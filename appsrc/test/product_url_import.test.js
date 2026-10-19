'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const importer = require('../product_url_import_v1');

test('la descarga segura valida cada salto y desactiva proxy y redirecciones automáticas', async () => {
  const calls = [];
  const response = await importer.readSafeResource('https://shop.example/item.pdf', {
    responseType: 'arraybuffer', maxBytes: 1024,
    headers: { Accept: 'application/pdf' }
  }, async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return { status: 302, headers: { location: 'https://cdn.example/file.pdf' } };
    return { status: 200, headers: { 'content-type': 'application/pdf' }, data: Buffer.from('%PDF-test') };
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.maxRedirects, 0);
  assert.equal(calls[0].options.proxy, false);
  assert.equal(calls[0].options.lookup, importer.safeLookup);
  assert.equal(calls[1].url, 'https://cdn.example/file.pdf');
  assert.equal(response.url, 'https://cdn.example/file.pdf');
  assert.equal(response.data.toString(), '%PDF-test');
});

test('la descarga segura bloquea redirecciones hacia direcciones privadas antes de seguirlas', async () => {
  let calls = 0;
  await assert.rejects(importer.readSafeResource('https://shop.example/item.pdf', {}, async () => {
    calls++;
    return { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } };
  }), /no permitida/i);
  assert.equal(calls, 1);
});

test('la descarga segura limita el tamaño tras recibir la respuesta', async () => {
  await assert.rejects(importer.readSafeResource('https://shop.example/item', { maxBytes: 4 }, async () => ({
    status: 200, headers: { 'content-type': 'text/plain' }, data: '12345'
  })), /tamaño permitido/i);
});
