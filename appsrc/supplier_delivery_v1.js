'use strict';

// Deterministic supplier lead-time rule.  The estimate is deliberately kept
// separate from RutaFV transport: it describes the time FVMarket needs to
// obtain the product from its supplier after payment.

const LOCAL_ISLAND = 'Fuerteventura';
const LOCAL_MIN_HOURS = 24;
const LOCAL_MAX_HOURS = 72;
// El cliente solo ve un plazo sencillo: los proveedores de otra isla se
// muestran como aproximadamente 7 días. Conservamos min/max para poder
// calcular una fecha concreta y actualizarla después si RutaFV la confirma.
const REMOTE_MIN_DAYS = 7;
const REMOTE_MAX_DAYS = 7;

function compact(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function fold(value = '') {
  return compact(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizeIsland(value = '') {
  const text = fold(value).replace(/[()]/g, ' ');
  if (text.includes('fuerteventura')) return LOCAL_ISLAND;
  if (text.includes('lanzarote')) return 'Lanzarote';
  if (text.includes('gran canaria')) return 'Gran Canaria';
  if (text.includes('tenerife')) return 'Tenerife';
  if (text.includes('la palma')) return 'La Palma';
  if (text.includes('la gomera')) return 'La Gomera';
  if (text.includes('el hierro')) return 'El Hierro';
  if (text.includes('isla') || text.includes('canaria')) return compact(value) || 'Desconocida';
  return compact(value) || '';
}

function islandFromAddress(address = '') {
  const text = fold(address);
  for (const island of [LOCAL_ISLAND, 'Lanzarote', 'Gran Canaria', 'Tenerife', 'La Palma', 'La Gomera', 'El Hierro']) {
    if (text.includes(fold(island))) return island;
  }
  return '';
}

function supplierLocation(supplier = {}) {
  const address = compact(supplier.address || supplier.pickupAddress);
  const explicitIsland = normalizeIsland(supplier.island || supplier.supplierIsland);
  const island = explicitIsland || islandFromAddress([address, supplier.city || supplier.pickupCity].filter(Boolean).join(', ')) || 'Desconocida';
  const isLocal = explicitIsland ? island === LOCAL_ISLAND : island === LOCAL_ISLAND || islandFromAddress(address) === LOCAL_ISLAND;
  return { island, address, city: compact(supplier.city || supplier.pickupCity), postalCode: compact(supplier.postalCode || supplier.pickupPostalCode), isLocal };
}

function addHours(base, hours) { return new Date(new Date(base).getTime() + hours * 3600000); }
function addDays(base, days) { return new Date(new Date(base).getTime() + days * 86400000); }

function deliveryEstimate(supplier = {}, baseAt = new Date()) {
  const location = supplierLocation(supplier);
  const knownIsland = !!location.island && location.island !== 'Desconocida';
  const minHours = location.isLocal ? LOCAL_MIN_HOURS : REMOTE_MIN_DAYS * 24;
  const maxHours = location.isLocal ? LOCAL_MAX_HOURS : REMOTE_MAX_DAYS * 24;
  const minAt = location.isLocal ? addHours(baseAt, minHours) : addDays(baseAt, REMOTE_MIN_DAYS);
  const maxAt = location.isLocal ? addHours(baseAt, maxHours) : addDays(baseAt, REMOTE_MAX_DAYS);
  const dateOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const minDate = minAt.toLocaleDateString('es-ES', dateOptions);
  const maxDate = maxAt.toLocaleDateString('es-ES', dateOptions);
  const label = !knownIsland
    ? 'Pendiente de confirmar'
    : location.isLocal
      ? `24–72 h · ${minDate}–${maxDate}`
      : `Aproximadamente 7 días · ${minDate}`;
  return {
    ...location,
    minHours,
    maxHours,
    minDays: location.isLocal ? 1 : REMOTE_MIN_DAYS,
    maxDays: location.isLocal ? 3 : REMOTE_MAX_DAYS,
    baseAt: new Date(baseAt).toISOString(),
    minAt: minAt.toISOString(),
    maxAt: maxAt.toISOString(),
    minDate,
    maxDate,
    label,
    rule: !knownIsland ? 'pendiente_confirmacion' : (location.isLocal ? 'local_fuerteventura' : 'fuera_isla')
  };
}

module.exports = {
  LOCAL_ISLAND,
  LOCAL_MIN_HOURS,
  LOCAL_MAX_HOURS,
  REMOTE_MIN_DAYS,
  REMOTE_MAX_DAYS,
  normalizeIsland,
  islandFromAddress,
  supplierLocation,
  deliveryEstimate
};
