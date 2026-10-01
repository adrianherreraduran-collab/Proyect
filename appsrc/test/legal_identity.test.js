'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const identity = require('../legal_identity_v1');
const fixture = () => ({ storeName: 'FVMarket', fiscalName: 'Ana López García', fiscalNif: '42350448L', fiscalAddress: 'Calle Prueba 1', fiscalCity: 'Tuineje', fiscalPostalCode: '35620', legalEmail: 'ana@example.com', contactPhone: '600123123' });

test('el vendedor admite DNI, NIE y NIF de sociedad y rechaza un control incorrecto', () => {
  for (const nif of ['42350448L', 'X1234567L', 'B12345674', 'A12345674', 'N1234567D']) assert.equal(identity.validSpanishNif(nif), true, nif);
  for (const nif of ['42350448A', 'X1234567A', 'B12345675', 'N12345674', 'FVMarket', '']) assert.equal(identity.validSpanishNif(nif), false, nif);
});

test('ni una marca sola ni campos sin confirmar habilitan los pagos reales', () => {
  assert.equal(identity.status({ fiscalName: 'FVMarket', storeName: 'FVMarket' }).ready, false);
  assert.equal(identity.status(fixture()).complete, true);
  assert.equal(identity.status(fixture()).ready, false);
  assert.throws(() => identity.updateSettings({}, { legalIdentityConfirmed: true }, { id: 'admin' }), /Completa los datos/);
});

test('la confirmación queda ligada a los datos y no puede falsificarse en el cuerpo del formulario', () => {
  const initial = fixture();
  const forged = identity.updateSettings(initial, { legalIdentityConfirmedAt: '2026-10-01', legalIdentityConfirmedHash: 'falso', legalIdentityStatus: { ready: true } });
  assert.equal(identity.status(forged).ready, false);
  const confirmed = identity.updateSettings(initial, { legalIdentityConfirmed: true }, { id: 'admin' });
  assert.equal(identity.status(confirmed).ready, true);
  assert.equal(confirmed.legalIdentityConfirmedBy, 'admin');
  assert.equal(identity.status(identity.updateSettings(confirmed, { invoiceFooter: 'Gracias.' })).ready, true);
  assert.equal(identity.status(identity.updateSettings(confirmed, { fiscalAddress: 'Calle Nueva 2' })).ready, false);
  assert.equal(identity.status(identity.updateSettings(confirmed, { legalIdentityConfirmed: false })).ready, false);
});

test('el control solo deja utilizar claves de pruebas mientras la identidad está pendiente', () => {
  for (const key of ['sk_live_prueba_aislada', 'rk_live_prueba_aislada', 'clave-no-identificada']) assert.equal(identity.paymentAllowed({}, key), false);
  for (const key of ['', 'sk_test_prueba_aislada', 'rk_test_prueba_aislada']) assert.equal(identity.paymentAllowed({}, key), true);
  const confirmed = identity.updateSettings(fixture(), { legalIdentityConfirmed: true }, { id: 'admin' });
  assert.equal(identity.paymentAllowed(confirmed, 'sk_live_prueba_aislada'), true);
});

test('la información pública escapa el texto y no inventa los datos que faltan', () => {
  const html = identity.sellerHtml({ fiscalName: '<script>alert(1)</script>' });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Pendiente de completar/);
  assert.match(html, /pagos reales están temporalmente deshabilitados/);
  assert.doesNotMatch(html, /Calle La Palma|42350448L/);
});
