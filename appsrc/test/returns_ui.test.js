'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('el carrito enlaza las condiciones de sus artículos y cantidades sin mostrar un bloque duplicado',()=>{
  let href='',removed=0;
  const link={setAttribute(name,value){if(name==='href')href=value;}},obsolete={remove(){removed++;}};
  const context={cart:[{id:'p',qty:2}],cartProduct:id=>id==='p'?{returnPolicy:{mode:'non_postal',maxCostPerUnit:100}}:null,document:{head:{appendChild(){}},createElement:()=>({}),querySelector:()=>link,getElementById:id=>id==='fvmCartReturns'?obsolete:null},renderCart(){},console};
  context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/fvmarket-returns-v1.js'),'utf8'),context);
  assert.deepEqual(JSON.parse(new URL(href,'https://fvmarket.es').searchParams.get('items')),[{id:'p',qty:2}]);
  assert.equal(href.includes('maxCostPerUnit'),false);assert.ok(removed>0);
  context.cart[0].qty=3;context.renderCart();assert.equal(JSON.parse(new URL(href,'https://fvmarket.es').searchParams.get('items'))[0].qty,3);
  context.cart=[];context.renderCart();assert.equal(href,'/legal/condiciones');
  const html=context.fvmReturnsInformationHtml({lines:[{title:'<img onerror=x>',qty:1,mode:'seller_paid'}]});assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/coste para ti: 0 €/);
});
