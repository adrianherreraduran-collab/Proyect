'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fvm-release-')), 'data.json');
process.env.JWT_SECRET = 'isolated-quality-test-secret';
process.env.STRIPE_SECRET_KEY = ''; process.env.RESEND_API_KEY = ''; process.env.EMAIL_FROM = '';
const server = require('../server')._test;
const benefits = require('../customer_benefits_v1');
const importer = require('../product_url_import_v1');
const { createAlertWorker, adminRecipient } = require('../admin_purchase_alerts_v1');
const { mergeState } = require('../state_merge_v1');
const user = { id: 'customer', role: 'customer', discountPct: 20, freeTransport: true };
const destination = { name: 'Ana López', email: 'ana@example.com', address: 'Calle Uno 1', city: 'Costa Calma', postalCode: '35627' };
function fixture() { return { settings: { igic: 7, adminCredentialsInitializedV14: true }, users: [{ id: 'admin', role: 'admin', password: 'unused' }, user], products: [{ id: 'p1', published: true, title: 'Taladro', ref: 'TA0001', price: 100, onOffer: true, discountPct: 10, weightKg: 3, sourcePrice: 40, sourceProvider: 'Proveedor privado' }], orders: [], quotes: [], invoices: [] }; }
function build(customer = user) { const data = fixture(), items = [{ id: 'p1', qty: 2, weightKg: 3 }], quote = server.decorateTransportQuote({ id: 'rfq', amount: 25 }, customer.id, items, destination); return { data, ...server.buildOrder(data, customer, items, destination, { quote }), quote, items }; }
test('descuento y transporte gratis son independientes y solo pertenecen a clientes', () => {
  for (const [discountPct, freeTransport] of [[0, false], [20, false], [0, true], [20, true]]) { const value = benefits.benefits({ role: 'customer', discountPct, freeTransport }); assert.equal(value.preferred, discountPct > 0 || freeTransport); assert.equal(value.freeTransport, freeTransport); }
  assert.deepEqual(benefits.benefits({ role: 'operator', discountPct: 90, freeTransport: true }), { discountPct: 0, freeTransport: false, preferred: false, customerLabel: 'Cliente' });
});
test('el pedido calcula oferta y descuento y conserva el coste real del transporte bonificado', () => {
  const { order } = build(); assert.equal(order.items[0].unitPrice, 72); assert.equal(order.subtotal, 144); assert.equal(order.regularDelivery, 25); assert.equal(order.delivery, 0); assert.equal(order.total, 144); assert.equal(order.transport.amount, 25); assert.equal(order.customerBenefits.customerLabel, 'Cliente preferente');
  assert.equal(build({ ...user, freeTransport: false }).order.total, 169);
});
test('la firma de transporte caduca y detecta manipulación de precio, fecha, peso, cliente y destino', () => {
  const { quote, items } = build(); assert.equal(server.validTransportQuote(quote, user.id, items, destination), true);
  assert.equal(server.validTransportQuote({ ...quote, amount: 0 }, user.id, items, destination), false);
  assert.equal(server.validTransportQuote({ ...quote, _fvmExpiresAt: Date.now() - 1 }, user.id, items, destination), false);
  assert.equal(server.validTransportQuote({ ...quote, _fvmExpiresAt: quote._fvmExpiresAt + 1000 }, user.id, items, destination), false);
  assert.equal(server.validTransportQuote(quote, 'another-user', items, destination), false);
  assert.equal(server.validTransportQuote(quote, user.id, [{ ...items[0], weightKg: 1 }], destination), false);
  assert.equal(server.validTransportQuote(quote, user.id, items, { ...destination, postalCode: '35600' }), false);
});
test('un cambio de peso o de beneficio exige volver a calcular el transporte', () => {
  const { data, quote, items } = build(); data.products[0].weightKg = 8;
  assert.equal(server.buildOrder(data, user, items, destination, { quote }).status, 409);
  data.products[0].weightKg = 3; quote.freeTransport = true;
  assert.equal(server.buildOrder(data, { ...user, freeTransport: false }, items, destination, { quote }).status, 409);
});
test('factura con descuento y transporte gratis mantiene base, IGIC, total e identidad', () => {
  const { data, order } = build(); order.status = 'pagado'; order.paidAt = '2026-09-30T12:00:00Z';
  const invoice = server.issueInvoiceForOrder(data, order); assert.equal(invoice.lines.length, 2); assert.equal(invoice.lines[1].gross, 0); assert.equal(invoice.lines[1].regularGross, 25); assert.equal(invoice.taxBase + invoice.taxAmount, invoice.total);
  assert.equal(server.issueInvoiceForOrder(data, order).id, invoice.id); assert.equal(data.invoices.length, 1);
  const html = server.professionalInvoiceHtml(invoice, { fiscalName: 'FVMarket' }); for (const text of ['Cliente preferente', 'Transporte gratis', 'Precio original', 'IGIC', 'Total pagado']) assert.ok(html.includes(text));
});
test('el archivo cambia al comenzar el día de Canarias y respeta incidencias actuales', () => {
  const order = { status: 'entregado', deliveredAt: '2026-09-30T22:20:00Z' };
  assert.equal(server.isStoredDeliveredOrder(order, new Date('2026-09-30T22:59:59Z')), false);
  assert.equal(server.isStoredDeliveredOrder(order, new Date('2026-09-30T23:00:00Z')), true);
  assert.equal(server.isStoredDeliveredOrder({ ...order, status: 'incidencia' }, new Date('2026-10-01T09:00:00Z')), false);
  assert.equal(server.isStoredDeliveredOrder({ status: 'entregado', deliveredAt: '2026-12-31T23:50:00Z' }, new Date('2027-01-01T00:00:00Z')), true);
});
test('el importador extrae referencia, descripción, precio e imágenes sin usar capacidad como peso', () => {
  const html = '<h1>SOPORTE MOTOS 300 KGS</h1><div class="product-reference"><span>REF: FT1580</span></div><div class="product-description">Capacidad de carga: 300 kg</div><div class="current-price"><span itemprop="price" content="69.00"></span></div><div class="product-images"><img data-image-large-src="/54058-large_default/a.jpg"></div><div class="product-miniature"><img src="/otro.jpg"></div>';
  const product = importer.augmentProduct(server.extractProductFromHtml(html, 'https://mibricolaje.com/a-8435156879507.html'), html);
  assert.equal(product.sourcePrice, 69); assert.equal(product.sourceRef, 'FT1580'); assert.equal(product.sourceEan, '8435156879507'); assert.equal(product.weightKg, 0); assert.equal(product.images.length, 1); assert.ok(product.importWarnings.some(message => message.includes('peso real'))); assert.equal(product.published, false);
});
test('peso estructurado se convierte en kg y la ficha de Mandatelo conserva su código', () => {
  const html = '<script type="application/ld+json">{"@type":"Product","name":"Silla gaming","sku":"CR1139","gtin13":"8436049036076","weight":{"value":15000,"unitCode":"GRM"},"offers":{"price":"89"}}</script>';
  const product = importer.augmentProduct(server.extractProductFromHtml(html, 'https://mandatelo.com/item.html'), html); assert.equal(product.weightKg, 15); assert.equal(product.sourceProvider, 'Mandatelo'); assert.equal(product.sourceRef, 'CR1139'); assert.equal(product.sourcePrice, 89);
});
test('la importación impide URL locales, metadatos de nube, IPv6 local y redirecciones privadas', async () => {
  for (const url of ['http://127.0.0.1', 'http://2130706433', 'http://169.254.169.254/latest/meta-data', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'file:///etc/passwd', 'http://localhost', 'https://user:secret@public.example.com']) assert.throws(() => importer.permittedUrl(url));
  assert.equal(importer.publicAddress('10.1.1.1'), false); assert.equal(importer.publicAddress('93.184.216.34'), true);
  await assert.rejects(importer.readProductUrl('https://mibricolaje.com/a', async () => ({ status: 302, headers: { location: 'http://127.0.0.1/secret' } })), /permitida/);
});
test('una alerta se envía una sola vez por pedido y no se genera después de comenzar la compra', async () => {
  const data = fixture(); data.users[0].email = 'admin@example.com'; data.orders = [{ id: 'order-a', number: 'FVM-A', status: 'pagado', paidAt: '2026-09-30T12:00:00Z', items: [], total: 100 }, { id: 'order-b', status: 'en_compra_proveedor', paidAt: '2026-09-30T12:00:00Z' }]; let calls = 0;
  const worker = createAlertWorker({ read: () => structuredClone(data), save: next => Object.assign(data, next), send: async message => { calls++; assert.equal(message.to, 'admin@example.com'); assert.equal(message.idempotencyKey, 'purchase_pending:order-a'); return { sent: true, id: 'mail' }; }, publicUrl: 'https://fvmarket.es' });
  await Promise.all([worker.scan(), worker.scan()]); await worker.scan(); assert.equal(calls, 1); assert.ok(data.orders[0].adminPurchaseAlert.sentAt);
  assert.equal(adminRecipient({ users: [{ role: 'admin', email: 'admin@fvmarket.local' }], settings: { adminAlertEmail: 'responsable@example.com' } }), 'responsable@example.com');
});
test('las actualizaciones concurrentes no borran otros pedidos ni beneficios cambiados por el admin', () => {
  const base = { users: [{ id: 'u', name: 'Ana', discountPct: 0 }], orders: [{ id: 'a', status: 'pagado' }] };
  const incoming = structuredClone(base); incoming.users[0].name = 'Ana López'; incoming.orders.push({ id: 'b', status: 'pendiente_pago' });
  const current = structuredClone(base); current.users[0].discountPct = 20; current.orders[0].status = 'entregado'; current.orders.push({ id: 'c', status: 'pagado' });
  const merged = mergeState(base, incoming, current); assert.equal(merged.users[0].discountPct, 20); assert.equal(merged.users[0].name, 'Ana López'); assert.equal(merged.orders.find(order => order.id === 'a').status, 'entregado'); assert.equal(merged.orders.length, 3);
  assert.equal(mergeState(base, incoming, { users: [], orders: [] }).users.length, 0);
});
test('la moderación detecta lenguaje ofensivo con mayúsculas y acentos sin bloquear palabras legítimas parecidas', () => {
  const moderation = require('../reviews_moderation_v1');
  for (const comment of ['Esto es una MIERDA.', 'Es un cabrón', 'Esto es un coño']) assert.ok(moderation.moderationWarning({comment}));
  for (const comment of ['El cono funciona bien', 'El cómputo de la factura es correcto', 'Muy buen producto']) assert.equal(moderation.moderationWarning({comment}), '');
});
test('los documentos del cliente ocultan proveedores, operaciones y direcciones internas', () => {
  const { order } = build(); order.procurement = { sourceCost: 80 }; order.adminPurchaseAlert = { recipient: 'private@example.com' }; order.transport.originDetails = { address: 'Dirección privada' };
  const publicOrder = server.publicOrder(order); assert.equal('procurement' in publicOrder, false); assert.equal('adminPurchaseAlert' in publicOrder, false); assert.equal('originDetails' in publicOrder.transport, false); assert.equal('procurement' in publicOrder.items[0], false);
  assert.equal(server.publicQuote({ items: [{ supplierId: 'private', sourceProvider: 'secret' }], transport: { originDetails: { address: 'secret' } } }).items[0].supplierId, undefined);
});
test('un archivo de datos ilegible causa un error y se conserva sin reemplazarlo por ejemplos', () => {
  fs.writeFileSync(process.env.DATA_FILE, '{invalid'); assert.throws(() => server.read(), /No se pueden leer/); assert.equal(fs.readFileSync(process.env.DATA_FILE, 'utf8'), '{invalid'); fs.writeFileSync(process.env.DATA_FILE, JSON.stringify(fixture()));
});

