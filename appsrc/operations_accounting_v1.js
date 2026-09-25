// FVM_OPERATIONS_ACCOUNTING_V1
// Shared order workflow, procurement tracking, RutaFV hand-off and internal ledger.

const STATUS_LABELS = {
  pendiente_pago: 'Pendiente de pago',
  pagado: 'Pagado',
  en_compra_proveedor: 'Compra al proveedor',
  mercancia_recogida: 'Mercancía recogida',
  listo_para_rutafv: 'Listo para RutaFV',
  enviado_a_rutafv: 'Enviado a RutaFV',
  en_reparto: 'En reparto',
  entregado: 'Entregado',
  incidencia: 'Incidencia',
  cancelado: 'Cancelado',
  reembolso_parcial: 'Reembolso parcial',
  reembolsado: 'Reembolsado'
};

const STATUS_ORDER = [
  'pendiente_pago', 'pagado', 'en_compra_proveedor', 'mercancia_recogida',
  'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto', 'entregado'
];

const TRANSITIONS = {
  pendiente_pago: new Set(['pagado', 'cancelado']),
  pagado: new Set(['en_compra_proveedor', 'incidencia', 'cancelado', 'reembolso_parcial', 'reembolsado']),
  en_compra_proveedor: new Set(['mercancia_recogida', 'incidencia', 'cancelado', 'reembolso_parcial', 'reembolsado']),
  mercancia_recogida: new Set(['listo_para_rutafv', 'incidencia', 'cancelado', 'reembolso_parcial', 'reembolsado']),
  listo_para_rutafv: new Set(['enviado_a_rutafv', 'incidencia', 'cancelado', 'reembolso_parcial', 'reembolsado']),
  enviado_a_rutafv: new Set(['en_reparto', 'incidencia', 'cancelado', 'reembolso_parcial', 'reembolsado']),
  en_reparto: new Set(['entregado', 'incidencia', 'cancelado', 'reembolso_parcial', 'reembolsado']),
  entregado: new Set(['incidencia', 'reembolso_parcial', 'reembolsado']),
  incidencia: new Set(['en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto', 'entregado', 'cancelado', 'reembolso_parcial', 'reembolsado']),
  cancelado: new Set(['pagado', 'reembolso_parcial', 'reembolsado']),
  reembolso_parcial: new Set(['reembolso_parcial', 'reembolsado']),
  reembolsado: new Set([])
};

const LEGACY_STATUS = {preparando: 'en_compra_proveedor'};

function money(value) { return Math.round((Number(value) || 0) * 100) / 100; }
function now() { return new Date().toISOString(); }
function label(status) { return STATUS_LABELS[String(status || '')] || String(status || 'Pendiente'); }
function normalizeStatus(status) { return LEGACY_STATUS[String(status || '')] || String(status || 'pendiente_pago'); }
function actorOf(actor = {}) {
  return { id: String(actor.id || 'system'), name: String(actor.name || actor.username || actor.email || 'Sistema'), role: String(actor.role || 'system') };
}

