'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const storefront = fs.readFileSync(path.join(__dirname, '../public/fvmarket-storefront-v2.js'), 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const pricingCode = between(html, 'let catalogRequestVersion=', 'function renderProducts(){');
const loginCode = between(html, 'async function submitAuth(){', 'async function resendVerification(){');
const sessionCode = between(html, 'function logout(){', 'function fillProfile(){');
const openCode = between(html, 'async function openCart(){', 'function closeCart(){');
const quoteKeyCode = between(html, 'function rutaFVQuoteCacheKey(body){', 'function readRutaFVBrowserQuote(body){');
const normalizeCode = between(html, 'function normalizeStoredCart(){', 'let catalogRequestVersion=');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const user = (discountPct = 20, freeTransport = false) => ({ id: 'customer', role: 'customer', discountPct, freeTransport, profileComplete: true });
const product = (id = 'p', price = 100) => ({ id, price: 100, regularPrice: 100, customerPrice: price, customerDiscountPct: 100 - price });

function harness(initialSession = null, api = async () => []) {
  const elements = new Map(), values = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { innerHTML: '', textContent: '', style: {}, classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) } });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    session: initialSession, products: [], catalogProducts: new Map(), cart: [], rutaFVQuote: null, profileDeliverySelection: null,
    api, mode: 'login', authEmail: { value: 'test@example.com' }, authPassword: { value: 'isolated-password' },
    authMsg: element('authMsg'), profileMsg: element('profileMsg'), guestSessionId: 'isolated-guest', window: {},
    document: { getElementById: element },
    localStorage: { setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) },
    renderProducts: () => {}, renderCart: () => {}, updateCart: () => {}, refreshAccount: () => {},
    closeCart: () => element('cartDrawer').classList.remove('show'), fillCheckoutCustomer: () => {},
    openAccount: () => {}, rutaFVBrowserRateLimited: () => false
  });
  vm.runInContext(normalizeCode + pricingCode + sessionCode + loginCode + openCode + quoteKeyCode, context);
  return { context, element, values };
}

test('iniciar sesión sustituye los precios anónimos del catálogo y del carrito por los del cliente', async () => {
  const authenticated = { token: 'customer-token', user: user() };
  let h;
  h = harness(null, async (url, options) => {
    if (url === '/api/auth/login') return authenticated;
    assert.equal(options.cache, 'no-store');
    return [product('p', h.context.session ? 80 : 100)];
  });
  await h.context.loadProducts();
  assert.equal(h.context.catalogProducts.get('p').customerPrice, 100);
  await h.context.submitAuth();
  assert.equal(h.context.catalogProducts.get('p').customerPrice, 80);
  assert.equal(h.context.products[0].customerDiscountPct, 20);
  assert.equal(h.element('authMsg').textContent, 'Sesión iniciada correctamente');
});

test('una respuesta anónima tardía no sobrescribe el descuento tras iniciar sesión', async () => {
  const oldRequest = deferred(); let count = 0;
  const h = harness(null, async url => {
    if (url === '/api/auth/login') return { token: 'customer-token', user: user() };
    return ++count === 1 ? oldRequest.promise : [product('p', 80)];
  });
  const anonymous = h.context.loadProducts();
  await h.context.submitAuth();
  oldRequest.resolve([product('p', 100)]);
  assert.equal(await anonymous, false);
  assert.equal(h.context.catalogProducts.get('p').customerPrice, 80);
});

test('abrir el carrito recoge cambios del admin y actualiza productos fuera del filtro actual', async () => {
  const h = harness({ token: 'customer-token', user: user(0) }, async url => url === '/api/me' ? user(20) : [product('a', 80), product('b', 80)]);
  h.context.products = [product('a')];
  h.context.catalogProducts = new Map([['a', product('a')], ['b', product('b')]]);
  h.context.cart = [{ id: 'b', qty: 2 }];
  assert.equal(await h.context.openCart(), true);
  assert.equal(h.context.catalogProducts.get('b').customerPrice, 80);
  assert.equal(h.context.products.length, 1);
  assert.equal(h.context.products[0].id, 'a');
  assert.equal(h.context.products[0].customerPrice, 80);
  assert.equal(h.context.session.user.discountPct, 20);
});

test('cerrar sesión limpia precios personales y descarta respuestas del cliente anterior', async () => {
  const pending = deferred(); let count = 0;
  const h = harness({ token: 'old-token', user: user() }, async () => ++count === 1 ? pending.promise : [product('p', 100)]);
  h.context.products = [product('p', 80)]; h.context.catalogProducts.set('p', product('p', 80));
  const authenticated = h.context.loadProducts();
  h.context.logout();
  await Promise.resolve();
  pending.resolve([product('p', 80)]);
  assert.equal(await authenticated, false);
  assert.equal(h.context.session, null);
  assert.equal(h.context.products[0].customerPrice, 100);
  assert.equal(h.context.catalogProducts.get('p').customerDiscountPct, 0);
});

test('cambiar transporte gratis invalida la cotización y su caché sin quitar el descuento de productos', async () => {
  const h = harness({ token: 'customer-token', user: user(20, false) }, async url => url === '/api/me' ? user(20, true) : [product('p', 80)]);
  h.context.cart = [{ id: 'p', qty: 1 }]; h.context.rutaFVQuote = { amount: 25 };
  const body = { items: h.context.cart, address: 'Calle Uno', city: 'Tuineje', postalCode: '35629' };
  const oldKey = h.context.rutaFVQuoteCacheKey(body);
  assert.equal(await h.context.refreshCustomerPricing(), true);
  assert.equal(h.context.rutaFVQuote, null);
  assert.notEqual(h.context.rutaFVQuoteCacheKey(body), oldKey);
  assert.equal(h.context.catalogProducts.get('p').customerPrice, 80);
});

test('un error al actualizar precios no habilita el cobro con importes obsoletos', async () => {
  const h = harness({ token: 'customer-token', user: user() }, async () => { throw new Error('No hay conexión'); });
  assert.equal(await h.context.openCart(), false);
  assert.equal(h.element('cartCheckout').style.display, 'none');
  assert.match(h.element('cartItems').innerHTML, /No se han podido actualizar/);
  assert.equal(h.element('cartMsg').textContent, 'No hay conexión');
});

test('si el descuento cambia antes de pagar, se presenta el nuevo total antes de abrir Stripe', async () => {
  const code = between(storefront, '  async function payWithStripe() {', '  function toast(');
  let price = 100, calls = 0;
  const elements = { cartMsg: { textContent: '' }, orderTerms: { checked: true }, orderPrivacy: { checked: true } };
  const context = vm.createContext({
    session: { user: user() }, cart: [{ id: 'p', qty: 1 }], rutaFVQuote: { amount: 25 }, guestSessionId: 'isolated-guest',
    $: id => elements[id], customer: () => ({ name: 'Cliente de prueba' }), deliveryError: () => '',
    cartProduct: () => ({ customerPrice: price }), refreshCustomerPricing: async () => { price = 80; return true; },
    api: async () => { calls++; return { url: 'https://checkout.stripe.com/isolated' }; }, window: { location: { assign: () => {} } }
  });
  vm.runInContext(code, context);
  await context.payWithStripe();
  assert.equal(calls, 0); assert.match(elements.cartMsg.textContent, /El precio se ha actualizado/);
  await context.payWithStripe();
  assert.equal(calls, 1);
});
