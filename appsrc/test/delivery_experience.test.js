'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fvm-experience-'));
process.env.DATA_FILE = path.join(temporary, 'data.json');
process.env.RESEND_API_KEY = '';
process.env.EMAIL_FROM = '';
process.env.STRIPE_SECRET_KEY = '';
process.env.JWT_SECRET = 'local-moderation-test-secret';
const { app, _test: server } = require('../server');
const customer = { id: 'customer-test', role: 'customer', emailVerified: true, firstName: 'Ana', lastName: 'López', name: 'Ana López' };
const order = (id, status, extra = {}) => ({id, number: id, userId: customer.id, status, total: 100, paidAt: '2026-09-29T08:00:00Z', createdAt: '2026-09-29T08:00:00Z', items: [], ...extra});
const fixture = () => ({users: [{id: 'admin-test', role: 'admin', password: 'unused', username: 'admin-test', emailVerified: true}, {...customer}], settings: {adminCredentialsInitializedV14: true, igic: 7}, products: [], quotes: [], invoices: [], orders: [], orderReviews: []});
const route = (url, method) => app._router.stack.find(layer => layer.route?.path === url && layer.route.methods[method]).route.stack.at(-1).handle;
async function call(handler, request = {}) {
  const response = {code: 200, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; }};
  await handler({user: customer, params: {}, body: {}, ...request}, response);
  return response;
}
const publicScript = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');

test('la pestaña de moderación permanece visible al restaurar la sesión del admin y se oculta al resto', () => {
  const html = publicScript('admin.html');
  const source = html.slice(html.indexOf('function applyRoleUi('), html.indexOf('function showAdminLogin('));
  const tabs = ['catalog','products','orders','reviews'].map(view => ({dataset:{view},style:{},click(){}}));
  const context = {document:{querySelectorAll:()=>tabs,querySelector:()=>null},FVM_ROLE_LABELS:{admin:'Admin'}};
  vm.runInNewContext(source,context);
  context.applyRoleUi('admin');
  assert.equal(tabs[3].style.display,'');
  for (const role of ['catalog_manager','orders_manager','operator']) {
    context.applyRoleUi(role);
    assert.equal(tabs[3].style.display,'none');
  }
});

async function callProtected(url, method, user, request = {}) {
  const jwt = require('jsonwebtoken');
  const layers = app._router.stack.find(layer => layer.route?.path === url && layer.route.methods[method]).route.stack;
  const req = {headers: user ? {authorization: 'Bearer ' + jwt.sign(user, process.env.JWT_SECRET)} : {}, params: {}, body: {}, query: {}, ...request};
  const res = {code:200,status(code){this.code=code;return this;},json(payload){this.payload=payload;return this;}};
  let index = 0;
  const next = () => layers[index++]?.handle(req,res,next);
  await next();
  return res;
}

test('la entrega actual prevalece sobre una incidencia antigua y no inventa fechas en pedidos activos', () => {
  assert.equal(server.customerOrderState(order('done', 'entregado', {history: [{to: 'incidencia', at: '2026-09-28T08:00:00Z'}]})).key, 'entregado');
  assert.equal(server.publicOrder(order('active', 'enviado_a_rutafv', {updatedAt: '2026-09-30T08:00:00Z'})).deliveredAt, null);
  assert.equal(server.customerOrderState(order('replica', 'enviado_a_rutafv', {transport: {rutaFVStatus: 'Entregado'}})).key, 'entregado');
  assert.equal(server.customerOrderState(order('cancelled', 'cancelado', {deliveredAt: '2026-09-28T08:00:00Z'})).key, 'cancelado');
});

