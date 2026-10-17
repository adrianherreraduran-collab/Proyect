'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),rules=require('../commercial_rules_v1');
const config={fee:{percent:1.5,fixed:.25},shipping:{enabled:true,rules:[{id:'south',name:'Gran Tarajal',cities:['Gran Tarajal'],postalCodes:['35620'],minSubtotal:300,maxWeightKg:100,maxShippingCost:40,excludedRefs:['EXCLUDE'],discountThreshold:150,discountAmount:10}]}};
const destination={address:'Calle de prueba 1',city:'Gran Tarajal',postalCode:'35620'};
const items=(price=300,weight=20)=>[{id:'p',ref:'PRODUCT',qty:1,unitPrice:price,weightKg:weight}];
test('la parte fija de Stripe se estima una vez por cobro y la calculadora cubre el neto a céntimos',()=>{
 assert.equal(rules.estimateFee(1.05,config),.27);assert.equal(rules.estimateFee(50,config),1);assert.equal(rules.estimateFee(100,config),1.75);
 assert.equal(rules.priceForNet(50,config).price,51.02);assert.equal(rules.priceForNet(50,config).estimatedNet,50);
 assert.equal(rules.priceForNet(1.05,config).estimatedNet,1.05);assert.throws(()=>rules.priceForNet(-1,config));
});
test('la promoción requiere un mínimo y un peso elegidos; no se activa una cifra ilustrativa',()=>{
 assert.equal(rules.settings({}).shipping.enabled,false);assert.deepEqual(rules.settings({}).shipping.rules,[]);
 assert.throws(()=>rules.validateSettings({shipping:{enabled:true,rules:[]}}));
 assert.throws(()=>rules.validateSettings({shipping:{enabled:true,rules:[{minSubtotal:0,maxWeightKg:100}]}}));
 assert.throws(()=>rules.validateSettings({fee:{percent:-1}}));
 assert.equal(rules.validateSettings(config).shipping.rules[0].minSubtotal,300);
});
test('importe, zona, peso, referencias y tope de transporte se verifican juntos',()=>{
 const apply=(rows=items(),dest=destination,cost=30)=>rules.shipping(config,rows,{},dest,cost);
 assert.equal(apply().freeTransport,true);assert.equal(apply(items(100)).remaining,200);assert.equal(apply(items(100)).discountAmount,0);
 assert.equal(apply(items(300,100)).freeTransport,true);assert.equal(apply(items(300,100.1)).reason,'weight_limit');
 assert.equal(apply(items(300,0)).reason,'weight_unknown');assert.equal(apply([{...items()[0],ref:'exclude'}]).reason,'excluded_product');
 assert.equal(apply(items(),{...destination,postalCode:'35660'}).reason,'outside_zone');assert.equal(apply(items(),destination,41).reason,'shipping_cost_limit');
 assert.equal(apply(items(),destination,null).reason,'quote_required');assert.equal(apply(items(),destination,null).freeTransport,false);
});
test('la bonificación parcial conserva el coste original y los beneficios personales siguen funcionando',()=>{
 const result=rules.transportBenefit({amount:30},{},config,items(200),destination);assert.equal(result.regularAmount,30);assert.equal(result.customerAmount,20);assert.equal(result.freeTransport,false);
 const vip=rules.transportBenefit({amount:60},{role:'customer',freeTransport:true},{},items(1,1000),destination);assert.equal(vip.customerAmount,0);assert.equal(vip.regularAmount,60);
 const forged=rules.transportBenefit({amount:30,regularAmount:0},{},{},items(),destination);assert.equal(forged.customerAmount,30);
});
test('el margen distingue tarifas estimadas, comisiones reales y coste de RutaFV aunque el envío sea gratis',()=>{
 const order={id:'o',number:'FVM-1',total:105,delivery:0,regularDelivery:30,items:[{qty:2,procurement:{sourcePrice:40}}]};
 let margin=rules.orderMargin(order,config);assert.equal(margin.supplierCost,80);assert.equal(margin.transportCost,30);assert.equal(margin.feeConfirmed,false);assert.equal(margin.margin,-6.83);assert.equal(margin.warning,'below_cost');
 order.stripeAccounting={status:'confirmed',fee:2};margin=rules.orderMargin(order,config);assert.equal(margin.margin,-7);assert.equal(margin.netReceived,103);assert.equal(margin.feeConfirmed,true);
});
