'use strict';

// A product needs an explicit, positive weight before it can be saved or published.
function parseRequiredWeightKg(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  const raw = String(value).trim().replace(',', '.');
  if (!raw) return 0;
  const weight = Number(raw);
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  return Math.round(Math.min(weight, 100000) * 1000) / 1000;
}

module.exports = { parseRequiredWeightKg };
