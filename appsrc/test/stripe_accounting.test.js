'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createReconciler,actualFee}=require('../stripe_accounting_v1');
const fixture=()=>({users:[],products:[],suppliers:[],settings:{},orders:[{id:'o',number:'FVM-1',paidAt:'2026-10-17',paymentIntentId:'pi_1',total:1.05,subtotal:1.05,status:'pagado',items:[]}],procurementTasks:[],accountingEntries:[],auditLog:[],customerNotifications:[]});
const charge=()=>({id:'ch_1',payment_intent:'pi_1',paid:true,captured:true,amount:105,currency:'eur',balance_transaction:{id:'txn_1',amount:105,fee:27,net:78,currency:'eur',available_on:1792400000}});
test('conciliar el mismo cobro o recibir eventos repetidos registra una sola comisión real',async()=>{
 let data=fixture(),calls=0;const reconciler=createReconciler({stripe:{charges:{list:async args=>{calls++;assert.equal(args.payment_intent,'pi_1');return{data:[charge()]}}}},read:()=>structuredClone(data),save:d=>{data=d}});
 const result=await Promise.all([reconciler.reconcile('o'),reconciler.reconcile('o')]);assert.ok(result.every(x=>x.confirmed));assert.equal(calls,1);
 await reconciler.reconcile('o');assert.equal(calls,1);assert.equal(data.orders[0].stripeAccounting.fee,.27);assert.equal(data.orders[0].stripeAccounting.net,.78);
 assert.equal(data.accountingEntries.filter(x=>x.type==='comision_stripe').length,1);assert.equal(data.accountingEntries.find(x=>x.type==='comision_stripe').amount,-.27);
});
test('una comisión aún no disponible o sin permiso no se inventa como gasto y permite reintentar',async()=>{
 let data=fixture(),mode='pending';const reconciler=createReconciler({stripe:{charges:{list:async()=>{if(mode==='permission')throw Object.assign(Error('restricted key private value'),{statusCode:403});const c=charge();if(mode==='pending')c.balance_transaction=null;return{data:[c]}}}},read:()=>structuredClone(data),save:d=>{data=d}});
 assert.equal((await reconciler.reconcile('o')).reason,'awaiting_balance_transaction');assert.equal(data.accountingEntries.length,0);
 mode='permission';assert.equal((await reconciler.reconcile('o')).reason,'permission_required');assert.doesNotMatch(JSON.stringify(data),/private value/);
 mode='ready';assert.equal((await reconciler.reconcile('o')).confirmed,true);assert.equal(data.accountingEntries.filter(x=>x.type==='comision_stripe').length,1);
});
test('el barrido periódico reintenta estados transitorios y evita errores de configuración o importes',async()=>{
 let data=fixture();
 data.orders[0].stripeAccounting={status:'awaiting_balance_transaction'};
 data.orders.push({...fixture().orders[0],id:'temporary',paymentIntentId:'pi_temporary',stripeAccounting:{status:'temporarily_unavailable'}});
 data.orders.push({...fixture().orders[0],id:'permission',paymentIntentId:'pi_permission',stripeAccounting:{status:'permission_required'}});
 data.orders.push({...fixture().orders[0],id:'mismatch',paymentIntentId:'pi_mismatch',stripeAccounting:{status:'balance_mismatch'}});
 const calls=[];const reconciler=createReconciler({stripe:{charges:{list:async args=>{calls.push(args.payment_intent);return{data:[]}}}},read:()=>structuredClone(data),save:d=>{data=d}});
 const results=await reconciler.sweep(20,{retryTransientOnly:true});
 assert.deepEqual(calls,['pi_1','pi_temporary']);
 assert.deepEqual(results.map(x=>x.reason),['awaiting_balance_transaction','awaiting_balance_transaction']);
 assert.equal(data.orders.find(x=>x.id==='permission').stripeAccounting.status,'permission_required');
 assert.equal(data.orders.find(x=>x.id==='mismatch').stripeAccounting.status,'balance_mismatch');
});
test('rechaza movimientos de otro pago, otra moneda o importes incompatibles',()=>{
 const order=fixture().orders[0];let c=charge();c.payment_intent='pi_other';assert.throws(()=>actualFee(order,c),/charge_mismatch/);
 c=charge();c.balance_transaction.currency='usd';assert.throws(()=>actualFee(order,c),/currency_mismatch/);
 c=charge();c.balance_transaction.net=100;assert.throws(()=>actualFee(order,c),/balance_mismatch/);
});
