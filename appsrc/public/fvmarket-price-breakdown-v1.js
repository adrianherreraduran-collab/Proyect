(() => {
  'use strict';
  const money = value => Number(value || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const round = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  const percent = value => Number(value || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' %';
  window.fvmDiscountBreakdown = (original, final) => {
    original = round(original); final = round(final);
    const amount = round(Math.max(0, original - final));
    return { original, final, amount, pct: original > 0 ? round(amount / original * 100) : 0 };
  };
  window.fvmDiscountLabel = value => percent(value);
  window.fvmProductPriceDetails = (product, quantity = 1) => {
    const qty = Number(quantity) || 1;
    const unit = round(product.customerPrice ?? product.salePrice ?? product.price ?? 0);
    const regularUnit = round(product.regularPrice ?? product.price ?? unit);
    return { unit, regularUnit, qty, unitDiscount: window.fvmDiscountBreakdown(regularUnit, unit), original: round(regularUnit * qty), subtotal: round(unit * qty) };
  };
  window.fvmPriceBreakdown = order => {
    const original = (order.items || []).reduce((sum, item) => sum + Number(item.regularUnitPrice ?? item.unitPrice ?? 0) * Number(item.qty || 1), 0);
    const subtotal = Number(order.subtotal || 0), regularDelivery = Number(order.regularDelivery ?? order.delivery ?? 0);
    const discount = window.fvmDiscountBreakdown(original, subtotal);
    const products = discount.amount > 0 ? '<div>Precio original de los productos: <b>' + money(discount.original) + '</b></div><div>Descuento aplicado (' + percent(discount.pct) + '): <b>-' + money(discount.amount) + '</b></div><div>Precio final de los productos: <b>' + money(subtotal) + '</b></div>' : '<div>Precio de los productos: <b>' + money(subtotal) + '</b></div>';
    return '<div style="margin-top:16px;font-size:13px;line-height:1.9">' + products + '<div>Precio del transporte: <b>' + money(regularDelivery) + '</b></div><div>' + (order.freeTransport ? 'Transporte gratis · Cliente preferente: <b>' + money(0) : 'Transporte: <b>' + money(order.delivery)) + '</b></div><div class="fvmOrderTotals"><span>Total</span><strong>' + money(order.total) + '</strong></div></div>';
  };
})();
