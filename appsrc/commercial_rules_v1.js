'use strict';
const money = value => Math.round((Number(value) || 0) * 100) / 100;
const text = value => String(value || '').trim();
const fold = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const list = value => (Array.isArray(value) ? value : text(value).split(',')).map(text).filter(Boolean).slice(0, 100);
function finite(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
function settings(value = {}) {
  const s = value.commercialRules || value;
  return {
    fee: { percent: Math.max(0, Math.min(20, finite(s.fee?.percent, 1.5))), fixed: Math.max(0, Math.min(100, finite(s.fee?.fixed, 0.25))) },
    shipping: { enabled: s.shipping?.enabled === true, rules: (Array.isArray(s.shipping?.rules) ? s.shipping.rules : []).slice(0, 20).map((raw, i) => { const r = raw && typeof raw === 'object' ? raw : {}; return ({
      id: text(r.id || 'zone-' + (i + 1)).slice(0, 60), name: text(r.name || 'Zona ' + (i + 1)).slice(0, 100),
      minSubtotal: money(Math.max(0, finite(r.minSubtotal, 0))), maxWeightKg: Math.max(0, finite(r.maxWeightKg, 0)),
      maxShippingCost: r.maxShippingCost === '' || r.maxShippingCost == null ? null : money(Math.max(0, finite(r.maxShippingCost, 0))),
      cities: list(r.cities), postalCodes: list(r.postalCodes), excludedRefs: list(r.excludedRefs),
      discountThreshold: money(Math.max(0, finite(r.discountThreshold, 0))), discountAmount: money(Math.max(0, finite(r.discountAmount, 0)))
    }); }) }
  };
}
function validateSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Configuración comercial no válida.');
  if (value.fee) for (const [key, max] of [['percent', 20], ['fixed', 100]]) {
    if (value.fee[key] !== undefined && (!Number.isFinite(Number(value.fee[key])) || Number(value.fee[key]) < 0 || Number(value.fee[key]) > max)) throw Error('La tarifa estimada de Stripe no es válida.');
  }
  if (value.shipping?.enabled !== undefined && typeof value.shipping.enabled !== 'boolean') throw Error('Indica si la promoción está activa.');
  if (value.shipping?.rules !== undefined && (!Array.isArray(value.shipping.rules) || value.shipping.rules.length > 20)) throw Error('Se admiten hasta 20 zonas.');
  const normalized = settings(value), ids = new Set();
  for (const [i, rule] of normalized.shipping.rules.entries()) {
    const raw = value.shipping.rules[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Zona no válida.');
    if (ids.has(rule.id)) throw Error('Cada zona debe tener un identificador distinto.'); ids.add(rule.id);
    for (const field of ['minSubtotal', 'maxWeightKg', 'discountThreshold', 'discountAmount', 'maxShippingCost']) {
      if (raw[field] !== undefined && raw[field] !== null && raw[field] !== '' && (!Number.isFinite(Number(raw[field])) || Number(raw[field]) < 0)) throw Error('Los importes y el peso de la promoción deben ser positivos.');
    }
    if (normalized.shipping.enabled && (rule.minSubtotal <= 0 || rule.maxWeightKg <= 0)) throw Error('Cada zona activa necesita una compra mínima y un peso máximo mayores que cero.');
    if (rule.postalCodes.some(code => !/^356\d{2}$/.test(code))) throw Error('Introduce códigos postales de Fuerteventura de cinco cifras.');
    if (rule.discountThreshold > 0 && (rule.discountThreshold >= rule.minSubtotal || rule.discountAmount <= 0)) throw Error('La bonificación parcial necesita un mínimo inferior al envío gratis y un importe positivo.');
  }
  if (normalized.shipping.enabled && !normalized.shipping.rules.length) throw Error('Añade una zona antes de activar transporte gratis.');
  return normalized;
}
function estimateFee(amount, config = {}) {
  const f = settings(config).fee;
  return Number(amount) > 0 ? money(Number(amount) * f.percent / 100 + f.fixed) : 0;
}
function priceForNet(target, config = {}) {
  const amount = Number(target), f = settings(config).fee;
  if (!Number.isFinite(amount) || amount <= 0) throw Error('Introduce un importe neto positivo.');
  let cents = Math.ceil((amount + f.fixed) / (1 - f.percent / 100) * 100 - 1e-8);
  while (money(cents / 100 - estimateFee(cents / 100, config)) < money(amount)) cents++;
  return { targetNet: money(amount), price: cents / 100, estimatedFee: estimateFee(cents / 100, config), estimatedNet: money(cents / 100 - estimateFee(cents / 100, config)), fee: f, estimated: true };
}
function shipping(config = {}, items = [], user = {}, destination = {}, cost = null) {
  const options = settings(config).shipping, subtotal = money(items.reduce((sum, row) => sum + Number(row.unitPrice || 0) * Number(row.qty || 0), 0));
  const weightKg = Math.round(items.reduce((sum, row) => sum + Number(row.weightKg || 0) * Number(row.qty || 0), 0) * 1000) / 1000;
  const knownCost = cost !== null && Number.isFinite(Number(cost)), regularAmount = knownCost ? money(Math.max(0, Number(cost))) : null;
  const base = { enabled: options.enabled, subtotal, weightKg, freeTransport: false, discountAmount: 0, rule: null, remaining: null, eligible: false, reason: 'disabled', regularAmount };
  if (user.role === 'customer' && user.freeTransport === true) return { ...base, enabled: true, eligible: true, freeTransport: true, discountAmount: regularAmount || 0, remaining: 0, reason: 'customer_benefit' };
  if (!options.enabled || !items.length) return base;
  if (!text(destination.city) || !/^356\d{2}$/.test(text(destination.postalCode))) return { ...base, reason: 'destination_required' };
  const zones = options.rules.filter(r => (!r.cities.length || r.cities.some(city => fold(city) === fold(destination.city))) && (!r.postalCodes.length || r.postalCodes.includes(text(destination.postalCode))));
  if (!zones.length) return { ...base, reason: 'outside_zone' };
  const candidates = zones.map(rule => {
    let reason = items.some(row => !(Number(row.weightKg) > 0)) ? 'weight_unknown' : weightKg > rule.maxWeightKg ? 'weight_limit' : items.some(row => rule.excludedRefs.some(ref => fold(ref) === fold(row.ref))) ? 'excluded_product' : '';
    if (!reason && rule.maxShippingCost !== null && knownCost && regularAmount > rule.maxShippingCost) reason = 'shipping_cost_limit';
    const remaining = money(Math.max(0, rule.minSubtotal - subtotal));
    const discountReached = rule.discountThreshold > 0 && subtotal >= rule.discountThreshold;
    const ready = !reason && (remaining === 0 || discountReached);
    const confirmed = ready && knownCost;
    const discountAmount = confirmed ? remaining === 0 ? regularAmount : Math.min(regularAmount, rule.discountAmount) : 0;
    return { ...base, rule, remaining, eligible: confirmed, freeTransport: confirmed && discountAmount === regularAmount, discountAmount, reason: reason || (remaining > 0 && !discountReached ? 'minimum_not_reached' : knownCost ? 'eligible' : 'quote_required') };
  });
  return candidates.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.discountAmount - a.discountAmount || Number(['minimum_not_reached', 'quote_required', 'eligible'].includes(b.reason)) - Number(['minimum_not_reached', 'quote_required', 'eligible'].includes(a.reason)) || a.remaining - b.remaining)[0];
}
function transportBenefit(quote = {}, user = {}, config = {}, items = [], destination = {}) {
  const regularAmount = money(Math.max(0, Number(quote.amount ?? quote.total ?? 0)));
  const promotion = shipping(config, items, user, destination, regularAmount);
  return { regularAmount, customerAmount: money(regularAmount - promotion.discountAmount), freeTransport: promotion.freeTransport, discountAmount: promotion.discountAmount, shippingPromotion: promotion };
}
function orderMargin(order = {}, config = {}, tasks = []) {
  const items = order.items || [], costKnown = items.length > 0 && items.every(row => Number(row.procurement?.sourcePrice) > 0);
  const supplierEstimate = money(items.reduce((sum, row) => sum + Number(row.procurement?.sourcePrice || 0) * Number(row.qty || 0), 0));
  const actualTasks = tasks.filter(row => row.orderId === order.id);
  const supplierCost = actualTasks.length ? money(actualTasks.reduce((sum, row) => sum + Number(row.actualCost ?? row.sourceCost ?? 0), 0)) : supplierEstimate;
  const confirmed = order.stripeAccounting?.status === 'confirmed';
  const fee = confirmed ? money(order.stripeAccounting.fee) : money(order.paymentCostEstimate?.amount ?? estimateFee(order.total, config));
  const transportActual = order.transport?.actualCost;
  const transportCost = money(transportActual ?? order.regularDelivery ?? order.transport?.regularAmount ?? order.transport?.amount ?? order.delivery);
  const refunded = money((order.refunds || []).filter(x => !['failed', 'canceled'].includes(x.status)).reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const netReceived = money(Number(order.total || 0) - fee - refunded);
  return { orderId: order.id, orderNumber: order.number, gross: money(order.total), fee, feeConfirmed: confirmed, netReceived, refunded, supplierCost, costKnown, transportCost, transportEstimated: transportActual == null, margin: money(netReceived - supplierCost - transportCost), estimated: true, warning: !costKnown ? 'cost_missing' : money(netReceived - supplierCost - transportCost) < 0 ? 'below_cost' : '' };
}
module.exports = { settings, validateSettings, estimateFee, priceForNet, shipping, transportBenefit, orderMargin, money };
