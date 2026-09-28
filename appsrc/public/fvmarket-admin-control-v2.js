// FVM_ADMIN_CONTROL_BOARD_V3
(function () {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = value => Number(value || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const labels = { pagado: 'Pagado', en_compra_proveedor: 'Compra al proveedor', mercancia_recogida: 'Mercancía recogida', listo_para_rutafv: 'Listo para RutaFV', incidencia: 'Incidencia' };
  const paidStatuses = new Set(['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'incidencia']);
  const paymentStatuses = new Set(['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto', 'entregado', 'incidencia', 'reembolso_parcial', 'reembolsado']);
  const actions = [['iniciar_compra', 'Iniciar compra'], ['comprada', 'Comprada'], ['mercancia_recogida', 'Mercancía recogida'], ['enviar_a_rutafv', 'Enviar a RutaFV'], ['incidencia', 'Incidencia']];
  let mounted = false;

  function addStyle() {
    if ($('fvmAdminControlV3Style')) return;
    const s = document.createElement('style'); s.id = 'fvmAdminControlV3Style';
    s.textContent = `.fvmBoard{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;margin-bottom:16px}.fvmBoardColumn{border-radius:12px;padding:14px;border:1px solid}.fvmBoardColumn.paid{background:#f3faef;border-color:#b8dda3}.fvmBoardColumn h3{margin:0 0 10px;font-size:15px;color:#397820}.fvmBoardCard{background:#fff;border:1px solid #e1e9ef;border-radius:10px;padding:11px;margin:8px 0}.fvmBoardCard header{background:none;color:inherit;padding:0;display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.fvmBoardCard header b{color:var(--navy);font-size:12px}.fvmBoardCard small{color:var(--muted)}.fvmBoardStatus{display:inline-flex;padding:4px 7px;border-radius:999px;background:#eaf7e4;color:#397820;font-size:10px;font-weight:900}.fvmBoardMeta{font-size:11px;line-height:1.5;margin:8px 0}.fvmBoardItems{border-top:1px solid #edf1f4;margin-top:8px;padding-top:7px;font-size:10px}.fvmActionSelect{width:100%;border:1px solid #cbd9e4;border-radius:7px;background:#fff;padding:8px;color:var(--navy);font-weight:800;font-size:11px}.fvmBoardEmpty{padding:16px;text-align:center;color:var(--muted);font-size:12px}.fvmChecklist{display:grid;gap:4px;margin-top:9px;padding:8px;border:1px solid #edf1f4;border-radius:8px;background:#fbfdff}.fvmChecklist label{display:flex;align-items:center;gap:5px;font-size:10px;color:#6b7787}.fvmChecklist label.done{color:#397820;font-weight:850}.fvmChecklist input{accent-color:#5fa92f;margin:0}.fvmChecklist input:disabled{opacity:1}.fvmIncidentNote{margin-top:6px;padding:7px 8px;border-left:3px solid #d48a22;background:#fff8e8;color:#76500e;border-radius:5px;font-size:10px;line-height:1.4}.fvmNotification{display:flex;gap:10px;align-items:flex-start;border:1px solid #dfe7ee;border-radius:9px;padding:11px;margin:8px 0;background:#fff}.fvmNotification.unread{border-left:4px solid var(--lime);background:#f8fbf5}.fvmNotification b{color:var(--navy)}.fvmNotification small{display:block;color:var(--muted);margin-top:3px}.fvmNotification button{margin-left:auto;white-space:nowrap}`;
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

  function actionSelect(order) {
    const status = String(order.status || ''), allowed = ({
      pagado: ['iniciar_compra', 'incidencia'],
      en_compra_proveedor: ['comprada', 'enviar_a_rutafv', 'mercancia_recogida', 'incidencia'],
      mercancia_recogida: ['enviar_a_rutafv', 'incidencia'],
      listo_para_rutafv: ['enviar_a_rutafv', 'incidencia'],
      incidencia: ['comprada', 'enviar_a_rutafv', 'mercancia_recogida']
    }[status] || []);
    if (!allowed.length) return '<span class="msg">Sin acciones pendientes</span>';
    const opts = actions.filter(([value]) => allowed.includes(value)).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    return `<select class="fvmActionSelect" onchange="fvmRunProcurementAction('${esc(order.id)}',this.value,'',this)"><option value="">Seleccionar acción…</option>${opts}</select>`;
  }

  function incidentNote(order) {
    const rows = Array.isArray(order.procurementActions) ? order.procurementActions.filter(x => x.action === 'incidencia') : [];
    const last = rows.sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).pop();
    return String(last?.metadata?.note || last?.note || '').trim();
  }

  function checklist(order) {
    const status = String(order.status || ''), rank = { pagado: 0, en_compra_proveedor: 1, mercancia_recogida: 2, listo_para_rutafv: 3, enviado_a_rutafv: 4, en_reparto: 5, entregado: 6 }[status] ?? -1;
    const tasks = Array.isArray(order.procurementTasks) ? order.procurementTasks : [];
    const bought = tasks.length ? tasks.every(t => ['comprada', 'recogida', 'recibida', 'lista'].includes(String(t.status || ''))) : rank >= 2;
    const collected = tasks.length ? tasks.every(t => ['recogida', 'recibida', 'lista'].includes(String(t.status || ''))) : rank >= 2;
    const incident = status === 'incidencia' || (Array.isArray(order.procurementActions) && order.procurementActions.some(x => x.action === 'incidencia'));
    const steps = [['Pendiente compra al proveedor', true], ['Comprado', bought], ['Incidencia', incident], ['Recogido', collected], ['Reembolsado', ['reembolso_parcial', 'reembolsado'].includes(status)], ['Cancelado', status === 'cancelado']];
    const note = incidentNote(order);
    return '<div class="fvmChecklist">' + steps.map(([label, done]) => `<label class="${done ? 'done' : ''}"><input type="checkbox" disabled ${done ? 'checked' : ''}><span>${label}</span></label>`).join('') + (note ? `<div class="fvmIncidentNote"><b>Nota de incidencia:</b> ${esc(note)}</div>` : '') + '</div>';
  }

  function card(order) {
    const items = (order.items || []).map(i => `<div>${esc(i.title || i.ref || 'Producto')} × ${Number(i.qty || 1)} · ${money(i.lineTotal)}</div>`).join('');
    const supplierRows = (order.supplierSummary || []).map(t => { const estimate=t.deliveryEstimate||{}; const location=[t.island, t.address].filter(Boolean).join(' · '); return `<div><b>${esc(t.name)}</b> (${esc(t.status || 'pendiente')})${location?` · ${esc(location)}`:''}<br><span>Entrega estimada del proveedor: <b>${esc(estimate.label || 'Pendiente de calcular')}</b></span></div>`; }).join('') || 'Proveedor pendiente';
    return `<article class="fvmBoardCard"><header><div><b>${esc(order.number || order.id)}</b><br><small>${esc(order.customer?.name || 'Cliente')} · ${new Date(order.createdAt || Date.now()).toLocaleString('es-ES')}</small></div><span class="fvmBoardStatus">${esc(labels[order.status] || order.status)}</span></header><div class="fvmBoardMeta"><b>Proveedor:</b><div>${supplierRows}</div><b>Total:</b> ${money(order.total)} · <b>RutaFV:</b> ${money(order.delivery)}</div><div class="fvmBoardItems">${items || 'Sin detalle de productos'}</div>${checklist(order)}<div style="margin-top:9px">${actionSelect(order)}</div></article>`;
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

  async function loadNotifications() {
    const host = $('fvmNotifications'); if (!host) return;
    try {
      const rows = await api('/api/admin/notifications');
      host.innerHTML = rows.map(n => `<div class="fvmNotification ${n.read ? '' : 'unread'}"><div>🔔</div><div><b>${esc(n.title)}</b><small>${esc(n.message)} · ${new Date(n.createdAt).toLocaleString('es-ES')}</small></div>${n.read ? '' : `<button class="btn ghost" onclick="fvmReadNotification('${esc(n.id)}')">Marcar leída</button>`}</div>`).join('') || '<div class="empty">No hay notificaciones.</div>';
    } catch (e) { host.innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
  }

  window.fvmRunProcurementAction = async function (orderId, action, taskId, select) {
    if (!action) return;
    if (action === 'incidencia' && !confirm('¿Registrar una incidencia para este pedido?')) { if (select) select.value = ''; return; }
    const note = action === 'incidencia' ? prompt('Describe la incidencia. Esta nota quedará guardada en la trazabilidad:', '') : '';
    if (action === 'incidencia' && !String(note || '').trim()) { alert('Debes indicar una nota para la incidencia.'); if (select) select.value = ''; return; }
    const purchaseReference = action === 'comprada' ? prompt('Referencia, ticket o factura de la compra (opcional):', '') : '';
    const cost = action === 'comprada' ? prompt('Coste real de compra (opcional):', '') : '';
    if (action === 'enviar_a_rutafv' && !confirm('¿Crear ahora el reparto en RutaFV para este pedido?')) { if (select) select.value = ''; return; }
    try {
      await api('/api/admin/orders/' + encodeURIComponent(orderId) + '/procurement-action', { method: 'POST', body: JSON.stringify({ action, taskId: taskId || '', note: note || '', purchaseReference: purchaseReference || '', actualCost: cost == null || cost === '' ? undefined : Number(String(cost).replace(',', '.')) }) });
      await Promise.all([loadBoard(), loadNotifications()]);
    } catch (e) { alert(e.message); if (select) select.value = ''; }
  };

  window.fvmReadNotification = async function (id) { try { await api('/api/admin/notifications/' + encodeURIComponent(id) + '/read', { method: 'POST' }); loadNotifications(); } catch (e) { alert(e.message); } };

  function mount() {
    if (mounted || !$('panel') || !document.querySelector('.navin')) return;
    mounted = true; addStyle(); removeLegacySections();
    const role = session?.user?.role || 'admin';
    if (!['admin', 'orders_manager'].includes(role)) return;
    newTab('control', '📋 Tablero'); newTab('notifications', '🔔 Avisos');
    newView('control', '<div class="bar"><div><h2 style="margin:0">Tablero de pedidos</h2><p class="sub" style="margin:5px 0 0">Aquí solo aparecen pedidos pagados pendientes de adquirir al proveedor de FVMarket.</p></div><button class="btn navy" id="fvmBoardRefresh">Actualizar</button></div><div id="fvmControlBoard"></div>');
    newView('notifications', '<div class="bar"><div><h2 style="margin:0">Avisos</h2><p class="sub" style="margin:5px 0 0">Pagos confirmados e incidencias internas.</p></div><button class="btn navy" id="fvmNotificationsRefresh">Actualizar</button></div><div id="fvmNotifications"></div>');
    $('fvmBoardRefresh').onclick = loadBoard; $('fvmNotificationsRefresh').onclick = loadNotifications;
    [...document.querySelectorAll('.tab')].filter(x => ['control', 'notifications'].includes(x.dataset.view)).forEach(x => x.onclick = () => show(x.dataset.view));
    loadBoard();
  }

  const timer = setInterval(() => { if ($('panel')) { mount(); if (mounted) clearInterval(timer); } }, 300);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else setTimeout(mount, 500);
})();