test('los avisos de entrega ya registrados reparan el estado sin duplicar avisos ni alterar cancelaciones', () => {
  const d = fixture();
  d.orders = [order('done', 'enviado_a_rutafv'), order('cancelled', 'cancelado'), order('unrelated', 'enviado_a_rutafv')];
  d.customerNotifications = d.orders.map(o => ({id: 'notice-' + o.id, userId: o.id === 'unrelated' ? 'another-user' : customer.id, orderId: o.id, metadata: {key: o.id + ':status:entregado'}, createdAt: '2026-09-30T08:00:00Z'}));
  server.normalizeState(d);
  assert.equal(d.orders[0].status, 'entregado');
  assert.equal(d.orders[0].workflow.deliveredAt, '2026-09-30T08:00:00Z');
  assert.equal(d.orders[1].status, 'cancelado');
  assert.equal(d.orders[2].status, 'enviado_a_rutafv');
  const deliveredReceipts = () => d.customerNotifications.filter(n => n.metadata?.key?.endsWith(':status:entregado'));
  assert.equal(deliveredReceipts().length, 3);
  server.normalizeState(d);
  assert.equal(deliveredReceipts().length, 3);
});

test('la cuenta mueve inmediatamente todos los entregados y conserva pagos, facturas y opiniones', () => {
  const d = fixture();
  d.orders = [order('today', 'entregado', {deliveredAt: new Date().toISOString()}), order('old', 'entregado', {deliveredAt: '2026-09-01T08:00:00Z'}), order('active', 'pagado'), order('foreign', 'entregado', {userId: 'another-user'})];
  d.orderReviews = [{id: 'own-review', orderId: 'old', userId: customer.id, rating: 4, comment: 'Buen servicio'}];
  d.invoices = [{id: 'invoice', userId: customer.id, total: 100}];
  const summary = server.profileSummary(d, customer);
  assert.deepEqual(summary.orders.map(o => o.id), ['active']);
  assert.deepEqual(summary.deliveredOrders.map(o => o.id).sort(), ['old', 'today']);
  assert.equal(summary.deliveredOrders.find(o => o.id === 'old').experienceReview.id, 'own-review');
  assert.equal(summary.payments.length, 3);
  assert.equal(summary.invoices.length, 1);
});

test('la opinión exige pedido propio entregado y validación, persiste una vez y oculta datos privados al publicarse', async () => {
  const d = fixture();
  d.orders = [order('done', 'entregado'), order('active', 'enviado_a_rutafv'), order('foreign', 'entregado', {userId: 'another-user'})];
  fs.writeFileSync(process.env.DATA_FILE, JSON.stringify(d));
  const post = route('/api/orders/:id/review', 'post');
  const req = (id, body = {rating: 5, comment: 'Muy buena compra y entrega.'}) => ({params: {id}, body});
  assert.equal((await call(post, req('foreign'))).code, 404);
  assert.equal((await call(post, req('active'))).code, 409);
  assert.equal((await call(post, req('done', {rating: 6, comment: 'Comentario válido'}))).code, 400);
  assert.equal((await call(post, req('done', {rating: 3, comment: 'no'}))).code, 400);
  const created = await call(post, req('done'));
  assert.equal(created.code, 201);
  assert.equal(created.payload.review.status, 'pending');
  assert.equal(created.payload.review.authorName, 'Ana L.');
  assert.equal((await call(post, req('done'))).code, 409);
  const saved = JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8'));
  assert.equal(saved.orderReviews.length, 1);
  assert.equal(server.profileSummary(saved, customer).deliveredOrders.find(o => o.id === 'done').experienceReview.rating, 5);
  const published = await call(route('/api/reviews/experiences', 'get'));
  assert.equal(published.payload.count, 0);
  const moderated = await call(route('/api/admin/reviews/:kind/:id', 'patch'), {user:{id:'admin-test',role:'admin'},params:{kind:'experience',id:created.payload.review.id},body:{action:'approve'}});
  assert.equal(moderated.payload.review.status, 'approved');
  const visible = await call(route('/api/reviews/experiences', 'get'));
  assert.equal(visible.payload.count, 1);
  assert.equal('userId' in visible.payload.reviews[0], false);
  assert.equal('orderId' in visible.payload.reviews[0], false);
  saved.users.find(u => u.id === customer.id).emailVerified = false;
  saved.orders.push(order('unverified', 'entregado'));
  fs.writeFileSync(process.env.DATA_FILE, JSON.stringify(saved));
  assert.equal((await call(post, req('unverified'))).code, 403);
});

