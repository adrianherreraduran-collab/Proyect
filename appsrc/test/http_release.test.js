'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fvm-http-')), 'data.json');
process.env.JWT_SECRET = 'http-integration-secret'; process.env.STRIPE_SECRET_KEY = 'sk_test_isolated'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_isolated'; process.env.RESEND_API_KEY = 're_isolated'; process.env.EMAIL_FROM = 'test@example.com'; process.env.PUBLIC_URL = 'http://localhost';
const checkoutCalls = []; let quoteCalls = 0; let emails = 0; let counter = 0;
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'stripe') return class { constructor() { this.checkout = { sessions: { create: async payload => { checkoutCalls.push(payload); return { id: 'cs_' + (++counter), url: 'https://checkout.stripe.com/isolated', expires_at: Math.floor(Date.now() / 1000) + 1200 }; } } }; this.webhooks = { constructEvent: (body, signature) => { if (signature !== 'isolated-signature') throw Error('invalid'); return JSON.parse(body); } }; } };
  return originalLoad.call(this, name, ...args);
};
const { app, _test: server } = require('../server'); Module._load = originalLoad;
const nativeFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).startsWith('https://api.resend.com/')) { emails++; return new Response(JSON.stringify({ id: 'mail-' + emails }), { status: 200, headers: { 'content-type': 'application/json' } }); }
  if (String(url).includes('/api/integrations/fvmarket/quote')) { quoteCalls++; return new Response(JSON.stringify({ id: 'q-' + quoteCalls, amount: 25, billableDistanceKm: 10 }), { status: 200, headers: { 'content-type': 'application/json' } }); }
  return nativeFetch(url, options);
};
process.env.RUTAFV_API_URL = ''; // No real transport or customer email calls are allowed.
const profile = { id: 'customer', role: 'customer', name: 'Ana López', firstName: 'Ana', lastName: 'López', email: 'ana@example.com', emailVerified: true, nifNie: '42350448L', phone: '600123123', billingAddress: 'Calle Uno 1', billingCity: 'Costa Calma', billingPostalCode: '35627', deliveryAddress: { address: 'Calle Uno 1', city: 'Costa Calma', postalCode: '35627', validated: true }, discountPct: 20, freeTransport: true };
const passwordHash = bcrypt.hashSync('isolated-password-123', 4);
const fixture = () => ({ users: [{ id: 'admin', username: 'admin-test', role: 'admin', email: 'admin@example.com', password: passwordHash, emailVerified: true }, { ...profile, password: passwordHash }, { id: 'operator', role: 'operator', password: passwordHash, emailVerified: true }], settings: { adminCredentialsInitializedV14: true, igic: 7 }, products: [{ id: 'p1', title: 'Producto prueba', ref: 'TP0001', price: 100, weightKg: 3, published: true, sourcePrice: 40, sourceProvider: 'Proveedor privado', images: [{ url: 'https://images.example.com/p1.jpg' }] }], orders: [], quotes: [], invoices: [], reviews: [], orderReviews: [] });
function reset() { fs.writeFileSync(process.env.DATA_FILE, JSON.stringify(fixture())); }
const sellerFixture = () => ({ fiscalName: 'Ana López García', fiscalNif: '42350448L', fiscalAddress: 'Calle Prueba 1', fiscalCity: 'Tuineje', fiscalPostalCode: '35620', legalEmail: 'ana@example.com', contactPhone: '600123123', legalIdentityConfirmed: true });
function token(id = 'admin', role = 'admin') { return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '1h' }); }
let listener, origin;
async function ready() { if (!listener) { listener = app.listen(0, '127.0.0.1'); await new Promise(resolve => listener.once('listening', resolve)); origin = 'http://127.0.0.1:' + listener.address().port; } }
async function request(url, { method = 'GET', id = 'admin', role = 'admin', body, headers = {}, anonymous = false } = {}) { await ready(); const response = await nativeFetch(origin + url, { method, redirect:'manual', headers: { ...(anonymous ? {} : { Authorization: 'Bearer ' + token(id, role) }), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }); const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = text; } return { status: response.status, data, headers: response.headers }; }
test('la API exige autenticación, roles vigentes y cuentas activas', async () => {
  reset(); assert.equal((await request('/api/admin/users', { anonymous: true })).status, 401);
  assert.equal((await request('/api/admin/users', { id: 'customer', role: 'admin' })).status, 403);
  const data = server.read(); data.users.find(user => user.id === 'operator').active = false; server.save(data);
  assert.equal((await request('/api/admin/products', { id: 'operator', role: 'admin' })).status, 401);
  assert.equal((await request('/api/admin/readiness')).status, 200);
});
test('solo el admin concede beneficios y se validan los importes', async () => {
  reset(); assert.equal((await request('/api/admin/users/customer/discount', { method: 'PUT', id: 'customer', role: 'customer', body: { freeTransport: true } })).status, 403);
  assert.equal((await request('/api/admin/users/customer/discount', { method: 'PUT', body: { discountPct: -10 } })).status, 400);
  const updated = await request('/api/admin/users/customer/discount', { method: 'PUT', body: { discountPct: 0, freeTransport: true } }); assert.equal(updated.status, 200); assert.equal(updated.data.customerLabel, 'Cliente preferente');
  const product = await request('/api/products', { id: 'customer', role: 'customer' }); assert.equal(product.data[0].customerPrice, 100); assert.equal(product.data[0].sourcePrice, undefined);
});
test('el catálogo autenticado usa el descuento actual del admin y el pago cobra el mismo precio', async () => {
  reset();
  const publicProducts = await request('/api/products', { anonymous: true });
  assert.equal(publicProducts.data[0].customerPrice, 100);
  const updated = await request('/api/admin/users/customer/discount', { method: 'PUT', body: { discountPct: 15, freeTransport: false } });
  assert.equal(updated.status, 200);
  const products = await request('/api/products', { id: 'customer', role: 'customer' });
  assert.equal(products.data[0].regularPrice, 100);
  assert.equal(products.data[0].customerDiscountPct, 15);
  assert.equal(products.data[0].customerPrice, 85);
  assert.match(products.headers.get('cache-control'), /no-store/);
  assert.match(products.headers.get('vary'), /Authorization/);
  const items = [{ id: 'p1', qty: 2, weightKg: 3 }], customer = { ...profile, ...profile.deliveryAddress };
  const quote = server.decorateTransportQuote({ id: 'rfq-discount', amount: 25 }, profile.id, items, customer);
  const result = await request('/api/checkout/stripe', { method: 'POST', id: 'customer', role: 'customer', body: { items, customer, rutaFVQuote: quote, termsAccepted: true, privacyAccepted: true } });
  assert.equal(result.status, 200);
  assert.equal(server.read().orders[0].subtotal, 170);
  assert.equal(server.read().orders[0].total, 195);
  assert.equal(checkoutCalls.at(-1).line_items[0].price_data.unit_amount, 8500);
});
test('un cliente no modifica sus beneficios asignando campos en su perfil', async () => {
  reset(); const updated = await request('/api/me/profile', { method: 'PUT', id: 'customer', role: 'customer', body: { ...profile, discountPct: 90, freeTransport: false } }); assert.equal(updated.status, 200); assert.equal(updated.data.user.discountPct, 20); assert.equal(updated.data.user.freeTransport, true);
});
test('registro y verificación no conceden roles ni beneficios y evitan cuentas duplicadas simultáneas', async () => {
  reset(); const input = { email: 'new-customer@example.com', password: 'new-customer-test-password', role: 'admin', discountPct: 90, freeTransport: true };
  const replies = await Promise.all([request('/api/auth/register', { anonymous: true, method: 'POST', body: input }), request('/api/auth/register', { anonymous: true, method: 'POST', body: input })]);
  assert.deepEqual(replies.map(reply => reply.status).sort(), [201, 409]);
  let data = server.read(), user = data.users.find(user => user.email === input.email); assert.equal(user.role, 'customer'); assert.equal(user.freeTransport, undefined); assert.equal(user.discountPct, undefined); assert.equal(data.users.filter(user => user.email === input.email).length, 1);
  assert.equal((await request('/api/auth/login', { anonymous: true, method: 'POST', body: input })).status, 403);
  const invalid=await request('/api/auth/verify-email?token=invalid',{anonymous:true});assert.equal(invalid.status,302);assert.equal(invalid.headers.get('location'),'/?verified=expired');
  const crypto = require('node:crypto'), raw = 'isolated-verify-token'; user.verificationTokenHash = crypto.createHash('sha256').update(raw).digest('hex'); user.verificationExpiresAt = Date.now() + 60000; server.save(data);
  const valid=await request('/api/auth/verify-email?token='+raw,{anonymous:true});assert.equal(valid.status,302);assert.equal(valid.headers.get('location'),'/?verified=1');
  const login = await request('/api/auth/login', { anonymous: true, method: 'POST', body: input }); assert.equal(login.status, 200); assert.equal(login.data.user.role, 'customer'); assert.equal(login.data.user.profileComplete, false);
});
test('recuperar contraseña consume el enlace una vez y revoca las sesiones anteriores', async () => {
  reset(); const data = server.read(), user = data.users.find(user => user.id === 'customer'), raw = 'isolated-reset-token'; user.passwordResetTokenHash = require('node:crypto').createHash('sha256').update(raw).digest('hex'); user.passwordResetExpiresAt = Date.now() + 60000; server.save(data);
  const resetResult = await request('/api/auth/reset-password', { anonymous: true, method: 'POST', body: { token: raw, password: 'replacement-only-for-local-test' } }); assert.equal(resetResult.status, 200);
  assert.equal((await request('/api/me/summary', { id: 'customer', role: 'customer' })).status, 401);
  assert.equal((await request('/api/auth/reset-password', { anonymous: true, method: 'POST', body: { token: raw, password: 'a-different-test-password' } })).status, 400);
  const login = await request('/api/auth/login', { anonymous: true, method: 'POST', body: { email: profile.email, password: 'replacement-only-for-local-test' } }); assert.equal(login.status, 200);
  const verified = await nativeFetch(origin + '/api/me/summary', { headers: { Authorization: 'Bearer ' + login.data.token } }); assert.equal(verified.status, 200);
});
test('el pago conserva descuentos, cobra cero transporte y envía a Stripe el importe calculado en el servidor', async () => {
  reset(); const items = [{ id: 'p1', qty: 2, weightKg: 3 }], customer = { ...profile, ...profile.deliveryAddress }, quote = server.decorateTransportQuote({ id: 'rfq', amount: 25 }, profile.id, items, customer);
  const result = await request('/api/checkout/stripe', { method: 'POST', id: 'customer', role: 'customer', body: { items, customer, rutaFVQuote: quote, termsAccepted: true, privacyAccepted: true, total: 1, discountPct: 90 } });
  assert.equal(result.status, 200); const data = server.read(), order = data.orders[0]; assert.equal(order.total, 160); assert.equal(order.delivery, 0); assert.equal(order.transport.amount, 25); assert.equal(checkoutCalls.at(-1).line_items.length, 1); assert.equal(checkoutCalls.at(-1).line_items[0].price_data.unit_amount, 8000); assert.equal(order.status, 'pendiente_pago');
});
test('Stripe confirma el pago una sola vez y un evento duplicado conserva el reembolso', async () => {
  const data = server.read(), order = data.orders[0]; const session = { id: order.stripeSessionId, metadata: { orderId: order.id }, amount_total: 16000, currency: 'eur', payment_status: 'paid', payment_intent: 'pi_isolated' };
  const event = { type: 'checkout.session.completed', data: { object: session } };
  assert.equal((await request('/api/stripe/webhook', { anonymous: true, method: 'POST', headers: { 'stripe-signature': 'invalid' }, body: event })).status, 400);
  assert.equal((await request('/api/stripe/webhook', { anonymous: true, method: 'POST', headers: { 'stripe-signature': 'isolated-signature' }, body: event })).status, 200);
  let latest = server.read(); assert.equal(latest.invoices.length, 1); assert.equal(latest.orders[0].status, 'pagado'); latest.orders[0].status = 'reembolsado'; latest.orders[0].refundedAmount = 160; server.save(latest);
  assert.equal((await request('/api/stripe/webhook', { anonymous: true, method: 'POST', headers: { 'stripe-signature': 'isolated-signature' }, body: event })).status, 200);
  latest = server.read(); assert.equal(latest.orders[0].status, 'reembolsado'); assert.equal(latest.invoices.length, 1);
});
test('la factura rechaza acceso anónimo y la firma de un usuario ajeno', async () => {
  const invoice = server.read().invoices[0]; assert.equal((await request('/api/invoices/' + invoice.id, { anonymous: true })).status, 401);
  assert.equal((await request('/api/invoices/' + invoice.id, { id: 'operator', role: 'operator' })).status, 403);
  assert.equal((await request('/api/invoices/' + invoice.id + '/print?token=incorrect', { anonymous: true })).status, 401);
  assert.match((await request('/api/invoices/' + invoice.id + '/print')).data, /Transporte gratis/);
});
test('las cantidades fraccionarias y el transporte manipulado no crean pedidos', async () => {
  const count = server.read().orders.length;
  assert.equal((await request('/api/checkout/stripe', { method: 'POST', id: 'customer', role: 'customer', body: { items: [{ id: 'p1', qty: 1.5 }] } })).status, 400);
  const customer = { ...profile, ...profile.deliveryAddress }, items = [{ id: 'p1', qty: 1, weightKg: 3 }], quote = server.decorateTransportQuote({ id: 'rfq', amount: 25 }, profile.id, items, customer); quote.amount = 0;
  assert.equal((await request('/api/checkout/stripe', { method: 'POST', id: 'customer', role: 'customer', body: { items, customer, rutaFVQuote: quote, termsAccepted: true, privacyAccepted: true } })).status, 409); assert.equal(server.read().orders.length, count);
});
test('la opinión queda pendiente, se destaca en Avisos y solo se publica después de aprobación del admin', async () => {
  reset(); const data = server.read(); data.orders.push({ id: 'delivered', userId: 'customer', number: 'FVM-TEST', status: 'entregado', deliveredAt: new Date().toISOString(), paidAt: new Date().toISOString(), createdAt: new Date().toISOString(), items: [{ productId: 'p1', title: 'Producto prueba', qty: 1 }], total: 100 }); server.save(data);
  const result = await request('/api/orders/delivered/review', { method: 'POST', id: 'customer', role: 'customer', body: { rating: 5, comment: 'Todo ha funcionado muy bien', status: 'approved' } }); assert.equal(result.status, 201); assert.equal(result.data.review.status, 'pending');
  assert.equal((await request('/api/reviews/experiences', { anonymous: true })).data.count, 0);
  assert.ok((await request('/api/admin/notifications')).data.some(item => item.type === 'pending_reviews'));
  assert.equal((await request('/api/admin/reviews/experience/' + result.data.review.id, { method: 'PATCH', id: 'operator', role: 'operator', body: { action: 'approve' } })).status, 403);
  assert.equal((await request('/api/admin/reviews/experience/' + result.data.review.id, { method: 'PATCH', body: { action: 'approve' } })).status, 200);
  assert.equal((await request('/api/reviews/experiences', { anonymous: true })).data.count, 1);
});
test('Pedidos y Tablero informan qué entregados van al archivo sin perderlos del historial', async () => {
  const data = server.read(); data.orders.push({ id: 'archived', userId: 'customer', status: 'entregado', number: 'FVM-OLD', total: 100, createdAt: '2026-09-28T12:00:00Z', deliveredAt: '2026-09-28T12:00:00Z', paidAt: '2026-09-28T12:00:00Z', items: [] }); server.save(data);
  const orders = await request('/api/admin/orders'); assert.equal(orders.data.find(order => order.id === 'archived').storedDelivered, true);
  const board = await request('/api/admin/procurement-board'); assert.equal(board.data.orders.find(order => order.id === 'archived').storedDelivered, true);
  const summary = await request('/api/me/summary', { id: 'customer', role: 'customer' }); assert.equal(summary.data.orders.length, 0); assert.equal(summary.data.deliveredOrders.length, 2);
});
test('una opinión antigua ofensiva se retira de la portada, vuelve a revisión y no puede aprobarse por error', async () => {
  const data = server.read();
  data.orderReviews.push({id:'offensive-old',orderId:'delivered',userId:'customer',rating:5,comment:'Esto es una MIERDA',status:'approved',reviewedAt:new Date().toISOString(),reviewedBy:{role:'admin',id:'admin'},createdAt:new Date().toISOString()});
  server.save(data);
  const published=await request('/api/reviews/experiences',{anonymous:true});
  assert.equal(published.data.reviews.some(review=>review.comment.includes('MIERDA')),false);
  const pending=await request('/api/admin/reviews?status=pending');
  assert.ok(pending.data.reviews.find(review=>review.id==='offensive-old').moderationWarning);
  assert.equal((await request('/api/admin/reviews/experience/offensive-old',{method:'PATCH',body:{action:'approve'}})).status,400);
  assert.equal((await request('/api/admin/reviews/experience/offensive-old',{method:'PATCH',body:{action:'reject',reason:'Lenguaje ofensivo'}})).status,200);
});
test('aviso legal accesible y privacidad coherente con la cuenta obligatoria', async () => {
  reset();
  const page = await request('/legal/aviso', { anonymous: true });
  assert.equal(page.status, 200);
  assert.match(page.data, /Titular legal/);
  assert.match(page.data, /Pendiente de completar/);
  assert.match(page.data, /pagos reales están temporalmente deshabilitados/);
  const privacy = await request('/legal/privacidad', { anonymous: true });
  assert.match(privacy.data, /Para comprar necesitas una cuenta/);
  assert.doesNotMatch(privacy.data, /Crear una cuenta es opcional/);
  const home = await request('/', { anonymous: true });
  assert.match(home.data, /href="\/legal\/aviso"/);
});

