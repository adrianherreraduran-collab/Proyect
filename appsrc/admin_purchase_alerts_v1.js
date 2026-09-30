'use strict';
const { pendingPurchase } = require('./customer_benefits_v1');
const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function adminRecipient(data, configured = '') {
  const valid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && !/\.(local|example|invalid)$/i.test(value);
  const candidates = [configured, data.settings?.adminAlertEmail, ...(data.users || []).filter(user => user.role === 'admin' && user.active !== false).map(user => user.email)];
  return candidates.map(value => String(value || '').trim().toLowerCase()).find(valid) || '';
}
function createAlertWorker({ read, save, send, configuredRecipient = '', publicUrl = '' }) {
  let running = false;
  async function scan() {
    if (running) return; running = true;
    try {
      const data = read(), recipient = adminRecipient(data, configuredRecipient);
      if (!recipient) return;
      for (const order of (data.orders || []).filter(pendingPurchase)) {
        const key = 'purchase_pending:' + order.id;
        const existing = order.adminPurchaseAlert || {};
        if (existing.sentAt || Date.now() < Number(existing.retryAfter || 0)) continue;
        try {
          const result = await send({ to: recipient, idempotencyKey: key, subject: 'FVMarket · Iniciar compra del pedido ' + (order.number || order.id), html: `<div style="font-family:Arial;color:#06345f"><h2>Pedido pagado pendiente de compra</h2><p>El pedido <b>${esc(order.number || order.id)}</b> todavía no ha comenzado la compra al proveedor.</p><p>${(order.items || []).map(item => esc(item.title || item.ref) + ' × ' + Number(item.qty || 1)).join('<br>')}</p><p>Importe pagado: ${Number(order.total || 0).toFixed(2)} €</p><p><a href="${esc(publicUrl)}/admin">Abrir el tablero de FVMarket</a></p></div>`, text: 'Pedido pagado ' + order.number + ' pendiente de iniciar la compra al proveedor. ' + publicUrl + '/admin' });
          const latest = read(), current = latest.orders.find(value => value.id === order.id); if (!current) continue;
          current.adminPurchaseAlert = { recipient, attemptedAt: new Date().toISOString(), ...(result.sent ? { sentAt: new Date().toISOString(), resendId: result.id || '' } : { reason: result.reason || 'not_sent', retryAfter: Date.now() + 30 * 60 * 1000 }) }; save(latest);
        } catch (error) {
          const latest = read(), current = latest.orders.find(value => value.id === order.id);
          if (current) { current.adminPurchaseAlert = { recipient, attemptedAt: new Date().toISOString(), error: String(error.message || error).slice(0, 200), retryAfter: Date.now() + 30 * 60 * 1000 }; save(latest); }
        }
      }
    } finally { running = false; }
  }
  return { scan };
}
module.exports = { adminRecipient, createAlertWorker };