test('el listado del administrador mantiene los entregados visibles y marca la casilla desde cualquier réplica', async () => {
  const data = [order('current', 'entregado'), order('transport', 'enviado_a_rutafv', {transport: {rutaFVStatus: 'Entregado'}}), order('workflow', 'enviado_a_rutafv', {workflow: {deliveredAt: '2026-09-30T08:00:00Z'}}), order('active', 'pagado'), {id: 'unpaid', status: 'pendiente_pago'}];
  const host = {innerHTML: ''};
  const context = {window: {}, orders: host, statOrders: {}, api: async () => data, esc: String, money: String, setTimeout() {}, document: {getElementById: () => null, createElement: () => ({}), head: {appendChild() {}}}};
  vm.runInNewContext(publicScript('fvmarket-admin-orders-v1.js'), context);
  await context.window.loadOrders();
  const $ = cheerio.load('<table><tbody>' + host.innerHTML + '</tbody></table>');
  assert.equal($('tbody tr').length, 4);
  assert.equal($('label').filter((_, label) => $(label).text() === 'Entregado').find('input[checked]').length, 3);
});

test('el Tablero marca Entregado y conserva los pedidos para consultar el reparto', () => {
  const host = {innerHTML: ''};
  const context = {window: {}, document: {getElementById: id => id === 'fvmControlBoard' ? host : null, readyState: 'loading', addEventListener() {}}, setTimeout() {}, setInterval() {}};
  const source = publicScript('fvmarket-admin-control-v2.js').replace(/\}\)\(\);\s*$/, 'window.testBoard={checklist,renderBoard};})();');
  vm.runInNewContext(source, context);
  context.window.testBoard.renderBoard({orders: [order('done', 'entregado'), order('replica', 'enviado_a_rutafv', {deliveryStatus: 'Entregado'}), order('active', 'pagado')]});
  const $ = cheerio.load(host.innerHTML);
  assert.equal($('.fvmBoardColumn.tracking .fvmBoardCard').length, 2);
  assert.equal($('label').filter((_, label) => $(label).text() === 'Entregado').find('input[checked]').length, 2);
});

test('Entregados muestra la opinión por pedido, evita duplicados y Mis pedidos solo muestra los activos', () => {
  const html = publicScript('index.html');
  const inline = cheerio.load(html)('#fvm-accumulated-changes-js-v1').html();
  const context = {window: {}};
  vm.runInNewContext(inline.slice(0, inline.indexOf('window.fvmSelectAccountSection=')) + 'window.testAccount={renderAccountSection};})();', context);
  const render = context.window.testAccount.renderAccountSection;
  const data = {orders: [order('active', 'pagado')], deliveredOrders: [order('today', 'entregado'), order('old', 'entregado', {experienceReview: {rating: 4}})], storedDeliveredOrders: [order('old', 'entregado')]};
  const $ = cheerio.load(render('completed', data));
  assert.equal($('h3').text(), 'Entregados');
  assert.equal($('.fvmOrderCard').length, 2);
  assert.equal($('[data-order-review="today"]').text(), 'Valorar compra y experiencia');
  assert.equal($('[data-order-review="old"]').text(), 'Ver mi opinión');
  assert.match(render('orders', data), /active/);
  assert.doesNotMatch(render('orders', data), /data-order-review/);
});

