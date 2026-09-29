// FVM_OPERATIONS_ACCOUNTING_V1
// Shared order workflow, procurement tracking, RutaFV hand-off and internal ledger.

const {deliveryEstimate, supplierLocation, probableDeliveryDate} = require('./supplier_delivery_v1');

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

// Both products belong to the same legal business for now.  We therefore keep
// one fiscal ledger and tag every movement with an analytic business unit so it
// can be reported independently in FVMarket, RutaFV or as a consolidated view.
const ACCOUNTING_APPS = {
  FVMARKET: 'FVMarket',
  RUTAFV: 'RutaFV',
  SHARED: 'Compartido'
};
const ACCOUNTING_META = {
  venta_productos: { analyticApp: ACCOUNTING_APPS.FVMARKET, accountCode: '700000', label: 'Venta de productos' },
  transporte_cobrado: { analyticApp: ACCOUNTING_APPS.RUTAFV, accountCode: '705000', label: 'Transporte cobrado' },
  coste_proveedor: { analyticApp: ACCOUNTING_APPS.FVMARKET, accountCode: '600000', label: 'Coste de proveedor' },
  reembolso: { analyticApp: ACCOUNTING_APPS.FVMARKET, accountCode: '708000', label: 'Reembolso de cliente' }
};

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

function shipmentPackages(items = []) {
  const grouped = new Map();
  for (const item of items || []) {
    const key = String(item.productId || item.ref || item.title || 'linea');
    const qty = Math.max(1, Number(item.qty) || 1);
    const weightKg = Number(item.weightKg || item.procurement?.weightKg || 0) || 0;
    const row = grouped.get(key) || { productId: item.productId || '', ref: item.ref || '', title: item.title || '', quantity: 0, weightKg: 0 };
    row.quantity += qty;
    row.weightKg = Math.round((row.weightKg + weightKg * qty) * 1000) / 1000;
    grouped.set(key, row);
  }
  return [...grouped.values()].map(row => ({ ...row, totalWeightKg: row.weightKg }));
}

function rutaFVClient(d = {}, fallbackCode = 'FVMarket') {
  const settings = d.settings || {};
  const code = String(settings.rutaFVClientCode || fallbackCode).trim();
  return {
    code,
    externalId: code,
    name: String(settings.fiscalName || settings.storeName || 'FVMarket').trim(),
    nif: String(settings.fiscalNif || '').trim(),
    email: String(settings.supportEmail || settings.legalEmail || '').trim(),
    phone: String(settings.contactPhone || '').trim(),
    address: String(settings.fiscalAddress || '').trim(),
    city: String(settings.fiscalCity || '').trim(),
    postalCode: String(settings.fiscalPostalCode || '').trim()
  };
}

function addCustomerNotification(d, order, title, message, metadata = {}) {
  if (!order?.userId) return null;
  if (!Array.isArray(d.customerNotifications)) d.customerNotifications = [];
  const key = String(metadata.key || `${order.id}:${title}:${message}`);
  if (d.customerNotifications.some(x => x.userId === order.userId && x.orderId === order.id && x.metadata?.key === key)) return null;
  const notification = {
    id: 'cn_' + Math.random().toString(36).slice(2, 12), userId: String(order.userId), orderId: order.id,
    orderNumber: order.number || order.id, title: String(title), message: String(message),
    metadata: { ...metadata, key }, read: false, createdAt: now()
  };
  d.customerNotifications.unshift(notification);
  return notification;
}

// The customer-facing estimate intentionally contains no supplier identity,
// address or source data. If an order contains products from more than one
// island, the longest applicable procurement rule is used.
function customerDeliveryEstimate(tasks = [], baseAt = new Date()) {
  const estimates = (tasks || []).map(task => task?.deliveryEstimate).filter(Boolean);
  if (!estimates.length) return null;
  if (estimates.some(x => x.rule === 'pendiente_confirmacion')) {
    return { label: 'Pendiente de confirmar', rule: 'pendiente_confirmacion' };
  }
  const remote = estimates.some(x => x.rule === 'fuera_isla');
  if (remote) {
    const chosen = estimates.find(x => x.rule === 'fuera_isla');
    return {
      label: chosen.label || 'Aproximadamente 7 días',
      rule: 'fuera_isla',
      minDays: 7,
      maxDays: 7,
      minDate: chosen.minDate,
      maxDate: chosen.maxDate,
      minAt: chosen.minAt,
      maxAt: chosen.maxAt,
      baseAt: chosen.baseAt || new Date(baseAt).toISOString()
    };
  }
  const local = estimates[0];
  return {
    label: local.label || '24–72 h',
    rule: 'local_fuerteventura',
    minDays: 1,
    maxDays: 3,
    minHours: 24,
    maxHours: 72,
    minDate: local.minDate,
    maxDate: local.maxDate,
    minAt: local.minAt,
    maxAt: local.maxAt,
    baseAt: local.baseAt || new Date(baseAt).toISOString()
  };
}

