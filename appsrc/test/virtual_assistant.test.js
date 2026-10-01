'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAssistant,findProducts,sensitive,MODEL}=require('../virtual_assistant_v1');
const {benefits}=require('../customer_benefits_v1');
const products=[{id:'bath',title:'Monomando de bañera Benotti',ref:'MB0001',description:'Grifo de acero inoxidable. <b>Montaje mural</b>.',price:82.6,published:true,sourceProvider:'Proveedor PRIVADO',sourcePrice:39,sourceRef:'PRIVADO-1'}, {id:'cement',title:'Cemento de obra',ref:'CE0001',description:'Saco de cemento',price:10,published:true}, {id:'hidden',title:'Taladro secreto',ref:'SEC01',price:1,published:false}];
const data={products,users:[],orders:[],settings:{legalEmail:'atencion@example.com',contactPhone:'600000000'}};
const user={id:'one',role:'customer',discountPct:20,freeTransport:true};
const deps={publicProduct:(product,d,u)=>({...product,customerPrice:product.price*(1-(u?.discountPct || 0)/100),regularPrice:product.price,hasDiscount:!!u?.discountPct,deliveryEstimate:{label:'24–72 h laborables'}}),customerOrderState:order=>({label:order.status==='entregado'?'Pedido entregado':'Pedido Confirmado'})};
const env={FVM_ASSISTANT_AI_ENABLED:'true',FVM_ASSISTANT_FREE_PLAN_CONFIRMED:'true',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_AI_TOKEN:'isolated-non-production-token'};
const query=(assistant,message,options={})=>assistant.answer({data,user:null,message,...options});
const ok=text=>new Response(JSON.stringify({success:true,result:{response:text}}),{status:200});
test('el buscador usa referencias, tildes y grifos; nunca muestra productos sin publicar',()=>{
  assert.equal(findProducts(products,'Busco un grifo')[0].id,'bath');
  assert.equal(findProducts(products,'MB0001')[0].id,'bath');
  assert.equal(findProducts(products,'bañera')[0].id,'bath');
  assert.equal(findProducts(products,'taladro secreto').length,0);
  assert.equal(findProducts(products,'ahora busco cemento','bath')[0].id,'cement');
  assert.equal(findProducts(products,'ahora busco taladro','bath').length,0);
  assert.equal(findProducts(products,'¿Qué medidas tiene?','bath')[0].id,'bath');
});
test('funciona sin proveedor y calcula precios personalizados sin filtrar información de compras',async()=>{
  const assistant=createAssistant(deps,{env:{},fetch:()=>{throw Error('Must never call a provider');}});
  assert.equal(assistant.status().mode,'help');const result=await query(assistant,'MB0001',{user});
  assert.equal(result.products[0].price,66.08);assert.equal(result.products[0].originalPrice,82.6);assert.equal(result.products[0].discountPct,20);
  assert.equal(result.products[0].sourceProvider,undefined);assert.equal(result.products[0].sourcePrice,undefined);assert.equal(result.aiContext,undefined);assert.doesNotMatch(JSON.stringify(result),/PRIVADO/);
  const regular=await query(assistant,'MB0001');assert.equal(regular.products[0].originalPrice,undefined);assert.equal(regular.products[0].price,82.6);
});
test('devoluciones toman la clasificación actual del artículo y conservan los derechos existentes',async()=>{
  const assistant=createAssistant(deps,{env:{}});const result=await query(assistant,'Devolución del MB0001');
  assert.match(result.answer,/14 días naturales/);assert.match(result.answer,/3 años/);assert.match(result.answer,/FVMarket asume/);assert.equal(result.links[0].path,'/legal/devoluciones');
  const specific={...data,products:[{...products[0],returnPolicy:{mode:'non_postal',maxCostPerUnit:35}}]};const bulky=await query(assistant,'devolver MB0001',{data:specific});assert.match(bulky.answer,/35,00/);
});
test('pedidos pertenecen solo al cliente autenticado y jamás llegan al proveedor IA',async()=>{
  let network=0;const assistant=createAssistant(deps,{env,fetch:async()=>{network++;return ok('AI');}}),orders={...data,orders:[{userId:'one',number:'FVM-123',status:'entregado'},{userId:'other',number:'FVM-456',status:'pagado',customer:{name:'Cliente ajeno'}}]};
  const anon=await query(assistant,'Mis pedidos',{data:orders});assert.match(anon.answer,/inicia sesión/);assert.doesNotMatch(anon.answer,/FVM-123/);
  const own=await query(assistant,'Mis pedidos',{data:orders,user});assert.match(own.answer,/FVM-123: Pedido entregado/);assert.doesNotMatch(own.answer,/FVM-456|Cliente ajeno/);
  const foreign=await query(assistant,'pedido FVM-456',{data:orders,user});assert.match(foreign.answer,/No encuentro/);assert.doesNotMatch(foreign.answer,/Pedido Confirmado|Cliente ajeno/);assert.equal(network,0);
});
test('datos sensibles, políticas, compras y transporte se resuelven localmente',async()=>{
  let network=0;const assistant=createAssistant(deps,{env,fetch:async()=>{network++;return ok('AI');}});
  for(const message of ['Mi email es privado@example.com, MB0001','Mi DNI es 42350487N','teléfono 613700107','Transporte MB0001','Cómo comprar','garantía MB0001'])await query(assistant,message,{user});
  assert.equal(network,0);assert.equal(sensitive('Me llamo Ana y busco MB0001'),true);
  const general={...data,products:[{...products[0],description:'Plazos de transporte y entrega'}]};
  assert.equal((await query(assistant,'Transporte y plazos',{data:general})).products.length,0);
  assert.equal((await query(assistant,'Transporte MB0001',{data:general})).products.length,1);
});
test('la IA exige confirmación del plan gratis; no usa otras claves API ni modelos de pago',async()=>{
  for(const configuration of [{},{...env,FVM_ASSISTANT_FREE_PLAN_CONFIRMED:'false'},{...env,CLOUDFLARE_ACCOUNT_ID:'../unsafe'},{OPENAI_API_KEY:'unused-key'}]){
    const assistant=createAssistant(deps,{env:configuration,fetch:()=>{throw Error('Must not call');}});assert.equal(assistant.status().aiConfigured,false);assert.equal((await query(assistant,'MB0001')).mode,'help');
  }
  assert.equal(MODEL,'@cf/meta/llama-3.2-3b-instruct');
});
test('la consulta IA contiene solo fichas públicas y la pregunta; precios y cuenta no se envían',async()=>{
  let request;const assistant=createAssistant(deps,{env,fetch:async(url,options)=>{request={url,options};return ok('El artículo es de acero inoxidable y tiene montaje mural.');}});
  const result=await query(assistant,'Describe MB0001',{user:{...user,email:'private@example.com',password:'secret',nifNie:'PRIVATE-ID'}});
  assert.equal(result.mode,'ai');assert.equal(result.products[0].price,66.08);assert.match(request.url,/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/a{32}\/ai\/run\/@cf\/meta\/llama-3.2-3b-instruct$/);
  const payload=JSON.parse(request.options.body);assert.equal(payload.max_tokens,256);assert.equal(payload.messages.length,2);assert.doesNotMatch(request.options.body,/private@example|secret|PRIVATE-ID|sourcePrice|Proveedor PRIVADO|customerPrice|66\.08|82\.6/);
});
test('fallos, cuota agotada y respuestas con precios falsos conservan la ayuda local',async()=>{
  for(const mock of [async()=>{throw Error('timeout');},async()=>new Response('quota',{status:429}),async()=>ok('Precio: 1,00 € y transporte gratis'),async()=>new Response(JSON.stringify({success:false}),{status:200})]){
    let calls=0;const assistant=createAssistant(deps,{env,fetch:async(...args)=>{calls++;return mock(...args);}});
    const result=await query(assistant,'MB0001');assert.equal(result.mode,'help');assert.equal(result.products[0].price,82.6);await query(assistant,'MB0001');assert.equal(calls,1);
  }
});
test('el límite diario se aplica antes de consultar al proveedor y vuelve a abrirse al día siguiente',async()=>{
  let now=Date.parse('2026-10-01T12:00:00Z'),calls=0;const assistant=createAssistant(deps,{env,clock:()=>now,fetch:async()=>{calls++;return ok('Grifo de acero inoxidable.');}});
  for(let i=0;i<101;i++)await query(assistant,'MB0001');assert.equal(calls,100);
  now+=86400000;assert.equal((await query(assistant,'MB0001')).mode,'ai');assert.equal(calls,101);
});
test('no se lanzan más de dos consultas IA simultáneas',async()=>{
  const pending=[];const assistant=createAssistant(deps,{env,fetch:()=>new Promise(resolve=>pending.push(resolve))});
  const first=query(assistant,'MB0001'),second=query(assistant,'MB0001');assert.equal((await query(assistant,'MB0001')).mode,'help');assert.equal(pending.length,2);pending.forEach(resolve=>resolve(ok('Grifo de acero inoxidable.')));await Promise.all([first,second]);
});
test('limita consultas por visitante y libera el cupo tras diez minutos',()=>{
  let now=1000;const assistant=createAssistant(deps,{env:{},clock:()=>now});for(let i=0;i<20;i++)assert.equal(assistant.limit('same'),true);assert.equal(assistant.limit('same'),false);assert.equal(assistant.limit('another'),true);now+=600001;assert.equal(assistant.limit('same'),true);
});