test('solo el admin confirma el vendedor y los datos no válidos se rechazan sin guardarse', async () => {
  reset();
  assert.equal((await request('/api/admin/settings', { method: 'PUT', id: 'customer', role: 'customer', body: sellerFixture() })).status, 403);
  assert.equal((await request('/api/admin/settings', { method: 'PUT', body: { legalIdentityConfirmed: true } })).status, 400);
  const invalid = await request('/api/admin/settings', { method: 'PUT', body: { fiscalNif: '42350448A' } });
  assert.equal(invalid.status, 400);
  assert.notEqual(server.read().settings.fiscalNif, '42350448A');
  const data = server.read(); data.settings.rutaFVOrigin = 'Origen logístico elegido'; data.settings.rutaFVOriginAuto = false; server.save(data);
  const saved = await request('/api/admin/settings', { method: 'PUT', body: sellerFixture() });
  assert.equal(saved.status, 200); assert.equal(saved.data.legalIdentityStatus.ready, true);
  assert.equal(saved.data.rutaFVOrigin, 'Origen logístico elegido');
  const readyState = await request('/api/admin/readiness');
  assert.equal(readyState.data.sellerIdentity.ready, true);
  const page = await request('/legal/aviso', { anonymous: true });
  assert.match(page.data, /Ana López García/); assert.match(page.data, /42350448L/);
  assert.doesNotMatch(page.data, /identificación del vendedor está pendiente/);
  await request('/api/admin/settings', { method: 'PUT', body: { fiscalAddress: 'Domicilio actualizado 2', legalIdentityConfirmedHash: saved.data.legalIdentityConfirmedHash, legalIdentityConfirmedAt: saved.data.legalIdentityConfirmedAt } });
  assert.equal((await request('/api/admin/settings')).data.legalIdentityStatus.ready, false);
});

