'use strict';
const money = value => Math.round((Number(value) || 0) * 100) / 100;
function benefits(user = {}) {
  const customer = user.role === 'customer';
  const discountPct = customer ? Math.max(0, Math.min(90, money(user.discountPct))) : 0;
  const freeTransport = customer && user.freeTransport === true;
  return { discountPct, freeTransport, preferred: discountPct > 0 || freeTransport, customerLabel: discountPct > 0 || freeTransport ? 'Cliente preferente' : 'Cliente' };
}
function transportBenefit(quote = {}, user = {}) {
  const regularAmount = money(Math.max(0, Number(quote.amount ?? quote.total ?? 0)));
  const freeTransport = benefits(user).freeTransport;
  return { regularAmount, customerAmount: freeTransport ? 0 : regularAmount, freeTransport, discountAmount: freeTransport ? regularAmount : 0 };
}
function priceSummary(document = {}) {
  const regularSubtotal = money((document.items || []).reduce((sum, item) => sum + Number(item.regularUnitPrice ?? item.unitPrice ?? 0) * Number(item.qty || 1), 0));
  const subtotal = money(document.subtotal ?? (document.items || []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
  return { regularSubtotal, productDiscount: money(Math.max(0, regularSubtotal - subtotal)), subtotal, regularDelivery: money(document.regularDelivery ?? document.transport?.regularAmount ?? document.delivery), delivery: money(document.delivery), freeTransport: document.freeTransport === true, total: money(document.total) };
}
function pendingPurchase(order = {}) {
  if (!order.paidAt && order.paymentState !== 'paid' && order.status !== 'pagado') return false;
  if (!['pagado', 'incidencia'].includes(order.status)) return false;
  if (order.transport?.deliveryId || order.fulfillment?.readyForRutaFV) return false;
  if ((order.procurementActions || []).some(action => ['comprada', 'mercancia_recogida', 'enviar_a_rutafv'].includes(action.action))) return false;
  return !(order.procurementTasks || []).some(task => ['comprada', 'recogida', 'recibida', 'lista'].includes(task.status));
}
module.exports = { benefits, transportBenefit, priceSummary, pendingPurchase };