function ensureOperationsData(d) {
  if (!Array.isArray(d.auditLog)) d.auditLog = [];
  if (!Array.isArray(d.accountingEntries)) d.accountingEntries = [];
  if (!Array.isArray(d.procurementTasks)) d.procurementTasks = [];
  if (!Array.isArray(d.suppliers)) d.suppliers = [];
  if (!Array.isArray(d.customerNotifications)) d.customerNotifications = [];
  for (const supplier of d.suppliers) {
    if (supplier.procurementMode == null) supplier.procurementMode = 'recogida_fvmarket';
    if (supplier.pickupAddress == null) supplier.pickupAddress = '';
    if (supplier.pickupCity == null) supplier.pickupCity = '';
    if (supplier.pickupPostalCode == null) supplier.pickupPostalCode = '';
    if (supplier.address == null) supplier.address = supplier.pickupAddress || '';
    if (supplier.city == null) supplier.city = supplier.pickupCity || '';
    if (supplier.postalCode == null) supplier.postalCode = supplier.pickupPostalCode || '';
    if (supplier.island == null) supplier.island = '';
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
    if (order.paidAt || ['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto', 'entregado', 'incidencia'].includes(order.status)) {
      const estimate = order.deliveryEstimate?.label || 'Pendiente de confirmar';
      addCustomerNotification(d, order, 'Pedido recibido', `Hemos recibido tu pedido. Entrega estimada: ${estimate}.`, { key: `${order.id}:payment_received` });
    }
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

function supplierRecord(supplier, name = '') {
  return supplier || { name, island: '', address: '' };
}

function syncProcurementTasks(d, order) {
  const grouped = new Map();
  const baseAt = order.paidAt || order.createdAt || now();
  for (const item of order.items || []) {
    const s = itemSupplier(item, d);
    const key = s.id || s.name.toLowerCase() || 'supplier_pending';
    const supplier = supplierRecord(d.suppliers.find(x => x.id === s.id) || d.suppliers.find(x => String(x.name || '').toLowerCase() === s.name.toLowerCase()), s.name);
    const current = grouped.get(key) || { supplierId: s.id, supplierName: s.name, supplier, items: [], sourceCost: 0 };
    const qty = Math.max(1, Number(item.qty) || 1);
    const sourcePrice = Number(item.procurement?.sourcePrice || 0);
    current.items.push({ productId: item.productId, title: item.title, ref: item.ref, sourceRef: item.procurement?.sourceRef || '', qty, weightKg: Number(item.weightKg || item.procurement?.weightKg || 0), totalWeightKg: Number(item.totalWeightKg || (Number(item.weightKg || item.procurement?.weightKg || 0) * qty)), sourcePrice });
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
    const location = supplierLocation(group.supplier);
    task.supplierIsland = location.island;
    task.supplierAddress = location.address;
    task.supplierCity = location.city;
    task.supplierPostalCode = location.postalCode;
    task.deliveryEstimate = deliveryEstimate(group.supplier, baseAt);
  }
  const tasks = d.procurementTasks.filter(x => x.orderId === order.id);
  order.procurement = { taskIds: tasks.map(x => x.id), allReady: tasks.length > 0 && tasks.every(x => ['recogida', 'recibida', 'lista'].includes(String(x.status || ''))), sourceCost: money(tasks.reduce((sum, x) => sum + Number(x.actualCost || x.sourceCost || 0), 0)) };
  order.deliveryEstimate = customerDeliveryEstimate(tasks, baseAt);
}

function addAudit(d, order, action, actor, details = {}) {
  const entry = { id: 'aud_' + Math.random().toString(36).slice(2, 12), orderId: order.id, action, fromStatus: String(details.fromStatus || ''), toStatus: String(details.toStatus || order.status || ''), note: String(details.note || ''), actor: actorOf(actor), metadata: details.metadata || {}, at: now() };
  d.auditLog.push(entry);
  return entry;
}

function addLedger(d, order, type, amount, details = {}) {
  const sourceKey = String(details.sourceKey || `${order.id}:${type}`);
  if (d.accountingEntries.some(x => x.sourceKey === sourceKey)) return;
  const meta = ACCOUNTING_META[type] || { analyticApp: ACCOUNTING_APPS.SHARED, accountCode: '', label: type };
  d.accountingEntries.push({
    id: 'led_' + Math.random().toString(36).slice(2, 12),
    orderId: order.id,
    type,
    analyticApp: String(details.analyticApp || meta.analyticApp),
    accountCode: String(details.accountCode || meta.accountCode),
    amount: money(amount),
    currency: 'EUR',
    description: String(details.description || meta.label || type),
    sourceKey,
    at: details.at || now(),
    metadata: details.metadata || {}
  });
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
  const eta = order.deliveryEstimate?.label || 'Pendiente de confirmar';
  const customerEvent = {
    pagado: ['Pedido recibido', `Hemos recibido tu pedido. Plazo estimado: ${eta}.`, `${order.id}:payment_received`],
    en_reparto: ['Pedido en reparto', 'Tu pedido está en reparto.', `${order.id}:status:en_reparto`],
    incidencia: ['Incidencia', note ? `Hemos registrado una incidencia: ${note}` : 'Hemos registrado una incidencia en tu pedido.', `${order.id}:status:incidencia`],
    entregado: ['Pedido entregado', 'Tu pedido ha sido entregado.', `${order.id}:status:entregado`],
    reembolso_parcial: ['Pedido reembolsado', 'Se ha emitido un reembolso parcial mediante Stripe.', `${order.id}:status:reembolso_parcial`],
    reembolsado: ['Pedido reembolsado', 'Se ha emitido el reembolso mediante Stripe.', `${order.id}:status:reembolsado`],
    cancelado: ['Pedido cancelado', 'Tu pedido ha sido cancelado.', `${order.id}:status:cancelado`]
  }[next];
  if (customerEvent) addCustomerNotification(d, order, customerEvent[0], customerEvent[1], { key: customerEvent[2] });
  ensureLedgerForOrder(d, order);
  return { ok: true, changed: true, from: current, to: next };
}

function recordPaymentConfirmation(d, order, actor = {}) {
  if (!order || !order.id) return;
  if (!d.auditLog.some(x => x.orderId === order.id && x.action === 'pago_confirmado')) addAudit(d, order, 'pago_confirmado', actor, { toStatus: order.status, note: 'Pago confirmado por el proveedor de pagos' });
  const estimate = order.deliveryEstimate?.label || 'Pendiente de confirmar';
  addCustomerNotification(d, order, 'Pedido recibido', `Hemos recibido tu pedido. Entrega estimada: ${estimate}.`, { key: `${order.id}:payment_received` });
  ensureLedgerForOrder(d, order);
}

function recordInvoiceIssued(d, order, invoice, actor = {}) {
  if (!order || !invoice) return;
  if (!d.auditLog.some(x => x.orderId === order.id && x.action === 'factura_emitida')) addAudit(d, order, 'factura_emitida', actor, { note: `Factura ${invoice.number || invoice.id} emitida`, metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number } });
}

function recordRefund(d, order, refund, actor = {}) {
  if (!order || !refund || Number(refund.amount || 0) <= 0) return;
  addLedger(d, order, 'reembolso', -Math.abs(Number(refund.amount)), { description: `Reembolso Stripe: ${order.number || order.id}`, sourceKey: `${order.id}:refund:${refund.id}`, metadata: { refundId: refund.id, providerReference: refund.stripeRefundId || '' } });
  if (!d.auditLog.some(x => x.orderId === order.id && x.action === 'reembolso_emitido' && x.metadata?.refundId === refund.id)) addAudit(d, order, 'reembolso_emitido', actor, { toStatus: order.status, note: `Reembolso de ${money(refund.amount).toFixed(2)} €`, metadata: { refundId: refund.id, amount: money(refund.amount), providerReference: refund.stripeRefundId || '' } });
  const key = `${order.id}:refund:${order.refundStatus || 'parcial'}`;
  addCustomerNotification(d, order, 'Pedido reembolsado', order.refundStatus === 'total' ? 'Se ha emitido el reembolso mediante Stripe.' : 'Se ha emitido un reembolso parcial mediante Stripe.', { key });
}

function publicOperationOrder(order, d) {
  const tasks = d.procurementTasks.filter(x => x.orderId === order.id).map(x => ({ ...x, items: (x.items || []).map(i => ({ ...i })) }));
  return { ...order, statusLabel: label(order.status), deliveryEstimate: order.deliveryEstimate || customerDeliveryEstimate(tasks, order.paidAt || order.createdAt || new Date()), procurementTasks: tasks, timeline: d.auditLog.filter(x => x.orderId === order.id).sort((a, b) => String(a.at).localeCompare(String(b.at))) };
}

function orderInvoice(d, order) {
  return (d.invoices || []).find(invoice => invoice.orderId === order.id) || null;
}

function accountingRow(entry, d) {
  const order = (d.orders || []).find(item => item.id === entry.orderId) || {};
  const invoice = orderInvoice(d, order);
  const meta = ACCOUNTING_META[entry.type] || {};
  const analyticApp = String(entry.analyticApp || meta.analyticApp || ACCOUNTING_APPS.SHARED);
  const amount = money(entry.amount);
  const gross = Math.abs(amount);
  const rate = entry.type === 'coste_proveedor'
    ? Number(entry.metadata?.taxRate || 0)
    : Number(entry.metadata?.taxRate ?? invoice?.taxRate ?? d.settings?.igic ?? 0);
  const taxableBase = rate > 0 && entry.type !== 'coste_proveedor' ? money(gross / (1 + rate / 100)) : 0;
  const taxAmount = rate > 0 && entry.type !== 'coste_proveedor' ? money(gross - taxableBase) : 0;
  const supplierName = String(entry.metadata?.supplierName || '');
  return {
    ...entry,
    analyticApp,
    accountCode: String(entry.accountCode || meta.accountCode || ''),
    accountLabel: String(meta.label || entry.type),
    orderNumber: String(order.number || entry.orderId || ''),
    invoiceId: String(invoice?.id || ''),
    invoiceNumber: String(invoice?.number || ''),
    status: String(order.status || ''),
    customerName: String(order.customer?.billingName || order.customer?.name || ''),
    customerNif: String(order.customer?.nifNie || ''),
    supplierName,
    paymentMethod: String(order.paymentMethod || invoice?.paymentMethod || ''),
    taxName: 'IGIC',
    taxRate: rate,
    taxableBase,
    taxAmount,
    grossAmount: gross
  };
}

function filterAccountingRows(d, query = {}) {
  const q = String(query.q || '').trim().toLowerCase();
  const analyticApp = String(query.app || '').trim();
  const type = String(query.type || '').trim();
  const status = String(query.status || '').trim();
  const from = String(query.from || '').trim();
  const to = String(query.to || '').trim();
  const rows = (d.accountingEntries || []).map(entry => accountingRow(entry, d)).filter(row => {
    const date = String(row.at || '').slice(0, 10);
    const haystack = [row.orderNumber, row.invoiceNumber, row.description, row.customerName, row.supplierName, row.type, row.accountLabel].join(' ').toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (analyticApp && row.analyticApp !== analyticApp) return false;
    if (type && row.type !== type) return false;
    if (status && row.status !== status) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return rows;
}

function accountingTotals(rows) {
  const byType = {};
  const byApp = {};
  for (const row of rows) {
    byType[row.type] = money((byType[row.type] || 0) + Number(row.amount || 0));
    const unit = byApp[row.analyticApp] || { income: 0, costs: 0, net: 0 };
    if (Number(row.amount || 0) >= 0) unit.income = money(unit.income + Number(row.amount || 0));
    else unit.costs = money(unit.costs + Math.abs(Number(row.amount || 0)));
    unit.net = money(unit.income - unit.costs);
    byApp[row.analyticApp] = unit;
  }
  const income = money(rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0)), 0));
  const costs = money(rows.reduce((sum, row) => sum + Math.abs(Math.min(0, Number(row.amount || 0))), 0));
  return { byType, byApp, income, costs, net: money(income - costs), entries: rows.length };
}