function ensureOperationsData(d) {
  if (!Array.isArray(d.auditLog)) d.auditLog = [];
  if (!Array.isArray(d.accountingEntries)) d.accountingEntries = [];
  if (!Array.isArray(d.procurementTasks)) d.procurementTasks = [];
  if (!Array.isArray(d.suppliers)) d.suppliers = [];
  for (const supplier of d.suppliers) {
    if (supplier.procurementMode == null) supplier.procurementMode = 'recogida_fvmarket';
    if (supplier.pickupAddress == null) supplier.pickupAddress = '';
    if (supplier.pickupCity == null) supplier.pickupCity = '';
    if (supplier.pickupPostalCode == null) supplier.pickupPostalCode = '';
  }
  for (const order of d.orders || []) {
    const previous = order.status;
    order.status = normalizeStatus(order.status);
    order.workflow = order.workflow || {};
    order.workflow.fulfillmentModel = 'sin_stock_fisico';
    order.workflow.deliveryMode = 'normal_planificado';
    order.workflow.supplierReady = order.status === 'mercancia_recogida' || order.status === 'listo_para_rutafv' || order.status === 'enviado_a_rutafv' || order.status === 'en_reparto' || order.status === 'entregado';
    order.workflow.lastStatusAt = order.workflow.lastStatusAt || order.updatedAt || order.createdAt || now();
    order.transport = order.transport || {};
    order.transport.provider = order.transport.provider || (order.delivery > 0 ? 'RutaFV' : '');
    order.transport.amount = money(order.transport.amount ?? order.delivery ?? 0);
    order.transport.requested = true;
    order.transport.deliveryMode = 'normal';
    order.transport.express = false;
    order.transport.status = order.transport.status || (order.transport.deliveryId ? 'creado_en_rutafv' : 'pendiente_crear_reparto');
    if (previous !== order.status || !d.auditLog.some(x => x.orderId === order.id && x.action === 'pedido_creado')) {
      const createdAt = order.createdAt || now();
      if (!d.auditLog.some(x => x.orderId === order.id && x.action === 'pedido_creado')) {
        d.auditLog.push({ id: 'aud_' + order.id + '_created', orderId: order.id, action: 'pedido_creado', fromStatus: '', toStatus: order.status, note: 'Pedido registrado en FVMarket', actor: actorOf(), at: createdAt });
      }
    }
    syncProcurementTasks(d, order);
    ensureLedgerForOrder(d, order);
  }
  return d;
}

function itemSupplier(item = {}, d = {}) {
  const supplierId = String(item.procurement?.supplierId || item.supplierId || '');
  const fromId = d.suppliers.find(x => x.id === supplierId);
  const name = String(item.procurement?.provider || item.sourceProvider || fromId?.name || 'Proveedor pendiente').trim();
  const fromName = d.suppliers.find(x => String(x.name || '').toLowerCase() === name.toLowerCase());
  return { id: supplierId || fromId?.id || fromName?.id || '', name };
}

function syncProcurementTasks(d, order) {
  const grouped = new Map();
  for (const item of order.items || []) {
    const s = itemSupplier(item, d);
    const key = s.id || s.name.toLowerCase() || 'supplier_pending';
    const current = grouped.get(key) || { supplierId: s.id, supplierName: s.name, items: [], sourceCost: 0 };
    const qty = Math.max(1, Number(item.qty) || 1);
    const sourcePrice = Number(item.procurement?.sourcePrice || 0);
    current.items.push({ productId: item.productId, title: item.title, ref: item.ref, sourceRef: item.procurement?.sourceRef || '', qty, sourcePrice });
    current.sourceCost = money(current.sourceCost + sourcePrice * qty);
    grouped.set(key, current);
  }
  for (const group of grouped.values()) {
    let task = d.procurementTasks.find(x => x.orderId === order.id && x.supplierKey === (group.supplierId || group.supplierName.toLowerCase()));
    if (!task) {
      task = { id: 'pt_' + order.id + '_' + (group.supplierId || group.supplierName.toLowerCase().replace(/[^a-z0-9]+/g, '_')), orderId: order.id, supplierKey: group.supplierId || group.supplierName.toLowerCase(), supplierId: group.supplierId, supplierName: group.supplierName, status: 'pendiente_compra', items: group.items, sourceCost: group.sourceCost, actualCost: 0, pickupAddress: '', notes: '', createdAt: order.createdAt || now(), updatedAt: now() };
      d.procurementTasks.push(task);
    } else {
      task.items = group.items;
      task.sourceCost = group.sourceCost;
      task.updatedAt = task.updatedAt || now();
    }
  }
  const tasks = d.procurementTasks.filter(x => x.orderId === order.id);
  order.procurement = { taskIds: tasks.map(x => x.id), allReady: tasks.length > 0 && tasks.every(x => ['recogida', 'recibida', 'lista'].includes(String(x.status || ''))), sourceCost: money(tasks.reduce((sum, x) => sum + Number(x.actualCost || x.sourceCost || 0), 0)) };
}

function addAudit(d, order, action, actor, details = {}) {
  const entry = { id: 'aud_' + Math.random().toString(36).slice(2, 12), orderId: order.id, action, fromStatus: String(details.fromStatus || ''), toStatus: String(details.toStatus || order.status || ''), note: String(details.note || ''), actor: actorOf(actor), metadata: details.metadata || {}, at: now() };
  d.auditLog.push(entry);
  return entry;
}

