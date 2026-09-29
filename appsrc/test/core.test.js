'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = require('../server')._test;
const operations = require('../operations_accounting_v1');
const procurement = require('../procurement_v2');
const supplierDelivery = require('../supplier_delivery_v1');
const emails = require('../transactional_emails');
const databaseBackup = require('../database_backup_v1');

function fixture() {
  return {
    users: [],
    settings: { igic: 7, storeName: 'FVMarket', fiscalName: 'FVMarket', rutaFVOrigin: 'Origen FVMarket' },
    products: [{
      id: 'p1', title: 'Taladro profesional', ref: 'FVM-TAL-01', price: 100,
      published: true, sourceProvider: 'Proveedor Uno', sourceRef: 'SRC-42',
      sourceUrl: 'https://supplier.example/item', sourcePrice: 60, margin: 40,
      supplierId: 'sup1', weightKg: 12.5, images: [{ url: 'https://images.example/taladro.jpg', license: 'private' }]
    }],
    orders: [], quotes: [], invoices: [], suppliers: [{ id: 'sup1', name: 'Proveedor Uno' }]
  };
}

test('el catálogo público oculta proveedor, coste y margen', () => {
  const product = server.publicProduct(fixture().products[0]);
  for (const key of ['sourceProvider', 'sourceRef', 'sourceUrl', 'sourcePrice', 'margin', 'supplierId']) assert.equal(key in product, false);
  assert.deepEqual(product.images, [{ url: 'https://images.example/taladro.jpg' }]);
});

test('el plazo público no expone la isla ni reglas internas del proveedor', () => {
  const product = server.publicProduct(fixture().products[0], { suppliers: [{ id: 'sup1', island: 'Fuerteventura', address: 'Calle privada 1' }] });
  assert.equal(product.deliveryEstimate.label, '24–72 h');
  assert.equal('rule' in product.deliveryEstimate, false);
  assert.equal('isLocal' in product.deliveryEstimate, false);
  assert.equal('address' in product.deliveryEstimate, false);
});

test('los datos de invitado validan contacto, entrega y facturación', () => {
  const valid = server.normalizeCheckoutCustomer({
    name: 'Cliente Prueba', email: 'cliente@example.com', phone: '600123123',
    address: 'Calle Prueba 1', city: 'Puerto del Rosario', postalCode: '35600'
  });
  assert.equal(valid.error, undefined);
  assert.equal(valid.customer.billingAddress, 'Calle Prueba 1');
  assert.equal(valid.customer.billingPostalCode, '35600');
  assert.match(server.normalizeCheckoutCustomer({}).error, /nombre/i);
});

test('la firma de RutaFV queda ligada a invitado, carrito y destino', () => {
  const actor = 'guest:abc123', items = [{ id: 'p1', qty: 2 }], destination = { address: 'Calle A 1', city: 'Morro Jable', postalCode: '35625' };
  const quote = server.decorateTransportQuote({ id: 'rq1', amount: 18.5 }, actor, items, destination);
  assert.equal(server.validTransportQuote(quote, actor, items, destination), true);
  assert.equal(server.validTransportQuote(quote, actor, [{ id: 'p1', qty: 3 }], destination), false);
  assert.equal(server.validTransportQuote(quote, actor, items, { ...destination, address: 'Calle B 2' }), false);
  assert.equal(server.sameTransportDestination({}, destination), false);
});

test('el pedido conserva trazabilidad privada y separa transporte', () => {
  const data = fixture(), actor = { id: 'guest:abc123', name: 'Cliente', email: 'cliente@example.com', phone: '600123123' };
  const customer = { name: 'Cliente', email: actor.email, phone: actor.phone, address: 'Calle A 1', city: 'Morro Jable', postalCode: '35625', billingAddress: 'Calle A 1', billingCity: 'Morro Jable', billingPostalCode: '35625' };
  const items = [{ id: 'p1', qty: 2 }], quote = server.decorateTransportQuote({ id: 'rq1', amount: 18.5 }, actor.id, items, customer);
  const built = server.buildOrder(data, actor, items, customer, { quote, paymentMethod: 'stripe', guest: true, userId: '' });
  assert.equal(built.error, undefined);
  assert.equal(built.order.subtotal, 200);
  assert.equal(built.order.delivery, 18.5);
  assert.equal(built.order.total, 218.5);
  assert.equal(built.order.items[0].weightKg, 12.5);
  assert.equal(built.order.items[0].totalWeightKg, 25);
  assert.equal(built.order.items[0].procurement.sourceRef, 'SRC-42');
  assert.equal(server.publicOrder(built.order).items[0].procurement, undefined);
});

