(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value || 0).toLocaleString('es-ES', {style:'currency',currency:'EUR'});
  const cachedOrders = new Map();
  window.fvmSetPurchaseOrders = orders => orders.forEach(order => cachedOrders.set(String(order.id), order));
  window.fvmPurchaseDetailButton = (order, index, item = {}) => `<button type="button" class="fvmPurchaseProductButton" data-purchase-order="${esc(order.id)}" data-purchase-index="${index}"><strong>${esc(item.title || item.ref || 'Producto')}</strong><span>${Math.max(1,Number(item.qty)||1)} ud. · Ver descripción y datos de compra</span></button>`;
  window.fvmOpenPurchaseDetails = (id, index) => {
    const order = cachedOrders.get(String(id)), item = order?.purchaseItems?.[index];
    if (!item) return;
    document.getElementById('fvmPurchaseDetailModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'fvmPurchaseDetailModal'; modal.className = 'fvmPurchaseDetailModal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-labelledby','fvmPurchaseDetailTitle');
    const safeLink = /^https?:\/\//i.test(item.sourceUrl || '') ? `<a href="${esc(item.sourceUrl)}" target="_blank" rel="noopener">Abrir ficha original del proveedor ↗</a>` : '';
    modal.innerHTML = `<div class="fvmPurchaseDetailBox"><button type="button" class="closeX" aria-label="Cerrar detalle">×</button><h2 id="fvmPurchaseDetailTitle">${esc(item.title)}</h2><p>Pedido ${esc(order.number || order.id)}</p>${item.image ? `<img class="fvmPurchaseDetailImage" src="${esc(item.image)}" alt="${esc(item.title)}">` : ''}<p class="fvmPurchaseDescription">${esc(item.description || 'Este producto aún no tiene una descripción guardada.')}</p><dl><dt>Proveedor</dt><dd>${esc(item.provider)}</dd><dt>Referencia original del proveedor</dt><dd>${esc(item.sourceRef || 'No guardada')}</dd><dt>Referencia FVMarket</dt><dd>${esc(item.ref || '—')}</dd>${item.sourceEan ? `<dt>EAN</dt><dd>${esc(item.sourceEan)}</dd>` : ''}<dt>Cantidad a comprar</dt><dd><strong>${Number(item.qty)} unidades</strong></dd><dt>Coste de origen por unidad</dt><dd>${money(item.sourcePrice)}</dd><dt>Total de compra al proveedor</dt><dd>${money(item.sourceTotal)}</dd>${item.supplierAddress ? `<dt>Dirección del proveedor</dt><dd>${esc(item.supplierAddress)}</dd>` : ''}</dl>${safeLink}</div>`;
    const previousFocus = document.activeElement;
    const close = () => {modal.remove(); previousFocus?.focus?.();};
    modal.querySelector('button').onclick = close;
    modal.onclick = event => {if(event.target === modal)close();};
    modal.onkeydown = event => {
      if(event.key === 'Escape')close();
      if(event.key !== 'Tab')return;
      const controls = [...modal.querySelectorAll('button,a[href]')], first = controls[0], last = controls.at(-1);
      if(event.shiftKey && document.activeElement === first){event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement === last){event.preventDefault();first.focus();}
    };
    document.body.appendChild(modal); modal.querySelector('button').focus();
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-purchase-order]');
    if(button)window.fvmOpenPurchaseDetails(button.dataset.purchaseOrder,Number(button.dataset.purchaseIndex));
  });
  const style = document.createElement('style');
  style.textContent = '.fvmPurchaseProductButton{display:block;width:100%;border:1px solid #c7d8e6;border-radius:8px;background:#f3f8fc;color:#06345f;text-align:left;padding:10px 12px;cursor:pointer;margin:5px 0}.fvmPurchaseProductButton strong{display:block;font-size:15px;line-height:1.4}.fvmPurchaseProductButton span{display:block;font-size:12px;margin-top:4px;color:#48617b}.fvmPurchaseProductButton:hover{border-color:#5c963e;background:#edf8e7}.fvmPurchaseProductButton:focus-visible{outline:3px solid #82c341}.fvmPurchaseDetailModal{position:fixed;inset:0;background:#03264acc;z-index:150;display:flex;align-items:center;justify-content:center;padding:16px}.fvmPurchaseDetailBox{background:#fff;border-radius:14px;padding:24px;width:min(680px,96vw);max-height:90vh;overflow:auto;position:relative;color:#10233f}.fvmPurchaseDetailBox>.closeX{position:absolute;right:14px;top:14px}.fvmPurchaseDetailBox h2{font-size:21px;margin-right:35px;line-height:1.3}.fvmPurchaseDescription{white-space:pre-wrap;font-size:14px;line-height:1.6}.fvmPurchaseDetailImage{display:block;width:100%;height:220px;object-fit:contain}.fvmPurchaseDetailBox dl{display:grid;grid-template-columns:minmax(120px,1fr) minmax(0,2fr);gap:10px;font-size:14px}.fvmPurchaseDetailBox dt{font-weight:750}.fvmPurchaseDetailBox dd{margin:0;overflow-wrap:anywhere}.fvmPurchaseDetailBox a{display:inline-block;margin-top:12px;color:#075b93;font-weight:750}@media(max-width:480px){.fvmPurchaseDetailBox dl{grid-template-columns:1fr;gap:5px}.fvmPurchaseDetailBox dd{margin-bottom:9px}}';
  document.head.appendChild(style);
})();