test('la factura conserva los datos del emisor y el pie capturados al emitirse', () => {
  const { data, order } = build();
  order.status = 'pagado';
  order.paidAt = '2026-09-30T12:00:00Z';
  Object.assign(data.settings, {
    storeName: 'FVMarket anterior',
    fiscalName: 'Titular anterior de prueba',
    fiscalNif: 'B12345674',
    fiscalAddress: 'Calle Anterior 1',
    fiscalCity: 'Tuineje',
    fiscalPostalCode: '35620',
    invoiceFooter: 'Pie anterior'
  });
  const invoice = server.issueInvoiceForOrder(data, order);
  Object.assign(data.settings, {
    storeName: 'FVMarket nuevo',
    fiscalName: 'Titular nuevo de prueba',
    fiscalNif: 'B12345683',
    fiscalAddress: 'Calle Nueva 9',
    fiscalCity: 'Pájara',
    fiscalPostalCode: '35628',
    invoiceFooter: 'Pie nuevo'
  });
  const html = server.professionalInvoiceHtml(invoice, data.settings);
  for (const value of ['FVMarket anterior', 'Titular anterior de prueba', 'B12345674', 'Calle Anterior 1', 'Tuineje', 'Pie anterior']) {
    assert.ok(html.includes(value), value);
  }
  for (const value of ['Titular nuevo de prueba', 'Calle Nueva 9', 'Pie nuevo']) {
    assert.equal(html.includes(value), false, value);
  }
});
