// FVM_PROCUREMENT_CONTROL_V2
// Admin-only procurement board, payment notifications and supplier accounting filters.

const {deliveryEstimate}=require('./supplier_delivery_v1');
const PDFDocument=require('pdfkit');

const ACTIONS = {
  comprada: { label: 'Comprado', status: 'en_compra_proveedor', taskStatus: 'comprada' },
  mercancia_recogida: { label: 'Mercancía recogida', status: 'mercancia_recogida', taskStatus: 'recogida' },
  enviar_a_rutafv: { label: 'Enviar a RutaFV', status: 'listo_para_rutafv' },
  incidencia: { label: 'Incidencia', status: 'incidencia' }
};

const BOARD_STATUSES = new Set(['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'incidencia']);

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
  const tasks = (d.procurementTasks || []).filter(x => x.orderId === order.id).map(task => {
    const supplier = (d.suppliers || []).find(x => x.id === task.supplierId) || {name: task.supplierName, island: task.supplierIsland, address: task.supplierAddress};
    const estimate = task.deliveryEstimate || deliveryEstimate(supplier, order.paidAt || order.createdAt || now());
    return {...task, supplierIsland: estimate.island, supplierAddress: estimate.address, supplierCity: estimate.city, supplierPostalCode: estimate.postalCode, deliveryEstimate: estimate};
  });
  const actions = (d.procurementActionLog || []).filter(x => x.orderId === order.id).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return { ...order, procurementTasks: tasks, procurementActions: actions, supplierSummary: tasks.map(t => ({ id: t.supplierId || t.supplierKey, name: t.supplierName, status: t.status, sourceCost: money(t.sourceCost), actualCost: money(t.actualCost), island: t.supplierIsland, address: t.supplierAddress, deliveryEstimate: t.deliveryEstimate, items: t.items || [] })) };
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
      const supplierRecord=(d.suppliers||[]).find(x=>x.id===task.supplierId)||{name:task.supplierName,island:task.supplierIsland,address:task.supplierAddress};
      const estimate=task.deliveryEstimate||deliveryEstimate(supplierRecord,order.paidAt||order.createdAt||now());
      rows.push({ orderId: order.id, orderNumber: order.number, paidAt: order.paidAt || null, createdAt: order.createdAt, customer: order.customer?.name || '', status: order.status, taskId: task.id, supplierId: task.supplierId || '', supplierName: task.supplierName || 'Proveedor pendiente', supplierIsland: estimate.island, supplierAddress: estimate.address, deliveryEstimate: estimate, taskStatus: task.status || 'pendiente_compra', sourceCost: money(task.sourceCost), actualCost: money(task.actualCost), pickupAddress: task.pickupAddress || '', purchaseReference: task.purchaseReference || '', notes: task.notes || '', items: task.items || [], delivery: money(order.delivery), total: money(order.total) });
    }
  }
  rows.sort((a, b) => String(b.paidAt || b.createdAt).localeCompare(String(a.paidAt || a.createdAt)));
  return rows;
}
function boardRows(d, query = {}) {
  return filterPurchases(d, query).filter(row => BOARD_STATUSES.has(String(row.status || '')));
}
function groupedBoardRows(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.supplierName || 'Proveedor pendiente').trim() || 'Proveedor pendiente';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([supplier, items]) => ({ supplier, items }));
}
function drawBoardPdf(doc, rows, exportedAt = new Date()) {
  const margin = 40, bottom = () => doc.page.height - margin;
  const ensureSpace = needed => { if (doc.y + needed > bottom()) doc.addPage(); };
  const text = (value, options = {}) => doc.text(String(value ?? ''), { width: doc.page.width - margin * 2, ...options });
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#06345f').text('FVMarket · Tablero de pedidos');
  doc.font('Helvetica').fontSize(9).fillColor('#52677b').text(`Pedidos pagados pendientes de gestión · Exportado: ${new Date(exportedAt).toLocaleString('es-ES')}`);
  doc.moveDown(1);
  const groups = groupedBoardRows(rows);
  if (!groups.length) { doc.fontSize(11).fillColor('#52677b').text('No hay pedidos pagados pendientes de gestión.'); return; }
  groups.forEach((group, groupIndex) => {
    ensureSpace(65);
    const supplierRows = group.items;
    const orderCount = new Set(supplierRows.map(x => x.orderId)).size;
    const cost = money(supplierRows.reduce((sum, x) => sum + Number(x.actualCost || x.sourceCost || 0), 0));
    doc.roundedRect(margin, doc.y, doc.page.width - margin * 2, 27, 5).fill('#eaf4df');
    doc.fillColor('#397820').font('Helvetica-Bold').fontSize(12).text(group.supplier, margin + 10, doc.y + 8);
    doc.fillColor('#52677b').font('Helvetica').fontSize(8).text(`${orderCount} pedido(s) · Coste proveedor: ${cost.toFixed(2)} €`, margin + 10, doc.y + 23);
    doc.y += 38;
    supplierRows.forEach(row => {
      ensureSpace(82);
      const itemText = (row.items || []).map(item => `${item.title || item.ref || 'Producto'} × ${Number(item.qty || 1)}${item.totalWeightKg ? ` · ${Number(item.totalWeightKg).toFixed(3)} kg` : ''}`).join(' | ') || 'Sin líneas de producto';
      doc.fillColor('#10233f').font('Helvetica-Bold').fontSize(10).text(`${row.orderNumber || row.orderId} · ${row.customer || 'Cliente'}`);
      doc.font('Helvetica').fontSize(8).fillColor('#405568');
      text(`Estado: ${row.status || 'pendiente'} · Paso proveedor: ${row.taskStatus || 'pendiente_compra'} · Plazo: ${row.deliveryEstimate?.label || 'Pendiente de calcular'}`);
      text(`Productos: ${itemText}`);
      text(`Total pedido: ${money(row.total).toFixed(2)} € · RutaFV: ${money(row.delivery).toFixed(2)} €${row.purchaseReference ? ` · Ref. compra: ${row.purchaseReference}` : ''}`);
      if (row.notes) text(`Nota: ${row.notes}`);
      doc.moveDown(.65);
    });
    if (groupIndex < groups.length - 1) doc.moveDown(.3);
  });
}
function registerProcurementRoutes(app, deps) {
  const { read, save, ordersManager, transitionOrder, ensureLedgerForOrder, createRutaFVDelivery, paidOrderStatus } = deps;
  app.get('/api/admin/procurement-board', ordersManager, (req, res) => {
    const d = ensureData(read());
    const orders = (d.orders || []).filter(o => (paidOrderStatus(o.status) || !!o.paidAt) && BOARD_STATUSES.has(String(o.status || ''))).map(o => orderPublic(o, d));
    res.json({ orders, pending: orders.length, statuses: [...BOARD_STATUSES] });
  });
  app.get('/api/admin/procurement-board/pdf', ordersManager, (req, res) => {
    const d = ensureData(read());
    const rows = boardRows(d, req.query || {});
    const filename = `fvmarket-tablero-proveedores-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.statusCode = 200;
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: 'FVMarket · Tablero de pedidos', Author: 'FVMarket' } });
    doc.pipe(res);
    drawBoardPdf(doc, rows);
    doc.end();
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
        comprada: ['pagado', 'incidencia'],
        mercancia_recogida: ['en_compra_proveedor', 'incidencia'],
        enviar_a_rutafv: ['mercancia_recogida', 'listo_para_rutafv', 'incidencia'],
        incidencia: ['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv', 'en_reparto']
      };
      if (!allowed[action]?.includes(String(order.status))) return res.status(409).json({ error: `La acción «${config.label}» no corresponde al estado actual del pedido.` });
      if (action === 'incidencia' && !String(req.body?.note || '').trim()) return res.status(400).json({ error: 'La incidencia debe incluir una nota.' });
      const tasks = (d.procurementTasks || []).filter(x => x.orderId === order.id);
      const task = req.body?.taskId ? tasks.find(x => x.id === req.body.taskId) : null;
      if (req.body?.taskId && !task) return res.status(404).json({ error: 'Compra de proveedor no encontrada' });
      if (action === 'comprada' && !tasks.length) return res.status(409).json({ error: 'El pedido no tiene líneas de proveedor para marcar como compradas.' });
      const allPurchased = tasks.length > 0 && tasks.every(t => ['comprada', 'recogida', 'recibida', 'lista'].includes(String(t.status || '')));
      const allCollected = tasks.length > 0 && tasks.every(t => ['recogida', 'recibida', 'lista'].includes(String(t.status || '')));
      if (action === 'comprada' && allPurchased) return res.status(409).json({ error: 'La acción «Comprado» ya está marcada.' });
      if (action === 'mercancia_recogida' && allCollected) return res.status(409).json({ error: 'La acción «Mercancía recogida» ya está marcada.' });
      if (action === 'enviar_a_rutafv' && order.transport?.deliveryId) return res.json(orderPublic(order, d));
      const before = order.status;
      if (config.taskStatus) {
        for (const t of task ? [task] : tasks) { t.status = config.taskStatus; t.purchaseReference = String(req.body?.purchaseReference || t.purchaseReference || '').slice(0, 120); t.actualCost = req.body?.actualCost == null ? Number(t.actualCost || t.sourceCost || 0) : money(req.body.actualCost); t.updatedAt = now(); }
      }
      const readyNow = tasks.length > 0 && tasks.every(t => ['recogida', 'recibida', 'lista'].includes(String(t.status || '')));
      order.procurement = { ...(order.procurement || {}), taskIds: tasks.map(x => x.id), allReady: readyNow, sourceCost: money(tasks.reduce((sum, x) => sum + Number(x.actualCost || x.sourceCost || 0), 0)) };
      if (config.status && action !== 'enviar_a_rutafv') {
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
      if (action === 'enviar_a_rutafv') {
        if (!allCollected) return res.status(409).json({ error: 'Marca primero como recogida la mercancía de todos los proveedores.' });
        for (const item of order.items || []) item.procurement = { ...(item.procurement || {}), status: 'ready' };
        order.fulfillment = { ...(order.fulfillment || {}), readyForRutaFV: true, readyAt: now(), status: 'listo_para_rutafv' };
      }
      if (action === 'enviar_a_rutafv' && createRutaFVDelivery) {
        try { await createRutaFVDelivery(d, order); } catch (e) { throw new Error('RutaFV no aceptó el reparto: ' + String(e.message || e)); }
      }
      order.procurement = { ...(order.procurement || {}), taskIds: tasks.map(x => x.id), allReady: tasks.length > 0 && tasks.every(x => ['comprada', 'recogida', 'recibida', 'lista'].includes(String(x.status || ''))), sourceCost: money(tasks.reduce((sum, x) => sum + Number(x.actualCost || x.sourceCost || 0), 0)) };
      addAction(d, order, action, req.user, { fromStatus: before, taskId: task?.id || '', purchaseReference: String(req.body?.purchaseReference || ''), note: String(req.body?.note || '') });
      if (action === 'incidencia') addNotification(d, order, 'procurement_incident', 'Incidencia en aprovisionamiento', `Se ha registrado una incidencia en el pedido ${order.number || order.id}.`);
      ensureLedgerForOrder(d, order); save(d); res.json(orderPublic(order, d));
    } catch (e) { res.status(409).json({ error: String(e.message || e) }); }
  });
}
module.exports = { ensureData, registerProcurementRoutes, filterPurchases };