test('el flujo operativo impide saltarse la recogida del proveedor', () => {
  const data = fixture();
  const order = { id: 'o1', number: 'FVM-1', status: 'pagado', subtotal: 100, delivery: 10, total: 110, createdAt: new Date().toISOString(), items: [{ productId: 'p1', title: 'Taladro', ref: 'FVM-TAL-01', qty: 1, procurement: { supplierId: 'sup1', provider: 'Proveedor Uno', sourceRef: 'SRC-42', sourcePrice: 60 } }], customer: { name: 'Cliente' } };
  data.orders.push(order); operations.ensureOperationsData(data);
  assert.equal(operations.transitionOrder(data, order, 'en_compra_proveedor', { id: 'admin' }).ok, true);
  assert.equal(operations.transitionOrder(data, order, 'mercancia_recogida', { id: 'admin' }).ok, false);
  const task = data.procurementTasks[0]; task.status = 'recogida'; order.procurement.allReady = true;
  assert.equal(operations.transitionOrder(data, order, 'mercancia_recogida', { id: 'admin' }).ok, true);
  const rows = procurement.filterPurchases(data, { supplier: 'proveedor uno' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].items[0].sourceRef, 'SRC-42');
  operations.recordRefund(data, order, { id: 'ref1', amount: 25, stripeRefundId: 're_test' }, { id: 'admin' });
  assert.equal(data.accountingEntries.find(entry => entry.type === 'reembolso').amount, -25);
  assert.ok(data.auditLog.some(entry => entry.action === 'reembolso_emitido'));
});

test('la contabilidad separa FVMarket y RutaFV y genera exportación para Holded', () => {
  const data = fixture();
  data.orders.push({ id: 'o-accounting', number: 'FVM-ACC-1', status: 'pagado', paidAt: '2026-09-28T08:00:00.000Z', createdAt: '2026-09-28T07:00:00.000Z', subtotal: 100, delivery: 15, total: 115, paymentMethod: 'stripe', customer: { name: 'Cliente contable' }, items: [{ productId: 'p1', title: 'Taladro', qty: 1, procurement: { supplierId: 'sup1', provider: 'Proveedor Uno', sourceRef: 'SRC-42', sourcePrice: 60 } }] });
  data.invoices = [{ id: 'inv-1', orderId: 'o-accounting', number: 'FVM-FAC-1', taxRate: 7, paymentMethod: 'stripe' }];
  operations.ensureOperationsData(data);
  const report = operations.accountingReport(data, { app: 'RutaFV' });
  assert.equal(report.entries.length, 1);
  assert.equal(report.entries[0].analyticApp, 'RutaFV');
  assert.equal(report.totals.byApp.RutaFV.net, 15);
  const csv = operations.holdedCsv(operations.accountingReport(data, {}).entries);
  assert.match(csv, /Aplicación/);
  assert.match(csv, /FVMarket/);
  assert.match(csv, /RutaFV/);
  assert.match(csv, /Debe;Haber/);
});

test('la API de contabilidad acepta filtros y responde la exportación CSV', async () => {
  const routes = {};
  const app = { get(path, ...args) { routes[path] = args.at(-1); }, post() {} };
  const data = { settings: { igic: 7 }, orders: [], invoices: [], accountingEntries: [], procurementTasks: [], auditLog: [] };
  operations.registerOperationsRoutes(app, {
    read: () => data,
    save: () => {},
    ordersManager: (req, res, next) => next(),
    paidOrderStatus: status => status === 'pagado'
  });
  let csv = '';
  await routes['/api/admin/accounting/export']({ query: { app: 'FVMarket' } }, { set() {}, send(value) { csv = value; } });
  assert.match(csv, /Fecha;Documento/);
  let json;
  await routes['/api/admin/accounting']({ query: { app: 'RutaFV' } }, { set() {}, json(value) { json = value; } });
  assert.deepEqual(json.applications, ['FVMarket', 'RutaFV', 'Compartido']);
  assert.deepEqual(json.entries, []);
});

