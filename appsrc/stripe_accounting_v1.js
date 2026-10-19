'use strict';
const operations = require('./operations_accounting_v1');
const { money } = require('./commercial_rules_v1');
function actualFee(order, charge) {
  const transaction = charge?.balance_transaction;
  const intent = typeof charge?.payment_intent === 'string' ? charge.payment_intent : charge?.payment_intent?.id;
  if (!charge?.paid || !charge?.captured || intent !== order.paymentIntentId || Number(charge.amount) !== Math.round(Number(order.total) * 100)) throw Error('charge_mismatch');
  if (!transaction || typeof transaction !== 'object') return null;
  if (charge.currency !== 'eur' || transaction.currency !== 'eur') throw Error('currency_mismatch');
  if (![transaction.amount, transaction.fee, transaction.net].every(Number.isInteger) || transaction.fee < 0 || transaction.amount !== charge.amount || transaction.amount - transaction.fee !== transaction.net || !transaction.id) throw Error('balance_mismatch');
  return { status: 'confirmed', chargeId: charge.id, balanceTransactionId: transaction.id, gross: money(transaction.amount / 100), fee: money(transaction.fee / 100), net: money(transaction.net / 100), currency: 'EUR', availableOn: Number(transaction.available_on || 0), recordedAt: new Date().toISOString() };
}
function createReconciler({ stripe, read, save }) {
  const inflight = new Map();
  const retryableStatuses = new Set(['awaiting_balance_transaction', 'temporarily_unavailable']);
  async function run(orderId, chargeId = '') {
    const initial = read().orders.find(x => x.id === orderId);
    if (!initial?.paidAt || !initial.paymentIntentId || !stripe?.charges) return { confirmed: false, reason: 'not_ready' };
    if (initial.stripeAccounting?.status === 'confirmed') return { confirmed: true, accounting: initial.stripeAccounting };
    try {
      const charges = chargeId
        ? [await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] })]
        : (await stripe.charges.list({ payment_intent: initial.paymentIntentId, limit: 10, expand: ['data.balance_transaction'] })).data;
      const charge = charges.find(x => x.paid && x.captured && Number(x.amount) === Math.round(initial.total * 100));
      const result = charge ? actualFee(initial, charge) : null;
      const d = read(), order = d.orders.find(x => x.id === orderId);
      if (!order || order.paymentIntentId !== initial.paymentIntentId || order.total !== initial.total) return { confirmed: false, reason: 'order_changed' };
      if (!result) {
        order.stripeAccounting = { status: 'awaiting_balance_transaction', lastAttemptAt: new Date().toISOString() }; save(d);
        return { confirmed: false, reason: 'awaiting_balance_transaction' };
      }
      order.stripeAccounting = result;
      operations.ensureLedgerForOrder(d, order); save(d);
      return { confirmed: true, accounting: result };
    } catch (error) {
      const reason = error.type === 'StripePermissionError' || error.statusCode === 403 ? 'permission_required' : ['charge_mismatch', 'currency_mismatch', 'balance_mismatch'].includes(error.message) ? error.message : 'temporarily_unavailable';
      const d = read(), order = d.orders.find(x => x.id === orderId);
      if (order && order.stripeAccounting?.status !== 'confirmed') { order.stripeAccounting = { status: reason, lastAttemptAt: new Date().toISOString() }; save(d); }
      return { confirmed: false, reason };
    }
  }
  function reconcile(orderId, chargeId = '') {
    if (inflight.has(orderId)) return inflight.get(orderId);
    const pending = run(orderId, chargeId).finally(() => inflight.delete(orderId)); inflight.set(orderId, pending); return pending;
  }
  async function sweep(limit = 20, { retryTransientOnly = false } = {}) {
    const ids = read().orders.filter(x => x.paidAt && x.paymentIntentId && x.stripeAccounting?.status !== 'confirmed' && (!retryTransientOnly || retryableStatuses.has(x.stripeAccounting?.status))).slice(-limit).map(x => x.id);
    const results = []; for (const id of ids) results.push({ orderId: id, ...await reconcile(id) }); return results;
  }
  return { reconcile, sweep };
}
module.exports = { createReconciler, actualFee };
