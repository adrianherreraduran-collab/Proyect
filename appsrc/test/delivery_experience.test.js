'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fvm-experience-'));
process.env.DATA_FILE = path.join(temporary, 'data.json');
process.env.RESEND_API_KEY = '';
process.env.EMAIL_FROM = '';
process.env.STRIPE_SECRET_KEY = '';
const { app, _test: server } = require('../server');
const customer = { id: 'customer-test', role: 'customer', emailVerified: true, firstName: 'Ana', lastName: 'López', name: 'Ana López' };
const order = (id, status, extra = {}) => ({id, number: id, userId: customer.id, status, total: 100, paidAt: '2026-09-29T08:00:00Z', createdAt: '2026-09-29T08:00:00Z', items: [], ...extra});
const fixture = () => ({users: [{id: 'admin-test', role: 'admin', password: 'unused', username: 'admin-test', emailVerified: true}, {...customer}], settings: {adminCredentialsInitializedV14: true, igic: 7}, products: [], quotes: [], invoices: [], orders: [], orderReviews: []});
const route = (url, method) => app._router.stack.find(layer => layer.route?.path === url && layer.route.methods[method]).route.stack.at(-1).handle;
async function call(handler, request = {}) {
  const response = {code: 200, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; }};
  await handler({user: customer, params: {}, body: {}, ...request}, response);
  return response;
}
const publicScript = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');

test('la entrega actual prevalece sobre una incidencia antigua y no inventa fechas en pedidos activos', () => {
  assert.equal(server.customerOrderState(order('done', 'entregado', {history: [{to: 'incidencia', at: '2026-09-28T08:00:00Z'}]})).key, 'entregado');
  assert.equal(server.publicOrder(order('active', 'enviado_a_rutafv', {updatedAt: '2026-09-30T08:00:00Z'})).deliveredAt, null);
  assert.equal(server.customerOrderState(order('replica', 'enviado_a_rutafv', {transport: {rutaFVStatus: 'Entregado'}})).key, 'entregado');
  assert.equal(server.customerOrderState(order('cancelled', 'cancelado', {deliveredAt: '2026-09-28T08:00:00Z'})).key, 'cancelado');
});

test('los avisos de entrega ya registrados reparan el estado sin duplicar avisos ni alterar cancelaciones', () => {
  const d = fixture();
  d.orders = [order('done', 'enviado_a_rutafv'), order('cancelled', 'cancelado'), order('unrelated', 'enviado_a_rutafv')];
  d.customerNotifications = d.orders.map(o => ({id: 'notice-' + o.id, userId: o.id === 'unrelated' ? 'another-user' : customer.id, orderId: o.id, metadata: {key: o.id + ':status:entregado'}, createdAt: '2026-09-30T08:00:00Z'}));
  server.normalizeState(d);
  assert.equal(d.orders[0].status, 'entregado');
  assert.equal(d.orders[0].workflow.deliveredAt, '2026-09-30T08:00:00Z');
  assert.equal(d.orders[1].status, 'cancelado');
  assert.equal(d.orders[2].status, 'enviado_a_rutafv');
  const deliveredReceipts = () => d.customerNotifications.filter(n => n.metadata?.key?.endsWith(':status:entregado'));
  assert.equal(deliveredReceipts().length, 3);
  server.normalizeState(d);
  assert.equal(deliveredReceipts().length, 3);
});

test('la cuenta mueve inmediatamente todos los entregados y conserva pagos, facturas y opiniones', () => {
  const d = fixture();
  d.orders = [order('today', 'entregado', {deliveredAt: new Date().toISOString()}), order('old', 'entregado', {deliveredAt: '2026-09-01T08:00:00Z'}), order('active', 'pagado'), order('foreign', 'entregado', {userId: 'another-user'})];
  d.orderReviews = [{id: 'own-review', orderId: 'old', userId: customer.id, rating: 4, comment: 'Buen servicio'}];
  d.invoices = [{id: 'invoice', userId: customer.id, total: 100}];
  const summary = server.profileSummary(d, customer);
  assert.deepEqual(summary.orders.map(o => o.id), ['active']);
  assert.deepEqual(summary.deliveredOrders.map(o => o.id).sort(), ['old', 'today']);
  assert.equal(summary.deliveredOrders.find(o => o.id === 'old').experienceReview.id, 'own-review');
  assert.equal(summary.payments.length, 3);
  assert.equal(summary.invoices.length, 1);
});

