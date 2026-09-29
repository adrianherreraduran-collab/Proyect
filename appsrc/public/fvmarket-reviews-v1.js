// FVM_CUSTOMER_REVIEWS_V1
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = value => Number(value || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const date = value => value ? new Date(value).toLocaleDateString('es-ES') : '';
  const apiCall = (...args) => (typeof window.api === 'function' ? window.api(...args) : Promise.reject(new Error('La sesión no está disponible')));
  const reviewSelector = id => `[data-review-product="${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;

  function currentProducts() {
    try { return Array.isArray(products) ? products : []; } catch { return Array.isArray(window.products) ? window.products : []; }
  }

  function currentSession() {
    try { return session || null; } catch { return window.session || null; }
  }

  function gallery(product) {
    const rows = Array.isArray(product?.images) ? product.images : [];
    const urls = rows.map(item => typeof item === 'string' ? item : item?.url).filter(Boolean);
    if (product?.image && !urls.includes(product.image)) urls.unshift(product.image);
    return [...new Set(urls)].slice(0, 12);
  }

  function stars(value, muted = false) {
    const rating = Math.max(0, Math.min(5, Number(value) || 0));
    const full = Math.round(rating);
    return `<span class="fvmReviewStars ${muted ? 'muted' : ''}" aria-label="${rating.toLocaleString('es-ES', { maximumFractionDigits: 1 })} de 5 estrellas">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
  }

  function installStyle() {
    if ($('fvmCustomerReviewsStyle')) return;
    const style = document.createElement('style');
    style.id = 'fvmCustomerReviewsStyle';
    style.textContent = `
      .fvmProductReviews{margin-top:22px;border-top:1px solid #e1e9ef;padding-top:18px}.fvmReviewSummary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0 14px}.fvmReviewStars{color:#f28a00;letter-spacing:1px;font-size:18px;line-height:1}.fvmReviewStars.muted{font-size:15px}.fvmReviewCount{color:#60748a;font-size:11px}.fvmReviewVerified{display:inline-flex;align-items:center;gap:4px;background:#edf8e7;color:#397820;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800}.fvmReviewList{display:grid;gap:9px;margin-top:12px}.fvmReviewItem{border:1px solid #e1e9ef;border-radius:9px;padding:10px 11px;background:#fbfdfe}.fvmReviewItemHead{display:flex;justify-content:space-between;align-items:center;gap:10px}.fvmReviewItemHead strong{color:#06345f;font-size:11px}.fvmReviewItemHead time{color:#718399;font-size:10px}.fvmReviewItem p{margin:7px 0 0;color:#33465d;font-size:11px;line-height:1.5;white-space:pre-wrap}.fvmReviewForm{margin-top:15px;padding:13px;border:1px solid #cfe2c2;background:#f5faF2;border-radius:10px}.fvmReviewForm h4{margin:0 0 8px;color:#06345f;font-size:13px}.fvmReviewForm select,.fvmReviewForm textarea{width:100%;border:1px solid #cbd9e4;border-radius:7px;background:#fff;padding:8px;box-sizing:border-box;font:inherit;font-size:11px;color:#10233f}.fvmReviewForm textarea{min-height:74px;resize:vertical;margin-top:8px}.fvmReviewForm button{margin-top:8px;border:0;border-radius:7px;background:#06345f;color:#fff;padding:9px 13px;font-size:11px;font-weight:900;cursor:pointer}.fvmReviewForm button:disabled{opacity:.55;cursor:wait}.fvmReviewMessage{margin:8px 0 0;color:#a32929;font-size:11px}.fvmReviewMessage.ok{color:#397820}.fvmReviewLogin{margin:10px 0 0;color:#60748a;font-size:11px}.fvmReviewLogin button{border:0;background:none;color:#06345f;text-decoration:underline;font-weight:900;cursor:pointer;padding:0}.fvmReviewEmpty{color:#718399;font-size:11px;padding:6px 0}.fvmReviewsLoading{color:#60748a;font-size:11px;padding:8px 0}
    `;
    document.head.appendChild(style);
  }

  function reviewSection(product, data) {
    const summary = data || product?.reviewSummary || { average: 0, count: 0, reviews: [] };
    const reviews = Array.isArray(summary.reviews) ? summary.reviews : [];
    const eligibility = summary.eligibility || { eligible: false, alreadyReviewed: false, reason: 'Inicia sesión para valorar este producto.' };
    const logged = !!currentSession()?.token;
    const form = eligibility.eligible ? `<form class="fvmReviewForm" data-review-form="${esc(product.id)}"><h4>Valora este producto</h4><label for="fvmReviewRating-${esc(product.id)}">Valoración</label><select id="fvmReviewRating-${esc(product.id)}" name="rating" required><option value="5">★★★★★ · 5 estrellas</option><option value="4">★★★★☆ · 4 estrellas</option><option value="3">★★★☆☆ · 3 estrellas</option><option value="2">★★☆☆☆ · 2 estrellas</option><option value="1">★☆☆☆☆ · 1 estrella</option></select><textarea name="comment" maxlength="2000" minlength="5" required placeholder="Cuéntanos cómo fue tu experiencia con este producto…"></textarea><button type="submit">Publicar opinión</button><p class="fvmReviewMessage" data-review-message></p></form>` : (logged ? `<p class="fvmReviewLogin">${esc(eligibility.reason || 'Podrás valorar este producto después de comprarlo.')}</p>` : '<p class="fvmReviewLogin">Para valorar una compra, <button type="button" data-review-login>inicia sesión</button> en FVMarket.</p>');
    const list = reviews.length ? reviews.map(review => `<article class="fvmReviewItem"><div class="fvmReviewItemHead"><strong>${esc(review.authorName || 'Cliente verificado')}</strong><time datetime="${esc(review.createdAt || '')}">${esc(date(review.createdAt))}</time></div><div>${stars(review.rating, true)} <span class="fvmReviewVerified">✓ Compra verificada</span></div><p>${esc(review.comment || '')}</p></article>`).join('') : '<div class="fvmReviewEmpty">Todavía no hay opiniones para este producto.</div>';
    return `<section class="fvmProductReviews" data-review-product="${esc(product.id)}"><h3>Opiniones de clientes</h3><div class="fvmReviewSummary">${summary.count ? stars(summary.average) : stars(0, true)}<strong>${summary.count ? esc(Number(summary.average).toLocaleString('es-ES', { maximumFractionDigits: 1 })) + ' / 5' : 'Sin valoraciones'}</strong><span class="fvmReviewCount">${summary.count} ${summary.count === 1 ? 'opinión' : 'opiniones'}</span></div>${form}<div class="fvmReviewList">${list}</div></section>`;
  }

  async function loadReviews(product) {
    const host = document.querySelector(reviewSelector(product.id));
    if (!host) return;
    try {
      const data = await apiCall('/api/products/' + encodeURIComponent(product.id) + '/reviews');
      if (!document.querySelector(reviewSelector(product.id))) return;
      host.outerHTML = reviewSection(product, data);
      bindReviewEvents(product);
    } catch (error) {
      const message = document.querySelector(reviewSelector(product.id) + ' .fvmReviewsLoading');
      if (message) message.textContent = error.message || 'No se pudieron cargar las opiniones.';
    }
  }

  function bindReviewEvents(product) {
    const root = document.querySelector(reviewSelector(product.id));
    if (!root) return;
    root.querySelector('[data-review-login]')?.addEventListener('click', () => window.openAccount?.());
    const form = root.querySelector('[data-review-form]');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]'), message = form.querySelector('[data-review-message]');
      const rating = Number(form.querySelector('[name="rating"]')?.value || 0), comment = String(form.querySelector('[name="comment"]')?.value || '').trim();
      if (!rating || comment.length < 5) { if (message) message.textContent = 'Selecciona una valoración y escribe una opinión de al menos 5 caracteres.'; return; }
      button.disabled = true;
      if (message) { message.className = 'fvmReviewMessage'; message.textContent = 'Publicando tu opinión…'; }
      try {
        const result = await apiCall('/api/products/' + encodeURIComponent(product.id) + '/reviews', { method: 'POST', body: JSON.stringify({ rating, comment }) });
        product.reviewSummary = result.summary;
        root.outerHTML = reviewSection(product, { ...result.summary, eligibility: { eligible: false, alreadyReviewed: true, reason: 'Ya has valorado este producto.' } });
        bindReviewEvents(product);
      } catch (error) {
        button.disabled = false;
        if (message) { message.className = 'fvmReviewMessage'; message.textContent = error.message || 'No se pudo publicar la opinión.'; }
      }
    });
  }

  function productDetail(id) {
    const product = currentProducts().find(item => String(item.id) === String(id));
    if (!product) return;
    installStyle();
    const urls = gallery(product), first = urls[0] || '';
    const thumbs = urls.map((url, index) => `<button class="pdThumb ${index ? '' : 'active'}" style="background-image:url('${esc(url)}')" onclick="setDetailImage('${esc(url)}',this)" aria-label="Imagen ${index + 1}"></button>`).join('');
    const initialReviews = product.reviewSummary || { average: 0, count: 0, reviews: [] };
    const content = $('productDetailContent');
    if (!content) return;
    content.innerHTML = `<div class="pdGrid"><div><div id="pdMainImage" class="pdMain" style="background-image:url('${esc(first)}')"></div><div class="pdThumbs">${thumbs}</div></div><div><div class="pdCategory">${esc(product.category || '')}</div><h2 class="pdTitle">${esc(product.title || '')}</h2><div class="pdRef">Ref. ${esc(product.ref || '')}</div><div class="pdDescription">${esc(product.description || 'Consulta disponibilidad y características del artículo.')}</div><div>${product.hasDiscount ? `<span class="oldPrice">${money(product.regularPrice)}</span>` : ''}<span class="pdPrice">${money(product.salePrice ?? product.price)}</span></div><div class="pdDelivery">Plazo estimado: ${esc(product.deliveryEstimate?.label || 'Pendiente de confirmar')}</div><div class="pdActions"><button class="pdAdd" onclick="addToCart('${esc(product.id)}');closeProductDetail()">Añadir al carrito</button></div></div></div>${reviewSection(product, initialReviews)}`;
    $('productDetailModal')?.classList.add('show');
    bindReviewEvents(product);
    loadReviews(product);
  }

  window.openProductDetail = productDetail;
  if (typeof window.renderProducts === 'function') {
    // The existing catalog renderer remains the source of truth for cards; the
    // overridden detail view adds the verified-review flow without changing cart behavior.
  }
})();
