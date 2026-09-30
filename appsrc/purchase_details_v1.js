'use strict';

function purchaseItems(order = {}, d = {}) {
  return (order.items || []).map(item => {
    const product = (d.products || []).find(p => String(p.id) === String(item.productId)) || {};
    const procurement = item.procurement || {};
    const task = (d.procurementTasks || []).find(t => t.orderId === order.id && (t.items || []).some(row => String(row.productId) === String(item.productId)));
    const supplierId = procurement.supplierId || task?.supplierId || product.supplierId || '';
    const supplier = (d.suppliers || []).find(row => String(row.id) === String(supplierId)) || {};
    const qty = Math.max(1, Number(item.qty) || 1);
    const sourcePrice = Number(procurement.sourcePrice ?? item.sourcePrice ?? product.sourcePrice ?? 0) || 0;
    const image = item.image || product.image || (typeof product.images?.[0] === 'string' ? product.images[0] : product.images?.[0]?.url) || '';
    return {
      productId: item.productId || '', title: item.title || product.title || 'Producto',
      description: String(item.description || procurement.description || product.description || ''),
      ref: String(item.ref || product.ref || ''),
      sourceRef: String(procurement.sourceRef || item.sourceRef || product.sourceRef || ''),
      sourceEan: String(procurement.sourceEan || item.sourceEan || product.sourceEan || ''),
      provider: String(procurement.provider || task?.supplierName || item.sourceProvider || supplier.name || product.sourceProvider || 'Proveedor pendiente'),
      supplierId: String(supplierId), supplierAddress: String(supplier.address || task?.supplierAddress || ''),
      sourceUrl: String(procurement.sourceUrl || item.sourceUrl || product.sourceUrl || ''),
      sourcePrice, qty, sourceTotal: Math.round(sourcePrice * qty * 100) / 100,
      image: /^https?:\/\//i.test(image) || String(image).startsWith('/uploads/') ? String(image) : ''
    };
  });
}

module.exports = {purchaseItems};