function addLedger(d, order, type, amount, details = {}) {
  const sourceKey = String(details.sourceKey || `${order.id}:${type}`);
  if (d.accountingEntries.some(x => x.sourceKey === sourceKey)) return;
  d.accountingEntries.push({ id: 'led_' + Math.random().toString(36).slice(2, 12), orderId: order.id, type, amount: money(amount), currency: 'EUR', description: String(details.description || type), sourceKey, at: details.at || now(), metadata: details.metadata || {} });
}

function ensureLedgerForOrder(d, order) {
  if (!order || !order.id) return;
  const paidStatuses = new Set(['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto', 'entregado', 'incidencia', 'reembolso_parcial', 'reembolsado']);
  if (paidStatuses.has(normalizeStatus(order.status))) {
    addLedger(d, order, 'venta_productos', order.subtotal, { description: 'Venta de productos FVMarket', sourceKey: `${order.id}:sale` });
    if (Number(order.delivery) > 0) addLedger(d, order, 'transporte_cobrado', order.delivery, { description: 'Transporte a obra RutaFV', sourceKey: `${order.id}:transport` });
  }
  const tasks = d.procurementTasks.filter(x => x.orderId === order.id);
  if (paidStatuses.has(normalizeStatus(order.status))) for (const task of tasks) if (!['pendiente_compra', 'incidencia'].includes(String(task.status || '')) && Number(task.actualCost || task.sourceCost) > 0) addLedger(d, order, 'coste_proveedor', -Number(task.actualCost || task.sourceCost), { description: `Coste proveedor: ${task.supplierName}`, sourceKey: `${order.id}:supplier:${task.id}`, metadata: { supplierId: task.supplierId, supplierName: task.supplierName } });
}

function transitionOrder(d, order, nextStatus, actor = {}, note = '') {
  const next = normalizeStatus(nextStatus);
  const current = normalizeStatus(order.status);
  if (current === next) return { ok: true, changed: false };
  if (!TRANSITIONS[current]?.has(next)) return { ok: false, error: `No se puede pasar de «${label(current)}» a «${label(next)}».` };
  if (next === 'mercancia_recogida' && order.procurement?.taskIds?.length && !order.procurement.allReady) return { ok: false, error: 'Marca primero como recogidas o recibidas todas las compras de proveedores.' };
  if (next === 'listo_para_rutafv' && order.procurement?.taskIds?.length && !order.procurement.allReady) return { ok: false, error: 'El pedido no puede quedar listo hasta completar todas las compras de proveedores.' };
  if (next === 'enviado_a_rutafv' && !order.transport?.deliveryId) return { ok: false, error: 'Primero crea el reparto en RutaFV.' };
  const at = now();
  order.status = next;
  order.updatedAt = at;
  order.workflow = order.workflow || {};
  order.workflow.lastStatusAt = at;
  if (next === 'en_compra_proveedor') order.workflow.purchaseStartedAt = order.workflow.purchaseStartedAt || at;
  if (next === 'mercancia_recogida') order.workflow.goodsCollectedAt = at;
  if (next === 'listo_para_rutafv') order.workflow.readyAt = at;
  if (next === 'enviado_a_rutafv') order.workflow.sentToRutaFVAt = at;
  if (next === 'en_reparto') order.workflow.inTransitAt = at;
  if (next === 'entregado') order.workflow.deliveredAt = at;
  addAudit(d, order, 'estado_cambiado', actor, { fromStatus: current, toStatus: next, note });
  ensureLedgerForOrder(d, order);
  return { ok: true, changed: true, from: current, to: next };
}

function recordPaymentConfirmation(d, order, actor = {}) {
  if (!order || !order.id) return;
  if (!d.auditLog.some(x => x.orderId === order.id && x.action === 'pago_confirmado')) addAudit(d, order, 'pago_confirmado', actor, { toStatus: order.status, note: 'Pago confirmado por el proveedor de pagos' });
  ensureLedgerForOrder(d, order);
}

function recordInvoiceIssued(d, order, invoice, actor = {}) {
  if (!order || !invoice) return;
  if (!d.auditLog.some(x => x.orderId === order.id && x.action === 'factura_emitida')) addAudit(d, order, 'factura_emitida', actor, { note: `Factura ${invoice.number || invoice.id} emitida`, metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number } });
}

