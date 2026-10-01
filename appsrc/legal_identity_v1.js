'use strict';

const crypto = require('node:crypto');
const VERSION = '2026-10-01-identidad-v1';
const DEFAULT_EMAIL = 'contacto.fvmarket@gmail.com';
const DEFAULT_PHONE = '605 308 154';
const text = value => typeof value === 'string' ? value.trim() : '';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FIELDS = ['storeName', 'fiscalName', 'fiscalNif', 'fiscalAddress', 'fiscalCity', 'fiscalPostalCode', 'legalEmail', 'contactPhone', 'legalRegisterInfo'];

function validSpanishNif(value) {
  const nif = text(value).toUpperCase();
  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  if (/^\d{8}[A-Z]$/.test(nif)) return letters[Number(nif.slice(0, 8)) % 23] === nif[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) return letters[Number('XYZ'.indexOf(nif[0]) + nif.slice(1, 8)) % 23] === nif[8];
  if (/^[KLM]\d{7}[A-Z]$/.test(nif)) return letters[Number(nif.slice(1, 8)) % 23] === nif[8];
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) return false;
  const digits = nif.slice(1, 8).split('').map(Number);
  const sum = digits.reduce((total, digit, index) => total + (index % 2 ? digit : Math.floor(digit * 2 / 10) + digit * 2 % 10), 0);
  const control = (10 - sum % 10) % 10;
  const digit = String(control), letter = 'JABCDEFGHI'[control];
  if ('ABEH'.includes(nif[0])) return nif[8] === digit;
  if ('NPQRSW'.includes(nif[0])) return nif[8] === letter;
  return nif[8] === digit || nif[8] === letter;
}

function seller(settings = {}) {
  return {
    storeName: text(settings.storeName) || 'FVMarket',
    fiscalName: text(settings.fiscalName),
    fiscalNif: text(settings.fiscalNif).toUpperCase(),
    fiscalAddress: text(settings.fiscalAddress),
    fiscalCity: text(settings.fiscalCity),
    fiscalPostalCode: text(settings.fiscalPostalCode),
    legalEmail: text(settings.legalEmail) || text(settings.supportEmail) || DEFAULT_EMAIL,
    contactPhone: text(settings.contactPhone) || DEFAULT_PHONE,
    legalRegisterInfo: text(settings.legalRegisterInfo)
  };
}

function fingerprint(settings = {}) {
  return crypto.createHash('sha256').update(JSON.stringify(seller(settings))).digest('hex');
}

function status(settings = {}) {
  const identity = seller(settings), issues = [];
  const add = (key, label) => issues.push({ key, label });
  if (!identity.fiscalName || identity.fiscalName.toLocaleLowerCase('es') === identity.storeName.toLocaleLowerCase('es')) add('fiscalName', 'Nombre y apellidos del titular o razón social completa');
  if (!validSpanishNif(identity.fiscalNif)) add('fiscalNif', 'NIF válido del titular');
  if (!identity.fiscalAddress) add('fiscalAddress', 'Domicilio del titular');
  if (!identity.fiscalCity) add('fiscalCity', 'Municipio');
  if (!/^\d{5}$/.test(identity.fiscalPostalCode)) add('fiscalPostalCode', 'Código postal de cinco cifras');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.legalEmail)) add('legalEmail', 'Correo de contacto válido');
  if (identity.contactPhone.replace(/\D/g, '').length < 7 || identity.contactPhone.replace(/\D/g, '').length > 15) add('contactPhone', 'Teléfono de contacto válido');
  const complete = issues.length === 0;
  const confirmed = complete && !!settings.legalIdentityConfirmedAt && settings.legalIdentityConfirmedHash === fingerprint(settings);
  return { complete, confirmed, ready: complete && confirmed, issues, confirmedAt: confirmed ? settings.legalIdentityConfirmedAt : null, version: VERSION };
}

function updateSettings(current = {}, input = {}, actor = {}) {
  const updates = { ...input };
  for (const key of ['legalIdentityStatus', 'legalIdentityConfirmedAt', 'legalIdentityConfirmedHash', 'legalIdentityConfirmedBy']) delete updates[key];
  delete updates.legalIdentityConfirmed;
  for (const key of FIELDS) {
    if (!Object.hasOwn(input, key)) continue;
    if (typeof input[key] !== 'string') throw new Error('Los datos del vendedor deben introducirse como texto.');
    updates[key] = text(input[key]);
  }
  if (Object.hasOwn(updates, 'fiscalNif')) {
    updates.fiscalNif = updates.fiscalNif.toUpperCase();
    if (updates.fiscalNif && !validSpanishNif(updates.fiscalNif)) throw new Error('Introduce un NIF válido del titular, con su letra o dígito de control.');
  }
  if (updates.legalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.legalEmail)) throw new Error('Introduce un correo de contacto válido.');
  if (updates.fiscalPostalCode && !/^\d{5}$/.test(updates.fiscalPostalCode)) throw new Error('El código postal debe tener cinco cifras.');
  if (Object.hasOwn(input, 'legalIdentityConfirmed') && typeof input.legalIdentityConfirmed !== 'boolean') throw new Error('Confirma los datos del vendedor mediante la casilla de configuración.');
  const next = { ...current, ...updates };
  if (fingerprint(current) !== fingerprint(next) || input.legalIdentityConfirmed === false) {
    delete next.legalIdentityConfirmedAt; delete next.legalIdentityConfirmedHash; delete next.legalIdentityConfirmedBy;
  }
  if (input.legalIdentityConfirmed === true) {
    const check = status(next);
    if (!check.complete) throw new Error('Completa los datos del vendedor antes de confirmarlos: ' + check.issues.map(issue => issue.label).join('; ') + '.');
    next.legalIdentityConfirmedAt = new Date().toISOString();
    next.legalIdentityConfirmedHash = fingerprint(next);
    next.legalIdentityConfirmedBy = text(actor.id);
  }
  return next;
}

function liveMode(key = '') { return !!key && !/^(sk|rk)_test_/.test(String(key)); }
function paymentAllowed(settings, key) { return !liveMode(key) || status(settings).ready; }

function sellerHtml(settings = {}) {
  const identity = seller(settings), check = status(settings);
  const row = (label, value) => `<div><dt>${label}</dt><dd>${esc(value || 'Pendiente de completar')}</dd></div>`;
  return `<dl class="seller-details">${row('Nombre comercial', identity.storeName)}${row('Titular legal', identity.fiscalName)}${row('NIF', identity.fiscalNif)}${row('Domicilio', identity.fiscalAddress)}${row('Municipio y código postal', [identity.fiscalPostalCode, identity.fiscalCity].filter(Boolean).join(' · '))}<div><dt>Correo electrónico</dt><dd><a href="mailto:${esc(identity.legalEmail)}">${esc(identity.legalEmail)}</a></dd></div><div><dt>Teléfono</dt><dd><a href="tel:${esc(identity.contactPhone.replace(/[^+\d]/g, ''))}">${esc(identity.contactPhone)}</a></dd></div>${identity.legalRegisterInfo ? row('Datos registrales', identity.legalRegisterInfo) : ''}</dl>${check.ready ? '' : '<p class="seller-pending" role="status">Tienda en preparación. La identificación del vendedor está pendiente de completar o confirmar; los pagos reales están temporalmente deshabilitados.</p>'}`;
}

module.exports = { VERSION, FIELDS, seller, status, updateSettings, validSpanishNif, liveMode, paymentAllowed, sellerHtml };