test('la moderación migra las opiniones antiguas y solo el admin puede aprobar o rechazar ambos tipos', async () => {
  const d = fixture();
  d.products = [{id:'p1',title:'Producto',published:true}];
  d.orders = [order('delivered','entregado',{items:[{productId:'p1',qty:1}]})];
  d.reviews = [{id:'old',productId:'p1',orderId:'delivered',userId:customer.id,comment:'Opinión anterior',rating:4,status:'published',createdAt:'2026-09-29T08:00:00Z'}];
  fs.writeFileSync(process.env.DATA_FILE,JSON.stringify(d));
  const publicProducts = await call(route('/api/products/:id/reviews','get'),{params:{id:'p1'}});
  assert.equal(publicProducts.payload.count,0);
  const list = '/api/admin/reviews', decision = '/api/admin/reviews/:kind/:id';
  assert.equal((await callProtected(list,'get',null)).code,401);
  for(const role of ['customer','orders_manager','catalog_manager','operator']){
    assert.equal((await callProtected(list,'get',{id:customer.id,role})).code,403);
    assert.equal((await callProtected(decision,'patch',{id:customer.id,role},{params:{kind:'product',id:'old'},body:{action:'approve'}})).code,403);
  }
  const administrator={id:'admin-test',role:'admin',name:'Administrador'};
  const pending=await callProtected(list,'get',administrator);
  assert.equal(pending.payload.counts.pending,1);
  assert.equal(pending.payload.reviews[0].status,'pending');
  assert.equal((await callProtected(decision,'patch',administrator,{params:{kind:'product',id:'old'},body:{status:'approved'}})).code,400);
  const approved=await callProtected(decision,'patch',administrator,{params:{kind:'product',id:'old'},body:{action:'approve'}});
  assert.equal(approved.payload.review.status,'approved');
  assert.equal((await call(route('/api/products/:id/reviews','get'),{params:{id:'p1'}})).payload.count,1);
  const rejected=await callProtected(decision,'patch',administrator,{params:{kind:'product',id:'old'},body:{action:'reject',reason:'Datos personales no permitidos'}});
  assert.equal(rejected.payload.review.status,'rejected');
  assert.equal((await call(route('/api/products/:id/reviews','get'),{params:{id:'p1'}})).payload.count,0);
  const saved=JSON.parse(fs.readFileSync(process.env.DATA_FILE,'utf8'));
  assert.equal(saved.auditLog.filter(row=>row.reviewId==='old').length,2);
});

test('el cliente no puede publicar una opinión asignando approved en la solicitud', async () => {
  const d=fixture();d.products=[{id:'p1',title:'Producto',published:true}];d.orders=[order('done','entregado',{items:[{productId:'p1',qty:2}]})];
  fs.writeFileSync(process.env.DATA_FILE,JSON.stringify(d));
  const result=await callProtected('/api/products/:id/reviews','post',customer,{params:{id:'p1'},body:{rating:5,comment:'Buen producto',status:'approved',reviewedBy:{role:'admin'}}});
  assert.equal(result.code,201);assert.equal(result.payload.review.status,'pending');assert.equal(result.payload.summary.count,0);
  const experience=await callProtected('/api/orders/:id/review','post',customer,{params:{id:'done'},body:{rating:5,comment:'Buena compra',status:'approved'}});
  assert.equal(experience.payload.review.status,'pending');
  assert.equal((await call(route('/api/reviews/experiences','get'))).payload.count,0);
});

test('los detalles privados conservan referencia original, proveedor, descripción y cantidad en ambos listados', async () => {
  const d=fixture();
  d.products=[{id:'p1',title:'Actual',description:'Descripción guardada del monomando',sourceRef:'NEW-REF',sourceProvider:'Proveedor nuevo',sourcePrice:90}];
  d.orders=[order('purchase','pagado',{items:[{productId:'p1',title:'Monomando',ref:'FV-1',qty:3,procurement:{provider:'Cofemax',sourceRef:'BT2384',sourcePrice:39}}]})];
  fs.writeFileSync(process.env.DATA_FILE,JSON.stringify(d));
  const admin=await call(route('/api/admin/orders','get'));
  const details=admin.payload[0].purchaseItems[0];
  assert.equal(details.sourceRef,'BT2384');assert.equal(details.provider,'Cofemax');assert.equal(details.qty,3);assert.equal(details.sourceTotal,117);assert.match(details.description,/monomando/);
  const board=await call(route('/api/admin/procurement-board','get'));
  assert.equal(board.payload.orders[0].purchaseItems[0].sourceRef,'BT2384');
  assert.match(board.payload.orders[0].procurementTasks[0].items[0].description,/monomando/);
  assert.equal('purchaseItems' in server.publicOrder(d.orders[0]),false);
});