function publicOperationOrder(order, d) {
  const tasks = d.procurementTasks.filter(x => x.orderId === order.id).map(x => ({ ...x, items: (x.items || []).map(i => ({ ...i })) }));
  return { ...order, statusLabel: label(order.status), procurementTasks: tasks, timeline: d.auditLog.filter(x => x.orderId === order.id).sort((a, b) => String(a.at).localeCompare(String(b.at))) };
}

function registerOperationsRoutes(app, deps) {
  const { read, save, id, ordersManager, admin, rutaFVRequest, RUTAFV_DELIVERY_PATH, RUTAFV_CLIENT_CODE, paidOrderStatus, issueInvoiceForOrder, recordInvoiceIssued, scheduleOrderEmail } = deps;

  app.get('/api/admin/operations/summary', ordersManager, (req, res) => {
    const d = ensureOperationsData(read());
    const orders = (d.orders || []).map(o => publicOperationOrder(o, d));
    const counts = Object.fromEntries(Object.keys(STATUS_LABELS).map(s => [s, orders.filter(o => o.status === s).length]));
    res.json({ statuses: STATUS_LABELS, counts, orders, procurementTasks: d.procurementTasks, fulfillmentModel: d.settings?.fulfillmentModel || 'sin_stock_fisico', deliveryMode: d.settings?.deliveryMode || 'normal_planificado' });
  });

  app.get('/api/admin/accounting', ordersManager, (req, res) => {
    const d = ensureOperationsData(read());
    const entries = (d.accountingEntries || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const orders = (d.orders || []).map(o => ({ id: o.id, number: o.number, status: o.status, total: money(o.total), subtotal: money(o.subtotal), transport: money(o.delivery), customer: o.customer?.name || '', createdAt: o.createdAt }));
    const totals = entries.reduce((acc, e) => { acc[e.type] = money((acc[e.type] || 0) + Number(e.amount || 0)); return acc; }, {});
    res.json({ entries, orders, totals, audit: (d.auditLog || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 500) });
  });

  app.get('/api/admin/orders/:id/timeline', ordersManager, (req, res) => {
    const d = ensureOperationsData(read());
    const order = d.orders.find(x => x.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ order: publicOperationOrder(order, d), timeline: d.auditLog.filter(x => x.orderId === order.id).sort((a, b) => String(a.at).localeCompare(String(b.at))) });
  });

  app.post('/api/admin/orders/:id/status', ordersManager, (req, res) => {
    const d = ensureOperationsData(read());
    const order = d.orders.find(x => x.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    const result = transitionOrder(d, order, req.body?.status, req.user, req.body?.note || '');
    if (!result.ok) return res.status(409).json({ error: result.error });
    let invoice = null;
    if (paidOrderStatus(order.status)) {
      order.paidAt = order.paidAt || now();
      invoice = issueInvoiceForOrder(d, order);
      if (invoice && recordInvoiceIssued) recordInvoiceIssued(d, order, invoice, req.user);
    }
    ensureLedgerForOrder(d, order);
    save(d);
    if (result.changed && result.to === 'en_reparto') scheduleOrderEmail(req, order.id, 'delivery_in_transit');
    if (result.changed && result.to === 'entregado') scheduleOrderEmail(req, order.id, 'delivery_completed');
    if (result.changed && result.to === 'pagado') { scheduleOrderEmail(req, order.id, 'order_confirmation'); if (invoice) scheduleOrderEmail(req, order.id, 'invoice_issued'); }
    res.json(publicOperationOrder(order, d));
  });

  app.post('/api/admin/orders/:id/procurement', ordersManager, (req, res) => {
    const d = ensureOperationsData(read());
    const order = d.orders.find(x => x.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    const tasks = d.procurementTasks.filter(x => x.orderId === order.id);
    for (const patch of Array.isArray(req.body?.tasks) ? req.body.tasks : []) {
      const task = tasks.find(x => x.id === patch.id); if (!task) continue;
      if (patch.status != null) task.status = String(patch.status);
      if (patch.actualCost != null) task.actualCost = money(patch.actualCost);
      if (patch.pickupAddress != null) task.pickupAddress = String(patch.pickupAddress).slice(0, 240);
      if (patch.notes != null) task.notes = String(patch.notes).slice(0, 600);
      task.updatedAt = now();
      addAudit(d, order, 'compra_proveedor_actualizada', req.user, { note: `${task.supplierName}: ${task.status}`, metadata: { taskId: task.id, supplierId: task.supplierId } });
    }
    const allReady = tasks.length > 0 && tasks.every(x => ['recogida', 'recibida', 'lista'].includes(String(x.status || '')));
    order.procurement = { ...(order.procurement || {}), taskIds: tasks.map(x => x.id), allReady, sourceCost: money(tasks.reduce((sum, x) => sum + Number(x.actualCost || x.sourceCost || 0), 0)) };
    ensureLedgerForOrder(d, order);
    save(d);
    res.json(publicOperationOrder(order, d));
  });

  app.post('/api/admin/orders/:id/send-to-rutafv', ordersManager, async (req, res) => {
    try {
      const d = ensureOperationsData(read());
      const order = d.orders.find(x => x.id === req.params.id);
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
      if (!order.transport?.requested || Number(order.delivery || 0) < 0) return res.status(409).json({ error: 'El pedido no tiene un cálculo de transporte válido.' });
      if (!['listo_para_rutafv', 'incidencia'].includes(String(order.status))) return res.status(409).json({ error: 'El pedido debe estar listo para enviarlo a RutaFV.' });
      if (order.transport.deliveryId) return res.json(publicOperationOrder(order, d));
      const user = d.users.find(x => x.id === order.userId) || {};
      const destination = { address: order.customer?.address || order.address || '', city: order.customer?.city || order.city || '', postalCode: order.customer?.postalCode || order.postalCode || '', notes: order.customer?.notes || order.notes || '' };
      const payload = {
        clientCode: d.settings?.rutaFVClientCode || RUTAFV_CLIENT_CODE,
        externalOrderId: order.id,
        externalOrderNumber: order.number,
        customer: { name: order.customer?.name || user.name || '', email: order.customer?.email || user.email || '', phone: order.customer?.phone || order.phone || '' },
        destination,
        destinationText: [destination.address, destination.city, destination.postalCode].filter(Boolean).join(', '),
        transportAmount: money(order.delivery),
        transportPaid: paidOrderStatus(order.status) || !!order.paidAt,
        orderSource: 'FVMarket',
        fulfillmentModel: 'sin_stock_fisico',
        deliveryMode: 'normal',
        express: false,
        items: (order.items || []).map(x => ({ productId: x.productId, ref: x.ref, title: x.title, qty: x.qty }))
      };
      const response = await rutaFVRequest(RUTAFV_DELIVERY_PATH, payload);
      order.transport.deliveryId = String(response.id || response.deliveryId || response.expeditionId || '');
      order.transport.status = 'creado_en_rutafv';
      order.transport.syncedAt = now();
      order.transport.rutaFVResponse = response;
      const transitioned = transitionOrder(d, order, 'enviado_a_rutafv', req.user, 'Reparto creado en RutaFV');
      if (!transitioned.ok) return res.status(409).json({ error: transitioned.error });
      save(d);
      res.json(publicOperationOrder(order, d));
    } catch (error) {
      res.status(503).json({ error: String(error.message || 'No se pudo crear el reparto en RutaFV') });
    }
  });

  app.post('/api/admin/orders/:id/rutafv-status', ordersManager, (req, res) => {
    const d = ensureOperationsData(read());
    const order = d.orders.find(x => x.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (!order.transport?.deliveryId) return res.status(409).json({ error: 'El pedido todavía no está enviado a RutaFV.' });
    if (req.body?.transportStatus != null) order.transport.status = String(req.body.transportStatus);
    const result = transitionOrder(d, order, req.body?.status, req.user, 'Actualización recibida de RutaFV');
    if (!result.ok) return res.status(409).json({ error: result.error });
    save(d);
    res.json(publicOperationOrder(order, d));
  });
}

module.exports = { registerOperationsRoutes, ensureOperationsData, transitionOrder, recordPaymentConfirmation, recordInvoiceIssued, ensureLedgerForOrder, STATUS_LABELS, _test: { normalizeStatus, label, money, TRANSITIONS } };
