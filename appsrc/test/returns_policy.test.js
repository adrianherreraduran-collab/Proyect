'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const returns = require('../returns_policy_v1');

test('el coste de devolución procede del catálogo, suma cantidades y no filtra datos internos', () => {
  const data = {products:[{id:'bulky',title:'Carretilla',ref:'CR1',sourceProvider:'Privado',returnPolicy:{mode:'non_postal',maxCostPerUnit:37.45,reviewedBy:'admin-private'}},{id:'postal',title:'Grifo',returnPolicy:{mode:'postal'}}]};
  const info = returns.information(data,[{id:'bulky',qty:2,returnPolicy:{mode:'postal',maxCostPerUnit:0}},{id:'postal',qty:1},{id:'bulky',qty:1}]);
  assert.equal(info.ready,true); assert.equal(info.nonPostalMaxCost,112.35);
  assert.equal(info.lines[0].qty,3); assert.equal(info.lines[0].maxCostPerUnit,37.45);
  assert.equal(info.lines[0].sourceProvider,undefined); assert.equal(info.lines[0].reviewedBy,undefined);
  assert.equal(returns.paymentAllowed(data,[{id:'bulky',qty:1}],'rk_live_mock'),true);
});

test('no se inventa una tarifa para artículos sin clasificar y las pruebas siguen disponibles', () => {
  const data = {products:[{id:'unreviewed',weightKg:1},{id:'missing-price',returnPolicy:{mode:'non_postal'}}]};
  for (const id of ['unreviewed','missing-price','missing-product']) {
    const items = [{id,qty:1}];
    assert.equal(returns.information(data,items).ready,false);
    assert.equal(returns.paymentAllowed(data,items,'sk_live_mock'),false);
    assert.equal(returns.paymentAllowed(data,items,'rk_test_mock'),true);
  }
});

test('un importe explícito cero se distingue del coste pendiente y los valores inválidos se rechazan', () => {
  assert.equal(returns.validatePolicy({mode:'non_postal',maxCostPerUnit:0}).policy.maxCostPerUnit,0);
  for (const value of [null,undefined,'',true,-1,NaN,Infinity,'abc',0.001,100001]) assert.ok(returns.validatePolicy({mode:'non_postal',maxCostPerUnit:value}).error,String(value));
  assert.ok(returns.validatePolicy({mode:'inventado'}).error);
});

test('la información de Stripe conserva el coste, enlaza las condiciones y cabe en el límite', () => {
  const info = returns.information({products:[{id:'p',returnPolicy:{mode:'non_postal',maxCostPerUnit:65}}]},[{id:'p',qty:2}]);
  const text = returns.checkoutText(info,'https://fvmarket.es');
  assert.match(text,/130,00/); assert.match(text,/14 días/); assert.match(text,/3 años/);
  assert.match(text,/https:\/\/fvmarket.es\/legal\/devoluciones/); assert.ok(text.length <= 1200);
  const changed = returns.information({products:[{id:'p',returnPolicy:{mode:'non_postal',maxCostPerUnit:70}}]},[{id:'p',qty:2}]);
  assert.notEqual(returns.fingerprint(info),returns.fingerprint(changed));
});
