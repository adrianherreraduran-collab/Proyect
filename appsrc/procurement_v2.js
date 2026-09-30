// FVM_PROCUREMENT_CONTROL_V2
// Admin-only procurement board, payment notifications and supplier accounting filters.

const {deliveryEstimate}=require('./supplier_delivery_v1');
const PDFDocument=require('pdfkit');
const {purchaseItems}=require('./purchase_details_v1');

const ACTIONS = {
  comprada: { label: 'Comprado', status: 'en_compra_proveedor', taskStatus: 'comprada' },
  mercancia_recogida: { label: 'Mercancía recogida', status: 'mercancia_recogida', taskStatus: 'recogida' },
  enviar_a_rutafv: { label: 'Enviar a RutaFV', status: 'listo_para_rutafv' },
  incidencia: { label: 'Incidencia', status: 'incidencia' }
};

// El tablero conserva visibles los pedidos después de enviarlos a RutaFV para poder
// consultar su seguimiento y recibir el estado Entregado. El PDF de compras usa
// PURCHASE_BOARD_STATUSES y no incluye repartos ya enviados.
const BOARD_STATUSES = new Set([
  'pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv',
  'enviado_a_rutafv', 'en_reparto', 'entregado', 'incidencia',
]);
const PURCHASE_BOARD_STATUSES = new Set([
  'pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'incidencia',
]);

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
  return { ...order, purchaseItems:purchaseItems(order,d), procurementTasks: tasks, procurementActions: actions, supplierSummary: tasks.map(t => ({ id: t.supplierId || t.supplierKey, name: t.supplierName, status: t.status, sourceCost: money(t.sourceCost), actualCost: money(t.actualCost), island: t.supplierIsland, address: t.supplierAddress, deliveryEstimate: t.deliveryEstimate, items: t.items || [] })) };
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
  return filterPurchases(d, query).filter(row => PURCHASE_BOARD_STATUSES.has(String(row.status || '')));
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

function pdfDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function pdfClean(value, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}

function drawPdfCheckbox(doc, x, y, size = 9) {
  doc.save();
  doc.lineWidth(0.8).strokeColor('#728397').roundedRect(x, y, size, size, 2).stroke();
  doc.restore();
}

function drawPdfFooter(doc, pageNumber) {
  const margin = 40;
  const y = doc.page.height - 63;
  doc.save();
  doc.moveTo(margin, y - 7).lineTo(doc.page.width - margin, y - 7).lineWidth(0.5).strokeColor('#d9e2ea').stroke();
  doc.font('Helvetica').fontSize(7).fillColor('#718096')
    .text(`FVMarket - Hoja de compras interna - Pagina ${pageNumber}`, margin, y, { width: doc.page.width - margin * 2, align: 'center', lineBreak: false });
  doc.restore();
}

