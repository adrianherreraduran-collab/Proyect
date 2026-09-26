'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { guestQuoteOwnerId, normalizeGuestCustomer } = require('../guest_checkout_v1');

test('anonymous quote owner is bound to a valid checkout session and email', () => {
  const session = 'qW7x5Kp3Tm9R4Vb6nH2sJ8cD1aF0zY5L';
  const owner = guestQuoteOwnerId(session, ' Buyer@example.com ');
  assert.match(owner, /^guest_[a-f0-9]{64}$/);
  assert.equal(guestQuoteOwnerId(session, 'buyer@example.com'), owner);
  assert.notEqual(guestQuoteOwnerId(session, 'other@example.com'), owner);
  assert.equal(guestQuoteOwnerId('too-short', 'buyer@example.com'), '');
});

test('guest checkout requires contact and delivery details but not an account', () => {
  const result = normalizeGuestCustomer({
    name: '  Ana Pérez  ',
    email: ' ANA@example.com ',
    phone: '+34 600 000 000',
    address: 'Calle Mayor 1',
    city: 'Gran Tarajal',
    postalCode: '35620'
  });
  assert.equal(result.error, undefined);
  assert.equal(result.customer.name, 'Ana Pérez');
  assert.equal(result.customer.email, 'ana@example.com');
  assert.equal(result.customer.nifNie, '');
});

test('guest checkout rejects invalid email, missing delivery address, and invalid supplied tax ID', () => {
  assert.match(normalizeGuestCustomer({}).error, /nombre/i);
  const base = {name:'Ana Pérez',email:'ana@example.com',phone:'600000000',address:'Calle Mayor 1',city:'Gran Tarajal',postalCode:'35620'};
  assert.match(normalizeGuestCustomer({...base,email:'incorrecto'}).error, /correo/i);
  assert.match(normalizeGuestCustomer({...base,address:''}).error, /dirección/i);
  assert.match(normalizeGuestCustomer({...base,nifNie:'12345678A'},()=>false).error, /NIF\/NIE/i);
});
