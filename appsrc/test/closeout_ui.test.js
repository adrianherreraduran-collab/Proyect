'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname,'../public/',name),'utf8');
test('buscar facturas admite nombres con tildes, NIF y números; conserva el filtro tras recargar',()=>{
  let listener; const input={value:'',addEventListener:(event,fn)=>{listener=fn;}}, count={};
  const row = value => ({textContent:value,dataset:{},hidden:false,querySelector:()=>null});
  let rows=[row('FV-2026-00012 FVM-123 Ana López 42350448L'),row('FV-2026-00013 FVM-456 Pedro García X1234567L')],empty=null;
  const host={querySelectorAll:()=>[...rows,...(empty?[empty]:[])],querySelector:()=>empty,appendChild:r=>{empty=r;r.remove=()=>{empty=null;};}};
  const document={getElementById:id=>({invoices:host,fvmInvoiceSearch:input,fvmInvoiceSearchCount:count}[id]),createElement:()=>({dataset:{},querySelector:()=>({})})},window={};
  vm.runInNewContext(source('fvmarket-invoice-search-v1.js'),{document,window});
  input.value='ana lopez';listener();assert.equal(rows[0].hidden,false);assert.equal(rows[1].hidden,true);assert.equal(count.textContent,'1 de 2 facturas');
  input.value='X-1234567-L';listener();assert.equal(rows[0].hidden,true);assert.equal(rows[1].hidden,false);
  input.value='FV202600012';listener();assert.equal(rows[0].hidden,false);assert.equal(rows[1].hidden,true);
  input.value='sin coincidencias';listener();assert.ok(empty);assert.equal(count.textContent,'0 de 2 facturas');
  input.value='FVM-456';listener();rows.push(row('FV-2026-00014 FVM-456 Pedro García X1234567L'));window.fvmFilterInvoices();assert.equal(count.textContent,'2 de 3 facturas');assert.equal(empty,null);
  input.value='';listener();assert.ok(rows.every(r=>!r.hidden));
});
test('el detalle muestra opiniones públicas pero ofrece formulario solo al comprador entregado y separa publicidad',async()=>{
  const content={innerHTML:''},reviewHost={outerHTML:'',querySelector:()=>null};let eligibility={eligible:false,alreadyReviewed:false};
  const product={id:'p1',title:'Taladro',price:100,customerPrice:80,hasDiscount:true,regularPrice:100,recommendation:{text:'Texto <script> promocional'},images:[]};
  const document={getElementById:id=>({productDetailContent:content,productDetailModal:{classList:{add(){}}},fvmCustomerReviewsStyle:{}}[id]),querySelector:()=>reviewHost};
  const window={products:[product],session:null,api:async()=>({count:1,average:5,reviews:[{authorName:'Ana L.',rating:5,comment:'Buen producto'}],eligibility})};
  vm.runInNewContext(source('fvmarket-reviews-v1.js'),{document,window});
  async function open(){window.openProductDetail('p1');await Promise.resolve();await Promise.resolve();}
  await open();assert.match(reviewHost.outerHTML,/Buen producto/);assert.doesNotMatch(reviewHost.outerHTML,/data-review-form|Inicia sesión|Valora este producto/);assert.match(content.innerHTML,/80,00/);assert.match(content.innerHTML,/Contenido promocional de FVMarket/);assert.match(content.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(content.innerHTML,/<script>/);
  window.session={token:'local-isolated'};await open();assert.doesNotMatch(reviewHost.outerHTML,/data-review-form/);
  eligibility={eligible:true,alreadyReviewed:false};await open();assert.match(reviewHost.outerHTML,/data-review-form/);assert.match(reviewHost.outerHTML,/>Enviar<\/button>/);
  eligibility={eligible:false,alreadyReviewed:true,reason:'Pendiente de aprobación'};await open();assert.doesNotMatch(reviewHost.outerHTML,/data-review-form/);assert.match(reviewHost.outerHTML,/Pendiente de aprobación/);
});
