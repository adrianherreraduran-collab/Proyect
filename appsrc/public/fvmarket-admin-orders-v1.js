// FVM_ADMIN_ORDERS_PAYMENT_SPLIT_AND_CHECKLIST_V1
(() => {
  const paidStatuses = new Set(['pagado','en_compra_proveedor','mercancia_recogida','listo_para_rutafv','enviado_a_rutafv','en_reparto','entregado','incidencia','reembolso_parcial','reembolsado']);
  const isPaid = order => order?.paymentState === 'paid' || !!order?.paidAt || paidStatuses.has(String(order?.status || ''));
  // RutaFV puede entregar el estado en el campo principal o en cualquiera de
  // sus campos de transporte mientras se replica el pedido. Trátalos igual
  // para que el check Entregado no dependa del orden en que llegue la réplica.
  const isDelivered = order => {
    const values=[order?.customerStatus,order?.status,order?.deliveryStatus,order?.rutaFVStatus,order?.transport?.status,order?.transport?.rutaFVStatus];
    return values.some(value=>['entregado','entregada','delivered','completado','completada'].includes(String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()))||!!order?.deliveredAt||!!order?.transport?.rutaFVDeliveredAt||!!order?.workflow?.deliveredAt;
  };
  const checklist = order => {
    const status = String(order.status || ''), rank = { pagado: 0, en_compra_proveedor: 1, mercancia_recogida: 2, listo_para_rutafv: 3, enviado_a_rutafv: 4, en_reparto: 5, entregado: 6 }[status] ?? -1;
    const tasks = Array.isArray(order.procurementTasks) ? order.procurementTasks : [];
    const bought = tasks.length ? tasks.every(task => ['comprada','recogida','recibida','lista'].includes(String(task.status || ''))) : rank >= 2;
    const collected = tasks.length ? tasks.every(task => ['recogida','recibida','lista'].includes(String(task.status || ''))) : rank >= 2;
    const incident = status === 'incidencia' || (Array.isArray(order.procurementActions) && order.procurementActions.some(action => action.action === 'incidencia'));
    const note = (Array.isArray(order.procurementActions) ? order.procurementActions.filter(action => action.action === 'incidencia').sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).pop()?.metadata?.note : '') || '';
    const delivered = isDelivered(order);
    const steps = [['Pendiente compra al proveedor', isPaid(order)], ['Comprado', bought], ['Incidencia', incident], ['Recogido', collected], ['Entregado', delivered], ['Reembolsado', ['reembolso_parcial','reembolsado'].includes(status)], ['Cancelado', status === 'cancelado']];
    return '<div class="fvmOrderChecklist">' + steps.map(([label, checked]) => `<label class="${checked ? 'done' : ''}"><input type="checkbox" disabled ${checked ? 'checked' : ''}><span>${label}</span></label>`).join('') + (note ? `<div class="fvmIncidentNote"><b>Nota de incidencia:</b> ${esc(note)}</div>` : '') + '</div>';
  };
  const source = order => (order.items || []).map((item,index) => {
    const data = item.procurement || {};
    const ref = data.sourceRef ? '<b>Ref. origen:</b> ' + esc(data.sourceRef) : '<b>Ref. origen:</b> no detectada';
    const ean = data.sourceEan ? '<br><b>EAN:</b> ' + esc(data.sourceEan) : '';
    const provider = data.provider ? '<b>Proveedor:</b> ' + esc(data.provider) + '<br>' : '';
    const cost = '<br><b>Coste origen:</b> ' + money(data.sourcePrice) + ' × ' + Number(item.qty || 1);
    const link = data.sourceUrl ? '<br><a href="' + esc(data.sourceUrl) + '" target="_blank" rel="noopener">Abrir ficha original ↗</a>' : '';
    const detail=window.fvmPurchaseDetailButton?.(order,index,item)||'<b>'+esc(item.title)+'</b>';
    return '<div class="procure">' + detail + '<br>' + provider + ref + ean + cost + link + '</div>';
  }).join('<div style="height:6px"></div>') || '<span class="msg">Pedido antiguo sin datos de origen guardados.</span>';
  const supplierEstimate = order => (order.procurementTasks || []).map(task => { const estimate=task.deliveryEstimate||{}; const place=[task.supplierIsland,task.supplierAddress].filter(Boolean).join(' · '); return `<div class="procure"><b>Entrega estimada proveedor:</b> ${esc(estimate.label||'Pendiente de calcular')}<br><small>${esc(task.supplierName||'Proveedor pendiente')}${place?' · '+esc(place):''}</small></div>`; }).join('') || '';
  const actions = order => {
    const id = esc(order.id), status = String(order.status || '');
    const payment = !isPaid(order) && status !== 'cancelado' ? `<button class="btn ghost" style="margin-top:5px" onclick="createPaymentLinkOrder('${id}')">${order.stripePaymentLinkUrl ? 'Copiar enlace de pago' : 'Generar enlace de pago'}</button>` : '';
    const refund = isPaid(order) && order.paymentMethod === 'stripe' && !['reembolsado','cancelado'].includes(status) ? `<button class="btn ghost" style="margin-top:5px" onclick="refundOrder('${id}',${Number(order.total || 0)})">Reembolsar</button>` : '';
    return payment + refund;
  };
  const rowState = order => String(order.customerStatus||order.status)==='incidencia'?'incidencia':isDelivered(order)?'entregado':'';
  const paidRow = order => `<tr class="fvmOrderState-${rowState(order)}" data-order-state="${rowState(order)}"><td>${esc(order.number)}</td><td>${new Date(order.createdAt).toLocaleString('es-ES',{timeZone:'Atlantic/Canary'})+(order.storedDelivered&&order.deliveredAt?'<br><small>Entrega: '+new Date(order.deliveredAt).toLocaleString('es-ES',{timeZone:'Atlantic/Canary'})+'</small>':'')}</td><td>${Number(order.total).toFixed(2)} €</td><td>${esc(order.paymentMethod)}</td><td>${source(order)}${supplierEstimate(order)}</td><td>${rowState(order)?'<b class="fvmOrderStateLabel">'+(rowState(order)==='entregado'?'Entregado':'Incidencia')+'</b>':''}${checklist(order)}</td><td>${actions(order)}</td></tr>`;
  window.loadOrders = async function loadOrders() {
    document.getElementById('fvmCompletedOrdersCard')?.remove();
    const all = await api('/api/admin/orders');
    window.fvmSetPurchaseOrders?.(all);
    const paid = all.filter(order=>isPaid(order)&&!order.storedDelivered);
    const archived=all.filter(order=>order.storedDelivered);
    document.getElementById('fvmDeliveredOrders')?.replaceChildren();
    const archivedBody=document.getElementById('fvmDeliveredOrders');if(archivedBody)archivedBody.innerHTML=archived.map(paidRow).join('')||'<tr><td colspan=7>No hay pedidos entregados archivados.</td></tr>';
    statOrders.textContent = paid.length;
    orders.innerHTML = paid.map(paidRow).join('') || '<tr><td colspan="7" class="empty">No hay pedidos pagados.</td></tr>';
  };
  function mountDeliveredArchive(){
    const nav=document.querySelector('.navin'),panel=document.getElementById('panel');
    if(!nav||!panel||document.getElementById('view-delivered-orders'))return;
    const tab=document.createElement('button');tab.className='tab';tab.dataset.view='delivered-orders';tab.textContent='✓ Pedidos Entregados';
    const view=document.createElement('section');view.id='view-delivered-orders';view.className='view';view.innerHTML='<div class="card"><h2>Pedidos Entregados</h2><p class="sub">Se archivan al comenzar el día siguiente a la entrega, según la hora de Canarias. Conservan todos los datos y el historial.</p><div style="overflow:auto"><table><thead><tr><th>Nº</th><th>Fecha</th><th>Total</th><th>Pago</th><th>Proveedor / compra</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="fvmDeliveredOrders"></tbody></table></div></div>';
    nav.appendChild(tab);panel.appendChild(view);tab.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===tab));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x===view));window.loadOrders();};
  }
  setTimeout(mountDeliveredArchive,800);
  if (!document.getElementById('fvmPaidOrderChecklist')) {
    const style = document.createElement('style');
    style.id = 'fvmPaidOrderChecklist';
    style.textContent = '.fvmOrderChecklist{display:grid;gap:4px;min-width:190px}.fvmOrderChecklist label{display:flex;align-items:center;gap:5px;color:#6b7787;font-size:10px;white-space:nowrap}.fvmOrderChecklist label.done{color:#397820;font-weight:850}.fvmOrderChecklist input{accent-color:#5fa92f;margin:0}.fvmOrderChecklist input:disabled{opacity:1}.fvmIncidentNote{margin-top:6px;padding:7px 8px;border-left:3px solid #d48a22;background:#fff8e8;color:#76500e;border-radius:5px;font-size:10px;line-height:1.4}';
    style.textContent += '.fvmOrderState-entregado>td{background:#e8f5e5!important}.fvmOrderState-entregado>td:first-child{border-left:4px solid #397820}.fvmOrderState-incidencia>td{background:#fff0f0!important}.fvmOrderState-incidencia>td:first-child{border-left:4px solid #b42323}.fvmOrderState-entregado .fvmOrderStateLabel{color:#27621b}.fvmOrderState-incidencia .fvmOrderStateLabel{color:#a32323}.fvmOrderStateLabel{display:block;margin-bottom:7px;font-size:12px}';
    document.head.appendChild(style);
  }
  setTimeout(() => {
    if (document.getElementById('panel')?.style.display === 'block') window.loadOrders();
  }, 1000);
})();