test('el plazo del proveedor se calcula por isla y conserva dirección y fecha estimada', () => {
  const base = '2026-09-27T12:00:00.000Z';
  const local = supplierDelivery.deliveryEstimate({ island: 'Fuerteventura', address: 'Calle Primero de Mayo 1, Puerto del Rosario' }, base);
  assert.equal(local.isLocal, true);
  assert.equal(local.minHours, 24);
  assert.equal(local.maxHours, 72);
  assert.equal(local.address, 'Calle Primero de Mayo 1, Puerto del Rosario');
  assert.match(local.label, /24–72 h/);
  const remote = supplierDelivery.deliveryEstimate({ island: 'Gran Canaria', address: 'Calle Mayor 2, Las Palmas' }, base);
  assert.equal(remote.isLocal, false);
  assert.equal(remote.minDays, 7);
  assert.equal(remote.maxDays, 7);
  assert.match(remote.label, /aproximadamente 7 días/i);
  const inferred = supplierDelivery.deliveryEstimate({ address: 'Avenida de Canarias, Fuerteventura' }, base);
  assert.equal(inferred.isLocal, true);
});

test('los plazos solo cuentan días laborables y no exponen la ubicación', () => {
  const friday = '2026-09-25T12:00:00.000Z';
  const local = supplierDelivery.deliveryEstimate({ island: 'Fuerteventura', address: 'Calle Primero de Mayo 1' }, friday);
  assert.equal(new Date(local.minAt).getUTCDay(), 1, '24 h desde viernes debe caer en lunes');
  assert.equal(new Date(local.maxAt).getUTCDay(), 3, '72 h debe caer en miércoles laborable');
  assert.equal(local.label, '24–72 h');
  assert.equal(supplierDelivery.probableDeliveryDate(local), '2026-09-28');
  const remote = supplierDelivery.deliveryEstimate({ island: 'Gran Canaria' }, friday);
  assert.equal(new Date(remote.minAt).getUTCDay(), 2, '7 días laborables desde viernes debe caer en martes');
  assert.equal(remote.label, 'Aproximadamente 7 días');
  assert.equal(supplierDelivery.probableDeliveryDate(remote), '2026-10-06');
});

