(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value).toLocaleString('es-ES', {style:'currency',currency:'EUR'});
  const style = document.createElement('style');
  style.textContent = '.fvmReturnsInfo{margin:20px 0;padding:18px;border:1px solid #cbd9e4;border-radius:12px;background:#f3f8fb;color:#17354d;font-size:13px;line-height:1.55}.fvmReturnsInfo h3{margin:0 0 8px;color:#06345f;font-size:16px}.fvmReturnsInfo p{margin:8px 0}.fvmReturnsInfo ul{margin:12px 0;padding-left:20px}.fvmReturnsInfo li{margin:8px 0}.fvmReturnsInfo a{color:#075b93;text-decoration:underline;font-weight:700}.fvmReturnsInfo .pending{color:#8a5300}';
  document.head.appendChild(style);
  window.fvmReturnsInformationHtml = info => {
    if (!info) return '';
    const rules = '<ol class="fvmReturnRules"><li><b>Correo ordinario:</b> si el artículo admite este envío y se informa antes de comprar, organizas la devolución y pagas únicamente el coste directo del transportista que elijas.</li><li><b>Artículos voluminosos:</b> si no admiten correo ordinario, solo asumes el coste directo cuando se haya indicado su importe o una estimación máxima razonable antes de comprar. Si falta esa información, FVMarket asume el transporte de devolución.</li><li><b>Falta de información:</b> si FVMarket no te ha informado previamente de que debes pagar la devolución, FVMarket asume ese coste.</li></ol>';
    const role = '<p>Las solicitudes de desistimiento, reembolso y garantía se dirigen a <b>FVMarket</b>, que responde como vendedor. <b>RutaFV</b> presta el transporte contratado y no está obligada a recoger gratuitamente ni a pagar las devoluciones por cambio de opinión. Se mantienen las responsabilidades legales que correspondan a RutaFV por su propio servicio.</p>';
    return '<section class="fvmReturnsInfo"><h3>Devoluciones y garantía</h3><p><b>14 días para comunicar el desistimiento desde la recepción · 3 años de garantía en bienes nuevos.</b></p>' + rules + '<p><b>Aplicable a los artículos de este pedido:</b></p><ul>' + (info.lines || []).map(line => '<li><b>' + esc(line.title) + '</b> · ' + esc(line.qty) + ' ud.: ' + (line.mode === 'postal' ? 'pagas el coste directo del envío postal que elijas.' : line.mode === 'non_postal' ? 'no admite envío postal ordinario; coste máximo estimado de devolución: <b>' + money(line.maxCostForQuantity) + '</b> (' + money(line.maxCostPerUnit) + ' por unidad, impuestos incluidos).' : 'FVMarket organiza y paga el transporte de devolución por desistimiento; coste para ti: 0 €.') + '</li>').join('') + '</ul><p>Si hay defecto, error o daño atribuible a la entrega, FVMarket la gestiona y paga. El transporte gratis o los descuentos de la compra no modifican estas reglas.</p>' + role + '<p><a href="/legal/devoluciones" target="_blank" rel="noopener">Plazos y condiciones</a> · <a href="/legal/desistimiento" target="_blank" rel="noopener">Formulario de desistimiento</a></p></section>';
  };
  let timer, sequence = 0, currentKey = '', currentInfo = null;
  function box() {
    let host = $('fvmCartReturns');
    if (!host && $('cartCheckout')) {
      host = document.createElement('div'); host.id = 'fvmCartReturns'; host.setAttribute('aria-live','polite');
      $('cartCheckout').insertBefore(host, $('cartCheckout').querySelector('.checkoutConsent'));
    }
    return host;
  }
  async function refresh() {
    const host = box(); if (!host) return;
    let items; try { items = cart.filter(item => Number(item.qty) > 0 && cartProduct(item.id)).map(({id,qty}) => ({id,qty})); } catch { items = []; }
    const key = JSON.stringify(items.map(item => ({...item,returnPolicy:cartProduct(item.id)?.returnPolicy}))), version = ++sequence;
    if (!items.length) { currentKey = ''; currentInfo = null; host.innerHTML = ''; return; }
    if (key === currentKey && currentInfo) { host.innerHTML = window.fvmReturnsInformationHtml(currentInfo); return; }
    host.innerHTML = '<div class="fvmReturnsInfo">Consultando información de devolución…</div>';
    try {
      const response = await fetch('/api/returns/information', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});
      const info = await response.json();
      if (!response.ok) throw Error(info.error || 'No se pudo consultar la devolución.');
      if (version !== sequence) return;
      currentKey = key; currentInfo = info; host.innerHTML = window.fvmReturnsInformationHtml(info);
    } catch (error) {
      if (version === sequence) { currentKey = ''; currentInfo = null; host.innerHTML = '<div class="fvmReturnsInfo">' + esc(error.message) + ' <a href="/legal/devoluciones" target="_blank" rel="noopener">Consultar condiciones</a></div>'; }
    }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(refresh,150); }
  const originalRender = window.renderCart;
  window.renderCart = function () { const result = originalRender?.apply(this,arguments); schedule(); return result; };
  try { renderCart = window.renderCart; } catch {}
  const originalOpen = window.openCart;
  window.openCart = function () { currentKey = ''; currentInfo = null; const result = originalOpen?.apply(this,arguments); schedule(); return result; };
  try { openCart = window.openCart; } catch {}
  box();
})();
