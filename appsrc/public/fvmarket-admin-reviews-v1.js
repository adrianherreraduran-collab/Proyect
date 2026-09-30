(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statuses = {pending:'Pendiente de aprobación',approved:'Aprobada',rejected:'Rechazada'};
  let filter = 'pending', mounted = false;
  function role() {try{return session?.user?.role;}catch{return window.session?.user?.role;}}
  function reviewCard(review) {
    return `<article class="fvmModerationCard"><header><div><b>${esc(review.authorName || 'Cliente verificado')}</b><small>${review.kind==='experience'?'Experiencia de compra':'Opinión de producto'} · ${esc(review.orderNumber)}${review.productTitle?' · '+esc(review.productTitle):''} · ${esc(new Date(review.createdAt).toLocaleDateString('es-ES'))}</small></div><span class="fvmModerationStatus ${esc(review.status)}">${statuses[review.status]}</span></header><div class="fvmModerationStars">${'★'.repeat(Math.max(1,Math.min(5,Number(review.rating)||1)))}</div><p class="fvmModerationComment">${esc(review.comment)}</p>${review.rejectionReason?'<p>Motivo: '+esc(review.rejectionReason)+'</p>':''}${review.reviewedBy?'<small>Revisada por '+esc(review.reviewedBy.name)+' · '+esc(new Date(review.reviewedAt).toLocaleString('es-ES'))+'</small>':''}<div class="fvmModerationActions"><label>Motivo del rechazo (opcional)<textarea maxlength="500" data-review-reason placeholder="Contenido obsceno, datos personales u otro contenido no permitido"></textarea></label><div>${review.status!=='approved'?'<button type="button" class="btn lime" data-review-decision="approve">Aprobar y publicar</button>':''}${review.status!=='rejected'?'<button type="button" class="btn ghost" data-review-decision="reject">Rechazar'+(review.status==='approved'?' y retirar':'')+'</button>':''}</div><p role="status" data-review-message></p></div></article>`;
  }
  async function loadReviews() {
    const host = $('fvmModerationList'); if(!host)return;
    try {
      const result = await api('/api/admin/reviews?status='+encodeURIComponent(filter));
      document.querySelectorAll('[data-moderation-filter]').forEach(button=>{const key=button.dataset.moderationFilter;button.textContent=({pending:'Pendientes',approved:'Aprobadas',rejected:'Rechazadas'})[key]+' ('+(result.counts[key]||0)+')';button.classList.toggle('active',key===filter);});
      host.innerHTML = result.reviews.length ? result.reviews.map(reviewCard).join('') : '<p class="empty">No hay opiniones en esta sección.</p>';
      host.querySelectorAll('.fvmModerationCard').forEach((card,index)=>{
        const review = result.reviews[index];
        card.querySelectorAll('[data-review-decision]').forEach(button=>button.onclick=async()=>{
          const controls=[...card.querySelectorAll('button')],message=card.querySelector('[data-review-message]');
          controls.forEach(control=>control.disabled=true);message.textContent='Guardando decisión…';
          try {
            await api('/api/admin/reviews/'+review.kind+'/'+encodeURIComponent(review.id),{method:'PATCH',body:JSON.stringify({action:button.dataset.reviewDecision,reason:card.querySelector('[data-review-reason]').value})});
            await loadReviews();window.fvmRefreshPendingReviews?.();
          } catch(error){message.textContent=error.message;controls.forEach(control=>control.disabled=false);}
        });
      });
    } catch(error){host.innerHTML='<p class="notice">'+esc(error.message)+'</p>';}
  }
  function showReviews() {
    document.querySelectorAll('.tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.view==='reviews'));
    document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active',view.id==='view-reviews'));
    loadReviews();
  }
  function mount() {
    if(mounted||role()!=='admin'||!$('panel'))return;
    const nav=document.querySelector('.navin');if(!nav)return;
    mounted=true;
    const tab=document.createElement('button');tab.className='tab';tab.dataset.view='reviews';tab.textContent='★ Opiniones';tab.onclick=showReviews;nav.appendChild(tab);
    const view=document.createElement('section');view.id='view-reviews';view.className='view';
    view.innerHTML='<div class="card"><div class="bar"><div><h2>Revisión de opiniones</h2><p class="sub">Solo las opiniones aprobadas se muestran en la tienda. Revisa el comentario antes de publicarlo.</p></div><button class="btn navy" type="button" id="fvmModerationRefresh" aria-label="Actualizar opiniones">↻</button></div><div class="fvmModerationFilters"><button type="button" class="btn ghost" data-moderation-filter="pending">Pendientes</button><button type="button" class="btn ghost" data-moderation-filter="approved">Aprobadas</button><button type="button" class="btn ghost" data-moderation-filter="rejected">Rechazadas</button></div><div id="fvmModerationList"></div></div>';
    $('panel').appendChild(view);
    view.querySelectorAll('[data-moderation-filter]').forEach(button=>button.onclick=()=>{filter=button.dataset.moderationFilter;loadReviews();});
    $('fvmModerationRefresh').onclick=loadReviews;
    const style=document.createElement('style');style.textContent='.fvmModerationFilters{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.fvmModerationFilters .active{background:#06345f;color:white}.fvmModerationCard{border:1px solid #dfe7ee;border-radius:10px;padding:16px;margin:12px 0}.fvmModerationCard header{display:flex;justify-content:space-between;gap:10px;background:none;color:#10233f}.fvmModerationCard small{display:block;color:#60748a;margin:5px 0}.fvmModerationComment{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.6}.fvmModerationStars{color:#e09210;font-size:20px}.fvmModerationStatus{font-size:11px;font-weight:750;padding:5px 9px;border-radius:20px;height:fit-content}.fvmModerationStatus.pending{background:#fff3d6;color:#815500}.fvmModerationStatus.approved{background:#e8f5e5;color:#27621b}.fvmModerationStatus.rejected{background:#ffe7e7;color:#a32323}.fvmModerationActions label{display:block;font-size:12px}.fvmModerationActions textarea{display:block;box-sizing:border-box;width:100%;max-width:620px;border:1px solid #cbd9e4;border-radius:7px;min-height:50px;margin:5px 0 10px;padding:8px}.fvmModerationActions button{margin:0 6px 0 0}';document.head.appendChild(style);
  }
  const timer=setInterval(()=>{mount();if(mounted)clearInterval(timer);},500);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
