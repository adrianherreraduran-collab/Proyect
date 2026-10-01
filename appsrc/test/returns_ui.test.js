'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('el carrito descarta respuestas antiguas, escapa títulos y vuelve a consultar si cambia la tarifa', async () => {
  const nodes = new Map(), timers = new Map(), requests = []; let timerId = 0;
  const element = () => ({innerHTML:'',setAttribute(){},querySelector(){return {};},insertBefore(node){nodes.set(node.id,node);}});
  nodes.set('cartCheckout',element());
  const product = {id:'p',returnPolicy:{mode:'non_postal',maxCostPerUnit:40}};
  const context = {
    cart:[{id:'p',qty:1}],cartProduct:() => product,
    document:{head:{appendChild(){}},getElementById:id => nodes.get(id),createElement:element},
    setTimeout:fn => {const id = ++timerId;timers.set(id,fn);return id;},clearTimeout:id => timers.delete(id),
    fetch:(url,options) => new Promise(resolve => requests.push({url,body:JSON.parse(options.body),resolve})),
    renderCart(){},openCart(){},console
  };
  context.window = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/fvmarket-returns-v1.js'),'utf8'),context);
  const tick = () => {const fn = [...timers.values()].at(-1);timers.clear();return fn();};
  const info = (qty,cost) => ({ready:true,lines:[{title:'<img onerror=alert(1)>',qty,mode:'non_postal',maxCostPerUnit:cost,maxCostForQuantity:qty*cost}]});
  context.renderCart(); const first = tick();
  context.cart[0].qty = 2; context.renderCart(); const second = tick();
  requests[1].resolve({ok:true,json:async() => info(2,40)}); await second;
  requests[0].resolve({ok:true,json:async() => info(1,40)}); await first;
  const host = nodes.get('fvmCartReturns');
  assert.match(host.innerHTML,/80,00/); assert.match(host.innerHTML,/&lt;img/); assert.doesNotMatch(host.innerHTML,/<img/);
  assert.equal(requests[1].body.items[0].qty,2); assert.equal(context.cart[0].qty,2);
  product.returnPolicy.maxCostPerUnit = 50; context.renderCart(); const third = tick();
  assert.equal(requests.length,3);
  requests[2].resolve({ok:true,json:async() => info(2,50)}); await third;
  assert.match(host.innerHTML,/100,00/);
});
