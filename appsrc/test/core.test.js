'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = require('../server')._test;
const operations = require('../operations_accounting_v1');
const procurement = require('../procurement_v2');
const emails = require('../transactional_emails');

function fixture() {
  return {
    users: [],
    settings: { igic: 7, storeName: 'FVMarket', fiscalName: 'FVMarket', rutaFVOrigin: 'Origen FVMarket' },
    products: [{
      id: 'p1', title: 'Taladro profesional', ref: 'FVM-TAL-01', price: 100,
      published: true, sourceProvider: 'Proveedor Uno', sourceRef: 'SRC-42',
      sourceUrl: 'https://supplier.example/item', sourcePrice: 60, margin: 40,
      supplierId: 'sup1', images: [{ url: 'https://images.example/taladro.jpg', license: 'private' }]
    }],
    orders: [], quotes: [], invoices: [], suppliers: [{ id: 'sup1', name: 'Proveedor Uno' }]
  };
}

test('el catálogo público oculta proveedor, coste y margen', () => {
  const product = server.publicProduct(fixture().products[0]);
  for (const key of ['sourceProvider', 'sourceRef', 'sourceUrl', 'sourcePrice', 'margin', 'supplierId']) assert.equal(key in product, false);
  assert.deepEqual(product.images, [{ url: 'https://images.example/taladro.jpg' }]);
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

test('la factura muestra estado pagado, Stripe e IGIC', () => {
  const html = server.professionalInvoiceHtml({ number: 'FVM-FAC-2026-00001', orderNumber: 'FVM-1', issuedAt: new Date().toISOString(), taxName: 'IGIC', taxRate: 7, taxBase: 100, taxAmount: 7, total: 107, paymentReference: 'pi_test', customer: { name: 'Cliente', billingName: 'Cliente', billingAddress: 'Calle A 1', billingCity: 'Morro Jable', billingPostalCode: '35625', deliveryAddress: { address: 'Calle A 1', city: 'Morro Jable', postalCode: '35625' }, email: 'cliente@example.com' }, lines: [{ description: 'Producto', reference: 'REF', quantity: 1, unitPrice: 107, taxableBase: 100, taxAmount: 7, gross: 107 }] }, fixture().settings);
  assert.match(html, /PAGADA/);
  assert.match(html, /Stripe/);
  assert.match(html, /IGIC/);
  assert.match(html, /pi_test/);
});

test('correos y páginas legales reflejan Stripe y la validación de disponibilidad', () => {
  const order = { number: 'FVM-1', total: 20, customer: { name: 'Cliente' }, items: [] };
  assert.match(emails.orderConfirmation(order).html, /validaremos la disponibilidad/i);
  assert.doesNotMatch(emails.orderReceived(order).text, /transferencia/i);
  assert.match(server.legalPage('condiciones', fixture().settings), /único método de pago online es la tarjeta mediante Stripe/i);
});

test('la tienda conserva la sesión y ofrece solo Stripe con consentimiento', () => {
  const storefront = fs.readFileSync(path.join(__dirname, '..', 'public', 'fvmarket-storefront-v2.js'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.doesNotMatch(storefront, /removeItem\(['"]fv_session/);
  assert.match(storefront, /termsAccepted:\s*true/);
  assert.match(storefront, /privacyAccepted:\s*true/);
  assert.match(index, /Pagar con tarjeta mediante Stripe/);
  assert.doesNotMatch(index, /placeTransfer|Pendiente de transferencia/);
  assert.equal((index.match(/<\/body>/g) || []).length, 1);
  assert.equal((index.match(/<\/html>/g) || []).length, 1);
});
