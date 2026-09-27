// FVM_ADMIN_ORDERS_PAYMENT_SPLIT_AND_CHECKLIST_V1
(() => {
  const paidStatuses = new Set(['pagado','en_compra_proveedor','mercancia_recogida','listo_para_rutafv','enviado_a_rutafv','en_reparto','entregado','incidencia','reembolso_parcial','reembolsado']);
  const isPaid = order => order?.paymentState === 'paid' || !!order?.paidAt || paidStatuses.has(String(order?.status || ''));
  const isCompleted = order => String(order?.status || '') === 'entregado';
  const ensurePendingCard = () => {
    if (document.getElementById('fvmPendingOrdersCard')) return;
    const view = document.getElementById('view-orders');
    const first = view?.querySelector('.card');
    if (!first) return;
    const card = document.createElement('div');
    card.id = 'fvmPendingOrdersCard';
    card.className = 'card';
    card.style.marginTop = '16px';
    card.innerHTML = '<div class="bar"><div><h2 style="margin:0">Presupuestos y pedidos pendientes de pago</h2><p class="sub" style="margin:5px 0 0">Mientras el pago no esté confirmado, permanecen aquí y no se mezclan con los pedidos operativos.</p></div><button class="btn navy" type="button" id="fvmPendingOrdersRefresh">Actualizar</button></div><div style="overflow:auto"><table><thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="fvmPendingOrders"></tbody></table></div>';
    first.insertAdjacentElement('afterend', card);
    document.getElementById('fvmPendingOrdersRefresh').onclick = window.loadOrders;
  };
  const ensureCompletedCard = () => {
    if (document.getElementById('fvmCompletedOrdersCard')) return;
    const view = document.getElementById('view-orders');
    const first = view?.querySelector('.card');
    if (!first) return;
    const card = document.createElement('div');
    card.id = 'fvmCompletedOrdersCard';
    card.className = 'card';
    card.style.marginTop = '16px';
    card.innerHTML = '<div class="bar"><div><h2 style="margin:0">Pedidos completados</h2><p class="sub" style="margin:5px 0 0">Pedidos entregados y cerrados correctamente, separados de la gestión pendiente.</p></div><button class="btn navy" type="button" id="fvmCompletedOrdersToggle" aria-expanded="false">Mostrar pedidos completados</button></div><div id="fvmCompletedOrdersBody" style="display:none;overflow:auto"><table><thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Entrega</th></tr></thead><tbody id="fvmCompletedOrders"></tbody></table></div>';
    view.appendChild(card);
    const toggle = document.getElementById('fvmCompletedOrdersToggle');
    toggle.onclick = () => {
      const body = document.getElementById('fvmCompletedOrdersBody');
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.textContent = open ? 'Mostrar pedidos completados' : 'Ocultar pedidos completados';
    };
  };
  const checklist = order => {
    const status = String(order.status || ''), rank = { pagado: 0, en_compra_proveedor: 1, mercancia_recogida: 2, listo_para_rutafv: 3, enviado_a_rutafv: 4, en_reparto: 5, entregado: 6 }[status] ?? -1;
    const tasks = Array.isArray(order.procurementTasks) ? order.procurementTasks : [];
    const bought = tasks.length ? tasks.every(task => ['comprada','recogida','recibida','lista'].includes(String(task.status || ''))) : rank >= 2;
    const collected = tasks.length ? tasks.every(task => ['recogida','recibida','lista'].includes(String(task.status || ''))) : rank >= 2;
    const incident = status === 'incidencia' || (Array.isArray(order.procurementActions) && order.procurementActions.some(action => action.action === 'incidencia'));
    const note = (Array.isArray(order.procurementActions) ? order.procurementActions.filter(action => action.action === 'incidencia').sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).pop()?.metadata?.note : '') || '';
    const steps = [['Pendiente compra al proveedor', isPaid(order)], ['Comprado', bought], ['Incidencia', incident], ['Recogido', collected], ['Reembolsado', ['reembolso_parcial','reembolsado'].includes(status)], ['Cancelado', status === 'cancelado']];
    return '<div class="fvmOrderChecklist">' + steps.map(([label, checked]) => `<label class="${checked ? 'done' : ''}"><input type="checkbox" disabled ${checked ? 'checked' : ''}><span>${label}</span></label>`).join('') + (note ? `<div class="fvmIncidentNote"><b>Nota de incidencia:</b> ${esc(note)}</div>` : '') + '</div>';
  };
  const source = order => (order.items || []).map(item => {
    const data = item.procurement || {};
    const ref = data.sourceRef ? '<b>Ref. origen:</b> ' + esc(data.sourceRef) : '<b>Ref. origen:</b> no detectada';
    const ean = data.sourceEan ? '<br><b>EAN:</b> ' + esc(data.sourceEan) : '';
    const provider = data.provider ? '<b>Proveedor:</b> ' + esc(data.provider) + '<br>' : '';
    const cost = '<br><b>Coste origen:</b> ' + money(data.sourcePrice) + ' × ' + Number(item.qty || 1);
    const link = data.sourceUrl ? '<br><a href="' + esc(data.sourceUrl) + '" target="_blank" rel="noopener">Abrir ficha original ↗</a>' : '';
    return '<div class="procure"><b>' + esc(item.title) + '</b><br>' + provider + ref + ean + cost + link + '</div>';
  }).join('<div style="height:6px"></div>') || '<span class="msg">Pedido antiguo sin datos de origen guardados.</span>';
  const supplierEstimate = order => (order.procurementTasks || []).map(task => { const estimate=task.deliveryEstimate||{}; const place=[task.supplierIsland,task.supplierAddress].filter(Boolean).join(' · '); return `<div class="procure"><b>Entrega estimada proveedor:</b> ${esc(estimate.label||'Pendiente de calcular')}<br><small>${esc(task.supplierName||'Proveedor pendiente')}${place?' · '+esc(place):''}</small></div>`; }).join('') || '';
  const actions = order => {
    const id = esc(order.id), status = String(order.status || '');
    const payment = !isPaid(order) && status !== 'cancelado' ? `<button class="btn ghost" style="margin-top:5px" onclick="createPaymentLinkOrder('${id}')">${order.stripePaymentLinkUrl ? 'Copiar enlace de pago' : 'Generar enlace de pago'}</button>` : '';
    const refund = isPaid(order) && order.paymentMethod === 'stripe' && !['reembolsado','cancelado'].includes(status) ? `<button class="btn ghost" style="margin-top:5px" onclick="refundOrder('${id}',${Number(order.total || 0)})">Reembolsar</button>` : '';
    return payment + refund;
  };
  const paidRow = order => `<tr><td>${esc(order.number)}</td><td>${new Date(order.createdAt).toLocaleString('es-ES')}</td><td>${Number(order.total).toFixed(2)} €</td><td>${esc(order.paymentMethod)}</td><td>${source(order)}${supplierEstimate(order)}</td><td>${checklist(order)}</td><td>${actions(order)}</td></tr>`;
  const pendingRow = order => `<tr><td>${esc(order.number)}</td><td>${new Date(order.createdAt).toLocaleString('es-ES')}</td><td><b>${esc(order.customer?.name || '')}</b><br><small>${esc(order.customer?.email || '')}</small></td><td>${money(order.total)}</td><td><span class="badge">${esc(order.statusLabel || 'Pendiente de pago')}</span></td><td>${actions(order)}</td></tr>`;
  const completedRow = order => `<tr><td>${esc(order.number)}</td><td>${new Date(order.createdAt).toLocaleString('es-ES')}</td><td><b>${esc(order.customer?.name || '')}</b><br><small>${esc(order.customer?.email || '')}</small></td><td>${money(order.total)}</td><td><span class="badge">${esc(order.statusLabel || 'Entregado')}</span></td><td>${order.workflow?.deliveredAt ? new Date(order.workflow.deliveredAt).toLocaleString('es-ES') : '—'}</td></tr>`;
  window.loadOrders = async function loadOrders() {
    ensurePendingCard();
    ensureCompletedCard();
    const all = await api('/api/admin/orders');
    const paid = all.filter(order => isPaid(order) && !isCompleted(order)), pending = all.filter(order => !isPaid(order)), completed = all.filter(isCompleted);
    statOrders.textContent = paid.length;
    orders.innerHTML = paid.map(paidRow).join('') || '<tr><td colspan="7" class="empty">No hay pedidos pagados.</td></tr>';
    const pendingHost = document.getElementById('fvmPendingOrders');
    if (pendingHost) pendingHost.innerHTML = pending.map(pendingRow).join('') || '<tr><td colspan="6" class="empty">No hay presupuestos pendientes de pago.</td></tr>';
    const completedHost = document.getElementById('fvmCompletedOrders');
    if (completedHost) completedHost.innerHTML = completed.map(completedRow).join('') || '<tr><td colspan="6" class="empty">Todavía no hay pedidos completados.</td></tr>';
  };
  if (!document.getElementById('fvmPaidOrderChecklist')) {
    const style = document.createElement('style');
    style.id = 'fvmPaidOrderChecklist';
    style.textContent = '.fvmOrderChecklist{display:grid;gap:4px;min-width:190px}.fvmOrderChecklist label{display:flex;align-items:center;gap:5px;color:#6b7787;font-size:10px;white-space:nowrap}.fvmOrderChecklist label.done{color:#397820;font-weight:850}.fvmOrderChecklist input{accent-color:#5fa92f;margin:0}.fvmOrderChecklist input:disabled{opacity:1}.fvmIncidentNote{margin-top:6px;padding:7px 8px;border-left:3px solid #d48a22;background:#fff8e8;color:#76500e;border-radius:5px;font-size:10px;line-height:1.4}';
    document.head.appendChild(style);
  }
  setTimeout(() => {
    if (document.getElementById('panel')?.style.display === 'block') window.loadOrders();
  }, 1000);
})();