test('ninguna entrada crea ni reutiliza un pago real con el vendedor pendiente', async () => {
  reset(); const previousKey = process.env.STRIPE_SECRET_KEY, count = checkoutCalls.length;
  const data = server.read(); data.orders.push({ id: 'order-legal', userId: 'customer', status: 'pendiente_pago', stripeSessionUrl: 'https://checkout.example.com/existing', stripeSessionExpiresAt: Date.now() + 60000 });
  data.quotes.push({ id: 'quote-legal', userId: 'customer', status: 'aceptado', orderId: 'order-legal' }); server.save(data);
  const before = server.read();
  process.env.STRIPE_SECRET_KEY = 'sk_live_isolated_mock_never_sent';
  try {
    for (const [url, id, role] of [['/api/checkout/stripe', 'customer', 'customer'], ['/api/quotes/quote-legal/payment-link', 'customer', 'customer'], ['/api/admin/orders/order-legal/payment-link', 'admin', 'admin']]) {
      const response = await request(url, { method: 'POST', id, role, body: { items: [{ id: 'p1', qty: 1 }] } });
      assert.equal(response.status, 503, url); assert.equal(response.data.code, 'SELLER_IDENTITY_PENDING');
    }
    assert.equal(checkoutCalls.length, count);
    assert.deepEqual(server.read().orders, before.orders);
    assert.deepEqual(server.read().quotes, before.quotes);
  } finally { process.env.STRIPE_SECRET_KEY = previousKey; }
});

