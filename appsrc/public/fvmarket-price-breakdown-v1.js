(() => {
  const money = value => Number(value || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  window.fvmPriceBreakdown = order => {
    const original = (order.items || []).reduce((sum, item) => sum + Number(item.regularUnitPrice ?? item.unitPrice ?? 0) * Number(item.qty || 1), 0);
    const subtotal = Number(order.subtotal || 0), regularDelivery = Number(order.regularDelivery ?? order.delivery ?? 0);
    return '<div style="margin-top:16px;font-size:13px;line-height:1.9"><div>Productos al precio original: <b>' + money(original) + '</b></div>' + (original > subtotal ? '<div>Descuento aplicado: <b>-' + money(original - subtotal) + '</b></div>' : '') + '<div>Productos: <b>' + money(subtotal) + '</b></div><div>Precio del transporte: <b>' + money(regularDelivery) + '</b></div><div>' + (order.freeTransport ? 'Transporte gratis · Cliente preferente: <b>' + money(0) : 'Transporte: <b>' + money(order.delivery)) + '</b></div><div class="fvmOrderTotals"><span>Total</span><strong>' + money(order.total) + '</strong></div></div>';
  };
})();