test('la opinión exige pedido propio entregado y validación, persiste una vez y oculta datos privados al publicarse', async () => {
  const d = fixture();
  d.orders = [order('done', 'entregado'), order('active', 'enviado_a_rutafv'), order('foreign', 'entregado', {userId: 'another-user'})];
  fs.writeFileSync(process.env.DATA_FILE, JSON.stringify(d));
  const post = route('/api/orders/:id/review', 'post');
  const req = (id, body = {rating: 5, comment: 'Muy buena compra y entrega.'}) => ({params: {id}, body});
  assert.equal((await call(post, req('foreign'))).code, 404);
  assert.equal((await call(post, req('active'))).code, 409);
  assert.equal((await call(post, req('done', {rating: 6, comment: 'Comentario válido'}))).code, 400);
  assert.equal((await call(post, req('done', {rating: 3, comment: 'no'}))).code, 400);
  const created = await call(post, req('done'));
  assert.equal(created.code, 201);
  assert.equal(created.payload.review.orderId, 'done');
  assert.equal(created.payload.review.authorName, 'Ana L.');
  assert.equal((await call(post, req('done'))).code, 409);
  const saved = JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8'));
  assert.equal(saved.orderReviews.length, 1);
  assert.equal(server.profileSummary(saved, customer).deliveredOrders.find(o => o.id === 'done').experienceReview.rating, 5);
  const published = await call(route('/api/reviews/experiences', 'get'));
  assert.equal(published.payload.count, 1);
  assert.equal('userId' in published.payload.reviews[0], false);
  assert.equal('orderId' in published.payload.reviews[0], false);
  saved.users.find(u => u.id === customer.id).emailVerified = false;
  saved.orders.push(order('unverified', 'entregado'));
  fs.writeFileSync(process.env.DATA_FILE, JSON.stringify(saved));
  assert.equal((await call(post, req('unverified'))).code, 403);
});

test('el listado del administrador mantiene los entregados visibles y marca la casilla desde cualquier réplica', async () => {
  const data = [order('current', 'entregado'), order('transport', 'enviado_a_rutafv', {transport: {rutaFVStatus: 'Entregado'}}), order('workflow', 'enviado_a_rutafv', {workflow: {deliveredAt: '2026-09-30T08:00:00Z'}}), order('active', 'pagado'), {id: 'unpaid', status: 'pendiente_pago'}];
  const host = {innerHTML: ''};
  const context = {window: {}, orders: host, statOrders: {}, api: async () => data, esc: String, money: String, setTimeout() {}, document: {getElementById: () => null, createElement: () => ({}), head: {appendChild() {}}}};
  vm.runInNewContext(publicScript('fvmarket-admin-orders-v1.js'), context);
  await context.window.loadOrders();
  const $ = cheerio.load('<table><tbody>' + host.innerHTML + '</tbody></table>');
  assert.equal($('tbody tr').length, 4);
  assert.equal($('label').filter((_, label) => $(label).text() === 'Entregado').find('input[checked]').length, 3);
});

test('el Tablero marca Entregado y conserva los pedidos para consultar el reparto', () => {
  const host = {innerHTML: ''};
  const context = {window: {}, document: {getElementById: id => id === 'fvmControlBoard' ? host : null, readyState: 'loading', addEventListener() {}}, setTimeout() {}, setInterval() {}};
  const source = publicScript('fvmarket-admin-control-v2.js').replace(/\}\)\(\);\s*$/, 'window.testBoard={checklist,renderBoard};})();');
  vm.runInNewContext(source, context);
  context.window.testBoard.renderBoard({orders: [order('done', 'entregado'), order('replica', 'enviado_a_rutafv', {deliveryStatus: 'Entregado'}), order('active', 'pagado')]});
  const $ = cheerio.load(host.innerHTML);
  assert.equal($('.fvmBoardColumn.tracking .fvmBoardCard').length, 2);
  assert.equal($('label').filter((_, label) => $(label).text() === 'Entregado').find('input[checked]').length, 2);
});

test('Entregados muestra la opinión por pedido, evita duplicados y Mis pedidos solo muestra los activos', () => {
  const html = publicScript('index.html');
  const inline = cheerio.load(html)('#fvm-accumulated-changes-js-v1').html();
  const context = {window: {}};
  vm.runInNewContext(inline.slice(0, inline.indexOf('window.fvmSelectAccountSection=')) + 'window.testAccount={renderAccountSection};})();', context);
  const render = context.window.testAccount.renderAccountSection;
  const data = {orders: [order('active', 'pagado')], deliveredOrders: [order('today', 'entregado'), order('old', 'entregado', {experienceReview: {rating: 4}})], storedDeliveredOrders: [order('old', 'entregado')]};
  const $ = cheerio.load(render('completed', data));
  assert.equal($('h3').text(), 'Entregados');
  assert.equal($('.fvmOrderCard').length, 2);
  assert.equal($('[data-order-review="today"]').text(), 'Valorar compra y experiencia');
  assert.equal($('[data-order-review="old"]').text(), 'Ver mi opinión');
  assert.match(render('orders', data), /active/);
  assert.doesNotMatch(render('orders', data), /data-order-review/);
});
