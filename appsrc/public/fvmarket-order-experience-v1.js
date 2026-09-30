// FVM_DELIVERED_ORDER_EXPERIENCE_V1
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reviewStateText = review => review.status==='approved'?'Tu opinión ha sido aprobada y está publicada.':review.status==='rejected'?'Tu opinión no se ha publicado tras la revisión del administrador.'+(review.rejectionReason?' Motivo: '+review.rejectionReason:''):'Tu opinión está pendiente de aprobación por el administrador.';
  const stars = value => '★'.repeat(Math.max(1, Math.min(5, Number(value) || 1)));
  const style = document.createElement('style');
  style.textContent = '.fvmExperienceModal{position:fixed;inset:0;z-index:110;background:#03264acc;display:flex;align-items:center;justify-content:center;padding:16px}.fvmExperienceBox{position:relative;width:min(520px,94vw);max-height:88vh;overflow:auto;background:#fff;border-radius:14px;padding:24px;color:#294e73;box-shadow:0 30px 90px #0006}.fvmExperienceBox h2{font-size:20px;margin:0 30px 8px 0;color:#06345f}.fvmExperienceBox p{font-size:12px;line-height:1.5}.fvmExperienceBox label{display:block;font-size:12px;font-weight:800;margin:14px 0 5px}.fvmExperienceBox select,.fvmExperienceBox textarea{box-sizing:border-box;width:100%;border:1px solid #cbd9e4;border-radius:8px;padding:10px;font:inherit;font-size:13px}.fvmExperienceBox textarea{min-height:115px;resize:vertical}.fvmExperienceSubmit{margin-top:14px;border:0;background:#397820;color:#fff;border-radius:8px;padding:11px 16px;font-weight:850;cursor:pointer}.fvmExperienceSubmit:disabled{opacity:.65;cursor:wait}.fvmExperienceMessage{color:#397820;white-space:pre-wrap}.fvmExperienceMessage.error{color:#a32929}.fvmExperienceStars{color:#e7a51b;font-size:22px;letter-spacing:2px}.fvmExperienceComment{white-space:pre-wrap}.fvmOrderFoot{flex-wrap:wrap}.fvmOrderFoot [data-order-review]{background:#eaf7e4;color:#397820;border-color:#a7d58a}';
  document.head.appendChild(style);

  window.fvmShowExperienceReview = function(order, onSaved) {
    document.getElementById('fvmExperienceModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'fvmExperienceModal';
    modal.className = 'fvmExperienceModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'fvmExperienceTitle');
    const existing = order.experienceReview;
    modal.innerHTML = `<div class="fvmExperienceBox"><button type="button" class="close" aria-label="Cerrar opinión">×</button><h2 id="fvmExperienceTitle">${existing ? 'Mi opinión' : 'Valorar compra y experiencia'}</h2><p>Pedido ${esc(order.number || order.id)} · Compra verificada</p>${existing ? `<div class="fvmExperienceStars" aria-label="${Number(existing.rating)} de 5 estrellas">${stars(existing.rating)}</div><p class="fvmExperienceComment">${esc(existing.comment)}</p><p role="status">${esc(reviewStateText(existing))}</p>` : '<form id="fvmExperienceForm"><label for="fvmExperienceRating">Valoración</label><select id="fvmExperienceRating" name="rating" required><option value="">Elige de 1 a 5 estrellas</option><option value="5">★★★★★ · 5 estrellas</option><option value="4">★★★★☆ · 4 estrellas</option><option value="3">★★★☆☆ · 3 estrellas</option><option value="2">★★☆☆☆ · 2 estrellas</option><option value="1">★☆☆☆☆ · 1 estrella</option></select><label for="fvmExperienceComment">Tu experiencia</label><textarea id="fvmExperienceComment" name="comment" required minlength="5" maxlength="2000" placeholder="Cuéntanos cómo fue la compra y la entrega…"></textarea><p>Tu opinión se publicará cuando la apruebe el administrador, con tu nombre y la inicial de tu apellido.</p><button type="submit" class="fvmExperienceSubmit">Enviar</button><p id="fvmExperienceMessage" class="fvmExperienceMessage" role="status" aria-live="polite"></p></form>'}</div>`;
    const previousFocus = document.activeElement;
    const close = () => { modal.remove(); previousFocus?.focus?.(); };
    modal.querySelector('button.close').onclick = close;
    modal.onclick = event => { if (event.target === modal) close(); };
    modal.onkeydown = event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const controls = [...modal.querySelectorAll('button,select,textarea')].filter(element => !element.disabled);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.body.appendChild(modal);
    modal.querySelector(existing ? 'button.close' : 'select').focus();
    const form = modal.querySelector('form');
    if (!form) return;
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]'), message = form.querySelector('#fvmExperienceMessage');
      const rating = Number(form.elements.rating.value), comment = form.elements.comment.value.trim();
      if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 5 || comment.length > 2000) {
        message.className = 'fvmExperienceMessage error'; message.textContent = 'Elige una valoración y escribe entre 5 y 2.000 caracteres.'; return;
      }
      button.disabled = true; message.className = 'fvmExperienceMessage'; message.textContent = 'Enviando tu opinión…';
      try {
        const result = await window.api('/api/orders/' + encodeURIComponent(order.id) + '/review', {method:'POST',body:JSON.stringify({rating,comment})});
        order.experienceReview = result.review;
        onSaved?.(result.review);
        form.innerHTML = '<p class="fvmExperienceMessage" role="status">'+esc(result.message||'Opinión enviada. Está pendiente de aprobación por el administrador.')+'</p>';
        loadExperiences();
      } catch (error) {
        button.disabled = false; message.className = 'fvmExperienceMessage error'; message.textContent = error.message || 'No se pudo enviar la opinión. Inténtalo de nuevo.';
      }
    };
  };

  async function loadExperiences() {
    const host = document.querySelector('#fvm-reviews .fvm-reviews-grid');
    if (!host) return;
    try {
      const response = await fetch('/api/reviews/experiences');
      if (!response.ok) return;
      const data = await response.json();
      if (!data.reviews?.length) {
        host.innerHTML = '<p class="fvm-reviews-empty">Todavía no hay opiniones publicadas.</p>';
        return;
      }
      host.innerHTML = data.reviews.slice(0,4).map(review => `<article class="fvm-review-card"><div class="fvm-review-stars" aria-label="${Number(review.rating)} de 5 estrellas">${stars(review.rating)}</div><blockquote>${esc(review.comment)}</blockquote><div class="fvm-review-author"><strong>${esc(review.authorName)}</strong><small>Compra verificada · ${esc(new Date(review.createdAt).toLocaleDateString('es-ES'))}</small></div></article>`).join('');
      document.getElementById('fvm-reviews-title').textContent = 'Experiencias de nuestros clientes';
      const intro = document.querySelector('#fvm-reviews .fvm-reviews-head p:not(.fvm-reviews-eyebrow)');
      if (intro) intro.textContent = 'Opiniones reales de clientes que han recibido su pedido en FVMarket.';
      const badge = document.querySelector('#fvm-reviews .fvm-reviews-demo-badge');
      if (badge) badge.textContent = 'Compras verificadas';
      const note = document.querySelector('#fvm-reviews .fvm-reviews-note span:not(.fvm-reviews-note-icon)');
      if (note) note.textContent = 'Comparte tu experiencia desde Mi cuenta → Entregados → Valorar compra y experiencia.';
    } catch {}
  }
  loadExperiences();
})();
