'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const money = n => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reasons = { weight_unknown: 'Hay artículos cuyo peso necesita confirmación.', weight_limit: 'Este pedido supera el peso máximo de la promoción.', excluded_product: 'El pedido incluye artículos excluidos de esta promoción.', shipping_cost_limit: 'El transporte supera el límite cubierto por esta promoción.' };
  let timer, lastKey = '', requestVersion = 0;
  function mount() {
    if (!$('fvmShippingProgress') && $('cartTotal')) {
      const node = document.createElement('section'); node.id = 'fvmShippingProgress'; node.hidden = true; node.setAttribute('aria-live', 'polite');
      node.style.cssText = 'margin:12px 0;padding:12px;border:1px solid #b8d99e;border-radius:9px;background:#f4faef;color:#244c18;font-size:12px;line-height:1.5';
      $('cartTotal').insertAdjacentElement('beforebegin', node);
    }
  }
  function render(promotion) {
    const node = $('fvmShippingProgress'); if (!node) return;
    if (!promotion?.enabled || !cart.length) { node.hidden = true; node.textContent = ''; return; }
    node.hidden = false;
    const r = promotion.rule;
    let message = promotion.reason === 'customer_benefit' ? 'Tu cuenta tiene transporte gratis.' : promotion.freeTransport ? '¡Tu pedido tiene transporte gratis!' : promotion.discountAmount > 0 ? 'Tienes una bonificación de ' + money(promotion.discountAmount) + ' en el transporte. Te faltan ' + money(promotion.remaining) + ' para alcanzar el mínimo de envío gratis.' : reasons[promotion.reason] || (promotion.reason === 'destination_required' ? 'Completa la localidad y el código postal para consultar las promociones de transporte.' : promotion.reason === 'outside_zone' ? 'La promoción de transporte gratis no cubre esta dirección.' : promotion.reason === 'quote_required' ? 'Has alcanzado un tramo de promoción. Calcula el transporte para confirmar la bonificación.' : 'Te faltan ' + money(promotion.remaining) + ' para alcanzar el mínimo de transporte gratis.');
    let conditions = '';
    if (r) conditions = '<small style="display:block;margin-top:6px">' + esc(r.name) + ' · Compra mínima: ' + money(r.minSubtotal) + ' después de descuentos · Hasta ' + Number(r.maxWeightKg) + ' kg' + (r.maxShippingCost !== null ? ' · Transporte cubierto hasta ' + money(r.maxShippingCost) : '') + (r.cities.length ? ' · ' + esc(r.cities.join(', ')) : '') + (r.postalCodes.length ? ' · CP: ' + esc(r.postalCodes.join(', ')) : '') + (r.excludedRefs.length ? ' · Referencias excluidas: ' + esc(r.excludedRefs.join(', ')) : '') + (r.discountThreshold > 0 ? ' · Bonificación de ' + money(r.discountAmount) + ' desde ' + money(r.discountThreshold) : '') + '</small>';
    const progress = r && !reasons[promotion.reason] ? '<progress aria-label="Progreso hacia transporte gratis" max="' + Number(r.minSubtotal) + '" value="' + Math.min(Number(r.minSubtotal), Number(promotion.subtotal)) + '" style="width:100%;margin-top:8px;accent-color:#589630"></progress>' : '';
    const inCart = new Set(cart.map(x => x.id));
    const categories = new Set(cart.map(x => cartProduct(x.id)?.category).filter(Boolean));
    const suggestions = promotion.remaining > 0 && !reasons[promotion.reason] ? [...catalogProducts.values()].filter(p => !inCart.has(p.id) && categories.has(p.category) && Number(p.customerPrice ?? p.salePrice ?? p.price) > 0).sort((a,b) => Number(a.customerPrice ?? a.salePrice ?? a.price) - Number(b.customerPrice ?? b.salePrice ?? b.price)).slice(0, 3) : [];
    node.innerHTML = '<strong>' + esc(message) + '</strong>' + progress + conditions;
    if (suggestions.length) {
      const box = document.createElement('div'); box.style.marginTop = '8px';
      const label = document.createElement('small'); label.textContent = 'Otros artículos de la misma categoría que puedes añadir:'; box.appendChild(label);
      for (const p of suggestions) { const button = document.createElement('button'); button.type = 'button'; button.style.cssText = 'display:block;margin:5px 0;padding:6px;border:1px solid #b8d99e;border-radius:6px;background:white;color:#244c18;text-align:left;cursor:pointer'; button.textContent = p.title + ' · ' + money(p.customerPrice ?? p.salePrice ?? p.price); button.onclick = () => { addToCart(p.id); renderCart(); }; box.appendChild(button); }
      node.appendChild(box);
    }
  }
  async function refresh() {
    mount(); if (!$('fvmShippingProgress')) return;
    if (!session || !cart.length) { render(null); return; }
    const customer = deliveryCustomer(), destination = { address: customer.address, city: customer.city, postalCode: customer.postalCode };
    const key = JSON.stringify({ user: session.user.id, discount: session.user.discountPct, free: session.user.freeTransport, items: cart, destination, signature: rutaFVQuote?._fvmSignature, prices: cart.map(x => cartProduct(x.id)?.customerPrice) });
    if (key === lastKey) return; lastKey = key; const version = ++requestVersion;
    try { const data = await api('/api/cart/benefits', { method: 'POST', body: JSON.stringify({ items: cart, destination, quote: rutaFVQuote }) }); if (version !== requestVersion) return; window.fvmCommercialVersion = data.version; render(data.promotion); }
    catch { if (version === requestVersion) { lastKey = ''; render(null); } }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 250); }
  const baseRender = window.renderCart;
  window.renderCart = function () { const result = baseRender?.apply(this, arguments); schedule(); return result; };
  try { renderCart = window.renderCart; } catch {}
  window.fvmRefreshShippingPromotion = schedule;
  ['orderAddress', 'orderCity', 'orderPostalCode'].forEach(id => $(id)?.addEventListener('input', () => { lastKey = ''; schedule(); }));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