test('el vendedor confirmado permite el pago y un cambio de domicilio vuelve a cerrarlo', async () => {
  reset(); await request('/api/admin/settings', { method: 'PUT', body: sellerFixture() });
  const previousKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_live_isolated_mock_never_sent';
  try {
    const customer = { ...profile, ...profile.deliveryAddress }, items = [{ id: 'p1', qty: 1, weightKg: 3 }];
    const quote = server.decorateTransportQuote({ id: 'rfq-legal', amount: 25 }, profile.id, items, customer);
    const body = { items, customer, rutaFVQuote: quote, termsAccepted: true, privacyAccepted: true };
    assert.equal((await request('/api/checkout/stripe', { method: 'POST', id: 'customer', role: 'customer', body })).status, 200);
    assert.equal(server.read().orders[0].consent.termsVersion, '2026-10-01-identidad-v1');
    const before = server.read().orders.length;
    assert.equal((await request('/api/admin/settings', { method: 'PUT', body: { fiscalAddress: 'Otra calle 3' } })).status, 200);
    assert.equal((await request('/api/checkout/stripe', { method: 'POST', id: 'customer', role: 'customer', body })).status, 503);
    assert.equal(server.read().orders.length, before);
  } finally { process.env.STRIPE_SECRET_KEY = previousKey; }
});

test('los cambios de rol invalidan también el acceso a la factura impresa y las rutas desconocidas devuelven JSON', async () => {
  const invoice = server.read().invoices[0]; // Current fixture has no invoice: use a private independent document.
  const data = server.read(); data.invoices.push({ id: 'private', userId: 'customer', orderId: 'delivered', issuedAt: new Date().toISOString(), lines: [] }); data.users.find(user => user.id === 'operator').active = false; server.save(data);
  assert.equal((await request('/api/invoices/private/print', { id: 'operator', role: 'admin' })).status, 401);
  assert.equal((await request('/api/no-such-route', { anonymous: true })).status, 404);
  await new Promise(resolve => listener.close(resolve)); listener = null; global.fetch = nativeFetch;
});
