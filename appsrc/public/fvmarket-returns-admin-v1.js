(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let products = [], loading = false;
  function role() { try { return session?.user?.role; } catch { return ''; } }
  function showProduct() {
    const product = products.find(p => p.id === $('fvmReturnProduct').value);
    const policy = product?.returnPolicy || {mode:'pending'};
    $('fvmReturnMode').value = ['postal','non_postal'].includes(policy.mode) ? policy.mode : 'pending';
    $('fvmReturnCost').value = policy.maxCostPerUnit ?? '';
    $('fvmReturnConfirmed').checked = false;
    showCost();
  }
  function showCost() {
    const bulky = $('fvmReturnMode').value === 'non_postal';
    $('fvmReturnCostRow').hidden = !bulky; $('fvmReturnCost').disabled = !bulky;
    $('fvmReturnCost').required = bulky;
    $('fvmReturnConfirmed').required = $('fvmReturnMode').value !== 'pending';
  }
  async function load() {
    if (loading) return; loading = true;
    const selected = $('fvmReturnProduct').value;
    try {
      products = await api('/api/admin/products');
      const published = products.filter(p => p.published), pending = published.filter(p => !['postal','non_postal'].includes(p.returnPolicy?.mode) || (p.returnPolicy.mode === 'non_postal' && p.returnPolicy.maxCostPerUnit == null));
      $('fvmReturnSummary').textContent = pending.length ? pending.length + ' artículos publicados pendientes de confirmar. Los pagos reales con esos artículos están deshabilitados; las pruebas siguen disponibles.' : (published.length ? 'Información de devolución confirmada para todos los artículos publicados.' : 'No hay artículos publicados para revisar.');
      $('fvmReturnProduct').innerHTML = products.map(p => '<option value="' + esc(p.id) + '">' + esc([p.ref,p.title].filter(Boolean).join(' · ')) + (p.published ? '' : ' (sin publicar)') + '</option>').join('');
      if (products.some(p => p.id === selected)) $('fvmReturnProduct').value = selected;
      else if (pending[0]) $('fvmReturnProduct').value = pending[0].id;
      $('fvmSaveReturnPolicy').disabled = products.length === 0;
      showProduct();
    } catch (error) { $('fvmReturnStatus').textContent = error.message; }
    finally { loading = false; }
  }
  function mount() {
    if (role() !== 'admin' || !$('view-settings') || $('fvmReturnsSettings')) return;
    const section = document.createElement('section'); section.id = 'fvmReturnsSettings'; section.className = 'card';
    section.innerHTML = '<h2>Devoluciones del catálogo</h2><p id="fvmReturnSummary" role="status">Comprobando artículos…</p><p>Confirma si el producto embalado puede devolverse por envío postal ordinario. Para artículos voluminosos, consulta una tarifa realista de devolución desde Fuerteventura y fija el máximo estimado por unidad, con impuestos incluidos. No uses automáticamente el precio del transporte de entrega.</p><form id="fvmReturnPolicyForm"><div class="field"><label for="fvmReturnProduct">Artículo</label><select id="fvmReturnProduct"></select></div><div class="field"><label for="fvmReturnMode">Transporte de devolución</label><select id="fvmReturnMode"><option value="pending">Pendiente de confirmar</option><option value="postal">Admite envío postal ordinario</option><option value="non_postal">No admite envío postal ordinario</option></select></div><div class="field" id="fvmReturnCostRow" hidden><label for="fvmReturnCost">Estimación máxima por unidad (€, impuestos incluidos)</label><input id="fvmReturnCost" type="number" min="0" max="100000" step="0.01"><small>Se multiplica por la cantidad comprada. El coste directo no puede superar el máximo informado. Un máximo de 0 € significa que el cliente no paga ese transporte de devolución.</small></div><label style="display:flex;gap:8px;margin:14px 0"><input id="fvmReturnConfirmed" type="checkbox" style="width:auto"> He comprobado el tipo de envío y, cuando corresponde, el coste máximo de devolución.</label><button type="submit" class="btn navy" id="fvmSaveReturnPolicy">Guardar devolución del artículo</button> <button type="button" class="btn" id="fvmReloadReturnPolicies">Actualizar catálogo</button><p id="fvmReturnStatus" role="status"></p></form><p><a href="/legal/devoluciones" target="_blank" rel="noopener">Ver condiciones publicadas</a> · <a href="/legal/desistimiento" target="_blank" rel="noopener">Ver formulario de desistimiento</a></p>';
    $('view-settings').appendChild(section);
    $('fvmReturnProduct').onchange = showProduct; $('fvmReturnMode').onchange = () => { $('fvmReturnConfirmed').checked = false; showCost(); };
    $('fvmReturnCost').oninput = () => { $('fvmReturnConfirmed').checked = false; };
    $('fvmReloadReturnPolicies').onclick = load;
    $('fvmReturnPolicyForm').onsubmit = async event => {
      event.preventDefault(); if (!$('fvmReturnPolicyForm').reportValidity()) return;
      const button = $('fvmSaveReturnPolicy'); button.disabled = true;
      try {
        await api('/api/admin/products/' + encodeURIComponent($('fvmReturnProduct').value) + '/return-policy',{method:'PUT',body:JSON.stringify({mode:$('fvmReturnMode').value,maxCostPerUnit:$('fvmReturnCost').value,confirmed:$('fvmReturnConfirmed').checked})});
        $('fvmReturnStatus').textContent = 'Información guardada. Ya se mostrará para este artículo antes del pago.';
        await load(); $('fvmReadiness')?.querySelector('button')?.click();
      } catch (error) { $('fvmReturnStatus').textContent = error.message; }
      finally { button.disabled = products.length === 0; }
    };
    load();
  }
  const observer = new MutationObserver(mount);
  observer.observe(document.body,{attributes:true,attributeFilter:['style'],childList:true,subtree:true});
  mount();
})();
