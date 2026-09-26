// FVM_PROCUREMENT_CONTROL_V2
// Admin-only procurement board, payment notifications and supplier accounting filters.

const ACTIONS = {
  iniciar_compra: { label: 'Iniciar compra', status: 'en_compra_proveedor' },
  comprada: { label: 'Comprada', taskStatus: 'comprada' },
  mercancia_recogida: { label: 'Mercancía recogida', status: 'mercancia_recogida', taskStatus: 'recogida' },
  enviar_a_rutafv: { label: 'Enviar a RutaFV', status: 'listo_para_rutafv' },
  incidencia: { label: 'Incidencia', status: 'incidencia' }
};

function now() { return new Date().toISOString(); }
function money(v) { return Math.round((Number(v) || 0) * 100) / 100; }
function paid(status) { return new Set(['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto', 'entregado', 'incidencia']).has(String(status || '')); }
function actor(user = {}) { return { id: String(user.id || 'system'), name: String(user.name || user.username || user.email || 'Sistema'), role: String(user.role || 'system') }; }
function ensureData(d) {
  if (!Array.isArray(d.notifications)) d.notifications = [];
  if (!Array.isArray(d.procurementActionLog)) d.procurementActionLog = [];
  for (const order of d.orders || []) {
    if (!paid(order.status)) continue;
    const exists = d.notifications.some(n => n.type === 'payment_received' && n.orderId === order.id);
    if (!exists) d.notifications.unshift({ id: 'ntf_' + order.id, type: 'payment_received', orderId: order.id, orderNumber: order.number, title: 'Pago recibido: preparar aprovisionamiento', message: `El pedido ${order.number || order.id} está pagado y listo para gestionar su compra al proveedor.`, read: false, createdAt: order.paidAt || order.createdAt || now() });
  }
  return d;
}
function addNotification(d, order, type, title, message, metadata = {}) {
  const key = `${type}:${order.id}`;
  if (d.notifications.some(x => x.type === type && x.orderId === order.id)) return;
  d.notifications.unshift({ id: 'ntf_' + Math.random().toString(36).slice(2, 11), type, orderId: order.id, orderNumber: order.number, title, message, metadata, read: false, createdAt: now() });
}
function addAction(d, order, action, user, metadata = {}) {
  const entry = { id: 'pac_' + Math.random().toString(36).slice(2, 11), orderId: order.id, orderNumber: order.number, action, actionLabel: ACTIONS[action]?.label || action, actor: actor(user), metadata, at: now() };
  d.procurementActionLog.unshift(entry);
  if (!Array.isArray(d.auditLog)) d.auditLog = [];
  d.auditLog.push({ id: 'aud_' + entry.id, orderId: order.id, action: 'aprovisionamiento_' + action, fromStatus: String(metadata.fromStatus || ''), toStatus: String(order.status || ''), note: entry.actionLabel, actor: entry.actor, metadata, at: entry.at });
  return entry;
}
function orderPublic(order, d) {
  const tasks = (d.procurementTasks || []).filter(x => x.orderId === order.id);
  const actions = (d.procurementActionLog || []).filter(x => x.orderId === order.id).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return { ...order, procurementTasks: tasks, procurementActions: actions, supplierSummary: tasks.map(t => ({ id: t.supplierId || t.supplierKey, name: t.supplierName, status: t.status, sourceCost: money(t.sourceCost), actualCost: money(t.actualCost), items: t.items || [] })) };
}
function filterPurchases(d, query = {}) {
  const q = String(query.q || '').trim().toLowerCase();
  const supplier = String(query.supplier || '').trim().toLowerCase();
  const status = String(query.status || '').trim().toLowerCase();
  const from = String(query.from || '').trim();
  const to = String(query.to || '').trim();
  const rows = [];
  for (const order of d.orders || []) {
    if (!paid(order.status)) continue;
    for (const task of (d.procurementTasks || []).filter(x => x.orderId === order.id)) {
      const hay = [order.number, order.customer?.name, task.supplierName, ...(task.items || []).flatMap(i => [i.title, i.ref, i.sourceRef])].join(' ').toLowerCase();
      const date = String(order.paidAt || order.createdAt || '').slice(0, 10);
      if (q && !hay.includes(q)) continue;
      if (supplier && !String(task.supplierName || '').toLowerCase().includes(supplier)) continue;
      if (status && String(task.status || '').toLowerCase() !== status) continue;
      if (from && date < from) continue;
      if (to && date > to) continue;
      rows.push({ orderId: order.id, orderNumber: order.number, paidAt: order.paidAt || null, createdAt: order.createdAt, customer: order.customer?.name || '', status: order.status, taskId: task.id, supplierId: task.supplierId || '', supplierName: task.supplierName || 'Proveedor pendiente', taskStatus: task.status || 'pendiente_compra', sourceCost: money(task.sourceCost), actualCost: money(task.actualCost), pickupAddress: task.pickupAddress || '', purchaseReference: task.purchaseReference || '', notes: task.notes || '', items: task.items || [], delivery: money(order.delivery), total: money(order.total) });
    }
  }
  rows.sort((a, b) => String(b.paidAt || b.createdAt).localeCompare(String(a.paidAt || a.createdAt)));
  return rows;
}
function registerProcurementRoutes(app, deps) {
  const { read, save, ordersManager, transitionOrder, ensureLedgerForOrder, createRutaFVDelivery, paidOrderStatus } = deps;
  app.get('/api/admin/procurement-board', ordersManager, (req, res) => {
    const d = ensureData(read());
    const orders = (d.orders || []).map(o => orderPublic(o, d));
    const pending = orders.filter(o => !['entregado', 'cancelado', 'reembolsado'].includes(String(o.status))).length;
    res.json({ orders, pending, statuses: ['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'incidencia'] });
  });
  app.get('/api/admin/purchases', ordersManager, (req, res) => {
    const d = ensureData(read());
    const rows = filterPurchases(d, req.query || {});
    const suppliers = [...new Set(rows.map(x => x.supplierName))].sort();
    const totals = rows.reduce((a, x) => { a.cost = money(a.cost + Number(x.actualCost || x.sourceCost || 0)); a.rows += 1; return a; }, { cost: 0, rows: 0 });
    res.json({ rows, suppliers, totals });
  });
  app.get('/api/admin/notifications', ordersManager, (req, res) => {
    const d = ensureData(read());
    res.json((d.notifications || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200));
  });
  app.post('/api/admin/notifications/:id/read', ordersManager, (req, res) => {
    const d = ensureData(read()); const n = (d.notifications || []).find(x => x.id === req.params.id);
    if (!n) return res.status(404).json({ error: 'Notificación no encontrada' }); n.read = true; save(d); res.json(n);
  });
  app.post('/api/admin/orders/:id/procurement-action', ordersManager, async (req, res) => {
    try {
      const d = ensureData(read()); const order = (d.orders || []).find(x => x.id === req.params.id);
      const action = String(req.body?.action || ''); const config = ACTIONS[action];
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (!config) return res.status(400).json({ error: 'Acción de aprovisionamiento no válida' });
      if (!paidOrderStatus(order.status) && action !== 'incidencia') return res.status(409).json({ error: 'El pedido debe estar pagado antes de gestionarlo.' });
      const allowed = {
        iniciar_compra: ['pagado', 'incidencia'],
        comprada: ['en_compra_proveedor', 'incidencia'],
        mercancia_recogida: ['en_compra_proveedor', 'incidencia'],
        enviar_a_rutafv: ['mercancia_recogida', 'listo_para_rutafv', 'incidencia'],
        incidencia: ['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto']
      };
      if (!allowed[action]?.includes(String(order.status))) return res.status(409).json({ error: `La acción «${config.label}» no corresponde al estado actual del pedido.` });
      const tasks = (d.procurementTasks || []).filter(x => x.orderId === order.id);
      const task = req.body?.taskId ? tasks.find(x => x.id === req.body.taskId) : null;
      if (req.body?.taskId && !task) return res.status(404).json({ error: 'Compra de proveedor no encontrada' });
      const before = order.status;
      if (config.taskStatus) {
        for (const t of task ? [task] : tasks) { t.status = config.taskStatus; t.purchaseReference = String(req.body?.purchaseReference || t.purchaseReference || '').slice(0, 120); t.actualCost = req.body?.actualCost == null ? Number(t.actualCost || t.sourceCost || 0) : money(req.body.actualCost); t.updatedAt = now(); }
      }
      const readyNow = tasks.length > 0 && tasks.every(t => ['recogida', 'recibida', 'lista'].includes(String(t.status || '')));
      order.procurement = { ...(order.procurement || {}), taskIds: tasks.map(x => x.id), allReady: readyNow, sourceCost: money(tasks.reduce((sum, x) => sum + Number(x.actualCost || x.sourceCost || 0), 0)) };
      if (config.status) {
        if (config.status === 'listo_para_rutafv') {
          if (!tasks.length || !tasks.every(t => ['recogida', 'recibida', 'lista'].includes(String(t.status || '')))) return res.status(409).json({ error: 'Completa primero la compra y recogida de todos los proveedores.' });
          for (const item of order.items || []) item.procurement = { ...(item.procurement || {}), status: 'ready' };
          order.procurement = { ...(order.procurement || {}), allReady: true };
        }
        const allCollected = readyNow;
        if (config.status !== 'mercancia_recogida' || allCollected) {
          if (config.status === 'mercancia_recogida') for (const item of order.items || []) item.procurement = { ...(item.procurement || {}), status: 'ready' };
          const result = transitionOrder(d, order, config.status, req.user, req.body?.note || config.label);
          if (!result.ok) return res.status(409).json({ error: result.error });
        }
      }
      if (action === 'enviar_a_rutafv' && createRutaFVDelivery) {
        try { await createRutaFVDelivery(d, order); } catch (e) { throw new Error('RutaFV no aceptó el reparto: ' + String(e.message || e)); }
      }
      order.procurement = { ...(order.procurement || {}), taskIds: tasks.map(x => x.id), allReady: tasks.length > 0 && tasks.every(x => ['recogida', 'recibida', 'lista'].includes(String(x.status || ''))), sourceCost: money(tasks.reduce((sum, x) => sum + Number(x.actualCost || x.sourceCost || 0), 0)) };
      addAction(d, order, action, req.user, { fromStatus: before, taskId: task?.id || '', purchaseReference: String(req.body?.purchaseReference || ''), note: String(req.body?.note || '') });
      if (action === 'incidencia') addNotification(d, order, 'procurement_incident', 'Incidencia en aprovisionamiento', `Se ha registrado una incidencia en el pedido ${order.number || order.id}.`);
      ensureLedgerForOrder(d, order); save(d); res.json(orderPublic(order, d));
    } catch (e) { res.status(409).json({ error: String(e.message || e) }); }
  });
}
module.exports = { ensureData, registerProcurementRoutes, filterPurchases };