test('el tablero excluye pagos pendientes y permite incidencia y envío a RutaFV tras comprar', async () => {
  const routes = {};
  const app = { get(path, ...args) { routes[path] = args.at(-1); }, post(path, ...args) { routes[path] = args.at(-1); } };
  const data = { orders: [], procurementTasks: [], notifications: [], procurementActionLog: [], auditLog: [], settings: {} };
  const paidOrder = { id: 'paid-1', number: 'FVM-PAID', status: 'pagado', paidAt: new Date().toISOString(), createdAt: new Date().toISOString(), total: 50, delivery: 10, items: [{ productId: 'p1', title: 'Taladro', qty: 1, procurement: { status: 'available' } }], transport: { requested: true } };
  const unpaidOrder = { id: 'pending-1', number: 'FVM-PENDING', status: 'pendiente_pago', createdAt: new Date().toISOString() };
  data.orders.push(paidOrder, unpaidOrder);
  data.procurementTasks.push({ id: 'task-1', orderId: 'paid-1', supplierName: 'Proveedor Uno', status: 'pendiente_compra', sourceCost: 30, items: [] });
  let createdDelivery = false;
  procurement.registerProcurementRoutes(app, {
    read: () => data,
    save: () => {},
    ordersManager: (req, res, next) => next(),
    transitionOrder: (d, order, status) => { order.status = status; return { ok: true }; },
    ensureLedgerForOrder: () => {},
    paidOrderStatus: status => ['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'incidencia'].includes(status),
    createRutaFVDelivery: async (d, order) => { createdDelivery = true; order.transport.deliveryId = 'rutafv-1'; order.status = 'enviado_a_rutafv'; }
  });
  let board;
  await routes['/api/admin/procurement-board']({}, { json(value) { board = value; } });
  assert.deepEqual(board.orders.map(order => order.id), ['paid-1']);
  let boughtResponse;
  await routes['/api/admin/orders/:id/procurement-action']({ params: { id: 'paid-1' }, body: { action: 'comprada', purchaseReference: 'TICKET-1' }, user: { id: 'admin', role: 'admin' } }, { json(value) { boughtResponse = value; }, status() { return this; } });
  assert.equal(boughtResponse.status, 'en_compra_proveedor');
  assert.equal(data.procurementTasks[0].status, 'comprada');
  let incidentResponse;
  await routes['/api/admin/orders/:id/procurement-action']({ params: { id: 'paid-1' }, body: { action: 'incidencia', note: 'Proveedor sin stock en tienda.' }, user: { id: 'admin', role: 'admin' } }, { json(value) { incidentResponse = value; }, status() { return this; } });
  assert.equal(incidentResponse.status, 'incidencia');
  assert.equal(data.procurementActionLog[0].metadata.note, 'Proveedor sin stock en tienda.');
  let collectedResponse;
  await routes['/api/admin/orders/:id/procurement-action']({ params: { id: 'paid-1' }, body: { action: 'mercancia_recogida' }, user: { id: 'admin', role: 'admin' } }, { json(value) { collectedResponse = value; }, status() { return this; } });
  assert.equal(collectedResponse.status, 'mercancia_recogida');
  assert.equal(data.procurementTasks[0].status, 'recogida');
  let response;
  await routes['/api/admin/orders/:id/procurement-action']({ params: { id: 'paid-1' }, body: { action: 'enviar_a_rutafv' }, user: { id: 'admin', role: 'admin' } }, { json(value) { response = value; }, status() { return this; } });
  assert.equal(createdDelivery, true);
  assert.equal(response.status, 'enviado_a_rutafv');
  assert.equal(data.procurementActionLog[0].action, 'enviar_a_rutafv');
});

test('el envío a RutaFV crea una expedición con cliente, fechas, direcciones y bultos agrupados', async () => {
  const routes = {};
  const app = { get(path, ...args) { routes[path] = args.at(-1); }, post(path, ...args) { routes[path] = args.at(-1); } };
  const data = {
    settings: { storeName: 'FVMarket', rutaFVClientCode: 'FVMarket', fiscalAddress: 'Origen logístico 1', fiscalCity: 'Puerto del Rosario', fiscalPostalCode: '35600' },
    users: [{ id: 'customer-1', name: 'Cliente Prueba', email: 'cliente@example.com' }], suppliers: [{ id: 'sup-1', name: 'Proveedor local', island: 'Fuerteventura', address: 'Proveedor 1' }], orders: [], procurementTasks: [], auditLog: [], accountingEntries: [], customerNotifications: []
  };
  const order = {
    id: 'order-ruta', number: 'FVM-RUTA-1', status: 'listo_para_rutafv', paidAt: '2026-09-25T12:00:00.000Z', createdAt: '2026-09-25T12:00:00.000Z',
    subtotal: 60, delivery: 12, total: 72, userId: 'customer-1',
    customer: { name: 'Cliente Prueba', email: 'cliente@example.com', phone: '600123123', address: 'Obra 1', city: 'Puerto del Rosario', postalCode: '35600' },
    transport: { requested: true, origin: 'Origen logístico 1, Puerto del Rosario, 35600', originDetails: { label: 'Origen logístico 1, Puerto del Rosario, 35600', address: 'Origen logístico 1', city: 'Puerto del Rosario', postalCode: '35600', source: 'FVMarket' }, destination: { address: 'Obra 1', city: 'Puerto del Rosario', postalCode: '35600' } },
    deliveryEstimate: { label: '24–72 h', rule: 'local_fuerteventura', minDate: '28/09/2026', maxDate: '30/09/2026', minAt: '2026-09-28T12:00:00.000Z', maxAt: '2026-09-30T12:00:00.000Z' },
    fulfillment: { readyForRutaFV: true }, items: [{ productId: 'p1', title: 'Cemento', ref: 'CEM-1', qty: 3, weightKg: 10, totalWeightKg: 30, procurement: { status: 'ready', supplierId: 'sup-1', provider: 'Proveedor local' } }]
  };
  data.orders.push(order);
  data.procurementTasks.push({ id: 'task-ruta', orderId: order.id, supplierId: 'sup-1', supplierName: 'Proveedor local', supplier: { island: 'Fuerteventura', address: 'Proveedor 1' }, status: 'recogida', items: order.items, sourceCost: 30, actualCost: 30 });
  let payload;
  operations.registerOperationsRoutes(app, {
    read: () => data, save: () => {}, ordersManager: (req, res, next) => next(),
    rutaFVRequest: async (path, value) => { payload = value; return { id: 'exp-1', status: 'pendiente' }; },
    RUTAFV_DELIVERY_PATH: '/deliveries', RUTAFV_CLIENT_CODE: 'FVMarket', paidOrderStatus: status => ['pagado', 'listo_para_rutafv'].includes(status),
    issueInvoiceForOrder: () => null, recordInvoiceIssued: () => {}, scheduleOrderEmail: () => {}
  });
  let response;
  await routes['/api/admin/orders/:id/send-to-rutafv']({ params: { id: order.id }, user: { id: 'admin', role: 'admin' } }, { json(value) { response = value; }, status() { return this; } });
  assert.equal(response.transport.deliveryId, 'exp-1');
  assert.equal(payload.client.code, 'FVMarket');
  assert.equal(payload.sourceApplication, 'FVMarket');
  assert.equal(payload.paymentRequired, false);
  assert.equal(payload.originDetails.address, 'Origen logístico 1');
  assert.equal(payload.destination.address, 'Obra 1');
  assert.equal(payload.probableDeliveryDate, '2026-09-28');
  assert.equal(payload.photoRequired, false);
  assert.equal(payload.packageCount, 1);
  assert.equal(payload.packages[0].quantity, 3);
  assert.equal(payload.packages[0].totalWeightKg, 30);
});

test('la factura muestra estado pagado, Stripe e IGIC', () => {
  const html = server.professionalInvoiceHtml({ number: 'FVM-FAC-2026-00001', orderNumber: 'FVM-1', issuedAt: new Date().toISOString(), taxName: 'IGIC', taxRate: 7, taxBase: 100, taxAmount: 7, total: 107, paymentReference: 'pi_test', customer: { name: 'Cliente', billingName: 'Cliente', billingAddress: 'Calle A 1', billingCity: 'Morro Jable', billingPostalCode: '35625', deliveryAddress: { address: 'Calle A 1', city: 'Morro Jable', postalCode: '35625' }, email: 'cliente@example.com' }, lines: [{ description: 'Producto', reference: 'REF', quantity: 1, unitPrice: 107, taxableBase: 100, taxAmount: 7, gross: 107 }] }, fixture().settings);
  assert.match(html, /PAGADA/);
  assert.match(html, /Stripe/);
  assert.match(html, /IGIC/);
  assert.match(html, /pi_test/);
});

test('correos y páginas legales reflejan Stripe, Klarna elegible y la validación de disponibilidad', () => {
  const order = { number: 'FVM-1', total: 20, customer: { name: 'Cliente' }, items: [] };
  assert.match(emails.orderConfirmation(order).html, /validaremos la disponibilidad/i);
  assert.doesNotMatch(emails.orderReceived(order).text, /transferencia/i);
  assert.match(server.legalPage('condiciones', fixture().settings), /métodos de pago a plazo.*Klarna/i);
});

test('la tienda inicia sin sesión ni búsqueda y ofrece Stripe con métodos dinámicos', () => {
  const storefront = fs.readFileSync(path.join(__dirname, '..', 'public', 'fvmarket-storefront-v2.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.doesNotMatch(storefront, /removeItem\(['"]fv_session/);
  assert.match(storefront, /termsAccepted:\s*true/);
  assert.match(storefront, /privacyAccepted:\s*true/);
  assert.match(index, /resetStorefrontStartState/);
  assert.match(index, /localStorage\.removeItem\('fv_session'\)/);
  assert.match(index, /Klarna y otros métodos disponibles para tu compra/);
  assert.doesNotMatch(index, /Productos destacados/);
  assert.doesNotMatch(index, /Buscar por producto o referencia/);
  assert.match(index, /Buscar productos, marcas o referencias/);
  assert.doesNotMatch(source, /payment_method_types\s*:/);
  assert.match(source, /integration_identifier:stripeIntegrationIdentifier\(\)/);
  assert.match(source, /checkout\.session\.async_payment_succeeded/);
  assert.doesNotMatch(index, /placeTransfer|Pendiente de transferencia/);
  assert.equal((index.match(/<\/body>/g) || []).length, 1);
  assert.equal((index.match(/<\/html>/g) || []).length, 1);
});

test('las copias de seguridad comprueban su integridad y conservan los administradores', () => {
  const state = fixture();
  state.users = [{ id: 'admin-actual', role: 'admin', username: 'admin', password: 'hash' }, { id: 'customer', role: 'customer' }];
  const backup = databaseBackup.createBackup(state, '2026-09-27T12:00:00.000Z');
  const restored = databaseBackup.parseBackup(backup);
  assert.equal(restored.products[0].id, 'p1');
  restored.users = [];
  const protectedState = databaseBackup.preserveAdministrators(restored, state.users);
  assert.deepEqual(protectedState.users.map(user => user.id), ['admin-actual']);
  assert.throws(() => databaseBackup.parseBackup({ ...backup, checksum: '0'.repeat(64) }), /integridad/i);
});

test('reiniciar elimina todos los productos incluso tras normalizar y conserva la taxonomía', () => {
  const current = {
    users: [{ id: 'admin-actual', role: 'admin' }, { id: 'cliente', role: 'customer' }],
    products: [{ id: 'p1', published: true }, { id: 'p2', published: false }],
    orders: [{ id: 'o1' }], quotes: [{ id: 'q1' }],
    settings: {
      categories: ['Construcción', 'Categoría creada'],
      subcategories: { 'Construcción': ['Cemento especial'], 'Categoría creada': ['Subcategoría creada'] }
    }
  };
  const reset = server.resetDatabaseState(current);
  assert.deepEqual(reset.products, []);
  assert.deepEqual(reset.users.map(user => user.id), ['admin-actual']);
  assert.equal(reset.settings.categories.includes('Categoría creada'), true);
  assert.deepEqual(reset.settings.subcategories['Categoría creada'], ['Subcategoría creada']);
  server.normalizeState(reset);
  assert.deepEqual(reset.products, [], 'la normalización no debe reponer productos semilla');
  assert.equal(reset.settings.categories.includes('Categoría creada'), true);
  assert.equal(reset.settings.subcategories['Categoría creada'].includes('Subcategoría creada'), true);
});

test('el catálogo interno muestra ubicación del proveedor y elimina la forma de adquisición', () => {
  const admin = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
  const databaseUi = fs.readFileSync(path.join(__dirname, '..', 'public', 'fvmarket-admin-database-v1.js'), 'utf8');
  const suppliers = fs.readFileSync(path.join(__dirname, '..', 'public', 'fvmarket-admin-v13.js'), 'utf8');
  const board = fs.readFileSync(path.join(__dirname, '..', 'public', 'fvmarket-admin-control-v2.js'), 'utf8');
  const accountingUi = fs.readFileSync(path.join(__dirname, '..', 'public', 'fvmarket-admin-accounting-v2.js'), 'utf8');
  const ordersUi = fs.readFileSync(path.join(__dirname, '..', 'public', 'fvmarket-admin-orders-v1.js'), 'utf8');
  assert.match(suppliers, /v13SupplierIsland/);
  assert.match(suppliers, /v13SupplierAddress/);
  assert.doesNotMatch(suppliers, /Forma de adquisición/);
  assert.doesNotMatch(admin, /Almacén virtual/);
  assert.doesNotMatch(admin, /fvmarket-operations-v1\.js/);
  assert.match(databaseUi, /Elimina todos los pedidos y productos/);
  assert.match(ordersUi, /Entrega estimada proveedor/);
  assert.match(board, /Entrega estimada del proveedor/);
  assert.doesNotMatch(board, /Iniciar compra/);
  assert.match(board, /fvmChecklistAction/);
  assert.match(board, /fvmBoardPdf/);
  assert.doesNotMatch(board, /Seleccionar acción/);
  assert.doesNotMatch(suppliers, /Forma de adquisición/);
  assert.match(accountingUi, /Exportar para Holded/);
  assert.match(accountingUi, /FVMarket \/ RutaFV/);
  assert.match(admin, /fvmarket-admin-accounting-v2\.js/);
});