function drawBoardPdf(doc, rows, exportedAt = new Date()) {
  const margin = 40;
  const contentWidth = doc.page.width - margin * 2;
  const bottom = () => doc.page.height - 70;
  let pageNumber = 1;

  const addPage = () => {
    drawPdfFooter(doc, pageNumber);
    doc.addPage();
    pageNumber += 1;
    doc.y = margin;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0c3358').text('FVMarket - Tablero de compras', margin, margin, { width: contentWidth });
    doc.moveTo(margin, margin + 15).lineTo(doc.page.width - margin, margin + 15).lineWidth(0.5).strokeColor('#d9e2ea').stroke();
    doc.y = margin + 27;
  };
  const ensureSpace = needed => { if (doc.y + needed > bottom()) addPage(); };
  const drawText = (value, x, y, width, options = {}) => {
    const text = pdfClean(value);
    if (!text) return 0;
    const font = options.font || 'Helvetica';
    const fontSize = options.fontSize || 8.5;
    const lineGap = options.lineGap == null ? 1.5 : options.lineGap;
    doc.font(font).fontSize(fontSize).fillColor(options.color || '#405568');
    const height = doc.heightOfString(text, { width, lineGap });
    doc.text(text, x, y, { width, lineGap });
    return height;
  };

  doc.roundedRect(margin, margin, contentWidth, 72, 8).fill('#0c3358');
  doc.font('Helvetica-Bold').fontSize(19).fillColor('#ffffff').text('FVMarket', margin + 16, margin + 13);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#d8f1b8').text('TABLERO DE COMPRAS', margin + 16, margin + 38);
  doc.font('Helvetica').fontSize(8).fillColor('#e9f3fb').text('Pedidos pagados organizados por proveedor', margin + 16, margin + 55);
  doc.font('Helvetica').fontSize(8).fillColor('#e9f3fb').text(`Exportado: ${pdfDate(exportedAt)}`, margin + 300, margin + 19, { width: contentWidth - 316, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor('#e9f3fb').text('Marque cada casilla al completar la compra', margin + 300, margin + 34, { width: contentWidth - 316, align: 'right' });
  doc.y = margin + 92;

  const groups = groupedBoardRows(rows);
  const allOrderIds = new Set(rows.map(row => row.orderId));
  const totalLines = rows.reduce((sum, row) => sum + (row.items || []).length, 0);
  const summaryWidth = (contentWidth - 16) / 3;
  const summaryY = doc.y;
  [['PROVEEDORES', groups.length], ['PEDIDOS', allOrderIds.size], ['LINEAS A COMPRAR', totalLines]].forEach(([label, value], index) => {
    const x = margin + index * (summaryWidth + 8);
    doc.roundedRect(x, summaryY, summaryWidth, 39, 6).fillAndStroke('#f4f8fb', '#dbe6ee');
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0c3358').text(String(value), x + 10, summaryY + 7, { width: summaryWidth - 20, lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor('#65788a').text(label, x + 10, summaryY + 25, { width: summaryWidth - 20, lineBreak: false });
  });
  doc.y = summaryY + 53;

  if (!groups.length) {
    doc.roundedRect(margin, doc.y, contentWidth, 54, 7).fillAndStroke('#f8fafc', '#dbe6ee');
    drawText('No hay pedidos pagados pendientes de gestion.', margin + 14, doc.y + 19, contentWidth - 28, { fontSize: 10, color: '#52677b' });
    drawPdfFooter(doc, pageNumber);
    return;
  }

  groups.forEach((group, groupIndex) => {
    const supplierRows = group.items;
    const firstRow = supplierRows[0] || {};
    const firstItemCount = Array.isArray(firstRow.items) ? firstRow.items.length : 0;
    const firstOrderHeight = 59 + Math.max(firstItemCount, 1) * 24 + (firstRow.notes ? 22 : 0);
    ensureSpace(Math.min(74 + firstOrderHeight, 260));
    const orderCount = new Set(supplierRows.map(x => x.orderId)).size;
    const lineCount = supplierRows.reduce((sum, row) => sum + (row.items || []).length, 0);
    const supplierY = doc.y;
    doc.roundedRect(margin, supplierY, contentWidth, 42, 6).fill('#e8f3df');
    drawPdfCheckbox(doc, margin + 11, supplierY + 10, 12);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#2f6b20').text(pdfClean(group.supplier, 'Proveedor pendiente'), margin + 31, supplierY + 8, { width: contentWidth - 42 });
    doc.font('Helvetica').fontSize(8).fillColor('#52677b').text(`${orderCount} pedido(s) - ${lineCount} linea(s) - Casilla: proveedor completado`, margin + 31, supplierY + 25, { width: contentWidth - 42 });
    doc.y = supplierY + 54;

    supplierRows.forEach(row => {
      const items = Array.isArray(row.items) ? row.items : [];
      const estimatedHeight = 59 + Math.max(items.length, 1) * 24 + (row.notes ? 22 : 0);
      ensureSpace(Math.min(estimatedHeight, 150));
      const orderY = doc.y;
      drawPdfCheckbox(doc, margin + 4, orderY + 2, 10);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#10233f').text(`${pdfClean(row.orderNumber || row.orderId)} - ${pdfClean(row.customer, 'Cliente')}`, margin + 21, orderY, { width: contentWidth - 25 });
      doc.font('Helvetica').fontSize(7.8).fillColor('#52677b').text(`Estado: ${pdfClean(row.status, 'pendiente')} - Paso: ${pdfClean(row.taskStatus, 'pendiente_compra')} - Plazo: ${pdfClean(row.deliveryEstimate?.label, 'Pendiente de calcular')}`, margin + 21, orderY + 16, { width: contentWidth - 25 });
      doc.y = orderY + 31;

      if (!items.length) {
        drawPdfCheckbox(doc, margin + 14, doc.y + 2, 9);
        drawText('Sin lineas de producto', margin + 30, doc.y, contentWidth - 30, { fontSize: 8, color: '#718096' });
        doc.y += 17;
      } else {
        items.forEach(item => {
          const title = pdfClean(item.title || item.ref || 'Producto');
          const qty = Number(item.qty || 1);
          const ref = pdfClean(item.sourceRef);
          const weight = Number(item.totalWeightKg || 0);
          const productText = `${title} - Cantidad a comprar: ${qty} ud.`;
          const details = [
            `Proveedor: ${pdfClean(item.provider || row.supplierName)}`,
            ref ? `Referencia original del proveedor: ${ref}` : 'Referencia original del proveedor: no guardada',
            item.ref ? `Referencia FVMarket: ${pdfClean(item.ref)}` : '',
            weight > 0 ? `Peso total: ${weight.toFixed(3)} kg` : '',
            `Coste de origen: ${money(item.sourcePrice).toFixed(2)} EUR/ud. - Total de compra: ${money(Number(item.sourcePrice) * qty).toFixed(2)} EUR`
          ].filter(Boolean).join(' - ');
          const description = `Descripcion: ${pdfClean(item.description, 'No guardada') || 'No guardada'}`;
          const width = contentWidth - 42;
          doc.font('Helvetica-Bold').fontSize(10);
          const titleHeight = doc.heightOfString(productText, {width, lineGap:1.5});
          doc.font('Helvetica').fontSize(8.5);
          const detailHeight = doc.heightOfString(details, {width, lineGap:1.5});
          ensureSpace(Math.min(titleHeight + detailHeight + 35, bottom() - margin - 27));
          const lineY = doc.y;
          drawPdfCheckbox(doc, margin + 14, lineY + 2, 9);
          drawText(productText, margin + 30, lineY, width, {font:'Helvetica-Bold',fontSize:10,color:'#10233f'});
          doc.y = lineY + titleHeight + 4;
          const detailY = doc.y;
          drawText(details, margin + 30, detailY, width, {fontSize:8.5,color:'#52677b'});
          doc.y = detailY + detailHeight + 4;
          // Divide descripciones largas entre páginas conservando los márgenes
          // y el pie de página; nunca trunca la información del producto.
          const words = description.split(' ');
          while (words.length) {
            doc.font('Helvetica').fontSize(8.5);
            const available = bottom() - doc.y - 8;
            if (available < 18) { addPage(); continue; }
            let take = 1;
            while (take < words.length && doc.heightOfString(words.slice(0,take+1).join(' '), {width,lineGap:1.5}) <= available) take++;
            const text = words.splice(0,take).join(' ');
            const y = doc.y;
            const height = drawText(text, margin + 30, y, width, {fontSize:8.5,color:'#405568'});
            doc.y = y + height + 4;
            if (words.length) addPage();
          }
          doc.y += 7;
        });
      }
      const totals = `Total pedido: ${money(row.total).toFixed(2)} EUR - RutaFV: ${money(row.delivery).toFixed(2)} EUR${row.purchaseReference ? ` - Ref. compra: ${pdfClean(row.purchaseReference)}` : ''}`;
      ensureSpace(44);
      drawText(totals, margin + 21, doc.y, contentWidth - 25, { fontSize: 7.7, color: '#52677b' });
      doc.y += 14;
      if (row.notes) {
        drawText(`Nota: ${pdfClean(row.notes)}`, margin + 21, doc.y, contentWidth - 25, { fontSize: 7.7, color: '#76500e' });
        doc.y += 14;
      }
      doc.moveTo(margin + 4, doc.y + 4).lineTo(doc.page.width - margin - 4, doc.y + 4).lineWidth(0.4).strokeColor('#dce5eb').stroke();
      doc.y += 13;
    });
    if (groupIndex < groups.length - 1) doc.y += 3;
  });
  drawPdfFooter(doc, pageNumber);
}
function registerProcurementRoutes(app, deps) {
  const { read, save, ordersManager, transitionOrder, ensureLedgerForOrder, createRutaFVDelivery, paidOrderStatus, isStoredDeliveredOrder = () => false, customerOrderState = order => ({key:order.status}) } = deps;
  app.get('/api/admin/procurement-board', ordersManager, (req, res) => {
    const d = ensureData(read());
    const orders = (d.orders || []).filter(o => (paidOrderStatus(o.status) || !!o.paidAt) && BOARD_STATUSES.has(String(o.status || ''))).map(o => ({...orderPublic(o,d),storedDelivered:isStoredDeliveredOrder(o),customerStatus:customerOrderState(o).key}));
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
    const pendingReviews=[...(d.reviews||[]),...(d.orderReviews||[])].filter(review=>review.status==='pending').length;const reviewNotice=req.user?.role==='admin'&&pendingReviews?[{id:'pending_reviews',type:'pending_reviews',title:pendingReviews+' opiniones pendientes de revisión',message:'Abre Opiniones para aprobar o rechazar los comentarios antes de publicarlos.',read:false,createdAt:new Date().toISOString()}]:[];res.json([...reviewNotice,...(d.notifications || [])].slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200));
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
module.exports = { ensureData, registerProcurementRoutes, filterPurchases, groupedBoardRows, drawBoardPdf };
