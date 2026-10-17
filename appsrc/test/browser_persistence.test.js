'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const state = require('../public/fvmarket-browser-state-v1');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const token = exp => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ exp })).toString('base64url') + '.signature';
const account = (id = 'customer') => ({ token: token(Math.floor(Date.now()/1000)+3600), user: { id, role: 'customer' } });
function storage(initial = {}) { const values = new Map(Object.entries(initial)); return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k), values }; }
test('recargar y volver desde Stripe mediante Atrás conserva la sesión y las cantidades', async () => {
  const customer = account(), saved = storage({ fv_session: JSON.stringify(customer), fv_cart: JSON.stringify([{ id: 'p1', qty: 3 }]) }), events = new Map();
  const context = vm.createContext({ localStorage: saved, atob, Date, window: { FVMStoreState: state, addEventListener: (k,v) => events.set(k,v) }, renderProducts(){}, updateCart(){}, refreshCustomerPricing: async()=>true, refreshAccount(){} });
  const boot = html.slice(html.indexOf("let products=[],mode='login'"), html.indexOf('let guestSessionId='));
  vm.runInContext('let catalogRequestVersion=0,rutaFVQuote=null;'+boot, context);
  assert.equal(vm.runInContext('session.user.id',context),'customer'); assert.equal(vm.runInContext('cart[0].qty',context),3);
  events.get('pageshow')({ persisted:true }); await Promise.resolve();
  assert.equal(vm.runInContext('session.user.id',context),'customer'); assert.equal(vm.runInContext('cart[0].qty',context),3);
  assert.equal(JSON.parse(saved.getItem('fv_cart'))[0].qty,3);
});
test('estado malformado y almacenamiento no disponible no impiden abrir la tienda', () => {
  assert.deepEqual(state.restore(storage({ fv_session:'{broken', fv_cart:'{broken' })),{session:null,cart:[]});
  const blocked = { getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')} };
  assert.deepEqual(state.restore(blocked),{session:null,cart:[]});
  const s=storage({fv_session:JSON.stringify(account()),fv_cart:'{broken'}); assert.deepEqual(state.restore(s).cart,[]);
});
test('la sesión caducada y el carrito de otro usuario no se recuperan', () => {
  const expired=account();expired.token=token(Math.floor(Date.now()/1000)-1);
  const s=storage({fv_session:JSON.stringify(expired),fv_cart:'[{"id":"p","qty":1}]'});assert.equal(state.restore(s).session,null);assert.equal(s.getItem('fv_cart'),null);
  const other=storage({fv_session:JSON.stringify(account('second')),fv_cart_owner:'first',fv_cart:'[{"id":"private","qty":1}]'});assert.deepEqual(state.restore(other).cart,[]);
});
test('volver sin pagar no borra artículos; confirmar el pago elimina solo las unidades compradas una vez', () => {
  const s=storage(),u=account(),original=[{id:'p',qty:1}];state.save(s,u,original);state.saveCheckout(s,u,'order',original);
  assert.deepEqual(state.restore(s).cart,original);
  const changed=[{id:'p',qty:3},{id:'other',qty:2}];state.save(s,u,changed);
  assert.deepEqual(state.finishCheckout(s,u,'order',changed),[{id:'p',qty:2},{id:'other',qty:2}]);
  assert.equal(state.finishCheckout(s,u,'order',changed),null);
  state.clear(s);assert.equal(s.getItem('fv_session'),null);assert.equal(s.getItem('fv_cart'),null);
});
