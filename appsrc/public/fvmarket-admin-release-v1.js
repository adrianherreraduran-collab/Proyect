(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => { try { return session?.user?.role; } catch { return ''; } };
  let pendingRequest = false;
  async function reviewBadge() {
    if (role() !== 'admin' || $('panel')?.style.display !== 'block' || pendingRequest) return;
    pendingRequest = true;
    try {
      const result = await api('/api/admin/reviews?status=pending'), count = Number(result.counts?.pending || 0);
      const tab = document.querySelector('.tab[data-view=reviews]');
      if (tab) { tab.textContent = '★ Opiniones' + (count ? ' (' + count + ')' : ''); tab.classList.toggle('fvmAttention', count > 0); }
      let banner = $('fvmPendingReviewNotice');
      if (!banner) { banner = document.createElement('button'); banner.id = 'fvmPendingReviewNotice'; banner.className = 'fvmPendingReviewNotice'; banner.type = 'button'; document.querySelector('.heroAdmin')?.appendChild(banner); banner.onclick = () => document.querySelector('.tab[data-view=reviews]')?.click(); }
      if (banner) { banner.hidden = !count; banner.textContent = count + (count === 1 ? ' opinión pendiente de revisión' : ' opiniones pendientes de revisión') + ' · Revisar'; }
    } catch {} finally { pendingRequest = false; }
  }
  const style = document.createElement('style'); style.textContent = '.tab.fvmAttention{background:#fff0cb!important;color:#815500!important;font-weight:900;box-shadow:inset 0 -3px #db9200}.fvmPendingReviewNotice{border:1px solid #e1b75b;background:#fff4d6;color:#815500;border-radius:9px;padding:10px 14px;margin-top:12px;font-weight:800;cursor:pointer}.fvmUrlImportBox{padding:14px;border:1px solid #cbd9e4;border-radius:10px;margin:12px 0;background:#f1f7fb}.fvmUrlImportBox input{width:100%;margin:8px 0}.fvmUrlImportBox .btn{margin-bottom:6px}.fvmUrlImportBox p{font-size:11px;color:#48617b}.fvmUrlImageSelection{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:10px}.fvmUrlImageSelection label{padding:6px;border:1px solid #cbd9e4;border-radius:8px;background:white}.fvmUrlImageSelection img{width:100%;height:110px;object-fit:contain}.fvmUrlImageSelection input{width:auto}'; document.head.appendChild(style);
  function urlImport() {
    const modal = document.querySelector('.v13Modal'), host = modal?.querySelector('.v13CaptureBox')?.parentElement;
    if (!host || modal.querySelector('#fvmProductUrl')) return;
    const box = document.createElement('section'); box.className = 'fvmUrlImportBox';
    box.innerHTML = '<b>Añadir artículo desde una URL</b><p>Pega la ficha pública del producto. Podrás revisar y editar sus datos e imágenes antes de guardarlo.</p><input type="url" id="fvmProductUrl" placeholder="https://tienda.es/producto.html" aria-label="URL de la ficha del producto"><button type="button" class="btn navy" id="fvmReadProductUrl">Leer ficha</button><p id="fvmUrlStatus" role="status"></p><div id="fvmUrlImages"></div>';
    host.prepend(box);
    $('fvmReadProductUrl').onclick = async () => {
      const button = $('fvmReadProductUrl'), message = $('fvmUrlStatus'); button.disabled = true; message.textContent = 'Leyendo ficha…';
      try {
        const product = await api('/api/admin/import-url', { method: 'POST', body: JSON.stringify({ url: $('fvmProductUrl').value.trim() }) });
        if (product.existingProduct) { message.textContent = 'Ya existe ' + product.existingProduct.ref + ': ' + product.existingProduct.title + '. Abre su edición desde Productos.'; return; }
        const values = { v13Title: product.title, v13SourceRef: product.sourceRef, v13SourcePrice: product.sourcePrice, v13Description: product.description, v13WeightKg: product.weightKg || '' };
        Object.entries(values).forEach(([id, value]) => { if ($(id)) $(id).value = value ?? ''; });
        $('v13SourcePrice')?.dispatchEvent(new Event('input', { bubbles: true }));
        const category = $('v13Category'); if (category && (!category.options || [...category.options].some(option => option.value === product.category))) { category.value = product.category; category.dispatchEvent(new Event('change', { bubbles: true })); }
        const state = window.fvmSupplierV13?.state; if (state) state.urlImport = { sourceUrl: product.sourceUrl, sourceEan: product.sourceEan, sourceTaxNote: product.sourceTaxNote, sourceProvider: product.sourceProvider };
        message.textContent = ['Ficha leída. Revisa precio, impuestos y peso antes de guardar.', product.sourceTaxNote, ...(product.importWarnings || [])].filter(Boolean).join(' ');
        const images = product.sourceImages || product.images || [];
        $('fvmUrlImages').innerHTML = images.length ? '<p>Selecciona las fotos que quieres añadir al borrador.</p><div class="fvmUrlImageSelection">' + images.map((image, index) => `<label><img src="${esc(image.url)}" alt="Imagen del producto ${index + 1}"><input type="checkbox" data-url-image="${index}"> Añadir</label>`).join('') + '</div>' : '';
        $('fvmUrlImages').querySelectorAll('input').forEach(input => input.onchange = () => { const image = images[Number(input.dataset.urlImage)]; if (!state) return; if (input.checked) { if (!state.photos.some(photo => photo.url === image.url)) state.photos.push({ ...image, origin: 'source-url' }); } else state.photos = state.photos.filter(photo => photo.url !== image.url); window.fvmSupplierV13.renderPhotos(); });
      } catch (error) { message.textContent = error.message; } finally { button.disabled = false; }
    };
  }
  function customerBenefitsEditor() {
    const input = $('customerDiscountPct'), host = input?.closest('.customerDiscountEditor');
    if (!host || $('customerFreeTransport')) return;
    const label = document.createElement('label'); label.innerHTML = '<input type="checkbox" id="customerFreeTransport"> Transporte gratis'; host.insertBefore(label, host.querySelector('button')); $('customerFreeTransport').checked = host.dataset.freeTransport === 'yes'; host.querySelector('button').textContent = 'Guardar beneficios';
  }
  new MutationObserver(() => { urlImport(); customerBenefitsEditor(); }).observe(document.body, { childList: true, subtree: true });
  setInterval(reviewBadge, 15000); setTimeout(reviewBadge, 1600);
  window.fvmRefreshPendingReviews = reviewBadge;
  window.fvmRenderSellerIdentity = status => {
    const box = $('fvmSellerIdentityStatus');
    if (!box || !status) return;
    box.innerHTML = status.ready ? '<b>Datos del vendedor confirmados.</b> Antes de abrir ventas reales debes completar también fiscalidad, condiciones, devoluciones y los demás controles de revisión.' : '<b>Identificación del vendedor pendiente.</b>' + (status.issues?.length ? '<ul>' + status.issues.map(issue => '<li>' + esc(issue.label) + '</li>').join('') + '</ul>' : '<p>Revisa los datos y marca la casilla de confirmación al guardar.</p>') + '<p>Los pagos reales están deshabilitados mientras este punto siga pendiente. Stripe en modo de pruebas puede seguir utilizándose.</p>';
  };
  async function readiness() {
    if (role() !== 'admin' || !$('view-settings') || $('fvmReadiness')) return;
    const box = document.createElement('section'); box.id = 'fvmReadiness'; box.className = 'card';
    box.innerHTML = '<h2>Comprobación de producción</h2><div id="fvmReadinessResult">Comprobando configuración…</div><button type="button" class="btn navy">Actualizar comprobación</button>';
    $('view-settings').appendChild(box);
    const check = async () => {
      try {
        const status = await api('/api/admin/readiness');
        const checks = [['Datos en Postgres', status.persistence.enabled && status.persistence.healthy], ['Stripe en modo real', status.stripe.live && status.stripe.webhook], ['Correo transaccional', status.email.configured], ['Correo de alertas del admin', !!status.email.adminRecipient], ['Identificación legal del vendedor confirmada', status.sellerIdentity?.ready === true], ['Información de devolución del catálogo confirmada', status.returns?.ready === true]];
        $('fvmReadinessResult').innerHTML = checks.map(([label, valid]) => '<p style="color:' + (valid ? '#397820' : '#a32323') + '"><b>' + (valid ? '✓ ' : 'Pendiente: ') + '</b>' + label + '</p>').join('') + '<small>La permanencia de la base de datos y las copias de seguridad se comprueban en Render.</small>';
        window.fvmRenderSellerIdentity(status.sellerIdentity);
        if ($('adminAlertEmail') && ! $('adminAlertEmail').value && status.email.adminRecipient) $('adminAlertEmail').value = status.email.adminRecipient;
      } catch (error) { $('fvmReadinessResult').textContent = error.message; }
    };
    box.querySelector('button').onclick = check; await check();
  }
  setInterval(readiness, 2000);
})();