function accountingReport(d, query = {}) {
  const entries = filterAccountingRows(d, query);
  const orders = (d.orders || []).map(order => ({
    id: order.id,
    number: order.number,
    status: order.status,
    total: money(order.total),
    subtotal: money(order.subtotal),
    transport: money(order.delivery),
    customer: order.customer?.name || '',
    createdAt: order.createdAt,
    paidAt: order.paidAt || null
  }));
  const invoices = (d.invoices || []).map(invoice => ({
    id: invoice.id,
    number: invoice.number,
    orderId: invoice.orderId,
    orderNumber: invoice.orderNumber,
    issuedAt: invoice.issuedAt,
    taxBase: money(invoice.taxBase),
    taxAmount: money(invoice.taxAmount),
    total: money(invoice.total),
    paymentMethod: invoice.paymentMethod || ''
  }));
  return {
    entries,
    orders,
    invoices,
    totals: accountingTotals(entries),
    applications: Object.values(ACCOUNTING_APPS),
    types: Object.keys(ACCOUNTING_META),
    statuses: Object.keys(STATUS_LABELS),
    audit: (d.auditLog || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 500)
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function holdedCsv(rows) {
  const headers = ['Fecha', 'Documento', 'Número documento', 'Descripción', 'Cuenta', 'Debe', 'Haber', 'Importe', 'Moneda', 'Aplicación', 'Centro de coste', 'Tercero', 'NIF', 'Pedido', 'Factura', 'Método de pago', 'Impuesto', 'Base imponible', 'Cuota impuesto'];
  const lines = [headers.join(';')];
  for (const row of rows) {
    const amount = Number(row.amount || 0);
    const values = [
      String(row.at || '').slice(0, 10),
      row.invoiceNumber || row.orderNumber,
      row.invoiceNumber || row.orderNumber,
      row.description,
      row.accountCode,
      amount < 0 ? Math.abs(amount).toFixed(2) : '0.00',
      amount > 0 ? amount.toFixed(2) : '0.00',
      amount.toFixed(2),
      row.currency || 'EUR',
      row.analyticApp,
      row.analyticApp,
      row.supplierName || row.customerName,
      row.customerNif,
      row.orderNumber,
      row.invoiceNumber,
      row.paymentMethod,
      row.taxRate ? `${row.taxName} ${Number(row.taxRate).toFixed(2)}%` : '',
      Number(row.taxableBase || 0).toFixed(2),
      Number(row.taxAmount || 0).toFixed(2)
    ];
    lines.push(values.map(csvCell).join(';'));
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

function registerOperationsRoutes(app, deps) {
  const { read, save, id, ordersManager, admin, rutaFVRequest, RUTAFV_DELIVERY_PATH, RUTAFV_CLIENT_CODE, paidOrderStatus, issueInvoiceForOrder, recordInvoiceIssued, scheduleOrderEmail } = deps;

  app.get('/api/admin/operations/summary', ordersManager, (req, res) => {
    const d = ensureOperationsData(read());
    const orders = (d.orders || []).map(o => publicOperationOrder(o, d));
    const counts = Object.fromEntries(Object.keys(STATUS_LABELS).map(s => [s, orders.filter(o => o.status === s).length]));
    res.json({ statuses: STATUS_LABELS, counts, orders, procurementTasks: d.procurementTasks, fulfillmentModel: d.settings?.fulfillmentModel || 'sin_stock_fisico', deliveryMode: d.settings?.deliveryMode || 'normal_planificado' });
  });

  app.get('/api/admin/accounting/export', ordersManager, (req, res) => {
    const d = ensureOperationsData(read());
    const report = accountingReport(d, req.query || {});
    const filename = `fvmarket-holded-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(holdedCsv(report.entries));
  });

  app.get('/api/admin/accounting', ordersManager, (req, res) => {
    const d = ensureOperationsData(read());
    res.set('Cache-Control', 'no-store');
    res.json(accountingReport(d, req.query || {}));
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
    if (String(req.body?.status || '') === 'pagado') return res.status(409).json({ error: 'El pago solo puede confirmarlo Stripe.' });
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
      if (!order.procurement?.allReady && !order.fulfillment?.readyForRutaFV) return res.status(409).json({ error: 'Completa primero la compra y recogida de todos los proveedores.' });
      const destination = order.transport?.destination || { address: order.customer?.address || order.address || '', city: order.customer?.city || order.city || '', postalCode: order.customer?.postalCode || order.postalCode || '', notes: order.customer?.notes || order.notes || '' };
      const originDetails = order.transport?.originDetails || { label: String(order.transport?.origin || d.settings?.rutaFVOrigin || '').trim(), source: 'FVMarket' };
      const probableDate = String(order.transport?.estimatedDeliveryDate || probableDeliveryDate(order.deliveryEstimate || {}) || '').trim();
      const client = rutaFVClient(d, RUTAFV_CLIENT_CODE);
      const items = (order.items || []).map(x => ({ productId: x.productId, ref: x.ref, title: x.title, qty: x.qty, weightKg: Number(x.weightKg || x.procurement?.weightKg || 0), totalWeightKg: Number(x.totalWeightKg || (Number(x.weightKg || x.procurement?.weightKg || 0) * Number(x.qty || 1))) }));
      const packages = shipmentPackages(order.items || []);
      const payload = {
        clientCode: client.code,
        client,
        externalOrderId: order.id,
        externalOrderNumber: order.number,
        customer: { name: order.customer?.name || user.name || '', email: order.customer?.email || user.email || '', phone: order.customer?.phone || order.phone || '' },
        sourceApplication: 'FVMarket',
        accountingApplication: 'RutaFV',
        paymentRequired: false,
        paymentStatus: 'paid_in_fvmarket',
        origin: originDetails.label || String(order.transport?.origin || '').trim(),
        originDetails,
        pickup: originDetails,
        destination,
        destinationText: [destination.address, destination.city, destination.postalCode].filter(Boolean).join(', '),
        deliveryAddress: destination,
        probableDeliveryDate: probableDate,
        estimatedDeliveryDate: probableDate,
        deliveryEstimate: { label: order.deliveryEstimate?.label || 'Pendiente de confirmar', minDate: order.deliveryEstimate?.minDate || '', maxDate: order.deliveryEstimate?.maxDate || '', businessDaysOnly: true },
        transportAmount: money(order.delivery),
        transportPaid: true,
        orderSource: 'FVMarket',
        fulfillmentModel: 'sin_stock_fisico',
        deliveryMode: 'normal',
        express: false,
        photoRequired: false,
        photoOptional: true,
        items,
        packages,
        packageCount: packages.length
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
    const estimated = req.body?.estimatedDeliveryDate || req.body?.deliveryDate || req.body?.estimatedDate;
    if (estimated) {
      order.transport.estimatedDeliveryDate = String(estimated);
      order.transport.deliveryDateStatus = 'actualizada';
      order.deliveryEstimate = { label: `Entrega estimada: ${String(estimated)}`, rule: 'rutafv_actualizada', minDate: String(estimated), maxDate: String(estimated), minAt: String(estimated), maxAt: String(estimated) };
      addCustomerNotification(d, order, 'Fecha de entrega actualizada', `La fecha estimada de entrega de tu pedido es ${String(estimated)}.`, { key: `${order.id}:eta:${String(estimated)}` });
    }
    const result = transitionOrder(d, order, req.body?.status, req.user, 'Actualización recibida de RutaFV');
    if (!result.ok) return res.status(409).json({ error: result.error });
    save(d);
    res.json(publicOperationOrder(order, d));
  });
}

module.exports = { registerOperationsRoutes, ensureOperationsData, transitionOrder, recordPaymentConfirmation, recordInvoiceIssued, recordRefund, ensureLedgerForOrder, customerDeliveryEstimate, addCustomerNotification, shipmentPackages, rutaFVClient, STATUS_LABELS, ACCOUNTING_APPS, accountingReport, holdedCsv, _test: { normalizeStatus, label, money, TRANSITIONS, accountingRow, accountingTotals } };
