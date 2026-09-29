// FVM_ADMIN_CONTROL_BOARD_V3
(function () {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = value => Number(value || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const labels = { pagado: 'Pagado', en_compra_proveedor: 'Compra al proveedor', mercancia_recogida: 'Mercancía recogida', listo_para_rutafv: 'Listo para RutaFV', incidencia: 'Incidencia' };
  const paidStatuses = new Set(['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'incidencia']);
  const paymentStatuses = new Set(['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto', 'entregado', 'incidencia', 'reembolso_parcial', 'reembolsado']);
  let mounted = false;

  function addStyle() {
    if ($('fvmAdminControlV3Style')) return;
    const s = document.createElement('style'); s.id = 'fvmAdminControlV3Style';
    s.textContent = `.fvmBoard{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;margin-bottom:16px}.fvmBoardColumn{border-radius:12px;padding:14px;border:1px solid}.fvmBoardColumn.paid{background:#f3faef;border-color:#b8dda3}.fvmBoardColumn h3{margin:0 0 10px;font-size:15px;color:#397820}.fvmBoardCard{background:#fff;border:1px solid #e1e9ef;border-radius:10px;padding:11px;margin:8px 0}.fvmBoardCard header{background:none;color:inherit;padding:0;display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.fvmBoardCard header b{color:var(--navy);font-size:12px}.fvmBoardCard small{color:var(--muted)}.fvmBoardStatus{display:inline-flex;padding:4px 7px;border-radius:999px;background:#eaf7e4;color:#397820;font-size:10px;font-weight:900}.fvmBoardMeta{font-size:11px;line-height:1.5;margin:8px 0}.fvmBoardItems{border-top:1px solid #edf1f4;margin-top:8px;padding-top:7px;font-size:10px}.fvmBoardEmpty{padding:16px;text-align:center;color:var(--muted);font-size:12px}.fvmChecklist{display:grid;gap:4px;margin-top:9px;padding:8px;border:1px solid #edf1f4;border-radius:8px;background:#fbfdff}.fvmChecklist label{display:flex;align-items:center;gap:5px;font-size:10px;color:#6b7787;padding:2px 3px;border-radius:5px}.fvmChecklist label.actionable{cursor:pointer;color:var(--navy);background:#f4f8fb}.fvmChecklist label.done{color:#397820;font-weight:850}.fvmChecklist input{accent-color:#5fa92f;margin:0}.fvmChecklist input:not(:disabled){cursor:pointer}.fvmChecklist input:disabled{opacity:1}.fvmIncidentNote{margin-top:6px;padding:7px 8px;border-left:3px solid #d48a22;background:#fff8e8;color:#76500e;border-radius:5px;font-size:10px;line-height:1.4}.fvmNotification{display:flex;gap:10px;align-items:flex-start;border:1px solid #dfe7ee;border-radius:9px;padding:11px;margin:8px 0;background:#fff}.fvmNotification.unread{border-left:4px solid var(--lime);background:#f8fbf5}.fvmNotification b{color:var(--navy)}.fvmNotification small{display:block;color:var(--muted);margin-top:3px}.fvmNotification button{margin-left:auto;white-space:nowrap}`;
    document.head.appendChild(s);
  }

  function removeLegacySections() {
    // Operaciones y aprovisionamiento se han retirado del panel. Contabilidad
    // queda como vista independiente y la monta fvmarket-admin-accounting-v2.js.
    ['operations', 'procurement'].forEach(id => {
      document.querySelector(`[data-view="${id}"]`)?.remove();
      $('view-' + id)?.remove();
    });
  }

  function newTab(id, text) {
    const nav = document.querySelector('.navin');
    if (!nav || nav.querySelector(`[data-view="${id}"]`)) return;
    const b = document.createElement('button'); b.className = 'tab'; b.dataset.view = id; b.textContent = text; b.onclick = () => show(id); nav.appendChild(b);
  }

  function newView(id, html) {
    if ($('view-' + id)) return;
    const panel = $('panel'); if (!panel) return;
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'view-' + id; sec.innerHTML = `<div class="card">${html}</div>`; panel.appendChild(sec);
  }

  function show(id) {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === id));
    document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + id));
    if (id === 'control') loadBoard();
    if (id === 'notifications') loadNotifications();
  }

  function incidentNote(order) {
    const rows = Array.isArray(order.procurementActions) ? order.procurementActions.filter(x => x.action === 'incidencia') : [];
    const last = rows.sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).pop();
    return String(last?.metadata?.note || last?.note || '').trim();
  }

  function checklistState(order) {
    const status = String(order.status || ''), rank = { pagado: 0, en_compra_proveedor: 1, mercancia_recogida: 2, listo_para_rutafv: 3, enviado_a_rutafv: 4, en_reparto: 5, entregado: 6 }[status] ?? -1;
    const tasks = Array.isArray(order.procurementTasks) ? order.procurementTasks : [];
    const supplierRows = Array.isArray(order.supplierSummary) ? order.supplierSummary : [];
    const bought = tasks.length ? tasks.every(t => ['comprada', 'recogida', 'recibida', 'lista'].includes(String(t.status || ''))) : supplierRows.length ? supplierRows.every(t => ['comprada', 'recogida', 'recibida', 'lista'].includes(String(t.status || ''))) : rank >= 2;
    const collected = tasks.length ? tasks.every(t => ['recogida', 'recibida', 'lista'].includes(String(t.status || ''))) : supplierRows.length ? supplierRows.every(t => ['recogida', 'recibida', 'lista'].includes(String(t.status || ''))) : rank >= 2;
    const incident = status === 'incidencia' || (Array.isArray(order.procurementActions) && order.procurementActions.some(x => x.action === 'incidencia'));
    const sent = !!order.transport?.deliveryId || ['enviado_a_rutafv', 'en_reparto', 'entregado'].includes(status);
    return { status, pending: paymentStatuses.has(status), bought, collected, incident, sent, refunded: status === 'reembolsado', cancelled: status === 'cancelado' };
  }

  function canChecklistAction(state, action) {
    if (action === 'comprada') return !state.bought && ['pagado', 'incidencia'].includes(state.status);
    if (action === 'mercancia_recogida') return !state.collected && state.bought && ['en_compra_proveedor', 'incidencia'].includes(state.status);
    if (action === 'enviar_a_rutafv') return !state.sent && state.collected && ['mercancia_recogida', 'listo_para_rutafv', 'incidencia'].includes(state.status);
    if (action === 'incidencia') return !state.incident && ['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto'].includes(state.status);
    if (action === 'reembolsado') return !state.refunded && !state.cancelled && ['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto', 'entregado', 'incidencia', 'reembolso_parcial'].includes(state.status);
    if (action === 'cancelado') return !state.cancelled && !state.refunded && ['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto', 'incidencia'].includes(state.status);
    return false;
  }

  function checklist(order) {
    const state = checklistState(order);
    const steps = [
      ['Pendiente compra al proveedor', state.pending, '', true],
      ['Comprado', state.bought, 'comprada', !state.bought && canChecklistAction(state, 'comprada')],
      ['Incidencia', state.incident, 'incidencia', !state.incident && canChecklistAction(state, 'incidencia')],
      ['Recogido', state.collected, 'mercancia_recogida', !state.collected && canChecklistAction(state, 'mercancia_recogida')],
      ['Enviar a RutaFV', state.sent, 'enviar_a_rutafv', !state.sent && canChecklistAction(state, 'enviar_a_rutafv')],
      ['Reembolsado', state.refunded, 'reembolsado', !state.refunded && canChecklistAction(state, 'reembolsado')],
      ['Cancelado', state.cancelled, 'cancelado', !state.cancelled && canChecklistAction(state, 'cancelado')]
    ];
    const note = incidentNote(order);
    return '<div class="fvmChecklist" aria-label="Pasos del pedido">' + steps.map(([label, done, action, actionable]) => `<label class="${done ? 'done' : ''}${actionable ? ' actionable' : ''}"><input type="checkbox" ${done ? 'checked' : ''} ${actionable ? `onchange="fvmChecklistAction('${esc(order.id)}','${action}',this)"` : 'disabled'}><span>${label}</span></label>`).join('') + (note ? `<div class="fvmIncidentNote"><b>Nota de incidencia:</b> ${esc(note)}</div>` : '') + '</div>';
  }

  function card(order) {
    const items = (order.items || []).map(i => `<div>${esc(i.title || i.ref || 'Producto')} × ${Number(i.qty || 1)} · ${money(i.lineTotal)}</div>`).join('');
    const supplierRows = (order.supplierSummary || []).map(t => { const estimate=t.deliveryEstimate||{}; const location=[t.island, t.address].filter(Boolean).join(' · '); return `<div><b>${esc(t.name)}</b> (${esc(t.status || 'pendiente')})${location?` · ${esc(location)}`:''}<br><span>Entrega estimada del proveedor: <b>${esc(estimate.label || 'Pendiente de calcular')}</b></span></div>`; }).join('') || 'Proveedor pendiente';
    return `<article class="fvmBoardCard"><header><div><b>${esc(order.number || order.id)}</b><br><small>${esc(order.customer?.name || 'Cliente')} · ${new Date(order.createdAt || Date.now()).toLocaleString('es-ES')}</small></div><span class="fvmBoardStatus">${esc(labels[order.status] || order.status)}</span></header><div class="fvmBoardMeta"><b>Proveedor:</b><div>${supplierRows}</div><b>Total:</b> ${money(order.total)} · <b>RutaFV:</b> ${money(order.delivery)}</div><div class="fvmBoardItems">${items || 'Sin detalle de productos'}</div>${checklist(order)}</article>`;
  }

  function renderBoard(data) {
    const orders = (data.orders || []).filter(order => paymentStatuses.has(String(order.status || '')) && paidStatuses.has(String(order.status || '')));
    const host = $('fvmControlBoard'); if (!host) return;
    host.innerHTML = `<div class="fvmBoard"><section class="fvmBoardColumn paid"><h3>Pedidos pagados pendientes de compra al proveedor (${orders.length})</h3>${orders.map(card).join('') || '<div class="fvmBoardEmpty">No hay pedidos pagados pendientes de adquirir al proveedor.</div>'}</section></div>`;
  }

  async function loadBoard() {
    const host = $('fvmControlBoard'); if (!host) return;
    host.innerHTML = '<div class="empty">Cargando pedidos pagados…</div>';
    try { renderBoard(await api('/api/admin/procurement-board')); } catch (e) { host.innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
  }

  window.fvmChecklistAction = async function (orderId, action, input) {
    if (!input?.checked) { if (input) input.checked = true; return; }
    if (action === 'incidencia' && !confirm('¿Registrar una incidencia para este pedido?')) { input.checked = false; return; }
    const note = action === 'incidencia' ? prompt('Describe la incidencia. Esta nota quedará guardada en la trazabilidad:', '') : '';
    if (action === 'incidencia' && !String(note || '').trim()) { alert('Debes indicar una nota para la incidencia.'); input.checked = false; return; }
    if (action === 'cancelado') {
      const reason = prompt('Indica el motivo de la cancelación:', '');
      if (!String(reason || '').trim()) { alert('Debes indicar un motivo para cancelar el pedido.'); input.checked = false; return; }
      if (!confirm('¿Confirmar la cancelación de este pedido?')) { input.checked = false; return; }
      try { await api('/api/admin/orders/' + encodeURIComponent(orderId), { method: 'PUT', body: JSON.stringify({ status: 'cancelado', note: String(reason).trim() }) }); await Promise.all([loadBoard(), loadNotifications()]); } catch (e) { input.checked = false; alert(e.message); }
      return;
    }
    if (action === 'reembolsado') {
      const amount = prompt('Importe a reembolsar en Stripe (vacío = importe restante completo):', '');
      if (amount === null) { input.checked = false; return; }
      if (amount !== null && String(amount).trim() !== '' && (!Number.isFinite(Number(String(amount).replace(',', '.'))) || Number(String(amount).replace(',', '.')) <= 0)) { alert('Indica un importe válido mayor que cero.'); input.checked = false; return; }
      if (!confirm('¿Confirmar el reembolso mediante Stripe?')) { input.checked = false; return; }
      try { const body = String(amount).trim() === '' ? {} : { amount: Number(String(amount).replace(',', '.')) }; await api('/api/admin/orders/' + encodeURIComponent(orderId) + '/refund', { method: 'POST', body: JSON.stringify(body) }); await Promise.all([loadBoard(), loadNotifications()]); } catch (e) { input.checked = false; alert(e.message); }
      return;
    }
    const purchaseReference = action === 'comprada' ? prompt('Referencia, ticket o factura de la compra (opcional):', '') : '';
    const cost = action === 'comprada' ? prompt('Coste real de compra (opcional):', '') : '';
    if (action === 'enviar_a_rutafv' && !confirm('¿Crear ahora el reparto en RutaFV para este pedido?')) { input.checked = false; return; }
    try {
      await api('/api/admin/orders/' + encodeURIComponent(orderId) + '/procurement-action', { method: 'POST', body: JSON.stringify({ action, note: note || '', purchaseReference: purchaseReference || '', actualCost: cost == null || cost === '' ? undefined : Number(String(cost).replace(',', '.')) }) });
      await Promise.all([loadBoard(), loadNotifications()]);
    } catch (e) { input.checked = false; alert(e.message); }
  };

  async function loadNotifications() {
    const host = $('fvmNotifications'); if (!host) return;
    try {
      const rows = await api('/api/admin/notifications');
      host.innerHTML = rows.map(n => `<div class="fvmNotification ${n.read ? '' : 'unread'}"><div>🔔</div><div><b>${esc(n.title)}</b><small>${esc(n.message)} · ${new Date(n.createdAt).toLocaleString('es-ES')}</small></div>${n.read ? '' : `<button class="btn ghost" onclick="fvmReadNotification('${esc(n.id)}')">Marcar leída</button>`}</div>`).join('') || '<div class="empty">No hay notificaciones.</div>';
    } catch (e) { host.innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
  }

  window.fvmRunProcurementAction = window.fvmChecklistAction;

  window.fvmExportBoardPdf = async function () {
    const button = $('fvmBoardPdf'); if (button) button.disabled = true;
    try {
      const response = await fetch('/api/admin/procurement-board/pdf', { headers: { Authorization: 'Bearer ' + (session?.token || '') } });
      if (!response.ok) { let data = {}; try { data = await response.json(); } catch {} throw Error(data.error || 'No se pudo exportar el tablero.'); }
      const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'fvmarket-tablero-proveedores.pdf'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (e) { alert(e.message || 'No se pudo exportar el tablero.'); }
    finally { if (button) button.disabled = false; }
  };

  window.fvmReadNotification = async function (id) { try { await api('/api/admin/notifications/' + encodeURIComponent(id) + '/read', { method: 'POST' }); loadNotifications(); } catch (e) { alert(e.message); } };

  function mount() {
    if (mounted || !$('panel') || !document.querySelector('.navin')) return;
    mounted = true; addStyle(); removeLegacySections();
    const role = session?.user?.role || 'admin';
    if (!['admin', 'orders_manager'].includes(role)) return;
    newTab('control', '📋 Tablero'); newTab('notifications', '🔔 Avisos');
    newView('control', '<div class="bar"><div><h2 style="margin:0">Tablero de pedidos</h2><p class="sub" style="margin:5px 0 0">Marca cada paso en el checklist. Aquí solo aparecen pedidos pagados de FVMarket.</p></div><div class="bar"><button class="btn ghost" id="fvmBoardPdf" type="button">⇩ Exportar PDF</button><button class="btn navy" id="fvmBoardRefresh" type="button" title="Actualizar ahora" aria-label="Actualizar ahora">↻</button></div></div><div id="fvmControlBoard"></div>');
    newView('notifications', '<div class="bar"><div><h2 style="margin:0">Avisos</h2><p class="sub" style="margin:5px 0 0">Pagos confirmados e incidencias internas.</p></div><button class="btn navy" id="fvmNotificationsRefresh">Actualizar</button></div><div id="fvmNotifications"></div>');
    $('fvmBoardRefresh').onclick = loadBoard; $('fvmBoardPdf').onclick = fvmExportBoardPdf; $('fvmNotificationsRefresh').onclick = loadNotifications;
    [...document.querySelectorAll('.tab')].filter(x => ['control', 'notifications'].includes(x.dataset.view)).forEach(x => x.onclick = () => show(x.dataset.view));
    loadBoard();
  }

  const timer = setInterval(() => { if ($('panel')) { mount(); if (mounted) clearInterval(timer); } }, 300);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else setTimeout(mount, 500);
})();
