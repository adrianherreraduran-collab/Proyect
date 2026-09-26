'use strict';

const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHECKOUT_ID_RE = /^[A-Za-z0-9_-]{24,100}$/;

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function guestQuoteOwnerId(checkoutId, email) {
  const id = String(checkoutId || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!CHECKOUT_ID_RE.test(id) || !EMAIL_RE.test(normalizedEmail)) return '';
  return 'guest_' + crypto.createHash('sha256').update(`${id}|${normalizedEmail}`).digest('hex');
}

function normalizeGuestCustomer(input = {}, isValidTaxId = () => true) {
  const customer = {
    name: text(input.name, 160),
    email: text(input.email, 254).toLowerCase(),
    phone: text(input.phone, 50),
    address: text(input.address, 240),
    city: text(input.city, 120),
    postalCode: text(input.postalCode, 20),
    notes: text(input.notes, 1000),
    billingName: text(input.billingName, 160),
    nifNie: text(input.nifNie, 32).toUpperCase().replace(/[\s-]/g, ''),
    billingAddress: text(input.billingAddress, 240),
    billingCity: text(input.billingCity, 120),
    billingPostalCode: text(input.billingPostalCode, 20)
  };

  if (!customer.name) return { error: 'Introduce el nombre del cliente o de la empresa.' };
  if (!EMAIL_RE.test(customer.email)) return { error: 'Introduce un correo electrónico válido.' };
  if (!customer.phone) return { error: 'Introduce un teléfono de contacto.' };
  if (!customer.address || !customer.city || !customer.postalCode) {
    return { error: 'Completa la dirección de entrega, el municipio y el código postal.' };
  }
  if (customer.nifNie && !isValidTaxId(customer.nifNie)) {
    return { error: 'El NIF/NIE indicado no es válido.' };
  }
  return { customer };
}

module.exports = { guestQuoteOwnerId, normalizeGuestCustomer };