test('los colores de Pedidos siguen el estado actual y una incidencia resuelta queda verde', async () => {
  const host={innerHTML:''};
  const data=[order('done','entregado',{procurementActions:[{action:'incidencia'}]}),order('incident','incidencia',{deliveredAt:'2026-09-29T08:00:00Z'}),order('active','pagado')];
  const context={window:{},orders:host,statOrders:{},api:async()=>data,esc:String,money:String,setTimeout(){},document:{getElementById:()=>null,createElement:()=>({}),head:{appendChild(){}}}};
  vm.runInNewContext(publicScript('fvmarket-admin-orders-v1.js'),context);await context.window.loadOrders();
  const $=cheerio.load('<table>'+host.innerHTML+'</table>');
  assert.equal($('.fvmOrderState-entregado').length,1);assert.equal($('.fvmOrderState-incidencia').length,1);
  assert.match($('.fvmOrderState-entregado').text(),/done/);assert.match($('.fvmOrderState-incidencia').text(),/incident/);
});

test('una entrega recibida mientras la cuenta está abierta mueve la tarjeta sin recargar la página', async () => {
  const host={innerHTML:''},modal={classList:{contains:()=>true}};
  const d=fixture();d.orders=[order('live','enviado_a_rutafv')];
  const document={hidden:false,getElementById:id=>id==='fvmAccountContent'?host:id==='accountModal'?modal:null,querySelectorAll:()=>[],addEventListener(){}};
  const context={window:{},document,session:{token:'local-session'},setInterval(){},api:async()=>server.profileSummary(d,customer)};
  const inline=cheerio.load(publicScript('index.html'))('#fvm-accumulated-changes-js-v1').html();
  vm.runInNewContext(inline.slice(0,inline.indexOf('window.fvmOpenOrderReview='))+'window.testAccount={loadProfileSummary,refreshVisibleAccount};})();',context);
  context.fvmSelectAccountSection=context.window.fvmSelectAccountSection;
  await context.window.testAccount.loadProfileSummary('orders');assert.match(host.innerHTML,/live/);
  d.orders[0].status='entregado';d.orders[0].deliveredAt=new Date().toISOString();
  await context.window.testAccount.refreshVisibleAccount();assert.doesNotMatch(host.innerHTML,/\blive\b/);
  await context.window.testAccount.loadProfileSummary('completed');assert.match(host.innerHTML,/live/);assert.match(host.innerHTML,/Valorar compra y experiencia/);
});

test('el detalle al pulsar un producto muestra todos los datos y escapa el contenido', () => {
  let addedModal;
  const button={focus(){}};
  const document={activeElement:button,getElementById:()=>null,addEventListener(){},head:{appendChild(){}},body:{appendChild(modal){addedModal=modal;}},createElement:()=>({setAttribute(){},querySelector:()=>button,remove(){}})};
  const context={window:{},document};vm.runInNewContext(publicScript('fvmarket-admin-purchase-details-v1.js'),context);
  const item={title:'Monomando',description:'Texto <script>alert(1)</script>',provider:'Cofemax',sourceRef:'BT2384',ref:'ML0001',qty:3,sourcePrice:39,sourceTotal:117};
  const o=order('detail','pagado',{purchaseItems:[item]});
  context.window.fvmSetPurchaseOrders([o]);context.window.fvmOpenPurchaseDetails('detail',0);
  const $=cheerio.load(addedModal.innerHTML);
  assert.match($('.fvmPurchaseDescription').text(),/<script>/);assert.equal($('script').length,0);
  assert.match($('dl').text(),/Cofemax/);assert.match($('dl').text(),/BT2384/);assert.match($('dl').text(),/3 unidades/);assert.match($('dl').text(),/117,00/);
  assert.match(context.window.fvmPurchaseDetailButton(o,0,item),/data-purchase-order="detail"/);
});
