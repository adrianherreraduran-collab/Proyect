'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const publicDir = path.join(__dirname, '../public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const start = html.indexOf('function renderCart(){');
const cartCode = html.slice(start, html.indexOf('// FVM_TRANSPORT_CHECKOUT_UI_V2', start));
const pricingCode = fs.readFileSync(path.join(publicDir, 'fvmarket-price-breakdown-v1.js'), 'utf8');

function render(products, cart, quote = null) {
  const elements = { cartItems: { innerHTML: '' }, cartTotal: { innerHTML: '' }, cartCheckout: { style: {} } };
  const context = vm.createContext({
    window: {}, cart, rutaFVQuote: quote,
    document: { getElementById: id => elements[id] },
    cartProduct: id => products.find(product => product.id === id),
    eur: value => Number(value || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }),
    siteEsc: value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    siteJsId: value => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    updateCart: () => {}
  });
  vm.runInContext(pricingCode, context);
  vm.runInContext(cartCode, context);
  context.renderCart();
  const plain = value => value.replace(/\u00a0|\u202f/g, ' ');
  return { context, elements, items: plain(elements.cartItems.innerHTML), total: plain(elements.cartTotal.innerHTML) };
}

test('el carrito con solo transporte gratis muestra precio original, descuento cero y precio final por unidad y en el resumen', () => {
  const result = render([{ id: 'p', title: 'Monomando', price: 82.6, regularPrice: 82.6, customerPrice: 82.6 }], [{ id: 'p', qty: 1 }], { regularAmount: 55.39, amount: 55.39, customerAmount: 0, freeTransport: true });
  assert.match(result.items, /Precio original<\/span><strong>82,60 € \/ ud\./);
  assert.match(result.items, /Descuento aplicado \(0 %\)<\/span><strong>0,00 € \/ ud\./);
  assert.match(result.items, /Precio final<\/span><strong>82,60 € \/ ud\./);
  assert.match(result.total, /Descuento aplicado \(0 %\): <b>0,00 €/);
  assert.match(result.total, /Precio final de los productos: <b>82,60 €/);
  assert.match(result.total, /Precio del transporte: 55,39 €/);
  assert.match(result.total, /Transporte gratis: 0,00 €/);
  assert.match(result.total, /Total: 82,60 €/);
});

test('el descuento de cliente conserva precios unitarios y actualiza importe y ahorro al cambiar cantidades', () => {
  const product = { id: 'p', title: 'Producto', price: 100, regularPrice: 100, customerPrice: 80, customerDiscountPct: 20 };
  const result = render([product], [{ id: 'p', qty: 2 }]);
  assert.match(result.items, /Descuento aplicado \(20 %\)<\/span><strong>-20,00 € \/ ud\./);
  assert.match(result.items, /Subtotal \(2 unidades\)<\/span><strong>160,00 €/);
  assert.match(result.total, /Precio original de los productos: <b>200,00 €/);
  assert.match(result.total, /Descuento aplicado \(20 %\): <b>-40,00 €/);
  result.context.cart[0].qty = 3; result.context.renderCart();
  assert.match(result.elements.cartTotal.innerHTML.replace(/\u00a0/g, ' '), /Total: 240,00 €/);
});

test('la oferta de producto se refleja aunque el cliente no tenga descuento personalizado', () => {
  const result = render([{ id: 'p', title: 'Producto en oferta', price: 100, regularPrice: 100, salePrice: 75, onOffer: true, discountPct: 25 }], [{ id: 'p', qty: 3 }], { amount: 25 });
  assert.match(result.items, /Descuento aplicado \(25 %\)<\/span><strong>-25,00 € \/ ud\./);
  assert.match(result.total, /Descuento aplicado \(25 %\): <b>-75,00 €/);
  assert.match(result.total, /Total: 250,00 €/);
});

test('oferta y descuento de cliente muestran el ahorro efectivo sin sumar porcentajes incorrectamente', () => {
  const result = render([{ id: 'p', title: 'Producto', price: 100, regularPrice: 100, salePrice: 80, customerPrice: 72, onOffer: true, discountPct: 20, customerDiscountPct: 10 }], [{ id: 'p', qty: 3 }], { amount: 25 });
  assert.match(result.items, /Descuento aplicado \(28 %\)<\/span><strong>-28,00 € \/ ud\./);
  assert.match(result.items, /Oferta: 20 % · Cliente preferente: 10 %/);
  assert.match(result.total, /Descuento aplicado \(28 %\): <b>-84,00 €/);
  assert.match(result.total, /Precio final de los productos: <b>216,00 €/);
  assert.match(result.total, /Total: 241,00 €/);
});

test('el porcentaje del resumen se pondera por precios y cantidades y mantiene precisión en céntimos', () => {
  const result = render([{ id: 'a', title: 'Descontado', price: 100, customerPrice: 80 }, { id: 'b', title: 'Sin descuento', price: 50 }], [{ id: 'a', qty: 2 }, { id: 'b', qty: 3 }]);
  assert.match(result.total, /Descuento aplicado \(11,43 %\): <b>-40,00 €/);
  assert.match(result.total, /Total: 310,00 €/);
  const cents = result.context.window.fvmProductPriceDetails({ price: 99.99, customerPrice: 82.49 }, 3);
  assert.equal(cents.original, 299.97); assert.equal(cents.subtotal, 247.47);
  assert.equal(cents.unitDiscount.amount, 17.5);
});

test('un carrito vacío no produce NaN y los documentos y títulos mantienen el desglose seguro', () => {
  const empty = render([], []);
  assert.match(empty.total, /Descuento aplicado \(0 %\): <b>0,00 €/);
  assert.doesNotMatch(empty.total, /NaN|Infinity/);
  assert.equal(empty.elements.cartCheckout.style.display, 'none');
  const result = render([{ id: 'p', title: '<img src=x onerror=alert(1)>', price: 10 }], [{ id: 'p', qty: 1 }]);
  assert.match(result.items, /&lt;img/); assert.doesNotMatch(result.items, /<img/);
  const order = result.context.window.fvmPriceBreakdown({ items: [{ regularUnitPrice: 10, unitPrice: 10, qty: 1 }], subtotal: 10, total: 10, regularDelivery: 25, delivery: 0, freeTransport: true }).replace(/\u00a0/g, ' ');
  assert.match(order, /Descuento aplicado \(0 %\): <b>0,00 €/);
  assert.match(order, /Precio final de los productos: <b>10,00 €/);
  assert.match(order, /Transporte gratis/);
});
