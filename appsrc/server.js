// FVM_TAXONOMY_V2
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const cheerio = require('cheerio');
const Stripe = require('stripe');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const {prepareImages} = require('./free_image_prep');
const {registerProviderSourceRoutes} = require('./supplier_capture_v13');
const persistence = require('./persistent_store_v17');
const transactionalEmails = require('./transactional_emails');
const operations = require('./operations_accounting_v1');
const procurementV2 = require('./procurement_v2');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.createHash('sha256').update('fvmarket-dev-' + (process.env.RENDER_SERVICE_ID || 'local')).digest('hex');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
persistence.config(DATA_FILE);
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
// FVM_CUSTOMER_ACCOUNTS_V2
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || '').trim();
const PUBLIC_URL = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/,'');
const INITIAL_ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase() || 'admin';
const INITIAL_ADMIN_PIN = String(process.env.ADMIN_PIN || '3669').trim() || '3669';
const STAFF_ROLE_KEYS = new Set(['admin','catalog_manager','orders_manager','operator']);
const STAFF_ROLE_LABELS = {admin:'Administrador principal',catalog_manager:'Gestor de catálogo',orders_manager:'Gestor de presupuestos y pedidos',operator:'Operador'};
const WAREHOUSE_STATUS_KEYS = new Set(['available','review','reserved','unavailable','retired']);
const WAREHOUSE_STATUS_LABELS = {available:'Disponible',review:'En revisión',reserved:'Reservado',unavailable:'No disponible',retired:'Retirado'};
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '');
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-5.6-luna');
const OPENAI_IMAGE_MODEL = String(process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');
const GOOGLE_CSE_API_KEY = String(process.env.GOOGLE_CSE_API_KEY || '');
const GOOGLE_CSE_CX = String(process.env.GOOGLE_CSE_CX || '');
const BRAVE_SEARCH_API_KEY = String(process.env.BRAVE_SEARCH_API_KEY || '');
const RUTAFV_API_URL = String(process.env.RUTAFV_API_URL || '').trim().replace(/\/$/,'');
const RUTAFV_API_KEY = String(process.env.RUTAFV_API_KEY || '').trim();
const RUTAFV_CLIENT_CODE = String(process.env.RUTAFV_CLIENT_CODE || 'FVMarket').trim();
const RUTAFV_QUOTE_PATH = String(process.env.RUTAFV_QUOTE_PATH || '/api/integrations/fvmarket/quote').trim();
const RUTAFV_DELIVERY_PATH = String(process.env.RUTAFV_DELIVERY_PATH || '/api/integrations/fvmarket/deliveries').trim();
const RUTAFV_CLIENT_PATH = String(process.env.RUTAFV_CLIENT_PATH || '/api/integrations/fvmarket/client').trim();
const FVMARKET_FISCAL_ORIGIN = String(process.env.FVMARKET_FISCAL_ORIGIN || '').trim();
const RUTAFV_QUOTE_CACHE_TTL_MS = 120000;
const RUTAFV_QUOTE_MIN_INTERVAL_MS = 3500;
const rutafvQuoteCache = new Map();
const rutafvQuoteInflight = new Map();
const rutafvQuoteLastExternal = new Map();
let rutafvQuoteCircuitOpenUntil = 0;
function rutafvQuoteKey(userId, origin, destination, items){
  const normalizedItems=(items||[]).map(x=>({id:String(x.id||''),qty:Math.max(1,Number(x.qty)||1)})).sort((a,b)=>a.id.localeCompare(b.id));
  return crypto.createHash('sha256').update(JSON.stringify({userId,origin,destination,items:normalizedItems})).digest('hex');
}
function pruneRutaFVQuoteState(now=Date.now()){
  for(const [key,value] of rutafvQuoteCache)if(!value||value.expiresAt<=now)rutafvQuoteCache.delete(key);
  for(const [userId,value] of rutafvQuoteLastExternal)if(now-value>RUTAFV_QUOTE_CACHE_TTL_MS)rutafvQuoteLastExternal.delete(userId);
  if(rutafvQuoteCache.size>250){const oldest=[...rutafvQuoteCache.entries()].sort((a,b)=>a[1].expiresAt-b[1].expiresAt).slice(0,rutafvQuoteCache.size-200);for(const [key] of oldest)rutafvQuoteCache.delete(key);}
}
app.post('/api/stripe/webhook',express.raw({type:'application/json'}),async(req,res)=>{
  if(!stripe||!STRIPE_WEBHOOK_SECRET)return res.status(503).json({error:'Webhook de Stripe no configurado'});
  const signature=String(req.headers['stripe-signature']||'');let event;
  try{event=stripe.webhooks.constructEvent(req.body,signature,STRIPE_WEBHOOK_SECRET)}catch(e){return res.status(400).json({error:'Firma de Stripe no válida'})}
  if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
    const s=event.data.object||{};
    if(s.payment_status==='paid'||event.type.endsWith('succeeded')){
      const d=read();const o=d.orders.find(x=>x.stripeSessionId===s.id||x.id===String(s.metadata?.orderId||''));
      if(o){o.status=paidOrderStatus(o.status)?o.status:'pagado';o.paidAt=o.paidAt||new Date().toISOString();o.paymentIntentId=String(typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent?.id||'');o.stripePaymentStatus=String(s.payment_status||'paid');o.fulfillment=o.fulfillment||{status:'pendiente_compra_proveedor',readyForRutaFV:false};operations.recordPaymentConfirmation(d,o,{id:'stripe_webhook',name:'Pago online',role:'system'});procurementV2.ensureData(d);if(o.quoteId){const q=(d.quotes||[]).find(x=>x.id===o.quoteId);if(q){q.status='pagado';q.paidAt=q.paidAt||o.paidAt}}const invoice=issueInvoiceForOrder(d,o);if(invoice)operations.recordInvoiceIssued(d,o,invoice,{id:'stripe_webhook',name:'Pago online',role:'system'});if(orderReadyForRutaFV(o)){try{await createRutaFVDelivery(d,o)}catch(error){o.transport=o.transport||{};o.transport.status='error_sincronizacion';o.transport.syncError=String(error.message||error);o.transport.syncAt=new Date().toISOString()}}else{o.transport=o.transport||{};o.transport.status='pendiente_disponibilidad_proveedores'}save(d);scheduleOrderEmail(req,o.id,'order_confirmation');if(invoice)scheduleOrderEmail(req,o.id,'invoice_issued')}
    }
  }
  res.json({received:true});
});
// FVM_CATALOG_TRANSPORT_V1
// FVM_PROVIDER_BRAVE_IMAGES_V3
app.use(express.json({limit:'30mb'}));
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});
app.use(express.static(path.join(__dirname,'public')));

const defaultProducts = [
  {id:'p1',title:'Cemento Portland CEM II/B-M 32,5R 25 kg',category:'Construcción',ref:'FVM-CEM-325',price:4.25,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p2',title:'Taladro percutor profesional 710 W',category:'Herramientas',ref:'FVM-TAL-710',price:119.90,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p3',title:'Pintura plástica interior mate 15 L',category:'Pintura',ref:'FVM-PIN-15L',price:39.95,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p4',title:'Inodoro completo salida dual',category:'Baño y cocina',ref:'FVM-WC-DUAL',price:189.00,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p5',title:'Carretilla de jardín 100 L rueda neumática',category:'Jardín',ref:'FVM-CAR-100',price:74.90,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1599685315640-68d303c222b9?auto=format&fit=crop&w=700&q=80',published:true,featured:true}
];
function cloneDefaultProducts(){return defaultProducts.map(p=>({...p,images:p.image?[{url:p.image,origin:'seed'}]:[]}))}
function ensureCatalogData(d){
  let changed=false;
  if(!Array.isArray(d.products)){
    d.products=[];
    changed=true;
  }
  const validProducts=d.products.filter(p=>p&&typeof p==='object');
  if(validProducts.length!==d.products.length){
    d.products=validProducts;
    changed=true;
  }
  if(!d.products.length){
    d.products=cloneDefaultProducts();
    d.settings=d.settings||{};
    d.settings.catalogRecovery='seed_default_products';
    d.settings.catalogRecoveryAt=new Date().toISOString();
    changed=true;
  }
  for(const p of d.products){
    // Products from the pre-publication schema were visible by default. Restore
    // that behavior only when the field never existed; explicit drafts remain drafts.
    if(!Object.prototype.hasOwnProperty.call(p,'published')&&!p.reviewStatus){p.published=true;changed=true}
    if(p.featured==null){p.featured=false;changed=true}
    if(p.onOffer==null){p.onOffer=false;changed=true}
    if(p.discountPct==null){p.discountPct=0;changed=true}
  }
  return changed;
}
function seed(){return {users:[],products:cloneDefaultProducts(),orders:[],quotes:[],settings:{deliveryBase:0,igic:7,storeName:'FVMarket',categories:['Construcción','Bricolaje','Herramientas','Reformas'],subcategories:{'Reformas':['Baño','Cocina','Fontanería','Electricidad'],'Bricolaje':['Adhesivos y selladores','Fijaciones','Organización','Reparación']}}}}
function save(d){fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2));persistence.persist(d)}
function ensureAdmin(d){
  if(!Array.isArray(d.users))d.users=[];
  d.settings=d.settings||{};
  let changed=false;
  let u=d.users.find(x=>x.role==='admin');
  if(!u){
    u={id:id('usr'),name:'Administrador FVMarket',username:INITIAL_ADMIN_USERNAME,email:INITIAL_ADMIN_USERNAME+'@fvmarket.local',password:bcrypt.hashSync(INITIAL_ADMIN_PIN,12),role:'admin',emailVerified:true,createdAt:new Date().toISOString()};
    d.users.unshift(u);changed=true;
  }
  if(!d.settings.adminCredentialsInitializedV14){
    u.username='admin';u.email='admin@fvmarket.local';u.password=bcrypt.hashSync('3669',12);u.role='admin';u.emailVerified=true;
    d.settings.adminCredentialsInitializedV14=true;changed=true;
  }else{
    if(!String(u.username||'').trim()){u.username=INITIAL_ADMIN_USERNAME;changed=true}
    if(!u.password){u.password=bcrypt.hashSync(INITIAL_ADMIN_PIN,12);changed=true}
    if(!u.emailVerified){u.emailVerified=true;changed=true}
  }
  return changed;
}
function ensureCatalogProducts(d){
  if(!Array.isArray(d.products))d.products=[];
  const visible=d.products.some(p=>p&&p.published===true&&p.warehouseStatus!=='retired');
  if(visible)return false;
  if(!d.products.length||d.products.every(p=>!p||p.warehouseStatus==='retired')){
    d.products=defaultProducts.map(p=>({...p}));
    return true;
  }
  let changed=false;
  for(const p of d.products){
    if(p&&p.warehouseStatus!=='retired'&&p.published!==true){p.published=true;changed=true}
  }
  return changed;
}
function read(){
  try{
    const d=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    const changedAdmin=ensureAdmin(d);
    const changedCatalogData=ensureCatalogData(d);
    const changedCatalog=ensureCatalogProducts(d);
    ensureCustomerData(d);ensureBillingData(d);ensureCatalogSettings(d);ensureWarehouseData(d);ensureLogisticsSettings(d);operations.ensureOperationsData(d);procurementV2.ensureData(d);
    if(changedAdmin||changedCatalogData||changedCatalog)save(d);else save(d);
    return d;
  }catch(e){
    const d=seed();ensureAdmin(d);ensureCatalogData(d);ensureCustomerData(d);ensureBillingData(d);ensureCatalogSettings(d);ensureWarehouseData(d);ensureLogisticsSettings(d);operations.ensureOperationsData(d);procurementV2.ensureData(d);save(d);return d;
  }
}
function id(prefix){return prefix+'_'+crypto.randomBytes(7).toString('hex')}
function token(u){return jwt.sign({id:u.id,email:u.email,username:u.username||'',role:u.role},JWT_SECRET,{expiresIn:'30d'})}
function auth(req,res,next){const h=req.headers.authorization||'';const t=h.startsWith('Bearer ')?h.slice(7):'';try{req.user=jwt.verify(t,JWT_SECRET);next()}catch(e){res.status(401).json({error:'Sesión no válida'})}}
function optionalAuth(req,res,next){const h=String(req.headers.authorization||'');const t=h.startsWith('Bearer ')?h.slice(7):'';if(!t){req.user=null;return next()}try{req.user=jwt.verify(t,JWT_SECRET)}catch{req.user=null}next()}
function requestActorId(req){if(req.user?.id)return String(req.user.id);const raw=String(req.body?.guestId||req.query?.guestId||'').trim();return /^[A-Za-z0-9_-]{12,96}$/.test(raw)?'guest:'+raw:''}
function admin(req,res,next){auth(req,res,()=>req.user.role==='admin'?next():res.status(403).json({error:'Acceso de administrador requerido'}))}
function staffWith(...roles){return (req,res,next)=>auth(req,res,()=>roles.includes(req.user.role)?next():res.status(403).json({error:'No tienes permisos para esta sección'}))}
const staffCatalogView=staffWith('admin','catalog_manager','operator');
const catalogEditor=staffWith('admin','catalog_manager');
const ordersManager=staffWith('admin','orders_manager');
const staffAccess=staffWith('admin','catalog_manager','orders_manager','operator');
function normalizeWarehouseStatus(value,published=false){const status=String(value||'');return WAREHOUSE_STATUS_KEYS.has(status)?status:(published?'available':'review')}
function ensureWarehouseData(d){for(const p of d.products||[]){p.warehouseStatus=normalizeWarehouseStatus(p.warehouseStatus,!!p.published);if(p.warehouseTask==null)p.warehouseTask='';if(p.warehouseAssignee==null)p.warehouseAssignee=''}}
function ensureCustomerData(d){
  if(!Array.isArray(d.quotes))d.quotes=[];
  if(!Array.isArray(d.users))d.users=[];
  for(const u of d.users){
    if(u.role==='admin'){u.emailVerified=true;continue}
    if(u.emailVerified==null)u.emailVerified=true;
    if(!u.deliveryAddress||typeof u.deliveryAddress!=='object')u.deliveryAddress={};
    if(u.firstName==null)u.firstName='';if(u.lastName==null)u.lastName='';if(u.nifNie==null)u.nifNie='';if(u.phone==null)u.phone='';if(u.billingName==null)u.billingName='';if(u.billingAddress==null)u.billingAddress='';if(u.billingCity==null)u.billingCity='';if(u.billingPostalCode==null)u.billingPostalCode='';
  }
}
function ensureLogisticsSettings(d){
  d.settings=d.settings||{};
  if(d.settings.fulfillmentModel==null)d.settings.fulfillmentModel='sin_stock_fisico';
  if(d.settings.deliveryMode==null)d.settings.deliveryMode='normal_planificado';
  if(d.settings.rutaFVClientCode==null)d.settings.rutaFVClientCode=RUTAFV_CLIENT_CODE;
  if(d.settings.rutaFVClientQr==null)d.settings.rutaFVClientQr='FVMarket';
  if(d.settings.rutaFVClientStatus==null)d.settings.rutaFVClientStatus='pendiente_configuracion';
  if(d.settings.rutaFVDeliveryDateMode==null)d.settings.rutaFVDeliveryDateMode='gestion_rutafv';
  const fiscalOrigin=[d.settings.fiscalAddress,d.settings.fiscalCity,d.settings.fiscalPostalCode].filter(Boolean).join(', ').trim();
  const configuredOrigin=String(d.settings.rutaFVOrigin||'').trim();
  const matchesFiscalOrigin=!!(configuredOrigin&&fiscalOrigin&&configuredOrigin===fiscalOrigin);
  if(d.settings.rutaFVOriginAuto===true||!configuredOrigin||matchesFiscalOrigin){
    const fallback=fiscalOrigin||FVMARKET_FISCAL_ORIGIN||'';
    d.settings.rutaFVOrigin=fallback;
    d.settings.rutaFVOriginAuto=true;
  }else{
    d.settings.rutaFVOrigin=configuredOrigin;
    d.settings.rutaFVOriginAuto=false;
  }
}
function fvmarketOrigin(d){
  const s=d.settings||{};
  return String(s.rutaFVOrigin||[s.fiscalAddress,s.fiscalCity,s.fiscalPostalCode].filter(Boolean).join(', ')||FVMARKET_FISCAL_ORIGIN||'').trim();
}
function fvmarketOriginSnapshot(d){
  const s=d.settings||{},auto=s.rutaFVOriginAuto!==false,label=fvmarketOrigin(d);
  return {
    label,
    address:auto?String(s.fiscalAddress||'').trim():label,
    city:auto?String(s.fiscalCity||'').trim():'',
    postalCode:auto?String(s.fiscalPostalCode||'').trim():'',
    source:'FVMarket'
  };
}
function ensureBillingData(d){
  d.settings=d.settings||{};if(!Array.isArray(d.invoices))d.invoices=[];
  if(d.settings.invoicePrefix==null)d.settings.invoicePrefix='FVM-FAC';if(d.settings.invoiceSequence==null)d.settings.invoiceSequence=0;if(d.settings.igic==null)d.settings.igic=7;
  if(d.settings.fiscalName==null)d.settings.fiscalName=d.settings.storeName||'FVMarket';if(d.settings.fiscalNif==null)d.settings.fiscalNif='';if(d.settings.fiscalAddress==null)d.settings.fiscalAddress='';if(d.settings.fiscalCity==null)d.settings.fiscalCity='';if(d.settings.fiscalPostalCode==null)d.settings.fiscalPostalCode='';if(d.settings.invoiceFooter==null)d.settings.invoiceFooter='Gracias por confiar en FVMarket.';
  for(const o of d.orders||[])if(paidOrderStatus(o.status))issueInvoiceForOrder(d,o);
}
function cleanNifNie(v=''){return String(v).toUpperCase().replace(/[\s-]/g,'')}
function validNifNie(v=''){
  const x=cleanNifNie(v);const letters='TRWAGMYFPDXBNJZSQVHLCKE';
  let digits='',letter='';
  if(/^\d{8}[A-Z]$/.test(x)){digits=x.slice(0,8);letter=x.slice(8)}
  else if(/^[XYZ]\d{7}[A-Z]$/.test(x)){digits=({X:'0',Y:'1',Z:'2'})[x[0]]+x.slice(1,8);letter=x.slice(8)}
  else return false;
  return letters[Number(digits)%23]===letter;
}
function customerProfileComplete(u={}){
  if(STAFF_ROLE_KEYS.has(u.role))return true;
  const a=u.deliveryAddress||{};
  return !!(u.emailVerified&&String(u.firstName||'').trim()&&String(u.lastName||'').trim()&&validNifNie(u.nifNie)&&String(u.billingAddress||'').trim()&&String(a.address||'').trim()&&a.validated===true);
}
function safeUser(u){return {id:u.id,name:String(u.name||[u.firstName,u.lastName].filter(Boolean).join(' ')).trim(),firstName:u.firstName||'',lastName:u.lastName||'',nifNie:u.nifNie||'',phone:u.phone||'',billingName:u.billingName||'',billingAddress:u.billingAddress||'',billingCity:u.billingCity||'',billingPostalCode:u.billingPostalCode||'',deliveryAddress:u.deliveryAddress||{},email:u.email,username:u.username||'',role:u.role,roleLabel:STAFF_ROLE_LABELS[u.role]||'Cliente',internal:STAFF_ROLE_KEYS.has(u.role),active:u.active!==false,emailVerified:!!u.emailVerified,profileComplete:customerProfileComplete(u),createdAt:u.createdAt}}
function verificationHash(v=''){return crypto.createHash('sha256').update(String(v)).digest('hex')}
function newVerificationToken(){return crypto.randomBytes(32).toString('hex')}
function baseUrl(req){return PUBLIC_URL||`${req.protocol}://${req.get('host')}`}
async function sendResendEmail({to,subject,html,text=''}){
  if(!RESEND_API_KEY||!EMAIL_FROM)return {sent:false,reason:'email_not_configured'};
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:EMAIL_FROM,to:[to],subject,html,text})});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data.message||data.error||'No se pudo enviar el correo');
  return {sent:true,id:data.id||''};
}
async function sendVerificationEmail(req,u,rawToken){
  if(!RESEND_API_KEY||!EMAIL_FROM)return {sent:false,reason:'email_not_configured'};
  const verifyUrl=`${baseUrl(req)}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
  return sendResendEmail({to:u.email,subject:'Verifica tu cuenta FVMarket',html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2 style="color:#06345f">Verifica tu cuenta FVMarket</h2><p>Confirma tu correo electrónico para activar tu cuenta.</p><p><a href="${verifyUrl}" style="display:inline-block;background:#35a33a;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Verificar correo</a></p><p style="font-size:12px;color:#64748b">El enlace caduca en 24 horas.</p></div>`,text:`Verifica tu cuenta FVMarket: ${verifyUrl}`});
}
async function sendPasswordResetEmail(req,u,rawToken){
  if(!RESEND_API_KEY||!EMAIL_FROM)return {sent:false,reason:'email_not_configured'};
  const resetUrl=`${baseUrl(req)}/?reset=${encodeURIComponent(rawToken)}`;
  return sendResendEmail({to:u.email,subject:'Restablece tu contraseña de FVMarket',html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2 style="color:#06345f">Restablece tu contraseña</h2><p>Hemos recibido una solicitud para cambiar la contraseña de tu cuenta FVMarket.</p><p><a href="${resetUrl}" style="display:inline-block;background:#35a33a;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Crear nueva contraseña</a></p><p style="font-size:12px;color:#64748b">El enlace caduca en 30 minutos. Si no solicitaste este cambio, puedes ignorar este correo.</p></div>`,text:`Restablece tu contraseña de FVMarket: ${resetUrl}`});
}
function invoiceEmailToken(invoice={}){return crypto.createHmac('sha256',JWT_SECRET).update(`fvmarket-invoice:${invoice.id}:${invoice.orderId}`).digest('hex')}
function invoicePublicUrl(req,invoice={}){return `${baseUrl(req)}/api/invoices/${encodeURIComponent(invoice.id)}/print?token=${encodeURIComponent(invoiceEmailToken(invoice))}`}
function orderRecipient(d,o){const u=(d.users||[]).find(x=>x.id===o.userId)||{};return String(o.customer?.email||u.email||'').trim().toLowerCase()}
function emailEventExists(o,event){return !!(o.emailEvents&&o.emailEvents[event]?.sentAt)}
const EMAIL_IN_FLIGHT=new Set();
function emailForOrderEvent(req,d,o,event,extra={}){
  const invoice=(d.invoices||[]).find(x=>x.id===o.invoiceId||x.orderId===o.id)||null;
  if(event==='order_received')return transactionalEmails.orderReceived(o);
  if(event==='order_confirmation')return transactionalEmails.orderConfirmation(o,invoice?invoicePublicUrl(req,invoice):'');
  if(event==='invoice_issued')return invoice?transactionalEmails.invoice(o,invoice,invoicePublicUrl(req,invoice)):null;
  if(event==='payment_link_created')return transactionalEmails.paymentLink(o,extra.paymentLinkUrl||o.stripePaymentLinkUrl||'');
  if(event==='delivery_in_transit')return transactionalEmails.delivery(o,'en_reparto');
  if(event==='delivery_completed')return transactionalEmails.delivery(o,'entregado');
  if(event.startsWith('refund:'))return transactionalEmails.refund(o,extra.refund||{});
  return null;
}
async function sendOrderEmail(req,orderId,event,extra={}){
  const flightKey=`${orderId}:${event}`;if(EMAIL_IN_FLIGHT.has(flightKey))return {sent:true,duplicate:true};EMAIL_IN_FLIGHT.add(flightKey);
  try{
  const d=read();const o=(d.orders||[]).find(x=>x.id===orderId);if(!o)return {sent:false,reason:'order_not_found'};
  const to=orderRecipient(d,o);if(!to)return {sent:false,reason:'customer_email_missing'};
  if(emailEventExists(o,event))return {sent:true,duplicate:true};
  const message=emailForOrderEvent(req,d,o,event,extra);if(!message)return {sent:false,reason:'email_template_missing'};
  const result=await sendResendEmail({to,subject:message.subject,html:message.html,text:message.text});
  if(result.sent){o.emailEvents=o.emailEvents||{};o.emailEvents[event]={sentAt:new Date().toISOString(),resendId:result.id||''};save(d)}
  return result;
  }finally{EMAIL_IN_FLIGHT.delete(flightKey)}
}
function scheduleOrderEmail(req,orderId,event,extra={}){
  setImmediate(()=>sendOrderEmail(req,orderId,event,extra).catch(error=>console.error(`FVMarket email ${event}:`,error.message)));
}
function requireCustomerReady(req,res,next){
  const u=read().users.find(x=>x.id===req.user.id);if(!u)return res.status(401).json({error:'Cuenta no encontrada'});
  req.customer=u;
  if(u.role==='admin')return next();
  if(!u.emailVerified)return res.status(403).json({error:'Debes verificar tu correo electrónico antes de continuar'});
  if(!customerProfileComplete(u))return res.status(409).json({error:'Completa tu perfil: nombre, apellidos, NIF/NIE, dirección de facturación y dirección de entrega validada'});
  req.customer=u;next();
}

// FVM_PRIVATE_PROCUREMENT_V1
function publicProduct(p={}){
  const {sourceUrl,sourcePrice,sourceRef,sourceEan,sourceProvider,sourceBrand,sourceAvailability,sourceTaxNote,sourceCheckedAt,sourceSync,margin,addedValue,imageSource,imageLicense,imageAuthor,sourceImages,sourceStore,sourceSeller,providerKey,supplierId,...safe}=p;
  if(Array.isArray(safe.images))safe.images=safe.images.map(x=>typeof x==='string'?x:{url:x.url}).filter(x=>x.url);
  safe.regularPrice=Number(safe.price||0);safe.salePrice=offerPrice(safe);safe.hasDiscount=!!(safe.onOffer&&Number(safe.discountPct)>0);return safe;
}
function publicOrder(o={}){
  const {stripeSessionId,paymentIntentId,stripePaymentStatus,emailEvents,refunds,...safe}=o;
  const paymentMethod=String(safe.paymentMethod||'').toLowerCase()==='stripe'?'Pago online':(safe.paymentMethod||'');
  return {...safe,paymentMethod,refunds:Array.isArray(refunds)?refunds.map(({stripeRefundId,...refund})=>refund):refunds,items:(o.items||[]).map(({procurement,...item})=>item)};
}
function providerFromUrl(raw=''){
  try{
    const h=new URL(String(raw)).hostname.toLowerCase().replace(/^www\./,'');
    const known={
      'mibricolaje.com':'Mi Bricolaje','obramat.es':'Obramat','leroymerlin.es':'Leroy Merlin','bauhaus.es':'BAUHAUS',
      'bricodepot.es':'Brico Depôt','manomano.es':'ManoMano','amazon.es':'Amazon','bigmat.es':'BigMat'
    };
    if(known[h])return known[h];
    const parts=h.split('.');
    const base=(parts.length>2&&['com','co','net','org'].includes(parts[parts.length-2]))?parts[parts.length-3]:parts[0];
    return String(base||h).replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }catch{return ''}
}


function ensureCatalogSettings(d){
  d.settings=d.settings||{};
  const main=['Construcción','Herramientas','Fontanería','Electricidad','Pintura','Jardín','Baño y cocina','Bricolaje','Reformas'];
  d.settings.categories=main.slice();
  if(!d.settings.subcategories||typeof d.settings.subcategories!=='object')d.settings.subcategories={};
  const defaults={
    'Construcción':['Cementos y morteros','Bloques y ladrillos','Azulejos y pavimentos','Aislamiento','Madera'],
    'Herramientas':['Eléctricas','Manuales','Medición','Taller','Accesorios'],
    'Fontanería':['Tuberías','Racores','Válvulas','Bombas','Accesorios'],
    'Electricidad':['Mecanismos','Cableado','Protección','Iluminación','Accesorios'],
    'Pintura':['Interior','Exterior','Esmaltes','Preparación','Accesorios'],
    'Jardín':['Riego','Herramientas de jardín','Mobiliario','Maquinaria','Cultivo'],
    'Baño y cocina':['Grifería','Sanitarios','Mamparas','Muebles de baño','Cocina'],
    'Bricolaje':['Adhesivos y selladores','Fijaciones','Organización','Reparación'],
    'Reformas':[]
  };
  for(const [cat,subs] of Object.entries(defaults)){
    const current=Array.isArray(d.settings.subcategories[cat])?d.settings.subcategories[cat]:[];
    d.settings.subcategories[cat]=[...new Set([...current,...subs])];
  }
  for(const p of d.products||[]){
    const old=String(p.category||'');
    const sub=String(p.subcategory||'');
    const title=String(p.title||'');
    if(old==='Baño'||old==='Cocina'){
      p.category='Baño y cocina';
      if(!sub)p.subcategory=old;
    }else if(old==='Reformas'){
      if(sub==='Fontanería'||sub==='Electricidad')p.category=sub;
      else if(sub==='Baño'||sub==='Cocina'||/inodoro|sanitario|grifer|mampara|lavabo|fregader|cocina|encimera|mueble de baño/i.test(title))p.category='Baño y cocina';
    }else if(old==='Bricolaje'){
      if(/pintur|esmalte|imprimaci|barniz|rodillo|brocha/i.test(title))p.category='Pintura';
      else if(/jard[ií]n|riego|césped|cesped|maceta|carretilla|piscina|podador|cortacésped|cortacesped/i.test(title))p.category='Jardín';
    }
    if(p.onOffer==null)p.onOffer=false;
    if(p.discountPct==null)p.discountPct=0;
    if(p.subcategory==null)p.subcategory='';
  }
}
function refPrefix(title=''){
  const stop=new Set(['DE','DEL','LA','LAS','EL','LOS','Y','E','CON','PARA','POR','EN','UN','UNA','UNO','KIT','PACK']);
  const words=String(title||'PRODUCTO').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(Boolean).filter(x=>!stop.has(x)&&/[A-Z]/.test(x));
  if(words.length>=2)return (words[0][0]+words[1][0]).slice(0,2);
  if(words.length===1)return (words[0].replace(/[^A-Z]/g,'')+'X').slice(0,2);
  return 'PR';
}
function nextProductRef(d,title,category){
  const prefix=refPrefix(title);let max=0;
  for(const p of d.products||[]){const m=String(p.ref||'').toUpperCase().match(new RegExp('^'+prefix+'(\\d{4})$'));if(m)max=Math.max(max,Number(m[1])||0)}
  return `${prefix}${String(max+1).padStart(4,'0')}`;
}
function offerPrice(p){const pct=Math.max(0,Math.min(90,Number(p.discountPct)||0));return p.onOffer&&pct?+(Number(p.price||0)*(1-pct/100)).toFixed(2):Number(p.price||0)}
function rutaFVErrorMessage(value,fallback=''){
  if(Array.isArray(value))return value.map(x=>rutaFVErrorMessage(x,'')).filter(Boolean).join('; ');
  if(value&&typeof value==='object'){
    const nested=value.message??value.detail??value.msg??value.error;
    if(nested!==undefined)return rutaFVErrorMessage(nested,fallback);
    try{return JSON.stringify(value)}catch{return ''}
  }
  return String(value??fallback).trim();
}
async function rutaFVRequest(pathname,payload){
  if(!RUTAFV_API_URL)throw new Error('RutaFV no está configurado');
  const headers={'Content-Type':'application/json'};if(RUTAFV_API_KEY)headers.Authorization='Bearer '+RUTAFV_API_KEY;
  const timeoutMs=pathname===RUTAFV_QUOTE_PATH?60000:30000;const r=await fetch(RUTAFV_API_URL+pathname,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(timeoutMs)});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok){
    const error=new Error(rutaFVErrorMessage(data.error??data.detail??data.message,`RutaFV HTTP ${r.status}`));
    error.status=r.status;error.retryAfter=Number(r.headers.get('retry-after')||0)||0;throw error;
  }
  return data;
}
async function rutaFVGet(pathname,params={}){
  if(!RUTAFV_API_URL)throw new Error('RutaFV no está configurado');
  const headers={};if(RUTAFV_API_KEY)headers.Authorization='Bearer '+RUTAFV_API_KEY;
  const qs=new URLSearchParams(params).toString();
  const r=await fetch(RUTAFV_API_URL+pathname+(qs?'?'+qs:''),{headers,signal:AbortSignal.timeout(15000)});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data.error||data.detail||`RutaFV HTTP ${r.status}`);return data;
}
function transportQuoteSignature(userId,amount,quoteId,items){const refs=(items||[]).map(x=>`${x.id||x.productId}:${Number(x.qty)||1}`).sort().join('|');return crypto.createHmac('sha256',JWT_SECRET).update(`${userId}|${Number(amount||0).toFixed(2)}|${quoteId||''}|${refs}`).digest('hex')}
function transportDestination(destination={}){return {address:String(destination.address||'').trim(),city:String(destination.city||'').trim(),postalCode:String(destination.postalCode||'').trim()}}
function sameTransportDestination(a={},b={}){const x=transportDestination(a),y=transportDestination(b);return !x.address&&!x.city&&!x.postalCode||(!y.address&&!y.city&&!y.postalCode)||['address','city','postalCode'].every(k=>x[k].toLowerCase()===y[k].toLowerCase())}
function decorateTransportQuote(q={},userId,items=[],destination={}){const amount=Math.max(0,Number(q.amount??q.total??0));const quoteId=String(q.id||q.quoteId||'');return {...q,amount,deliveryMode:'normal',express:false,estimatedDeliveryDate:q.estimatedDeliveryDate||q.deliveryDate||null,deliveryDateStatus:q.deliveryDateStatus||'pendiente_planificacion',_fvmDestination:transportDestination(destination),_fvmSignature:transportQuoteSignature(userId,amount,quoteId,items)}}
function validTransportQuote(q,userId,items=[],destination={}){if(!q||q.deliveryMode==='express'||q.express===true||!sameTransportDestination(q._fvmDestination,destination))return false;const amount=Math.max(0,Number(q.amount??q.total??0));const quoteId=String(q.id||q.quoteId||'');const actual=Buffer.from(String(q._fvmSignature||''));const expected=Buffer.from(transportQuoteSignature(userId,amount,quoteId,items));return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected)}
function moneyRound(value){return Math.round((Number(value)||0)*100)/100}
function paidOrderStatus(status){return new Set(['pagado','preparando','en_compra_proveedor','mercancia_recogida','listo_para_rutafv','enviado_a_rutafv','en_reparto','entregado','incidencia']).has(String(status||'').toLowerCase())}
function billingCustomerForOrder(d,o){const u=(d.users||[]).find(x=>x.id===o.userId)||{},c=o.customer||{},contactName=String(c.name||u.name||[u.firstName,u.lastName].filter(Boolean).join(' ')||'').trim();return {name:contactName,billingName:String(c.billingName||u.billingName||contactName).trim(),nifNie:String(c.nifNie||u.nifNie||'').trim(),email:String(c.email||u.email||'').trim(),phone:String(c.phone||u.phone||'').trim(),billingAddress:String(c.billingAddress||u.billingAddress||'').trim(),billingCity:String(c.billingCity||u.billingCity||'').trim(),billingPostalCode:String(c.billingPostalCode||u.billingPostalCode||'').trim(),deliveryAddress:{address:String(c.address||o.address||'').trim(),city:String(c.city||o.city||'').trim(),postalCode:String(c.postalCode||o.postalCode||'').trim()}}}
function nextInvoiceNumber(d){d.settings=d.settings||{};const prefix=String(d.settings.invoicePrefix||'FVM-FAC').trim()||'FVM-FAC';d.settings.invoiceSequence=Math.max(0,Number(d.settings.invoiceSequence)||0)+1;return `${prefix}-${String(new Date().getFullYear())}-${String(d.settings.invoiceSequence).padStart(5,'0')}`}
function issueInvoiceForOrder(d,o){if(!o||!paidOrderStatus(o.status))return null;d.invoices=Array.isArray(d.invoices)?d.invoices:[];const existing=d.invoices.find(x=>x.orderId===o.id);if(existing){o.invoiceId=o.invoiceId||existing.id;o.invoiceNumber=o.invoiceNumber||existing.number;return existing}const taxRate=Math.max(0,Math.min(100,Number(d.settings?.igic??7)||0));const grossLines=(o.items||[]).map(x=>({description:String(x.title||x.ref||'Producto FVMarket'),reference:String(x.ref||''),quantity:Math.max(1,Number(x.qty)||1),gross:moneyRound(x.lineTotal)}));if(Number(o.delivery)>0)grossLines.push({description:'Envío a tu obra',reference:'RUTAFV',quantity:1,gross:moneyRound(o.delivery)});const expectedTotal=moneyRound(o.total||grossLines.reduce((sum,x)=>sum+x.gross,0));const lineTotal=grossLines.reduce((sum,x)=>sum+x.gross,0);if(grossLines.length&&lineTotal!==expectedTotal)grossLines[grossLines.length-1].gross=moneyRound(grossLines[grossLines.length-1].gross+(expectedTotal-lineTotal));const lines=grossLines.map(x=>{const base=taxRate?moneyRound(x.gross/(1+taxRate/100)):x.gross;return {...x,unitPrice:moneyRound(x.gross/x.quantity),taxableBase:base,taxAmount:moneyRound(x.gross-base),taxRate}});const taxBase=moneyRound(lines.reduce((sum,x)=>sum+x.taxableBase,0)),taxAmount=moneyRound(lines.reduce((sum,x)=>sum+x.taxAmount,0));const invoice={id:id('inv'),number:nextInvoiceNumber(d),orderId:o.id,orderNumber:o.number,userId:o.userId,status:'emitida',issuedAt:o.paidAt||new Date().toISOString(),paidAt:o.paidAt||new Date().toISOString(),taxName:'IGIC',taxRate,taxBase,taxAmount,total:expectedTotal,currency:'EUR',paymentMethod:String(o.paymentMethod||''),customer:billingCustomerForOrder(d,o),lines,createdAt:new Date().toISOString()};d.invoices.push(invoice);o.invoiceId=invoice.id;o.invoiceNumber=invoice.number;return invoice}
function publicInvoice(invoice={}){return {...invoice,lines:(invoice.lines||[]).map(x=>({...x}))}}
function invoiceDocumentHtml(invoice={},settings={}){const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const issuer={name:settings.fiscalName||settings.storeName||'FVMarket',nif:settings.fiscalNif||'',address:settings.fiscalAddress||'',city:settings.fiscalCity||'',postalCode:settings.fiscalPostalCode||''};const c=invoice.customer||{};const row=(invoice.lines||[]).map(x=>`<tr><td>${esc(x.description)}<small>${esc(x.reference)}</small></td><td>${Number(x.quantity||1)}</td><td>${moneyRound(x.unitPrice).toFixed(2)} €</td><td>${moneyRound(x.taxAmount).toFixed(2)} €</td><td>${moneyRound(x.gross).toFixed(2)} €</td></tr>`).join('');return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(invoice.number)} · FVMarket</title><style>body{font-family:Arial,sans-serif;color:#10233f;margin:0;background:#eef3f7}.sheet{max-width:820px;margin:24px auto;background:#fff;padding:42px;box-shadow:0 8px 30px #1232}.top{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #82c341;padding-bottom:22px}.brand{font-size:30px;font-weight:900;color:#06345f}.brand span{color:#82c341}.muted{color:#60748a;font-size:12px;line-height:1.5}.right{text-align:right}.title{font-size:24px;margin:28px 0 14px;color:#06345f}.parties{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:24px}.box{border:1px solid #dce5ec;border-radius:8px;padding:14px;min-height:90px;font-size:13px;line-height:1.5}.box b{display:block;color:#06345f;margin-bottom:6px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #e3e9ee}th{background:#f2f7fa;color:#48617b}td:nth-child(n+2),th:nth-child(n+2){text-align:right}td small{display:block;color:#718399;margin-top:3px}.totals{width:300px;margin:20px 0 0 auto}.totals div{display:flex;justify-content:space-between;padding:6px 0;font-size:13px}.totals .grand{border-top:2px solid #06345f;margin-top:5px;padding-top:10px;font-size:18px;font-weight:900}.footer{border-top:1px solid #dce5ec;margin-top:30px;padding-top:14px}.actions{text-align:center;margin:18px}.actions button{border:0;border-radius:7px;background:#06345f;color:#fff;padding:11px 18px;font-weight:800;cursor:pointer}@media print{body{background:#fff}.sheet{margin:0;box-shadow:none;max-width:none}.actions{display:none}}@media(max-width:620px){.sheet{padding:22px}.top,.parties{display:block}.right{text-align:left;margin-top:16px}.totals{width:100%}}</style></head><body><main class="sheet"><div class="actions"><button onclick="window.print()">Imprimir / guardar PDF</button></div><div class="top"><div><div class="brand">FV<span>Market</span></div><div class="muted">${esc(issuer.name)}${issuer.nif?`<br>NIF: ${esc(issuer.nif)}`:''}<br>${esc(issuer.address)}${issuer.city||issuer.postalCode?`<br>${esc([issuer.postalCode,issuer.city].filter(Boolean).join(' '))}`:''}</div></div><div class="right"><h1>FACTURA</h1><b>${esc(invoice.number)}</b><div class="muted">Fecha de emisión: ${esc(new Date(invoice.issuedAt).toLocaleDateString('es-ES'))}<br>Pedido: ${esc(invoice.orderNumber)}</div></div></div><div class="parties"><div class="box"><b>Facturado a</b>${esc(c.billingName||c.name)}<br>${c.nifNie?`NIF/NIE: ${esc(c.nifNie)}<br>`:''}${esc(c.billingAddress)}${c.billingCity||c.billingPostalCode?`<br>${esc([c.billingPostalCode,c.billingCity].filter(Boolean).join(' '))}`:''}<br>${esc(c.email)}</div><div class="box"><b>Entrega</b>${esc(c.deliveryAddress?.address||'')}<br>${esc([c.deliveryAddress?.postalCode,c.deliveryAddress?.city].filter(Boolean).join(' '))}</div></div><table><thead><tr><th>Concepto</th><th>Ud.</th><th>Precio</th><th>${esc(invoice.taxName||'IGIC')}</th><th>Total</th></tr></thead><tbody>${row}</tbody></table><div class="totals"><div><span>Base imponible</span><b>${moneyRound(invoice.taxBase).toFixed(2)} €</b></div><div><span>${esc(invoice.taxName||'IGIC')} (${Number(invoice.taxRate||0).toFixed(2)}%)</span><b>${moneyRound(invoice.taxAmount).toFixed(2)} €</b></div><div class="grand"><span>Total</span><b>${moneyRound(invoice.total).toFixed(2)} €</b></div></div><div class="footer muted">${esc(settings.invoiceFooter||'Gracias por confiar en FVMarket.')}</div></main></body></html>`}
function buildOrder(d,user,items,customer={},options={}){const normalized=[];let subtotal=0;for(const item of items||[]){const p=d.products.find(x=>x.id===item.id&&x.published);if(!p)continue;const qty=Math.max(1,Math.min(99,Number(item.qty)||1)),unit=offerPrice(p);normalized.push({productId:p.id,title:p.title,ref:p.ref,unitPrice:unit,regularUnitPrice:Number(p.price||0),discountPct:Number(p.discountPct||0),qty,lineTotal:moneyRound(unit*qty),procurement:{supplierId:String(p.supplierId||''),provider:String(p.sourceProvider||providerFromUrl(p.sourceUrl)||''),sourceRef:String(p.sourceRef||''),sourceEan:String(p.sourceEan||''),sourceUrl:String(p.sourceUrl||''),sourcePrice:Number(p.sourcePrice)||0}});subtotal+=unit*qty}if(!normalized.length)return {error:'No hay productos válidos'};const q=options.quote||{},c=customer||{},destination={address:String(c.address||options.address||'').trim(),city:String(c.city||options.city||'').trim(),postalCode:String(c.postalCode||options.postalCode||'').trim(),notes:String(c.notes||options.notes||'').trim()};if(!destination.address||!destination.city||!destination.postalCode)return {error:'La dirección de entrega, municipio y código postal son obligatorios.',status:400};if(!validTransportQuote(q,user.id,items,destination))return {error:options.paymentMethod==='stripe'?'Vuelve a calcular el transporte a tu obra antes de pagar.':'Vuelve a calcular el transporte a tu obra antes de confirmar el pedido.',status:409};const delivery=Math.max(0,Number(q.amount??q.total??0)),total=moneyRound(subtotal+delivery),contactName=String(c.name||user.name||[user.firstName,user.lastName].filter(Boolean).join(' ')||'').trim();const order={id:options.id||id('ord'),number:options.number||'FVM-'+Date.now().toString().slice(-8),userId:user.id,items:normalized,subtotal:moneyRound(subtotal),delivery,transport:{provider:'RutaFV',requested:true,amount:delivery,quoteId:String(q.id||q.quoteId||''),deliveryMode:'normal',express:false,status:'pendiente_crear_reparto',estimatedDeliveryDate:q.estimatedDeliveryDate||null,deliveryDateStatus:q.deliveryDateStatus||'pendiente_planificacion',origin:fvmarketOrigin(d),originDetails:fvmarketOriginSnapshot(d)},workflow:{fulfillmentModel:'sin_stock_fisico',deliveryMode:'normal_planificado'},fulfillment:{status:'pendiente_compra_proveedor',readyForRutaFV:false},total,customer:{name:contactName,billingName:String(c.billingName||user.billingName||contactName).trim(),nifNie:String(c.nifNie||user.nifNie||'').trim(),billingAddress:String(c.billingAddress||user.billingAddress||'').trim(),billingCity:String(c.billingCity||user.billingCity||'').trim(),billingPostalCode:String(c.billingPostalCode||user.billingPostalCode||'').trim(),email:String(c.email||user.email||'').trim(),phone:String(c.phone||user.phone||options.phone||'').trim(),...destination},...destination,phone:String(c.phone||user.phone||options.phone||'').trim(),paymentMethod:options.paymentMethod||'stripe',status:'pendiente_pago',createdAt:new Date().toISOString()};return {order}}

function buildOrderFromQuote(d,q,user){
  if(!q.transport||Number(q.delivery)<0)return {error:'El presupuesto debe incluir el transporte calculado por RutaFV.'};
  const deliveryAddress=q.customer?.deliveryAddress||user.deliveryAddress||{};
  const items=(q.items||[]).map(item=>{
    const p=(d.products||[]).find(x=>x.id===item.productId)||{};
    const qty=Math.max(1,Math.min(99,Number(item.qty)||1));
    const unit=moneyRound(Number(item.unitPrice||0));
    return {productId:String(item.productId||p.id||''),title:String(item.title||p.title||'Producto FVMarket'),ref:String(item.ref||p.ref||''),unitPrice:unit,regularUnitPrice:Number(p.price||unit),discountPct:Number(p.discountPct||0),qty,lineTotal:moneyRound(Number(item.lineTotal||unit*qty)),procurement:{supplierId:String(p.supplierId||''),provider:String(p.sourceProvider||providerFromUrl(p.sourceUrl)||''),sourceRef:String(p.sourceRef||''),sourceEan:String(p.sourceEan||''),sourceUrl:String(p.sourceUrl||''),sourcePrice:Number(p.sourcePrice)||0}};
  }).filter(x=>x.title&&x.qty>0);
  if(!items.length)return {error:'El presupuesto no contiene productos válidos'};
  const name=String(q.customer?.name||user.name||[user.firstName,user.lastName].filter(Boolean).join(' ')||'').trim();
  const order={id:id('ord'),number:'FVM-'+Date.now().toString().slice(-8),userId:user.id,quoteId:q.id,items,subtotal:moneyRound(q.subtotal),delivery:moneyRound(q.delivery),transport:{provider:'RutaFV',requested:true,amount:moneyRound(q.delivery),quoteId:String(q.transport?.quoteId||''),deliveryMode:'normal',express:false,status:'pendiente_crear_reparto',estimatedDeliveryDate:q.deliveryDate||q.estimatedDeliveryDate||null,deliveryDateStatus:q.deliveryDate?'actualizada':'pendiente_planificacion',origin:fvmarketOrigin(d),originDetails:fvmarketOriginSnapshot(d)},workflow:{fulfillmentModel:'sin_stock_fisico',deliveryMode:'normal_planificado'},fulfillment:{status:'pendiente_compra_proveedor',readyForRutaFV:false},total:moneyRound(q.total),customer:{name,billingName:String(q.customer?.billingName||user.billingName||name).trim(),nifNie:String(q.customer?.nifNie||user.nifNie||'').trim(),billingAddress:String(q.customer?.billingAddress||user.billingAddress||'').trim(),billingCity:String(q.customer?.billingCity||user.billingCity||'').trim(),billingPostalCode:String(q.customer?.billingPostalCode||user.billingPostalCode||'').trim(),email:String(q.customer?.email||user.email||'').trim(),phone:String(q.customer?.phone||user.phone||'').trim(),address:String(deliveryAddress.address||'').trim(),city:String(deliveryAddress.city||'').trim(),postalCode:String(deliveryAddress.postalCode||'').trim(),notes:String(deliveryAddress.notes||'').trim()},address:String(deliveryAddress.address||'').trim(),city:String(deliveryAddress.city||'').trim(),postalCode:String(deliveryAddress.postalCode||'').trim(),phone:String(q.customer?.phone||user.phone||'').trim(),paymentMethod:'stripe',status:'pendiente_pago',createdAt:new Date().toISOString()};
  return {order};
}

async function createStripePaymentLink(req,d,o){
  if(!stripe)throw new Error('Stripe no está configurado en modo test');
  if(paidOrderStatus(o.status))throw new Error('Este pedido ya está pagado');
  if(o.stripePaymentLinkUrl)return {id:String(o.stripePaymentLinkId||''),url:o.stripePaymentLinkUrl,reused:true};
  const sourceItems=[...(o.items||[])];
  if(o.delivery>0)sourceItems.push({title:'Envío a tu obra',ref:'RUTAFV',qty:1,unitPrice:o.delivery,lineTotal:o.delivery});
  if(!sourceItems.length||sourceItems.length>20)throw new Error('Stripe permite como máximo 20 conceptos por enlace de pago');
  const line_items=[];
  for(const item of sourceItems){
    const price=await stripe.prices.create({currency:'eur',unit_amount:Math.round(Number(item.unitPrice||0)*100),product_data:{name:String(item.title||item.ref||'Producto FVMarket').slice(0,250),metadata:{ref:String(item.ref||'')}}});
    line_items.push({price:price.id,quantity:Math.max(1,Math.min(99,Number(item.qty)||1))});
  }
  const link=await stripe.paymentLinks.create({line_items,customer_creation:'always',billing_address_collection:'required',phone_number_collection:{enabled:true},submit_type:'pay',restrictions:{completed_sessions:{limit:1}},after_completion:{type:'redirect',redirect:{url:`${baseUrl(req)}/?payment=success&order=${encodeURIComponent(o.id)}`}},metadata:{source:'FVMarket',orderId:o.id,orderNumber:o.number,quoteId:String(o.quoteId||''),fulfillment_model:'sin_stock_fisico',delivery_mode:'normal',transport_amount:String(o.delivery||0)}});
  o.stripePaymentLinkId=String(link.id||'');o.stripePaymentLinkUrl=String(link.url||'');o.stripePaymentLinkActive=true;o.paymentMethod='stripe';o.paymentChannel='payment_link';
  return {id:o.stripePaymentLinkId,url:o.stripePaymentLinkUrl,reused:false};
}

app.get('/api/health',(req,res)=>res.json({ok:true,app:'FVMarket',emailVerification:!!(RESEND_API_KEY&&EMAIL_FROM),billing:true,stripeWebhook:!!(stripe&&STRIPE_WEBHOOK_SECRET)}));
app.get('/api/products',(req,res)=>{const d=read();const q=(req.query.q||'').toLowerCase();const category=(req.query.category||'').toLowerCase();res.json(d.products.filter(p=>p.published && (!q || `${p.title} ${p.category} ${p.ref}`.toLowerCase().includes(q)) && (!category || p.category.toLowerCase()===category)).map(publicProduct))});
app.post('/api/auth/register',async(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)return res.status(400).json({error:'Introduce un correo válido y una contraseña de al menos 8 caracteres'});
  if(!RESEND_API_KEY||!EMAIL_FROM)return res.status(503).json({error:'El registro requiere configurar el envío de correos de verificación en Render. Inténtalo de nuevo más tarde.'});
  const d=read();if(d.users.some(u=>String(u.email||'').toLowerCase()===email))return res.status(409).json({error:'Ese correo ya está registrado'});
  const rawToken=newVerificationToken();
  const u={id:id('usr'),name:'',firstName:'',lastName:'',nifNie:'',phone:'',billingAddress:'',deliveryAddress:{},username:'',email,password:await bcrypt.hash(password,12),role:'customer',emailVerified:false,verificationTokenHash:verificationHash(rawToken),verificationExpiresAt:Date.now()+24*60*60*1000,createdAt:new Date().toISOString()};
  d.users.push(u);save(d);
  try{const mail=await sendVerificationEmail(req,u,rawToken);return res.status(201).json({verificationRequired:true,emailSent:mail.sent,message:mail.sent?'Te hemos enviado un correo de verificación. Ábrelo para activar tu cuenta.':'Cuenta creada. El servicio de correo de verificación todavía no está configurado.'})}catch(e){return res.status(201).json({verificationRequired:true,emailSent:false,message:'Cuenta creada, pero no se pudo enviar el correo de verificación. Puedes solicitar un nuevo envío.',mailError:e.message})}
});
app.post('/api/auth/resend-verification',async(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();const d=read();const u=d.users.find(x=>String(x.email||'').toLowerCase()===email&&x.role==='customer');
  if(!u||u.emailVerified)return res.json({ok:true,message:'Si la cuenta existe y está pendiente, recibirás un correo de verificación.'});
  const rawToken=newVerificationToken();u.verificationTokenHash=verificationHash(rawToken);u.verificationExpiresAt=Date.now()+24*60*60*1000;save(d);
  try{const mail=await sendVerificationEmail(req,u,rawToken);if(!mail.sent)return res.status(503).json({error:'El servicio de correo de verificación no está configurado'});res.json({ok:true,message:'Correo de verificación reenviado'})}catch(e){res.status(502).json({error:e.message})}
});
app.post('/api/auth/forgot-password',async(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();
  const generic='Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.json({ok:true,message:generic});
  const d=read();const u=d.users.find(x=>String(x.email||'').toLowerCase()===email&&x.active!==false);
  if(!u)return res.json({ok:true,message:generic});
  const rawToken=newVerificationToken();u.passwordResetTokenHash=verificationHash(rawToken);u.passwordResetExpiresAt=Date.now()+30*60*1000;save(d);
  try{
    const mail=await sendPasswordResetEmail(req,u,rawToken);
    if(!mail.sent){u.passwordResetTokenHash='';u.passwordResetExpiresAt=0;save(d);return res.json({ok:true,message:generic});}
  }catch(e){
    u.passwordResetTokenHash='';u.passwordResetExpiresAt=0;save(d);
    console.error('Password reset email:',e.message);
    return res.json({ok:true,message:generic});
  }
  res.json({ok:true,message:generic});
});
app.post('/api/auth/reset-password',async(req,res)=>{
  const rawToken=String(req.body?.token||'').trim();const password=String(req.body?.password||'');
  if(!rawToken||password.length<8)return res.status(400).json({error:'El enlace no es válido o la contraseña debe tener al menos 8 caracteres'});
  const d=read();const hash=verificationHash(rawToken);const u=d.users.find(x=>x.passwordResetTokenHash===hash&&Number(x.passwordResetExpiresAt||0)>=Date.now()&&x.active!==false);
  if(!u)return res.status(400).json({error:'El enlace de recuperación no es válido o ha caducado. Solicita uno nuevo.'});
  u.password=await bcrypt.hash(password,12);u.passwordResetTokenHash='';u.passwordResetExpiresAt=0;u.updatedAt=new Date().toISOString();save(d);
  res.json({ok:true,message:'Contraseña actualizada. Ya puedes iniciar sesión.'});
});
app.get('/api/auth/verify-email',(req,res)=>{
  const raw=String(req.query.token||'');if(!raw)return res.redirect('/?verified=invalid');const d=read();const h=verificationHash(raw);const u=d.users.find(x=>x.verificationTokenHash===h&&x.role==='customer');
  if(!u||Number(u.verificationExpiresAt||0)<Date.now())return res.redirect('/?verified=expired');u.emailVerified=true;u.verificationTokenHash='';u.verificationExpiresAt=0;save(d);res.redirect('/?verified=1');
});
app.post('/api/auth/login',async(req,res)=>{
  const body=req.body||{};const identifier=String(body.email||body.user||body.username||'').trim().toLowerCase();const secret=String(body.password??body.pin??'');const d=read();
  const u=d.users.find(x=>String(x.email||'').toLowerCase()===identifier||(STAFF_ROLE_KEYS.has(x.role)&&String(x.username||'').toLowerCase()===identifier));
  if(!u||u.active===false||!u.password||!(await bcrypt.compare(secret,u.password)))return res.status(401).json({error:'Correo o contraseña incorrectos'});
  if(u.role==='customer'&&!u.emailVerified)return res.status(403).json({error:'Confirma tu correo electrónico antes de iniciar sesión'});
  res.json({token:token(u),user:safeUser(u)});
});
app.get('/api/me',auth,(req,res)=>{const u=read().users.find(x=>x.id===req.user.id);res.json(u?safeUser(u):null)});
// FVM_ADMIN_SECURITY_V14
app.get('/api/admin/security',admin,(req,res)=>{
  const d=read();const u=d.users.find(x=>x.id===req.user.id&&x.role==='admin');
  if(!u)return res.status(404).json({error:'Administrador no encontrado'});
  res.set('Cache-Control','no-store');res.json({username:String(u.username||'admin')});
});
app.put('/api/admin/security',admin,async(req,res)=>{
  const d=read();const u=d.users.find(x=>x.id===req.user.id&&x.role==='admin');
  if(!u)return res.status(404).json({error:'Administrador no encontrado'});
  const currentPin=String(req.body?.currentPin||'');
  if(!currentPin||!u.password||!(await bcrypt.compare(currentPin,u.password)))return res.status(401).json({error:'El PIN actual no es correcto'});
  const newUsername=String(req.body?.newUsername??u.username??'').trim().toLowerCase();
  const newPin=String(req.body?.newPin||'').trim();
  if(!/^[a-z0-9._-]{3,32}$/.test(newUsername))return res.status(400).json({error:'El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo'});
  if(d.users.some(x=>x.id!==u.id&&String(x.username||'').trim().toLowerCase()===newUsername))return res.status(409).json({error:'Ese usuario ya está en uso'});
  if(newPin&&!/^\d{4,12}$/.test(newPin))return res.status(400).json({error:'El nuevo PIN debe tener entre 4 y 12 dígitos'});
  u.username=newUsername;u.email=newUsername+'@fvmarket.local';if(newPin)u.password=await bcrypt.hash(newPin,12);u.updatedAt=new Date().toISOString();save(d);
  res.json({ok:true,token:token(u),user:safeUser(u)});
});

app.put('/api/me/profile',auth,async(req,res)=>{
  const d=read();const u=d.users.find(x=>x.id===req.user.id);if(!u)return res.status(404).json({error:'Cuenta no encontrada'});if(u.role==='customer'&&!u.emailVerified)return res.status(403).json({error:'Verifica primero tu correo electrónico'});
  const firstName=String(req.body?.firstName||'').trim(),lastName=String(req.body?.lastName||'').trim(),nifNie=cleanNifNie(req.body?.nifNie||''),billingName=String(req.body?.billingName||'').trim(),billingAddress=String(req.body?.billingAddress||'').trim(),billingCity=String(req.body?.billingCity||'').trim(),billingPostalCode=String(req.body?.billingPostalCode||'').trim(),phone=String(req.body?.phone||'').trim();const dv=req.body?.deliveryAddress||{};
  if(!firstName||!lastName||!validNifNie(nifNie)||!billingAddress)return res.status(400).json({error:'Completa nombre, apellidos, un NIF/NIE válido y la dirección de facturación'});
  const deliveryAddress=String(dv.address||dv.label||'').trim();
  const deliveryCity=String(dv.city||'').trim();
  const deliveryPostal=String(dv.postalCode||dv.postal_code||'').trim();
  if(!deliveryAddress||!deliveryCity||!deliveryPostal)return res.status(400).json({error:'Completa la dirección de entrega, el municipio y el código postal'});
  try{
    let match=null;
    const placeId=String(dv.placeId||dv.place_id||'').trim();
    if(placeId||dv.validated===true){
      match={...dv,address:deliveryAddress,city:deliveryCity,postalCode:deliveryPostal,placeId};
    }else{
      const query=[deliveryAddress,deliveryCity,deliveryPostal].filter(Boolean).join(', ').trim();
      const found=await rutaFVGet('/api/integrations/fvmarket/address-search',{q:query,limit:'5'});const rows=Array.isArray(found?.results)?found.results:[];
      const norm=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
      match=rows.find(r=>norm(r.address||r.label).includes(norm(deliveryAddress))||norm(deliveryAddress).includes(norm(r.address||r.label)));
    }
    if(!match)return res.status(400).json({error:'La dirección de entrega no pudo validarse. Selecciónala desde las sugerencias o completa los datos manualmente.'});
    u.firstName=firstName;u.lastName=lastName;u.name=(firstName+' '+lastName).trim();u.nifNie=nifNie;u.billingName=billingName||u.name;u.billingAddress=billingAddress;u.billingCity=billingCity;u.billingPostalCode=billingPostalCode;u.phone=phone;u.deliveryAddress={address:String(match.address||match.label||dv.address),city:String(match.city||dv.city||''),postalCode:String(match.postalCode||match.postal_code||dv.postalCode||''),municipality:String(match.municipality||''),placeId:String(match.placeId||match.place_id||dv.placeId||''),lat:match.lat??match.latitude??dv.lat??null,lng:match.lng??match.longitude??dv.lng??null,validated:true,source:'google'};save(d);res.json({user:safeUser(u)});
  }catch(e){res.status(503).json({error:'No se pudo validar la dirección con Google/RutaFV: '+e.message})}
});
app.get('/api/my-orders',auth,(req,res)=>res.json(read().orders.filter(o=>o.userId===req.user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(publicOrder)));
app.get('/api/my-quotes',auth,(req,res)=>res.json((read().quotes||[]).filter(q=>q.userId===req.user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))));
app.post('/api/quotes/:id/accept',auth,(req,res)=>{
  const d=read();
  const q=(d.quotes||[]).find(x=>x.id===req.params.id&&x.userId===req.user.id);
  if(!q)return res.status(404).json({error:'Presupuesto no encontrado'});
  if(String(q.status||'').toLowerCase()==='aceptado')return res.json(q);
  if(q.validUntil&&new Date(q.validUntil).getTime()<Date.now())return res.status(409).json({error:'Este presupuesto ha caducado.'});
  q.status='aceptado';q.acceptedAt=new Date().toISOString();save(d);res.json(q);
});
app.post('/api/quotes/:id/payment-link',auth,requireCustomerReady,async(req,res)=>{
  if(!stripe)return res.status(503).json({error:'Stripe no está configurado en modo test'});
  const d=read();const q=(d.quotes||[]).find(x=>x.id===req.params.id&&x.userId===req.user.id);
  if(!q)return res.status(404).json({error:'Presupuesto no encontrado'});
  if(String(q.status||'').toLowerCase()!=='aceptado'&&String(q.status||'').toLowerCase()!=='pagado')return res.status(409).json({error:'Acepta primero el presupuesto para poder pagarlo'});
  if(q.validUntil&&new Date(q.validUntil).getTime()<Date.now()&&String(q.status||'').toLowerCase()!=='pagado')return res.status(409).json({error:'Este presupuesto ha caducado.'});
  if(String(q.status||'').toLowerCase()==='pagado')return res.status(409).json({error:'Este presupuesto ya está pagado'});
  try{
    let o=q.orderId?(d.orders||[]).find(x=>x.id===q.orderId):null;let created=false;
    if(!o){const built=buildOrderFromQuote(d,q,req.customer);if(built.error)return res.status(409).json({error:built.error});o=built.order;d.orders.push(o);created=true}
    const link=await createStripePaymentLink(req,d,o);q.orderId=o.id;q.stripePaymentLinkId=link.id;q.stripePaymentLinkUrl=link.url;q.paymentLinkCreatedAt=q.paymentLinkCreatedAt||new Date().toISOString();save(d);if(created)scheduleOrderEmail(req,o.id,'payment_link_created',{paymentLinkUrl:link.url});res.json({url:link.url,orderNumber:o.number,reused:!!link.reused});
  }catch(e){console.error('Stripe quote payment link:',e.message);res.status(502).json({error:`No se pudo crear el enlace de pago: ${e.message}`})}
});
app.delete('/api/quotes/:id',auth,(req,res)=>{
  const d=read();
  const index=(d.quotes||[]).findIndex(q=>q.id===req.params.id&&q.userId===req.user.id);
  if(index<0)return res.status(404).json({error:'Presupuesto no encontrado'});
  const q=d.quotes[index];
  if(String(q.status||'').toLowerCase()==='aceptado')return res.status(409).json({error:'No se puede eliminar un presupuesto aceptado.'});
  d.quotes.splice(index,1);save(d);res.json({ok:true});
});
function profileSummary(d,u){const quotes=(d.quotes||[]).filter(q=>q.userId===u.id).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));const orders=(d.orders||[]).filter(o=>o.userId===u.id).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(publicOrder);const invoices=(d.invoices||[]).filter(x=>x.userId===u.id).sort((a,b)=>String(b.issuedAt||'').localeCompare(String(a.issuedAt||''))).map(publicInvoice);const payments=orders.map(o=>({id:o.id,orderNumber:o.number,amount:o.total,method:'Stripe',status:['pagado','preparando','en_compra_proveedor','mercancia_recogida','listo_para_rutafv','enviado_a_rutafv','en_reparto','entregado'].includes(String(o.status||''))?'pagado':'pendiente',createdAt:o.createdAt}));return {quotes,orders,invoices,payments}}
app.get('/api/my-invoices',auth,(req,res)=>res.json(read().invoices.filter(x=>x.userId===req.user.id).sort((a,b)=>String(b.issuedAt||'').localeCompare(String(a.issuedAt||''))).map(publicInvoice)));
app.get('/api/invoices/:id',auth,(req,res)=>{const d=read();const inv=d.invoices.find(x=>x.id===req.params.id);if(!inv)return res.status(404).json({error:'Factura no encontrada'});if(inv.userId!==req.user.id&&!['admin','orders_manager'].includes(req.user.role))return res.status(403).json({error:'No tienes permiso para ver esta factura'});res.json(publicInvoice(inv))});
app.get('/api/invoices/:id/print',(req,res)=>{const d=read();const inv=d.invoices.find(x=>x.id===req.params.id);if(!inv)return res.status(404).send('Factura no encontrada');const supplied=String(req.query.token||'');const expected=invoiceEmailToken(inv);const tokenOk=supplied&&supplied.length===expected.length&&crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));let viewer=null;const header=String(req.headers.authorization||'');if(header.startsWith('Bearer ')){try{viewer=jwt.verify(header.slice(7),JWT_SECRET)}catch{}}if(!tokenOk&&(!viewer|| (inv.userId!==viewer.id&&!['admin','orders_manager'].includes(viewer.role))))return res.status(401).send('No tienes permiso para ver esta factura');res.type('html').send(invoiceDocumentHtml(inv,d.settings))});
app.get('/api/me/summary',auth,(req,res)=>{const d=read();const u=d.users.find(x=>x.id===req.user.id);if(!u)return res.status(404).json({error:'Cuenta no encontrada'});res.json({user:safeUser(u),...profileSummary(d,u)})});
app.post('/api/quotes',auth,requireCustomerReady,async(req,res)=>{
  const d=read();const normalized=[];let subtotal=0;for(const item of req.body?.items||[]){const p=d.products.find(x=>x.id===item.id&&x.published);if(!p)continue;const qty=Math.max(1,Math.min(99,Number(item.qty)||1));const unit=offerPrice(p);normalized.push({productId:p.id,title:p.title,ref:p.ref,qty,unitPrice:unit,lineTotal:+(unit*qty).toFixed(2),supplierId:String(p.supplierId||''),sourceProvider:String(p.sourceProvider||'')});subtotal+=unit*qty}
  if(!normalized.length)return res.status(400).json({error:'El carrito está vacío'});let delivery=0,transport=null;
  try{const profile=req.customer||{},input=req.body?.customer||{},u={...profile,...input};const rawDestination=input.deliveryAddress||input;const a={address:String(rawDestination.address||profile.deliveryAddress?.address||'').trim(),city:String(rawDestination.city||profile.deliveryAddress?.city||'').trim(),postalCode:String(rawDestination.postalCode||profile.deliveryAddress?.postalCode||'').trim()};if(!a.address||!a.city||!a.postalCode)return res.status(400).json({error:'Completa y valida la dirección de entrega antes de crear el presupuesto.'});const supplied=req.body?.rutaFVQuote;let r=null;if(validTransportQuote(supplied,req.user.id,req.body?.items||[],a)){r=supplied}else{const payload={clientCode:d.settings.rutaFVClientCode||RUTAFV_CLIENT_CODE,customer:{name:u.name,email:u.email,phone:u.phone||''},origin:fvmarketOrigin(d),originDetails:fvmarketOriginSnapshot(d),destination:[a.address,a.city,a.postalCode].filter(Boolean).join(', '),destinationText:[a.address,a.city,a.postalCode].filter(Boolean).join(', '),items:normalized.map(x=>({id:x.productId,ref:x.ref,title:x.title,qty:x.qty,weightKg:Number(d.products.find(p=>p.id===x.productId)?.weightKg||0),supplierId:x.supplierId,sourceProvider:x.sourceProvider})),orderSource:'FVMarket',fulfillmentModel:'sin_stock_fisico',deliveryMode:'normal',express:false,requestType:'quote'};r=await rutaFVRequest(RUTAFV_QUOTE_PATH,payload)}delivery=Math.max(0,Number(r.amount||r.total||0));transport={provider:'RutaFV',amount:delivery,quoteId:String(r.id||r.quoteId||''),origin:fvmarketOrigin(d),originDetails:fvmarketOriginSnapshot(d),destination:a,deliveryMode:'normal',express:false,estimatedDeliveryDate:r.estimatedDeliveryDate||r.deliveryDate||null,deliveryDateStatus:r.deliveryDateStatus||'pendiente_planificacion',originDetails:fvmarketOriginSnapshot(d)}}catch(e){return res.status(503).json({error:'No se pudo calcular el transporte: '+e.message})}
  const now=new Date(),until=new Date(now.getTime()+15*24*60*60*1000),input=req.body?.customer||{},profile=req.customer||{},deliveryAddress=input.deliveryAddress||{address:input.address||profile.deliveryAddress?.address||'',city:input.city||profile.deliveryAddress?.city||'',postalCode:input.postalCode||profile.deliveryAddress?.postalCode||''};const total=+(subtotal+delivery).toFixed(2);const q={id:id('quo'),number:'PRE-FVM-'+Date.now().toString().slice(-8),userId:req.user.id,items:normalized,subtotal:+subtotal.toFixed(2),delivery,total,transport,status:'emitido',validUntil:until.toISOString(),customer:{name:input.name||profile.name,email:input.email||profile.email,nifNie:input.nifNie||profile.nifNie,billingName:input.billingName||profile.billingName,billingAddress:input.billingAddress||profile.billingAddress,billingCity:input.billingCity||profile.billingCity,billingPostalCode:input.billingPostalCode||profile.billingPostalCode,deliveryAddress,phone:input.phone||profile.phone},createdAt:now.toISOString()};d.quotes.push(q);save(d);res.status(201).json(q);
});

app.post('/api/orders',(req,res)=>res.status(410).json({error:'FVMarket admite únicamente pago online con Stripe. Finaliza la compra desde el botón de pago seguro.'}));
app.post('/api/checkout/stripe',optionalAuth,async(req,res)=>{
  // FVM_TRANSPORT_CHECKOUT_V3 - Stripe only, registered customer or guest.
  if(!stripe)return res.status(503).json({error:'Pago con tarjeta pendiente de activación'});
  const body=req.body||{};const items=Array.isArray(body.items)?body.items:[];const useRutaFV=!!body.useRutaFV;const quote=body.rutaFVQuote||{};const d=read();
  const actorId=requestActorId(req);if(!actorId)return res.status(400).json({error:'No se pudo identificar esta sesión de compra. Recarga la página e inténtalo de nuevo.'});
  const inputCustomer=body.customer||{address:body.address,city:body.city,postalCode:body.postalCode,phone:body.phone,notes:body.notes};
  let checkoutUser=null;
  if(req.user){
    checkoutUser=(d.users||[]).find(x=>x.id===req.user.id)||null;
    if(!checkoutUser)return res.status(401).json({error:'Cuenta no encontrada'});
    if(checkoutUser.role==='customer'&&!checkoutUser.emailVerified)return res.status(403).json({error:'Debes verificar tu correo electrónico antes de comprar con esta cuenta'});
    if(checkoutUser.role==='customer'&&!customerProfileComplete(checkoutUser))return res.status(409).json({error:'Completa tu perfil o cierra sesión para comprar como invitado'});
  }else{
    const email=String(inputCustomer.email||'').trim().toLowerCase(),name=String(inputCustomer.name||'').trim(),phone=String(inputCustomer.phone||'').trim();
    if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!phone)return res.status(400).json({error:'Para comprar como invitado indica nombre, email y teléfono válidos'});
    checkoutUser={id:actorId,name,email,phone,role:'guest',emailVerified:true,billingName:String(inputCustomer.billingName||name).trim(),nifNie:String(inputCustomer.nifNie||'').trim(),billingAddress:String(inputCustomer.billingAddress||inputCustomer.address||'').trim(),billingCity:String(inputCustomer.billingCity||inputCustomer.city||'').trim(),billingPostalCode:String(inputCustomer.billingPostalCode||inputCustomer.postalCode||'').trim(),deliveryAddress:{address:String(inputCustomer.address||'').trim(),city:String(inputCustomer.city||'').trim(),postalCode:String(inputCustomer.postalCode||'').trim()}};
  }
  const built=buildOrder(d,checkoutUser,items,inputCustomer,{id:id('ord'),paymentMethod:'stripe',useRutaFV,quote,phone:body.phone,notes:body.notes});
  if(built.error)return res.status(built.status||400).json({error:built.error});
  const order=built.order;const line_items=order.items.map(item=>({quantity:item.qty,price_data:{currency:'eur',unit_amount:Math.round(item.unitPrice*100),product_data:{name:item.title,metadata:{ref:item.ref}}}}));
  if(order.delivery>0)line_items.push({quantity:1,price_data:{currency:'eur',unit_amount:Math.round(order.delivery*100),product_data:{name:'Envío a tu obra',description:'Servicio de entrega asociado a la compra FVMarket'}}});
  const base=baseUrl(req);
  try{
    const session=await stripe.checkout.sessions.create({mode:'payment',line_items,success_url:`${base}/?payment=success&order=${encodeURIComponent(order.id)}`,cancel_url:`${base}/?payment=cancel&order=${encodeURIComponent(order.id)}`,customer_email:order.customer.email,customer_creation:'always',billing_address_collection:'required',phone_number_collection:{enabled:true},integration_identifier:`fvmarket_checkout_${crypto.randomBytes(4).toString('hex')}`,metadata:{source:'FVMarket',orderId:order.id,orderNumber:order.number,rutafv:String(useRutaFV),fulfillment_model:'sin_stock_fisico',delivery_mode:'normal',transport_amount:String(order.delivery),rutafv_quote_id:String(quote.id||quote.quoteId||''),delivery_address:String(order.address||'').slice(0,450),delivery_phone:String(order.phone||'').slice(0,100)}});
    order.stripeSessionId=session.id;d.orders.push(order);save(d);res.json({url:session.url,orderNumber:order.number,transportAmount:order.delivery,totalIncludesTransport:order.delivery>0});
  }catch(e){console.error('Stripe checkout:',e.message);res.status(502).json({error:`No se pudo crear el pago con Stripe: ${e.message}`})}
});

// FVM_IMAGE_MANAGER_V2
function normalizeProductImages(value=[],fallback=''){
  const arr=Array.isArray(value)?value:[];const out=[];const seen=new Set();
  for(const raw of arr){const x=typeof raw==='string'?{url:raw}:(raw||{});const url=String(x.url||'').trim();if(!url||seen.has(url))continue;seen.add(url);out.push({url,source:String(x.source||''),license:String(x.license||''),author:String(x.author||''),origin:String(x.origin||'manual')});if(out.length>=12)break}
  if(fallback&&!seen.has(String(fallback))){out.unshift({url:String(fallback),source:'',license:'',author:'',origin:'legacy'})}
  return out;
}
function scoreSourceImage(url='',el=null){let s=0;const u=String(url).toLowerCase();const hint=String(el?.attr?.('class')||'')+' '+String(el?.attr?.('id')||'')+' '+String(el?.attr?.('alt')||'');if(/product|producto|gallery|galeria|zoom|main|principal|detail|detalle/i.test(hint))s+=5;if(/logo|icon|sprite|avatar|banner|payment|star|flag/i.test(u+' '+hint))s-=8;const w=Number(el?.attr?.('width')||0),h=Number(el?.attr?.('height')||0);if(w>=300||h>=300)s+=2;return s}
function collectSourceImages($,prod,url){const found=[];const push=(v,score=0)=>{const abs=absoluteUrl(v,url);if(!abs||!/^https?:/i.test(abs))return;if(/logo|icon|sprite|favicon|payment|badge/i.test(abs))return;found.push({url:abs,score})};const j=Array.isArray(prod?.image)?prod.image:[prod?.image];j.filter(Boolean).forEach(v=>push(typeof v==='string'?v:(v?.url||v?.contentUrl||''),12));push($('meta[property="og:image"]').attr('content')||'',10);push($('link[rel="image_src"]').attr('href')||'',9);$('img').each((_,el)=>{const e=$(el);const src=e.attr('data-zoom-image')||e.attr('data-large')||e.attr('data-src')||e.attr('src')||'';push(src,scoreSourceImage(src,e))});const seen=new Set();return found.sort((a,b)=>b.score-a.score).filter(x=>{if(seen.has(x.url))return false;seen.add(x.url);return true}).slice(0,8).map(x=>({url:x.url,source:url,license:'Imagen de la ficha de origen: revisar permiso/licencia antes de publicar',author:'',origin:'source'}))}
app.get('/api/admin/access',staffAccess,(req,res)=>{const role=req.user.role;res.json({role,roleLabel:STAFF_ROLE_LABELS[role]||'Cliente',permissions:{catalogView:['admin','catalog_manager','operator'].includes(role),catalogEdit:['admin','catalog_manager'].includes(role),ordersView:['admin','orders_manager'].includes(role),usersManage:role==='admin',settingsManage:role==='admin',warehouseTasks:['admin','catalog_manager','operator'].includes(role)}})});
app.get('/api/admin/warehouse',staffCatalogView,(req,res)=>{const d=read();const names=new Map(d.users.filter(u=>STAFF_ROLE_KEYS.has(u.role)).map(u=>[u.id,u.name||u.username||u.email]));res.json(d.products.map(p=>({...p,warehouseStatus:normalizeWarehouseStatus(p.warehouseStatus,!!p.published),warehouseStatusLabel:WAREHOUSE_STATUS_LABELS[normalizeWarehouseStatus(p.warehouseStatus,!!p.published)],warehouseAssigneeName:p.warehouseAssignee?(names.get(p.warehouseAssignee)||p.warehouseAssignee):'Sin asignar'})))});
app.put('/api/admin/warehouse/:id',staffWith('admin','catalog_manager','operator'),(req,res)=>{const d=read();const p=d.products.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Producto no encontrado'});const role=req.user.role;const assignee=String(p.warehouseAssignee||'');if(role==='operator'&&assignee&&assignee!==req.user.id&&assignee!==String(req.user.username||''))return res.status(403).json({error:'Esta tarea está asignada a otro operador'});if(req.body.warehouseStatus!=null)p.warehouseStatus=normalizeWarehouseStatus(req.body.warehouseStatus,!!p.published);if(req.body.warehouseTask!=null)p.warehouseTask=String(req.body.warehouseTask||'').trim().slice(0,240);if(role==='operator'&&!p.warehouseAssignee)p.warehouseAssignee=req.user.id;if(req.body.warehouseAssignee!=null&&role!=='operator')p.warehouseAssignee=String(req.body.warehouseAssignee||'').trim().slice(0,100);save(d);res.json(p)});
app.get('/api/admin/products',staffCatalogView,(req,res)=>res.json(read().products));
app.post('/api/admin/products',catalogEditor,(req,res)=>{const d=read();const title=String(req.body.title||'Producto sin título');const category=String(req.body.category||guessCategory(title));const sourcePrice=Number(req.body.sourcePrice)||0;const p={id:id('prd'),title,category,ref:String(req.body.ref&&!String(req.body.ref).startsWith('FVM-')?req.body.ref:nextProductRef(d,title,category)),price:Number(req.body.price)||0,stock:req.body.stock||'bajo_pedido',warehouseStatus:normalizeWarehouseStatus(req.body.warehouseStatus,!!req.body.published),warehouseTask:String(req.body.warehouseTask||'').trim().slice(0,240),warehouseAssignee:String(req.body.warehouseAssignee||'').trim().slice(0,100),image:String(req.body.image||''),imageSource:String(req.body.imageSource||''),imageLicense:String(req.body.imageLicense||''),imageAuthor:String(req.body.imageAuthor||''),sourceUrl:String(req.body.sourceUrl||''),sourceProvider:String(req.body.sourceProvider||providerFromUrl(req.body.sourceUrl)||''),sourceRef:String(req.body.sourceRef||''),sourceEan:String(req.body.sourceEan||''),description:String(req.body.description||''),sourcePrice,addedValue:Number(req.body.addedValue)||Math.max(0,(Number(req.body.price)||0)-sourcePrice),margin:Number(req.body.margin)||0,published:!!req.body.published,featured:!!req.body.featured,subcategory:String(req.body.subcategory||''),onOffer:!!req.body.onOffer,discountPct:Math.max(0,Math.min(90,Number(req.body.discountPct)||0))};p.images=normalizeProductImages(req.body.images,p.image);if(req.body.published&&p.images.length<1)return res.status(400).json({error:'Para publicar un producto se requiere al menos 1 imagen.'});if(p.images[0]){p.image=p.images[0].url;p.imageSource=p.images[0].source||p.imageSource;p.imageLicense=p.images[0].license||p.imageLicense;p.imageAuthor=p.images[0].author||p.imageAuthor}d.products.unshift(p);save(d);res.json(p)});
app.put('/api/admin/products/:id',catalogEditor,(req,res)=>{const d=read();const i=d.products.findIndex(p=>p.id===req.params.id);if(i<0)return res.status(404).json({error:'Producto no encontrado'});const old=d.products[i];const next={...old,...req.body,id:old.id};for(const k of ['price','sourcePrice','margin','addedValue'])if(req.body[k]!=null)next[k]=Number(req.body[k])||0;for(const k of ['title','category','ref','stock','image','imageSource','imageLicense','imageAuthor','sourceUrl','sourceProvider','sourceRef','sourceEan','description'])if(req.body[k]!=null)next[k]=String(req.body[k]);if(req.body.published!=null){if(req.body.published){const checkImages=normalizeProductImages(req.body.images!=null?req.body.images:next.images,next.image);if(checkImages.length<1)return res.status(400).json({error:'Para publicar un producto se requiere al menos 1 imagen.'})}next.published=!!req.body.published}next.warehouseStatus=normalizeWarehouseStatus(req.body.warehouseStatus!=null?req.body.warehouseStatus:next.warehouseStatus,!!next.published);if(req.body.warehouseTask!=null)next.warehouseTask=String(req.body.warehouseTask||'').trim().slice(0,240);if(req.body.warehouseAssignee!=null)next.warehouseAssignee=String(req.body.warehouseAssignee||'').trim().slice(0,100);if(req.body.featured!=null)next.featured=!!req.body.featured;if(req.body.images!=null)next.images=normalizeProductImages(req.body.images,next.image);else if(!Array.isArray(next.images))next.images=normalizeProductImages([],next.image);if(next.images.length){next.image=next.images[0].url;next.imageSource=next.images[0].source||'';next.imageLicense=next.images[0].license||'';next.imageAuthor=next.images[0].author||''}else if(req.body.images!=null){next.image='';next.imageSource='';next.imageLicense='';next.imageAuthor=''}d.products[i]=next;save(d);res.json(next)});
app.delete('/api/admin/products/:id',catalogEditor,(req,res)=>{const d=read();d.products=d.products.filter(p=>p.id!==req.params.id);save(d);res.json({ok:true})});
app.get('/api/admin/orders',ordersManager,(req,res)=>res.json(read().orders.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))));
app.get('/api/admin/quotes',ordersManager,(req,res)=>res.json((read().quotes||[]).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))));
app.post('/api/admin/orders/:id/payment-link',ordersManager,async(req,res)=>{
  if(!stripe)return res.status(503).json({error:'Stripe no está configurado en modo test'});
  const d=read();const o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Pedido no encontrado'});
  try{const link=await createStripePaymentLink(req,d,o);save(d);if(!link.reused)scheduleOrderEmail(req,o.id,'payment_link_created',{paymentLinkUrl:link.url});res.json({url:link.url,orderNumber:o.number,reused:!!link.reused})}catch(e){console.error('Stripe order payment link:',e.message);res.status(502).json({error:`No se pudo crear el enlace de pago: ${e.message}`})}
});
app.post('/api/admin/orders/:id/refund',ordersManager,async(req,res)=>{
  if(!stripe)return res.status(503).json({error:'Stripe no está configurado'});
  const d=read();const o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Pedido no encontrado'});
  const current=String(o.status||'').toLowerCase();if(!['pagado','preparando','en_reparto','entregado','reembolso_parcial'].includes(current))return res.status(409).json({error:'El pedido no tiene un pago Stripe reembolsable'});
  if(!o.stripeSessionId&&!o.paymentIntentId)return res.status(409).json({error:'El pedido no tiene identificador de pago Stripe'});
  const already=Math.max(0,Number(o.refundedAmount)||0),total=Math.max(0,Number(o.total)||0),remaining=Math.max(0,moneyRound(total-already));
  const requested=req.body?.amount==null||String(req.body.amount).trim()===''?remaining:moneyRound(Number(req.body.amount));
  if(!Number.isFinite(requested)||requested<=0||requested>remaining+0.01)return res.status(400).json({error:`El importe debe estar entre 0,01 € y ${remaining.toFixed(2)} €`});
  try{
    let paymentIntentId=String(o.paymentIntentId||'');
    if(!paymentIntentId&&o.stripeSessionId){const session=await stripe.checkout.sessions.retrieve(o.stripeSessionId);paymentIntentId=String(typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||'')}
    if(!paymentIntentId)throw new Error('Stripe todavía no ha devuelto el PaymentIntent');
    const full=already<=0.01&&requested>=total-0.01;const refund=await stripe.refunds.create({payment_intent:paymentIntentId,...(full?{}:{amount:Math.round(requested*100)})});
    const refundRecord={id:id('ref'),amount:requested,stripeRefundId:String(refund.id||''),createdAt:new Date().toISOString(),status:String(refund.status||'succeeded'),emailSent:false};o.paymentIntentId=paymentIntentId;o.refunds=Array.isArray(o.refunds)?o.refunds:[];o.refunds.push(refundRecord);o.refundedAmount=moneyRound(already+requested);o.refundStatus=o.refundedAmount>=total-0.01?'total':'parcial';o.status=o.refundedAmount>=total-0.01?'reembolsado':'reembolso_parcial';save(d);
    scheduleOrderEmail(req,o.id,`refund:${refundRecord.id}`,{refund:refundRecord});
    res.json({ok:true,orderNumber:o.number,refundedAmount:o.refundedAmount,remainingAmount:moneyRound(total-o.refundedAmount),status:o.status});
  }catch(e){console.error('Stripe refund:',e.message);res.status(502).json({error:`No se pudo ejecutar el reembolso con Stripe: ${e.message}`})}
});
app.put('/api/admin/orders/:id',ordersManager,(req,res)=>{const d=read();const o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Pedido no encontrado'});const result=operations.transitionOrder(d,o,req.body.status,req.user,req.body.note||'Actualización desde administración');if(!result.ok)return res.status(409).json({error:result.error});let invoice=null;if(paidOrderStatus(o.status)){o.paidAt=o.paidAt||new Date().toISOString();invoice=issueInvoiceForOrder(d,o);if(invoice)operations.recordInvoiceIssued(d,o,invoice,req.user)}operations.ensureLedgerForOrder(d,o);save(d);if(result.changed&&result.to==='pagado'){scheduleOrderEmail(req,o.id,'order_confirmation');if(invoice)scheduleOrderEmail(req,o.id,'invoice_issued')}if(result.changed&&result.to==='en_reparto')scheduleOrderEmail(req,o.id,'delivery_in_transit');if(result.changed&&result.to==='entregado')scheduleOrderEmail(req,o.id,'delivery_completed');res.json(o)});
app.get('/api/admin/users',admin,(req,res)=>res.json(read().users.map(safeUser)));
app.post('/api/admin/users',admin,async(req,res)=>{const d=read();const body=req.body||{};const role=String(body.role||'operator').trim();const email=String(body.email||'').trim().toLowerCase();const username=String(body.username||email.split('@')[0]||'').trim().toLowerCase();const password=String(body.password??body.pin??'');const name=String(body.name||'').trim();if(!STAFF_ROLE_KEYS.has(role))return res.status(400).json({error:'Rol no válido'});if(!name||!email||!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Indica nombre y un correo válido'});if(!/^[a-z0-9._-]{3,32}$/.test(username))return res.status(400).json({error:'El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo'});if(password.length<8)return res.status(400).json({error:'La contraseña debe tener al menos 8 caracteres'});if(d.users.some(x=>String(x.email||'').toLowerCase()===email||String(x.username||'').toLowerCase()===username))return res.status(409).json({error:'Ese correo o usuario ya está en uso'});const parts=name.split(/\s+/),u={id:id('usr'),name,firstName:parts.shift()||name,lastName:parts.join(' '),email,username,password:await bcrypt.hash(password,12),role,emailVerified:true,internal:true,active:true,createdAt:new Date().toISOString(),deliveryAddress:{}};d.users.unshift(u);save(d);res.status(201).json(safeUser(u))});
app.get('/api/admin/settings',admin,(req,res)=>res.json(read().settings));
app.put('/api/admin/settings',admin,(req,res)=>{
  const d=read(),body=req.body||{};
  const fiscalOrigin=[body.fiscalAddress,body.fiscalCity,body.fiscalPostalCode].filter(Boolean).join(', ').trim();
  const enteredOrigin=String(body.rutaFVOrigin||'').trim();
  d.settings={...d.settings,...body};
  if(enteredOrigin){
    d.settings.rutaFVOrigin=enteredOrigin;
    d.settings.rutaFVOriginAuto=false;
  }else{
    d.settings.rutaFVOrigin=fiscalOrigin||FVMARKET_FISCAL_ORIGIN||'';
    d.settings.rutaFVOriginAuto=true;
  }
  save(d);res.json(d.settings)
});
app.get('/api/admin/invoices',ordersManager,(req,res)=>{const d=read();res.json(d.invoices.slice().sort((a,b)=>String(b.issuedAt||'').localeCompare(String(a.issuedAt||''))).map(publicInvoice))});


function guessCategory(text=''){const x=String(text).toLowerCase();if(/cement|mortero|ladrill|bloque|yeso|hormig|azulej|cerám/.test(x))return'Construcción';if(/taladro|sierra|martillo|atornill|broca|herramient/.test(x))return'Herramientas';if(/grifo|tuber|válvula|fontan|fregadero/.test(x))return'Reformas';if(/cable|enchufe|interruptor|led|lámpara|electric/.test(x))return'Reformas';if(/pintura|esmalte|barniz|rodillo/.test(x))return'Bricolaje';if(/jardín|manguera|carretilla|poda/.test(x))return'Bricolaje';if(/inodoro|ducha|mampara|baño|lavabo|cocina/.test(x))return'Reformas';return'Otros'}
function categoryCode(category='Otros'){return ({'Construcción':'CON','Herramientas':'HER','Fontanería':'FON','Electricidad':'ELE','Pintura':'PIN','Jardín':'JAR','Baño y cocina':'BAN','Otros':'OTR'})[category]||'OTR'}
function ownReference(title='',sourcePrice=0,category='Otros'){const key=String(title).toLowerCase().replace(/\s+/g,' ').trim()+'|'+Number(sourcePrice||0).toFixed(2);const h=crypto.createHash('sha1').update(key).digest('hex').slice(0,6).toUpperCase();return 'FVM-'+categoryCode(category)+'-'+h}
function cleanProductTitle(title=''){return String(title).replace(/\s+/g,' ').replace(/[|•]+/g,' ').trim().slice(0,150)}
function imageSearchQuery(title='',category='Otros'){const x=String(title).toLowerCase();const pairs=[[/inodoro|wc|sanitario/,'toilet bathroom fixture'],[/plato.*ducha|ducha/,'shower tray bathroom'],[/mampara/,'shower screen glass'],[/grifo|monomando/,'faucet tap'],[/fregadero/,'kitchen sink'],[/taladro/,'electric drill tool'],[/sierra/,'power saw tool'],[/martillo/,'hammer hand tool'],[/pintura/,'paint bucket interior'],[/cemento/,'cement bag construction'],[/mortero/,'mortar bag construction'],[/carretilla/,'wheelbarrow garden'],[/puerta/,'interior door'],[/ventana/,'aluminium window'],[/lavabo/,'bathroom sink'],[/cable/,'electrical cable'],[/enchufe/,'electrical socket outlet']];for(const [rx,q] of pairs)if(rx.test(x))return q;return ({'Construcción':'construction material','Herramientas':'hardware tool','Fontanería':'plumbing fixture','Electricidad':'electrical hardware','Pintura':'painting supplies','Jardín':'garden hardware','Baño y cocina':'bathroom kitchen fixture','Otros':'hardware product'})[category]||'hardware product'}
function fallbackProductAnalysis(item={},index=0){const title=cleanProductTitle(item.title||'Producto');const category=guessCategory(title+' '+(item.description||''));const sourcePrice=Number(item.sourcePrice||0);const baseDesc=String(item.description||'').replace(/\s+/g,' ').trim().slice(0,700);return {index,title,description:baseDesc||('Artículo de '+category.toLowerCase()+' seleccionado para FVMarket. Disponible en FVMarket. Lo enviamos a tu obra en Fuerteventura.'),category,imageQuery:imageSearchQuery(title,category),keywords:title.toLowerCase().split(/\s+/).filter(x=>x.length>3).slice(0,6),ref:ownReference(title,sourcePrice,category)}}
function responseOutputText(data){if(data&&typeof data.output_text==='string')return data.output_text;for(const item of (data?.output||[])){for(const c of (item?.content||[])){if(c?.type==='output_text'&&typeof c.text==='string')return c.text}}return ''}
async function aiAnalyzeItems(items=[]){const base=items.map((x,i)=>({...x,index:i}));if(!OPENAI_API_KEY)return {mode:'local',warning:'OPENAI_API_KEY no configurada: se usa análisis inteligente local.',products:base.map(fallbackProductAnalysis)};const schema={type:'object',additionalProperties:false,properties:{products:{type:'array',items:{type:'object',additionalProperties:false,properties:{index:{type:'integer'},title:{type:'string'},description:{type:'string'},category:{type:'string',enum:['Construcción','Herramientas','Fontanería','Electricidad','Pintura','Jardín','Baño y cocina','Otros']},imageQuery:{type:'string'},keywords:{type:'array',items:{type:'string'}}},required:['index','title','description','category','imageQuery','keywords']}}},required:['products']};const prompt='Eres el asistente de catalogación de FVMarket, marketplace de ferretería y hogar en Fuerteventura. Para cada producto: conserva index; redacta un título propio y claro en español, sin copiar eslóganes ni mencionar la tienda de origen; escribe una descripción comercial propia de 1-2 frases basada solo en datos presentes, sin inventar medidas, materiales, potencia, marca o prestaciones; elige exactamente una categoría permitida; crea imageQuery breve en inglés para buscar una imagen genérica visualmente similar del tipo de producto, evitando nombres de tiendas y marcas salvo que sean imprescindibles para identificar el tipo de pieza; genera hasta 6 keywords. No inventes disponibilidad ni afiliaciones. Entrada JSON: '+JSON.stringify(base.map(x=>({index:x.index,title:x.title||'',description:x.description||'',category:x.category||'',sourcePrice:Number(x.sourcePrice||0)})));try{const r=await axios.post('https://api.openai.com/v1/responses',{model:OPENAI_MODEL,input:prompt,text:{format:{type:'json_schema',name:'fvmarket_products',strict:true,schema}},max_output_tokens:5000},{timeout:30000,headers:{Authorization:'Bearer '+OPENAI_API_KEY,'Content-Type':'application/json'}});const parsed=JSON.parse(responseOutputText(r.data)||'{}');const out=(parsed.products||[]).map(p=>{const src=base[p.index]||{};const title=cleanProductTitle(p.title||src.title||'Producto');const category=p.category||guessCategory(title);return {...src,...p,title,category,ref:ownReference(title,Number(src.sourcePrice||0),category)}});return {mode:'openai',products:out}}catch(e){return {mode:'local',warning:'La IA no respondió; se aplicó el análisis local.',products:base.map(fallbackProductAnalysis)}}}
async function searchCommonsImages(query='',limit=4){const q=String(query).trim();if(!q)return [];try{const run=async term=>axios.get('https://commons.wikimedia.org/w/api.php',{timeout:12000,headers:{'User-Agent':'FVMarket/1.5 (product image search; contact via site)'},params:{action:'query',generator:'search',gsrsearch:String(term).slice(0,120),gsrnamespace:6,gsrlimit:Math.min(Math.max(Number(limit)||4,1),6),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:700,format:'json',origin:'*'}});let r=await run(q);let pages=Object.values(r.data?.query?.pages||{});if(!pages.length&&q.includes(' ')){r=await run(q.split(' ').slice(0,2).join(' '));pages=Object.values(r.data?.query?.pages||{})}return pages.map(p=>{const ii=p.imageinfo?.[0]||{};const m=ii.extmetadata||{};return {title:p.title||'',url:ii.thumburl||ii.url||'',original:ii.url||'',source:ii.descriptionurl||'',license:m.LicenseShortName?.value||m.UsageTerms?.value||'',author:String(m.Artist?.value||'').replace(/<[^>]*>/g,'').slice(0,160)}}).filter(x=>x.url).slice(0,limit)}catch(e){console.warn('Commons image search failed:',e.response?.status||e.message);return []}}

// FVM_EXTERNAL_IMAGE_SEARCH_V3
function isSpanishImageDomain(value=''){
  try{const h=new URL(String(value)).hostname.toLowerCase();return h.endsWith('.es')||h.includes('.es.')||/(^|\.)amazon\.es$/.test(h)||/(^|\.)leroymerlin\.es$/.test(h)||/(^|\.)obramat\.es$/.test(h)}catch{return false}
}
async function searchOpenverseImages(query='',limit=8){
  const q=String(query).trim();if(!q)return [];
  try{
    const r=await axios.get('https://api.openverse.org/v1/images/',{timeout:12000,headers:{'User-Agent':'FVMarket/1.7'},params:{q:q.slice(0,140),page_size:Math.min(Math.max(Number(limit)||8,3),20),mature:false}});
    return (r.data?.results||[]).map(x=>({title:x.title||'',url:x.thumbnail||x.url||'',original:x.url||'',source:x.foreign_landing_url||x.detail_url||'',license:[x.license,x.license_version].filter(Boolean).join(' ').toUpperCase(),author:x.creator||'',origin:'similar'})).filter(x=>x.url);
  }catch(e){console.warn('Openverse image search failed:',e.response?.status||e.message);return []}
}
function searchTokens(text=''){
  const stop=new Set(['para','con','una','uno','las','los','del','the','and','for','with','from','producto','product','hardware','similar','bathroom','kitchen','fixture']);
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]+/g)?.filter(x=>x.length>2&&!stop.has(x))||[];
}
function imageCandidateScore(x={},query=''){
  const q=searchTokens(query), hay=searchTokens([x.title,x.source,x.url].join(' '));
  const hs=new Set(hay);let score=0;
  for(const t of q)if(hs.has(t))score+=2;
  const dims=String(query).match(/\b\d{2,4}\s*[x×]\s*\d{2,4}\b/ig)||[];
  for(const d of dims)if([x.title,x.source,x.url].join(' ').toLowerCase().includes(d.toLowerCase().replace(/\s/g,'')))score+=5;
  const critical=['mampara','cafetera','taladro','inodoro','lavabo','grifo','fregadero','carretilla','cemento','mortero','puerta','ventana','panel','ducha','coffee','moka','screen','shower','drill','toilet','sink','faucet','wheelbarrow'];
  const qcrit=critical.filter(t=>String(query).toLowerCase().includes(t));
  const full=[x.title,x.source,x.url].join(' ').toLowerCase();
  for(const t of qcrit)score+=full.includes(t)?6:-4;
  try{const h=new URL(String(x.source||x.url||'')).hostname.toLowerCase();if(/\.(?:es|fr|de|it|pt|nl|be|eu|at|ie|pl|cz|dk|se|fi|gr|ro|hu)$/.test(h))score+=2}catch{}
  return score;
}
async function searchBraveImages(query='',limit=8){
  if(!BRAVE_SEARCH_API_KEY)return [];
  try{
    const count=Math.min(Math.max(Number(limit)||8,1),100);
    const r=await axios.get('https://api.search.brave.com/res/v1/images/search',{
      timeout:12000,
      headers:{'Accept':'application/json','Accept-Encoding':'gzip','X-Subscription-Token':BRAVE_SEARCH_API_KEY},
      params:{q:String(query).slice(0,180),count,safesearch:'strict',search_lang:'es',country:'ALL'}
    });
    const rows=r.data?.results||[];
    return rows.map(x=>({
      title:x.title||'',
      url:x.properties?.url||x.thumbnail?.src||'',
      original:x.properties?.url||x.thumbnail?.src||'',
      source:x.url||x.source||'',
      license:'Comprobar derechos/licencia antes de publicar',
      author:'',
      origin:'brave'
    })).filter(x=>x.url);
  }catch(e){
    console.warn('Brave image search failed:',e.response?.status||e.message);
    return [];
  }
}
async function searchExternalImages(query='',limit=8){
  const target=Math.max(3,Math.min(Number(limit)||8,12));const seen=new Set(),pool=[];
  const add=items=>{for(const x of items||[]){const url=String(x.url||'');const src=String(x.source||'');if(!url||seen.has(url))continue;seen.add(url);pool.push({...x,origin:x.origin||'similar'})}};
  add(await searchBraveImages(query,Math.min(target+6,20)));
  add(await searchOpenverseImages(query,target+5));
  add((await searchCommonsImages(query,target+5)).map(x=>({...x,origin:'similar'})));
  const ranked=pool.map(x=>({...x,matchScore:imageCandidateScore(x,query)})).sort((a,b)=>b.matchScore-a.matchScore);
  const good=ranked.filter(x=>x.matchScore>=4);
  return (good.length>=3?good:ranked.filter(x=>x.matchScore>=1)).slice(0,target);
}

// FVM_CATALOG_PARSER_V2
const FVM_CATALOG_DEFAULT_MARGIN = 40;
const FVM_CATALOG_REF_RX = /\b(?:FT|BT|LH|AT|DG|AM|AC|TK|PM|SW|VL|PACK)\s*\d{2,8}\b/gi;
const FVM_CATALOG_PRICE_RX = /\b(?:\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{1,5}(?:[.,]\d{2})?)\s*€/g;

function catalogPriceNumber(raw=''){
  let s=String(raw).replace(/€/g,'').replace(/\s/g,'').trim();
  if(!s)return 0;
  if(/^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/.test(s)){
    s=s.replace(/\./g,'').replace(',','.');
  }else if(s.includes(',')&&s.includes('.')){
    if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  }else if(s.includes(',')){
    s=s.replace(',','.');
  }else if(/^\d+\.\d{3}$/.test(s)){
    s=s.replace('.','');
  }
  const n=Number(s);
  return Number.isFinite(n)&&n>0&&n<=50000?n:0;
}
function catalogRefs(line=''){
  return [...String(line).matchAll(new RegExp(FVM_CATALOG_REF_RX.source,'gi'))]
    .map(m=>String(m[0]).replace(/\s/g,'').toUpperCase());
}
function catalogPrices(line=''){
  return [...String(line).matchAll(new RegExp(FVM_CATALOG_PRICE_RX.source,'g'))]
    .map(m=>catalogPriceNumber(m[0])).filter(Boolean);
}
function cleanCatalogLine(line=''){
  return String(line).replace(/\s+/g,' ').replace(/\u0000/g,'').trim();
}
function catalogSection(lines=[],page=1){
  const joined=lines.slice(0,18).join(' · ');
  const sections=[
    'Herramienta eléctrica · Maquinaria','Jardín · Ordenación','Baños · Ocio y deporte',
    'Bricolaje · Soldadura','Electrodoméstico industrial','Pequeño electrodoméstico',
    'Herramienta eléctrica','Automoción','Agricultura','Ventilación','Camping','Baños','Jardín'
  ];
  const found=sections.find(x=>joined.toLowerCase().includes(x.toLowerCase()));
  return found||(page===1?'Destacados':'Otros');
}
function catalogCategory(section='',text=''){
  const s=String(section).toLowerCase(),t=String(text).toLowerCase();
  if(/herramient|maquinaria|soldadura|automoci/.test(s)||/taladro|sierra|martillo|gato hidrául|compresor|soldador/.test(t))return 'Herramientas';
  if(/baño/.test(s)||/mampara|ducha|lavabo|inodoro|grifo|fregadero/.test(t))return 'Reformas';
  if(/electrodoméstico|ventilación/.test(s)||/ventilador|cocina|horno|frigor|congelador|freidora/.test(t))return 'Reformas';
  if(/jardín|camping|agricultura|ocio|ordenación/.test(s)||/barbacoa|carpa|sombrilla|estanter|sulfat|césped/.test(t))return 'Bricolaje';
  return guessCategory(text);
}
function catalogVariantTokens(line=''){
  const s=String(line);
  const rx=/\(?\d+(?:[.,]\d+)?(?:\s*(?:x|×|\+|-)\s*\d+(?:[.,]\d+)?){1,2}\s*(?:cm|mm|m)?\)?/gi;
  return [...s.matchAll(rx)].map(m=>cleanCatalogLine(m[0])).filter(Boolean);
}
function catalogLineLooksLikeTitle(line=''){
  const s=cleanCatalogLine(line);
  if(!s||s.length<4||s.length>100)return false;
  if(/Julio\s*·?\s*Agosto|mibricolaje|NOVE\s*DAD|PRECIO|REF\b/i.test(s))return false;
  if(catalogRefs(s).length||catalogPrices(s).length)return false;
  if(/^(Medidas?|Alto|Altura|Ancho|Largo|Peso|Potencia|Velocidad|Capacidad|Color|Colores|Diámetro|Ø|Serie)\b/i.test(s))return false;
  if(/^\d+(?:[.,]\d+)?\s*(?:kg|g|cm|mm|m|W|V|Hp|litros?|piezas?|toneladas?)\b/i.test(s))return false;
  if(/[:;]/.test(s)&&s.split(/\s+/).length>10)return false;
  const letters=(s.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)||[]).length;
  return letters>=4;
}
function catalogBaseTitle(lines=[],idx=0,section=''){
  let fallback='';
  for(let j=idx-1;j>=Math.max(0,idx-14);j--){
    const s=cleanCatalogLine(lines[j]);
    if(!s)continue;
    if(!fallback&&catalogLineLooksLikeTitle(s))fallback=s;
    if(catalogLineLooksLikeTitle(s)&&!/^(Serie|Color|Medidas?)/i.test(s)){
      const words=s.split(/\s+/).length;
      if(words<=12)return s;
    }
  }
  return fallback||section||'Producto';
}
function catalogNearbyDescription(lines=[],idx=0){
  const parts=[];
  for(let j=Math.max(0,idx-5);j<=Math.min(lines.length-1,idx+3);j++){
    const s=cleanCatalogLine(lines[j]);
    if(!s||catalogRefs(s).length||catalogPrices(s).length)continue;
    if(/Julio\s*·?\s*Agosto|NOVE\s*DAD|mibricolaje/i.test(s))continue;
    if(s.length>=12&&s.length<=210)parts.push(s);
  }
  return [...new Set(parts)].join(' · ').slice(0,650);
}
async function catalogPageRender(pageData){
  const content=await pageData.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false});
  const rows=[];
  for(const item of content.items||[]){
    const text=cleanCatalogLine(item.str||'');
    if(!text)continue;
    const tr=item.transform||[];const x=Number(tr[4]||0),y=Number(tr[5]||0);
    let row=rows.find(r=>Math.abs(r.y-y)<2.4);
    if(!row){row={y,parts:[]};rows.push(row)}
    row.parts.push({x,text});
  }
  rows.sort((a,b)=>b.y-a.y);
  return rows.map(r=>r.parts.sort((a,b)=>a.x-b.x).map(p=>p.text).join(' ')).join('\n');
}
function catalogCandidatesFromPages(pages=[]){
  const out=[],seen=new Set();
  for(const pg of pages){
    const lines=(pg.lines||[]).map(cleanCatalogLine).filter(Boolean);
    const section=catalogSection(lines,pg.page);
    for(let i=0;i<lines.length;i++){
      const refs=catalogRefs(lines[i]);
      if(!refs.length)continue;
      let priceLine=i,prices=catalogPrices(lines[i]);
      if(!prices.length){
        for(let j=i-1;j>=Math.max(0,i-4);j--){
          const p=catalogPrices(lines[j]);
          if(p.length){priceLine=j;prices=p;break}
        }
      }
      if(!prices.length)continue;
      let variants=[];
      for(let j=priceLine-1;j>=Math.max(0,priceLine-3);j--){
        const v=catalogVariantTokens(lines[j]);
        if(v.length){variants=v;break}
      }
      const baseTitle=catalogBaseTitle(lines,Math.min(i,priceLine),section);
      refs.forEach((sourceRef,k)=>{
        if(seen.has(sourceRef))return;
        const sourcePrice=prices.length===refs.length?prices[k]:(prices[k]||prices[prices.length-1]||0);
        if(!sourcePrice)return;
        const variant=(variants.length===refs.length?variants[k]:(variants.length===1?variants[0]:''))||'';
        let title=cleanProductTitle([baseTitle,variant].filter(Boolean).join(' · '));
        title=title.replace(/\s*·\s*·\s*/g,' · ').slice(0,150);
        if(!title||/^producto$/i.test(title))title='Producto '+sourceRef;
        const category=catalogCategory(section,title);
        const margin=FVM_CATALOG_DEFAULT_MARGIN;
        const addedValue=+(sourcePrice*margin/100).toFixed(2);
        const price=+(sourcePrice+addedValue).toFixed(2);
        out.push({
          title,sourcePrice,margin,addedValue,price,category,
          sourceRef,sourceProvider:'Mi Bricolaje',sourceUrl:'',sourceEan:'',
          catalogPage:pg.page,catalogSection:section,catalogVariant:variant,
          description:catalogNearbyDescription(lines,Math.min(i,priceLine)),
          ref:'',stock:'bajo_pedido',image:'',images:[],
          imageSource:'',imageLicense:'',imageAuthor:'',
          published:false,featured:false,reviewStatus:'borrador'
        });
        seen.add(sourceRef);
      });
      if(out.length>=450)break;
    }
  }
  return out;
}
async function parseCatalogBuffer(buffer,name='catalogo.pdf'){
  let pageNo=0;
  const data=await pdfParse(buffer,{pagerender:async pageData=>{
    pageNo+=1;
    return '[[FVM_PAGE:'+pageNo+']]\n'+await catalogPageRender(pageData);
  }});
  const chunks=String(data.text||'').split(/\[\[FVM_PAGE:(\d+)\]\]/);
  const pages=[];
  for(let i=1;i<chunks.length;i+=2){
    const page=Number(chunks[i])||pages.length+1;
    pages.push({page,lines:String(chunks[i+1]||'').split(/\r?\n/)});
  }
  if(!pages.length){
    pages.push({page:1,lines:String(data.text||'').split(/\r?\n/)});
  }
  const candidates=catalogCandidatesFromPages(pages);
  const sections=[...new Set(candidates.map(x=>x.catalogSection).filter(Boolean))];
  return {
    catalog:{name:String(name||'catalogo.pdf'),provider:'Mi Bricolaje',pages:data.numpages||pages.length,defaultMargin:FVM_CATALOG_DEFAULT_MARGIN},
    pages:data.numpages||pages.length,sections,candidates
  };
}


function isUnsafeUrl(raw){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return true;const h=u.hostname.toLowerCase();return h==='localhost'||h==='127.0.0.1'||h==='::1'||/^10\./.test(h)||/^192\.168\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h)||h.endsWith('.local')}catch(e){return true}}

app.post('/api/admin/import-catalog',catalogEditor,upload.single('catalog'),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:'Selecciona un archivo PDF'});if(!/pdf/i.test(req.file.mimetype||'')&&!/\.pdf$/i.test(req.file.originalname||''))return res.status(400).json({error:'El archivo debe ser PDF'});const result=await parseCatalogBuffer(req.file.buffer,req.file.originalname);res.json(result)}catch(e){res.status(422).json({error:'No se pudo analizar el catálogo PDF. Si es un PDF escaneado necesitaremos procesarlo como imágenes.'})}});
app.post('/api/admin/import-catalog-url',catalogEditor,async(req,res)=>{const url=String(req.body.url||'').trim();if(isUnsafeUrl(url))return res.status(400).json({error:'URL no permitida'});try{const r=await axios.get(url,{responseType:'arraybuffer',timeout:15000,maxContentLength:25*1024*1024,headers:{'User-Agent':'FVMarket/1.2'}});const result=await parseCatalogBuffer(Buffer.from(r.data),String(url).split('/').pop()||'catalogo.pdf');res.json(result)}catch(e){res.status(422).json({error:'No se pudo descargar o leer ese catálogo PDF'})}});
app.post('/api/admin/import-catalog-products',catalogEditor,(req,res)=>{
  const items=Array.isArray(req.body.products)?req.body.products.slice(0,450):[];
  if(!items.length)return res.status(400).json({error:'No hay productos seleccionados'});
  const d=read();let created=0,skipped=0;
  for(const item of items){
    const title=String(item.title||'').trim();if(!title)continue;
    const sourceRef=String(item.sourceRef||'').trim().toUpperCase();
    if(sourceRef&&d.products.some(p=>String(p.sourceRef||'').trim().toUpperCase()===sourceRef)){skipped++;continue}
    const category=String(item.category||guessCategory(title));
    const sourcePrice=Number(item.sourcePrice)||0;
    const margin=Math.max(0,Number(item.margin)||0);
    const addedValue=item.addedValue!=null?Math.max(0,Number(item.addedValue)||0):+(sourcePrice*margin/100).toFixed(2);
    const price=Number(item.price)||+(sourcePrice+addedValue).toFixed(2);
    const p={
      id:id('prd'),title,category,ref:nextProductRef(d,title,category),price,stock:'bajo_pedido',
      image:String(item.image||''),imageSource:String(item.imageSource||''),imageLicense:String(item.imageLicense||''),imageAuthor:String(item.imageAuthor||''),
      sourceUrl:String(item.sourceUrl||''),sourceProvider:String(item.sourceProvider||'Mi Bricolaje'),sourceRef,sourceEan:String(item.sourceEan||''),
      description:String(item.description||''),published:false,featured:!!item.featured,
      sourcePrice,addedValue,margin,
      catalogPage:Number(item.catalogPage)||0,catalogSection:String(item.catalogSection||''),catalogVariant:String(item.catalogVariant||''),
      catalogName:String(item.catalogName||req.body.catalogName||''),reviewStatus:'borrador',
      importedAt:new Date().toISOString()
    };
    p.images=normalizeProductImages(item.images,p.image);
    if(p.images[0])p.image=p.images[0].url;
    d.products.unshift(p);created++;
  }
  save(d);res.json({created,skipped});
});

function numberPrice(v){if(v==null)return 0;let x=String(v).trim().replace(/\s/g,'').replace(/[^0-9,.-]/g,'');if(!x)return 0;if(x.includes(',')&&x.includes('.')){if(x.lastIndexOf(',')>x.lastIndexOf('.'))x=x.replace(/\./g,'').replace(',','.');else x=x.replace(/,/g,'')}else if(x.includes(','))x=x.replace(',','.');const n=Number(x);return Number.isFinite(n)&&n>0?n:0}
function absoluteUrl(value,base){try{return value?new URL(value,base).href:''}catch{return ''}}
function productJsonLd($){const out=[];$('script[type="application/ld+json"]').each((_,el)=>{try{let j=JSON.parse($(el).text());const walk=v=>{if(Array.isArray(v))return v.forEach(walk);if(v&&typeof v==='object'){if(v['@type']==='Product'||(Array.isArray(v['@type'])&&v['@type'].includes('Product')))out.push(v);Object.values(v).forEach(walk)}};walk(j)}catch{}});return out}
function extractProductFromHtml(html,url){const $=cheerio.load(html);const products=productJsonLd($);const prod=products[0]||{};const offers=Array.isArray(prod.offers)?prod.offers[0]:(prod.offers||{});const meta=(sel,attr='content')=>$(sel).first().attr(attr)||'';const title=cleanProductTitle(prod.name||meta('meta[property="og:title"]')||$('h1').first().text()||$('title').text()||'Producto');const description=String(prod.description||meta('meta[property="og:description"]')||meta('meta[name="description"]')||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,900);const imageRaw=Array.isArray(prod.image)?prod.image[0]:(prod.image||meta('meta[property="og:image"]')||meta('link[rel="image_src"]','href')||$('img').first().attr('src')||'');let sourcePrice=numberPrice(offers.price||offers.lowPrice||meta('meta[property="product:price:amount"]')||meta('meta[property="og:price:amount"]')||meta('meta[itemprop="price"]')||$('[itemprop="price"]').first().attr('content')||$('[data-price]').first().attr('data-price'));if(!sourcePrice){const candidates=[];$('body').find('*').each((_,el)=>{const txt=$(el).clone().children().remove().end().text().trim();if(txt&&txt.length<80&&/[€]/.test(txt)){const m=txt.match(/(?:€\s*)?(\d{1,5}(?:[.,]\d{2}))(?:\s*€)?/);if(m){const n=numberPrice(m[1]);if(n)candidates.push(n)}}});sourcePrice=candidates.find(n=>n>0)||0}const category=guessCategory(title+' '+description);const sourceImages=collectSourceImages($,prod,url);const main=sourceImages[0]?.url||absoluteUrl(imageRaw,url);const sourceProvider=providerFromUrl(url);const bodyText=$('body').text().replace(/\s+/g,' ');const sourceRef=String(prod.sku||prod.mpn||prod.productID||meta('meta[itemprop=\"sku\"]')||$('[itemprop=\"sku\"]').first().attr('content')||$('[itemprop=\"sku\"]').first().text()||(bodyText.match(/(?:Ref(?:erencia)?\.?|SKU|Código)\s*[:#-]?\s*([A-Z0-9._\/-]{3,40})/i)||[])[1]||'').trim().slice(0,60);const sourceEan=String(prod.gtin13||prod.gtin14||prod.gtin12||prod.gtin8||prod.gtin||meta('meta[itemprop=\"gtin13\"]')||meta('meta[itemprop=\"gtin\"]')||$('[itemprop^=\"gtin\"]').first().attr('content')||(bodyText.match(/(?:EAN|GTIN)\s*[:#-]?\s*(\d{8,14})/i)||[])[1]||'').replace(/\s/g,'').slice(0,20);return {title,description,image:main,sourceImages,images:sourceImages,sourceUrl:url,sourceProvider,sourceRef,sourceEan,sourcePrice,margin:0,addedValue:0,price:sourcePrice?+sourcePrice.toFixed(2):0,category,ref:ownReference(title,sourcePrice,category),stock:'bajo_pedido',published:false,featured:false}}
app.post('/api/admin/import-url',catalogEditor,async(req,res)=>{const url=String(req.body.url||'').trim();if(isUnsafeUrl(url))return res.status(400).json({error:'URL no permitida'});try{const r=await axios.get(url,{timeout:15000,maxRedirects:5,maxContentLength:3*1024*1024,headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Safari/537.36','Accept':'text/html,application/xhtml+xml','Accept-Language':'es-ES,es;q=0.9,en;q=0.7','Cache-Control':'no-cache'}});const p=extractProductFromHtml(r.data,url);if(!p.title||p.title==='Producto')return res.status(422).json({error:'La página no expone una ficha de producto legible.'});res.json(p)}catch(e){const status=e.response?.status;res.status(422).json({error:status?('La tienda respondió '+status+' y no permite leer esa ficha automáticamente. Puedes introducir el precio origen manualmente y usar la IA/imágenes.'):('No se pudo leer esa URL. Comprueba que sea una ficha pública de producto.')})}});


app.get('/api/admin/ai-status',catalogEditor,(req,res)=>res.json({openai:!!OPENAI_API_KEY,model:OPENAI_MODEL,braveImages:!!BRAVE_SEARCH_API_KEY,imageSearch:(BRAVE_SEARCH_API_KEY?'Brave Images + Openverse + Wikimedia':'Openverse + Wikimedia (Brave pendiente de credencial)')+' · búsqueda internacional y europea'}));
app.post('/api/admin/ai-product',catalogEditor,async(req,res)=>{const item=req.body||{};const result=await aiAnalyzeItems([item]);const p=result.products?.[0]||fallbackProductAnalysis(item,0);const sourceImages=normalizeProductImages(item.sourceImages||[],item.sourceUrl?item.image:'').map(x=>({...x,origin:'source'}));const searchQuery=[item.title,p.title,p.imageQuery,item.sourceRef].filter(Boolean).join(' ');const alternativeImages=await searchExternalImages(searchQuery.slice(0,180),8);const images=alternativeImages.slice(0,8);const first=alternativeImages[0]||null;res.json({...p,aiMode:result.mode,warning:result.warning||'',sourceImages,alternativeImages,images,image:first?.url||'',imageSource:first?.source||'',imageLicense:first?.license||'',imageAuthor:first?.author||''})});
app.post('/api/admin/ai-catalog',catalogEditor,async(req,res)=>{const items=Array.isArray(req.body.products)?req.body.products.slice(0,30):[];if(!items.length)return res.status(400).json({error:'No hay productos para analizar'});const result=await aiAnalyzeItems(items);const products=[];for(const p of (result.products||[])){const images=await searchExternalImages((p.title+' '+(p.imageQuery||'')).slice(0,140),6);const first=images[0]||null;products.push({...p,images,alternativeImages:images,image:first?.url||'',imageSource:first?.source||'',imageLicense:first?.license||'',imageAuthor:first?.author||''})}res.json({mode:result.mode,warning:result.warning||'',products})});


// FVM_MIBRICOLAJE_IMPORT_V8
const MB_ALLOWED_PREFIXES=/^(?:BT|FT|LH|DG|AM|AC|TK|PM|SW|VL)\d{2,10}$/i;
const MB_BASE='https://mibricolaje.com';
function isMiBricolajeUrl(raw=''){
  try{const u=new URL(String(raw));const h=u.hostname.toLowerCase().replace(/^www\./,'');return u.protocol==='https:'&&h==='mibricolaje.com'}catch{return false}
}
function mbHeaders(){return {'User-Agent':'FVMarket/2.0 (admin-assisted product lookup; one product at a time)','Accept':'text/html,application/xhtml+xml','Accept-Language':'es-ES,es;q=0.9','Cache-Control':'no-cache'}}
async function mbGet(url){return axios.get(url,{timeout:15000,maxRedirects:4,maxContentLength:4*1024*1024,headers:mbHeaders()})}
function mbProductLinkFromSearch(html,ref,base=MB_BASE){
  const $=cheerio.load(html);const target=String(ref).toUpperCase();let found='';
  $('article,.product-miniature,.product-item,.product').each((_,el)=>{
    if(found)return;const card=$(el);const text=card.text().replace(/\s+/g,' ').toUpperCase();
    if(text.includes(target)){const a=card.find('a[href]').filter((_,x)=>/\.html(?:\?|$)/i.test($(x).attr('href')||'')).first();const href=a.attr('href')||card.find('a[href]').first().attr('href')||'';if(href)found=absoluteUrl(href,base)}
  });
  if(found)return found;
  $('a[href]').each((_,el)=>{if(found)return;const href=$(el).attr('href')||'';const text=$(el).text().replace(/\s+/g,' ').toUpperCase();if(text.includes(target)&&/\.html(?:\?|$)/i.test(href))found=absoluteUrl(href,base)});
  return found;
}
async function resolveMiBricolajeInput(input=''){
  const q=String(input||'').trim();if(!q)throw new Error('Introduce una referencia o URL');
  if(/^https?:\/\//i.test(q)){if(!isMiBricolajeUrl(q))throw new Error('Solo se permiten fichas públicas de mibricolaje.com');return q}
  const ref=q.toUpperCase().replace(/\s+/g,'');if(!MB_ALLOWED_PREFIXES.test(ref))throw new Error('Referencia no válida. Usa BT, FT, LH, DG, AM, AC, TK, PM, SW o VL seguida de números.');
  const searches=[
    MB_BASE+'/buscar?controller=search&s='+encodeURIComponent(ref),
    MB_BASE+'/search?controller=search&s='+encodeURIComponent(ref),
    MB_BASE+'/?s='+encodeURIComponent(ref)
  ];
  for(const u of searches){try{const r=await mbGet(u);const found=mbProductLinkFromSearch(r.data,ref,u);if(found&&isMiBricolajeUrl(found))return found}catch{}}
  // Fallback limitado a listados públicos ordenados por referencia de las marcas conocidas.
  const brandByPrefix={FT:'13_fargo-tools',AM:'10_airmec',AC:'8_aicer',TK:'49_takuma',PM:'39_pamacon',SW:'46_sowell',LH:'31_larryhouse'};
  const slug=brandByPrefix[ref.slice(0,2)];
  if(slug){try{const u=MB_BASE+'/'+slug+'?order=product.reference.asc&productListView=list&resultsPerPage=99999';const r=await mbGet(u);const found=mbProductLinkFromSearch(r.data,ref,u);if(found&&isMiBricolajeUrl(found))return found}catch{}}
  throw new Error('No encontré esa referencia en MiBricolaje. Puedes pegar la URL exacta de la ficha.');
}
function mbBrand(prod={},$){
  const b=prod.brand;let name='';if(typeof b==='string')name=b;else if(b&&typeof b==='object')name=b.name||b['@id']||'';
  if(!name)name=$('[itemprop="brand"]').first().text()||$('.product-manufacturer,.manufacturer-name,.brand').first().text()||'';
  return String(name).replace(/\s+/g,' ').trim().slice(0,80)
}
function mbFactsFromHtml(html,url){
  const $=cheerio.load(html);const products=productJsonLd($);const prod=products[0]||{};const offers=Array.isArray(prod.offers)?prod.offers[0]:(prod.offers||{});
  const meta=(sel,attr='content')=>$(sel).first().attr(attr)||'';
  const bodyText=$('body').text().replace(/\s+/g,' ').trim();
  const sourceTitle=cleanProductTitle(prod.name||meta('meta[property="og:title"]')||$('h1').first().text()||'Producto');
  const sourceDescription=String(prod.description||meta('meta[property="og:description"]')||meta('meta[name="description"]')||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,1800);
  let sourcePrice=numberPrice(offers.price||offers.lowPrice||meta('meta[property="product:price:amount"]')||meta('meta[itemprop="price"]')||$('[itemprop="price"]').first().attr('content')||$('[data-price]').first().attr('data-price'));
  if(!sourcePrice){const m=bodyText.match(/(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{2})\s*€/);if(m)sourcePrice=numberPrice(m[0])}
  const sourceRef=String(prod.sku||prod.mpn||prod.productID||(bodyText.match(/Referencia\s*:\s*([A-Z]{2}\d{2,10})/i)||[])[1]||'').trim().toUpperCase();
  const sourceEan=String(prod.gtin13||prod.gtin14||prod.gtin12||prod.gtin8||prod.gtin||(bodyText.match(/(?:EAN|GTIN)\s*[:#-]?\s*(\d{8,14})/i)||[])[1]||'').replace(/\s/g,'').slice(0,20);
  const sourceBrand=mbBrand(prod,$);
  const av=String(offers.availability||'');const sourceAvailability=av?av.split('/').pop():/\bDisponible\b/i.test(bodyText)?'Disponible':'';
  const sourceTaxNote=/impuestos?\s+excluidos?/i.test(bodyText)?'Impuestos excluidos':(/impuestos?\s+incluidos?/i.test(bodyText)?'Impuestos incluidos':'');
  if(!sourcePrice)throw new Error('No se pudo leer el precio de origen');
  if(!sourceRef||!MB_ALLOWED_PREFIXES.test(sourceRef))throw new Error('La ficha no contiene una referencia válida de las familias configuradas');
  const sourceImages=collectSourceImages($,prod,url).map(x=>x.url).filter(Boolean).slice(0,6);
  return {sourceTitle,sourceDescription,sourcePrice,sourceRef,sourceEan,sourceBrand,sourceAvailability,sourceTaxNote,sourceUrl:url,sourceImages};
}
function mbFallbackCopy(f={}){
  const category=guessCategory((f.sourceTitle||'')+' '+(f.sourceDescription||''));
  const brand=f.sourceBrand?(' '+f.sourceBrand):'';
  const title=cleanProductTitle(String(f.sourceTitle||('Artículo'+brand)).replace(/\s+/g,' '));
  return {title,category,description:'Producto de '+category.toLowerCase()+' disponible en FVMarket en FVMarket. La ficha comercial se revisa y redacta de forma independiente antes de su publicación.'}
}
async function mbCandidate(input,margin=40){
  const sourceUrl=await resolveMiBricolajeInput(input);const r=await mbGet(sourceUrl);const f=mbFactsFromHtml(r.data,sourceUrl);
  let own=mbFallbackCopy(f);const ai=await aiAnalyzeItems([{title:f.sourceTitle,description:f.sourceDescription,sourcePrice:f.sourcePrice,sourceRef:f.sourceRef}]);
  if(ai.mode==='openai'&&ai.products?.[0]){const p=ai.products[0];own={title:cleanProductTitle(p.title||own.title),category:p.category||own.category,description:String(p.description||own.description).replace(/\s+/g,' ').trim().slice(0,700)}}
  const m=Math.max(0,Math.min(300,Number(margin)||40));const addedValue=+(f.sourcePrice*m/100).toFixed(2);const price=+(f.sourcePrice+addedValue).toFixed(2);
  return {...own,ref:nextProductRef(read(),own.title,own.category),sourceProvider:'Mi Bricolaje',sourceRef:f.sourceRef,sourceEan:f.sourceEan,sourceBrand:f.sourceBrand,sourceAvailability:f.sourceAvailability,sourceTaxNote:f.sourceTaxNote,sourceUrl:f.sourceUrl,sourceImages:f.sourceImages||[],sourcePrice:f.sourcePrice,margin:m,addedValue,price,stock:'bajo_pedido',published:false,featured:false,image:'',images:[],imageSource:'',imageLicense:'',imageAuthor:'',reviewStatus:'borrador',aiMode:ai.mode||'local'}
}
app.post('/api/admin/mibricolaje/analyze',catalogEditor,async(req,res)=>{
  const raw=Array.isArray(req.body.inputs)?req.body.inputs:[req.body.input];const inputs=raw.map(x=>String(x||'').trim()).filter(Boolean).slice(0,20);if(!inputs.length)return res.status(400).json({error:'Introduce al menos una referencia o URL'});
  const margin=Math.max(0,Math.min(300,Number(req.body.margin)||40));const products=[],errors=[];
  for(const input of inputs){try{products.push(await mbCandidate(input,margin))}catch(e){errors.push({input,error:String(e.message||e)})}}
  res.json({products,errors,policy:{source:'Mi Bricolaje',copyImages:false,copyDescriptions:false,internalAssociation:true,defaultMargin:margin}})
});
app.post('/api/admin/mibricolaje/import',catalogEditor,(req,res)=>{
  const items=Array.isArray(req.body.products)?req.body.products.slice(0,50):[];if(!items.length)return res.status(400).json({error:'No hay productos seleccionados'});
  const d=read();let created=0,skipped=0;const products=[];
  for(const x of items){const sourceRef=String(x.sourceRef||'').toUpperCase().trim();if(!MB_ALLOWED_PREFIXES.test(sourceRef)){skipped++;continue}if(d.products.some(p=>String(p.sourceProvider||'')==='Mi Bricolaje'&&String(p.sourceRef||'').toUpperCase()===sourceRef)){skipped++;continue}
    const title=cleanProductTitle(x.title||('Producto '+sourceRef));const category=String(x.category||guessCategory(title));const sourcePrice=Number(x.sourcePrice)||0;if(!sourcePrice){skipped++;continue}const margin=Math.max(0,Math.min(300,Number(x.margin)||40));const addedValue=+(sourcePrice*margin/100).toFixed(2);const price=+(sourcePrice+addedValue).toFixed(2);
    const aiImages=normalizeProductImages(Array.isArray(x.images)?x.images:[]).filter(im=>String(im.origin||'')==='ai-render'||/^data:image\//i.test(String(im.url||''))).slice(0,6);const mainImage=aiImages[0]?.url||'';const requestedRef=String(x.ref||'').toUpperCase().trim();const ownRef=(requestedRef.startsWith('FVM-')&&!d.products.some(q=>String(q.ref||'').toUpperCase()===requestedRef))?requestedRef:nextProductRef(d,title,category);
    const p={id:id('prd'),title,category,subcategory:String(x.subcategory||''),ref:ownRef,price,stock:'bajo_pedido',image:mainImage,images:aiImages,imageSource:(aiImages.some(im=>im.origin==='ai-render')?'IA FVMarket':'Preparación FVMarket'),imageLicense:'',imageAuthor:'',description:String(x.description||'').slice(0,900),published:false,featured:false,onOffer:false,discountPct:0,sourceProvider:'Mi Bricolaje',sourceRef,sourceEan:String(x.sourceEan||''),sourceBrand:String(x.sourceBrand||''),sourceAvailability:String(x.sourceAvailability||''),sourceTaxNote:String(x.sourceTaxNote||''),sourceUrl:String(x.sourceUrl||''),sourceImages:Array.isArray(x.sourceImages)?x.sourceImages.slice(0,6):[],sourcePrice,margin,addedValue,sourceCheckedAt:new Date().toISOString(),sourceSync:'mibricolaje_v8',reviewStatus:'borrador',importedAt:new Date().toISOString()};d.products.unshift(p);products.push(p);created++}
  save(d);res.json({created,skipped,products})
});

// FVM_MIBRICOLAJE_IMAGES_V9
async function mbImageDataUrl(raw=''){
  const url=String(raw||'').trim();if(!url||isUnsafeUrl(url))throw new Error('Imagen origen no válida');
  const r=await axios.get(url,{responseType:'arraybuffer',timeout:18000,maxRedirects:4,maxContentLength:6*1024*1024,headers:{...mbHeaders(),Accept:'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'}});
  const ct=String(r.headers?.['content-type']||'image/jpeg').split(';')[0].trim().toLowerCase();if(!/^image\//.test(ct))throw new Error('El origen no devolvió una imagen');
  return `data:${ct};base64,${Buffer.from(r.data).toString('base64')}`
}
async function mbGenerateImageVariant({title='',sourceRef='',inputImages=[],variant=0}={}){
  if(!OPENAI_API_KEY)throw new Error('OPENAI_API_KEY no configurada');
  const looks=['foto de catálogo limpia, vista tres cuartos, fondo blanco suave','vista frontal de comercio electrónico, fondo gris muy claro','ángulo ligeramente elevado, estudio neutro y sombra natural'];
  const prompt=`Genera una fotografía NUEVA y original para la ficha de FVMarket del producto ${title||sourceRef}. Usa las imágenes aportadas únicamente como referencia visual del artículo. Conserva el tipo de producto, forma, proporciones, color y características visibles importantes. Cambia composición, iluminación y fondo para que no sea una copia de la fotografía origen. ${looks[variant%looks.length]}. No añadas accesorios que no estén presentes. No añadas logos de tiendas, marcas de agua, carteles, precios ni texto. Si existe una marca de fabricante integrada físicamente en el producto, no inventes ni modifiques su contenido. Producto centrado, realista y completo, sin personas.`;
  const content=[{type:'input_text',text:prompt},...inputImages.slice(0,2).map(image_url=>({type:'input_image',image_url,detail:'high'}))];
  const body={model:OPENAI_MODEL,input:[{role:'user',content}],tools:[{type:'image_generation',action:'edit',model:OPENAI_IMAGE_MODEL,size:'1024x1024',quality:'medium',output_format:'jpeg',output_compression:84}],tool_choice:{type:'image_generation'}};
  const r=await axios.post('https://api.openai.com/v1/responses',body,{timeout:120000,headers:{Authorization:'Bearer '+OPENAI_API_KEY,'Content-Type':'application/json'}});
  const out=(r.data?.output||[]).find(x=>x?.type==='image_generation_call'&&x?.result);if(!out?.result)throw new Error('La IA no devolvió una imagen');
  return {url:'data:image/jpeg;base64,'+out.result,source:'IA FVMarket',license:'',author:'',origin:'ai-render',model:OPENAI_IMAGE_MODEL}
}
app.post('/api/admin/mibricolaje/prepare-images',catalogEditor,async(req,res)=>{
  const src=(Array.isArray(req.body.sourceImages)?req.body.sourceImages:[]).map(x=>typeof x==='string'?x:x?.url).filter(Boolean).slice(0,3);
  if(!src.length)return res.status(400).json({error:'No hay imágenes del artículo para preparar'});
  try{
    const dataUrls=[];for(const u of src){try{dataUrls.push(await mbImageDataUrl(u))}catch{}}
    if(!dataUrls.length)return res.status(422).json({error:'No se pudieron leer las imágenes del artículo origen'});
    const images=await prepareImages(dataUrls,req.body.count||3);
    res.json({images,mode:'free',cost:0});
  }catch(e){console.error('free image prep',e);res.status(500).json({error:'No se pudieron preparar las imágenes: '+String(e.message||e)})}
});

app.post('/api/admin/mibricolaje/render-images',catalogEditor,async(req,res)=>{
  if(!OPENAI_API_KEY)return res.status(503).json({error:'La generación de imágenes requiere OPENAI_API_KEY en Render'});
  const src=(Array.isArray(req.body.sourceImages)?req.body.sourceImages:[]).map(x=>typeof x==='string'?x:x?.url).filter(Boolean).slice(0,2);if(!src.length)return res.status(400).json({error:'No hay imágenes del artículo para usar como referencia visual'});
  try{
    const inputImages=[];for(const u of src){try{inputImages.push(await mbImageDataUrl(u))}catch{}}
    if(!inputImages.length)return res.status(422).json({error:'No se pudieron leer las imágenes del artículo origen'});
    const count=Math.max(1,Math.min(3,Number(req.body.count)||3));const jobs=[];for(let i=0;i<count;i++)jobs.push(mbGenerateImageVariant({title:String(req.body.title||''),sourceRef:String(req.body.sourceRef||''),inputImages,variant:i}));
    const settled=await Promise.allSettled(jobs);const images=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);if(!images.length){const err=settled.find(x=>x.status==='rejected');throw new Error(err?.reason?.response?.data?.error?.message||err?.reason?.message||'No se pudieron generar imágenes')}
    res.json({images,model:OPENAI_IMAGE_MODEL,count:images.length})
  }catch(e){res.status(422).json({error:e.response?.data?.error?.message||String(e.message||'No se pudieron generar imágenes IA')})}
});

app.post('/api/admin/mibricolaje/refresh/:id',catalogEditor,async(req,res)=>{
  const d=read();const p=d.products.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Producto no encontrado'});if(p.sourceProvider!=='Mi Bricolaje'||!isMiBricolajeUrl(p.sourceUrl))return res.status(400).json({error:'El producto no está asociado a MiBricolaje'});
  try{const r=await mbGet(p.sourceUrl);const f=mbFactsFromHtml(r.data,p.sourceUrl);const oldSourcePrice=Number(p.sourcePrice)||0;p.sourcePrice=f.sourcePrice;p.sourceAvailability=f.sourceAvailability;p.sourceTaxNote=f.sourceTaxNote;p.sourceCheckedAt=new Date().toISOString();p.addedValue=+(f.sourcePrice*(Number(p.margin)||0)/100).toFixed(2);p.price=+(f.sourcePrice+p.addedValue).toFixed(2);save(d);res.json({product:p,change:{oldSourcePrice,newSourcePrice:f.sourcePrice}})}catch(e){res.status(422).json({error:String(e.message||'No se pudo actualizar el origen')})}
});

app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));


app.get('/api/admin/catalog-taxonomy',catalogEditor,(req,res)=>{const d=read();ensureCatalogSettings(d);res.json({categories:d.settings.categories,subcategories:d.settings.subcategories})});
app.put('/api/admin/catalog-taxonomy',catalogEditor,(req,res)=>{const d=read();ensureCatalogSettings(d);d.settings.categories=['Construcción','Bricolaje','Herramientas','Reformas'];d.settings.subcategories=req.body.subcategories&&typeof req.body.subcategories==='object'?req.body.subcategories:d.settings.subcategories;const r=Array.isArray(d.settings.subcategories['Reformas'])?d.settings.subcategories['Reformas']:[];d.settings.subcategories['Reformas']=[...new Set([...r,'Baño','Cocina'])];save(d);res.json({categories:d.settings.categories,subcategories:d.settings.subcategories})});
app.post('/api/rutafv/quote',optionalAuth,async(req,res)=>{
  let cacheKey='';
  try{
    const actorId=requestActorId(req);if(!actorId)return res.status(400).json({error:'No se pudo identificar esta sesión para calcular el transporte'});
    const d=read(),u=req.user?(d.users||[]).find(x=>x.id===req.user.id)||{}:{},c=req.body.customer||{};
    const customer={name:String(c.name||u.name||''),email:String(c.email||u.email||req.user?.email||''),phone:String(c.phone||req.body.phone||u.phone||'')};
    const destination={address:String(c.address||req.body.address||''),city:String(c.city||req.body.city||''),postalCode:String(c.postalCode||req.body.postalCode||''),notes:String(c.notes||req.body.notes||'')};
    if(!customer.name||!customer.email||!customer.phone||!destination.address||!destination.city||!destination.postalCode)return res.status(400).json({error:'Faltan datos del cliente o de entrega'});
    if(String(req.body.deliveryMode||'normal').toLowerCase()==='express'||req.body.express===true)return res.status(422).json({error:'Los productos de FVMarket no admiten envío exprés: FVMarket no tiene stock físico.'});
    const items=[];
    for(const x of req.body.items||[]){
      const p=d.products.find(y=>y.id===x.id);
      if(p)items.push({id:p.id,ref:p.ref,title:p.title,qty:Math.max(1,Number(x.qty)||1),weightKg:Number(p.weightKg||0),supplierId:String(p.supplierId||''),sourceProvider:p.sourceProvider||'',sourceUrl:p.sourceUrl||''});
    }
    if(!items.length)return res.status(400).json({error:'No hay productos válidos para calcular el transporte'});
    const origin=fvmarketOrigin(d),originDetails=fvmarketOriginSnapshot(d);
    const destinationText=[destination.address,destination.city,destination.postalCode].filter(Boolean).join(', ');
    cacheKey=rutafvQuoteKey(actorId,origin,destinationText,req.body.items||items);
    const now=Date.now();pruneRutaFVQuoteState(now);
    const cached=rutafvQuoteCache.get(cacheKey);
    if(cached&&cached.expiresAt>now)return res.json(decorateTransportQuote(cached.quote,actorId,req.body.items||items,destination));
    if(rutafvQuoteCircuitOpenUntil>now){
      const retryAfter=Math.max(1,Math.ceil((rutafvQuoteCircuitOpenUntil-now)/1000));
      res.set('Retry-After',String(retryAfter));
      return res.status(429).json({error:'RutaFV está temporalmente saturado. El cálculo se reintentará cuando se libere.'});
    }
    let pending=rutafvQuoteInflight.get(cacheKey);
    if(!pending){
      const lastExternal=rutafvQuoteLastExternal.get(actorId)||0;
      if(now-lastExternal<RUTAFV_QUOTE_MIN_INTERVAL_MS){
        const retryAfter=Math.max(1,Math.ceil((RUTAFV_QUOTE_MIN_INTERVAL_MS-(now-lastExternal))/1000));
        res.set('Retry-After',String(retryAfter));
        return res.status(429).json({error:'El cálculo de transporte está temporalmente limitado. Reintentaremos en unos segundos.'});
      }
      rutafvQuoteLastExternal.set(actorId,now);
      const payload={clientCode:d.settings.rutaFVClientCode||RUTAFV_CLIENT_CODE,customer,origin,originDetails,destination:destinationText,destinationText,items,orderSource:'FVMarket',fulfillmentModel:'sin_stock_fisico',deliveryMode:'normal',express:false};
      pending=rutaFVRequest(RUTAFV_QUOTE_PATH,payload).then(q=>{rutafvQuoteCache.set(cacheKey,{quote:q,expiresAt:Date.now()+RUTAFV_QUOTE_CACHE_TTL_MS});return q}).finally(()=>rutafvQuoteInflight.delete(cacheKey));
      rutafvQuoteInflight.set(cacheKey,pending);
    }
    const q=await pending;
    return res.json(decorateTransportQuote(q,actorId,req.body.items||items,destination));
  }catch(e){
    if(Number(e?.status)===429){
      const cooldownMs=Math.max(30000,(Number(e.retryAfter)||30)*1000);
      rutafvQuoteCircuitOpenUntil=Date.now()+cooldownMs;
      res.set('Retry-After',String(Math.ceil(cooldownMs/1000)));
      return res.status(429).json({error:'RutaFV está temporalmente saturado. El cálculo se reintentará cuando se libere.'});
    }
    return res.status(503).json({error:(e.name==='TimeoutError'||e.name==='AbortError')?'RutaFV no respondió dentro del tiempo esperado':rutaFVErrorMessage(e?.message||e,'No se pudo calcular el transporte')});
  }
});
app.get('/api/rutafv/address-search',optionalAuth,async(req,res)=>{try{const q=String(req.query.q||'').trim();if(q.length<3)return res.json({results:[]});const data=await rutaFVGet('/api/integrations/fvmarket/address-search',{q,limit:'5'});res.json(data)}catch(e){res.status(503).json({error:e.message})}});
function orderReadyForRutaFV(o={}){if(o.fulfillment?.readyForRutaFV===true||o.readyForRutaFV===true)return true;const ready=new Set(['available','available_at_supplier','received','recibido','listo','ready']);const items=Array.isArray(o.items)?o.items:[];return items.length>0&&items.every(x=>ready.has(String(x.procurement?.status||x.fulfillmentStatus||'').toLowerCase()))}
async function createRutaFVDelivery(d,o){if(!o?.transport?.requested)return null;if(!paidOrderStatus(o.status))throw new Error('El pedido aún no está pagado');if(!orderReadyForRutaFV(o))throw new Error('El pedido aún no está listo: faltan productos por recibir del proveedor');if(o.transport.deliveryId)return {id:o.transport.deliveryId,reused:true};const u=d.users.find(x=>x.id===o.userId)||{},address=String(o.customer?.address||o.address||'').trim(),city=String(o.customer?.city||o.city||'').trim(),postalCode=String(o.customer?.postalCode||o.postalCode||'').trim(),notes=String(o.customer?.notes||o.notes||'').trim(),destination=[address,city,postalCode].filter(Boolean).join(', ');if(!address||!city||!postalCode)throw new Error('El pedido no tiene una dirección de entrega completa');const payload={clientCode:RUTAFV_CLIENT_CODE,externalOrderId:o.id,externalOrderNumber:o.number,customer:{name:o.customer?.name||u.name||'',email:o.customer?.email||u.email||'',phone:o.customer?.phone||o.phone||'',city,postalCode,notes},origin:fvmarketOrigin(d),destination,transportAmount:o.delivery,transportPaid:true,items:(o.items||[]).map(x=>({ref:x.ref,title:x.title,qty:x.qty,weightKg:Number(x.weightKg||x.procurement?.weightKg||0),supplierId:x.procurement?.supplierId||'',sourceProvider:x.procurement?.provider||''}))};const r=await rutaFVRequest(RUTAFV_DELIVERY_PATH,payload);o.transport.deliveryId=String(r.id||r.deliveryId||r.expeditionId||'');o.transport.status=o.transport.deliveryId?'creado_en_rutafv':'pendiente_planificacion';o.transport.syncedAt=new Date().toISOString();o.transport.syncResponse={status:r.status||'',provider:r.provider||'RutaFV'};o.status=o.transport.deliveryId?'enviado_a_rutafv':o.status;return r}

app.post('/api/admin/orders/:id/create-rutafv-delivery',ordersManager,async(req,res)=>{try{const d=read(),o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Pedido no encontrado'});if(!o.transport?.requested)return res.status(400).json({error:'Este pedido no tiene transporte RutaFV'});if(!paidOrderStatus(o.status))return res.status(409).json({error:'El pedido debe estar pagado antes de enviarlo a RutaFV'});if(!orderReadyForRutaFV(o))return res.status(409).json({error:'Aún faltan productos por recibir del proveedor'});await createRutaFVDelivery(d,o);operations.ensureLedgerForOrder(d,o);save(d);res.json(o)}catch(e){res.status(503).json({error:e.message})}});

app.post('/api/admin/orders/:id/mark-ready-for-rutafv',ordersManager,async(req,res)=>{try{const d=read(),o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Pedido no encontrado'});o.fulfillment=o.fulfillment||{};o.fulfillment.readyForRutaFV=true;o.fulfillment.readyAt=new Date().toISOString();o.fulfillment.status='listo_para_rutafv';if(paidOrderStatus(o.status))await createRutaFVDelivery(d,o);else{o.transport=o.transport||{};o.transport.status='pendiente_pago'}if(paidOrderStatus(o.status)&&o.transport?.deliveryId)o.status='enviado_a_rutafv';save(d);res.json(o)}catch(e){res.status(409).json({error:e.message})}});

// FVM_OPERATIONS_ACCOUNTING_ROUTES_V1
operations.registerOperationsRoutes(app,{read,save,id,ordersManager,admin,rutaFVRequest,RUTAFV_DELIVERY_PATH,RUTAFV_CLIENT_CODE,paidOrderStatus,issueInvoiceForOrder,recordInvoiceIssued:operations.recordInvoiceIssued,scheduleOrderEmail});

// FVM_PROCUREMENT_CONTROL_ROUTES_V2
procurementV2.registerProcurementRoutes(app,{read,save,ordersManager,transitionOrder:operations.transitionOrder,ensureLedgerForOrder:operations.ensureLedgerForOrder,createRutaFVDelivery,paidOrderStatus});


// FVM_SUPPLIER_SIMILAR_IMAGES_V17
app.post('/api/admin/suppliers/:id/search-images',catalogEditor,async(req,res)=>{
  const d=read();const supplier=(d.suppliers||[]).find(x=>x.id===req.params.id);
  if(!supplier)return res.status(404).json({error:'Proveedor no encontrado'});
  const title=String(req.body?.title||'').trim(),brand=String(req.body?.brand||'').trim(),sourceRef=String(req.body?.sourceRef||'').trim();
  const query=[sourceRef,brand,title].filter(Boolean).join(' ').slice(0,180);
  if(!query)return res.status(400).json({error:'Indica nombre o referencia para buscar imágenes'});
  try{const images=await searchExternalImages(query,Math.max(4,Math.min(12,Number(req.body?.limit)||12)));res.set('Cache-Control','no-store');res.json({query,images,includesEuropeanDomains:true})}
  catch(e){res.status(502).json({error:'No se pudo completar la búsqueda de imágenes: '+String(e.message||e)})}
});
app.get('/api/admin/persistence-status',admin,(req,res)=>res.json(persistence.status()));

// FVM_PROVIDER_ROUTES_V15 - API routes must be registered before the storefront catch-all.
registerProviderSourceRoutes(app,admin,{read,save,id,nextProductRef,aiAnalyzeItems,guessCategory,cleanProductTitle,normalizeProductImages,prepareImages});

app.get('*',(req,res)=>{res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.set('Pragma','no-cache');res.set('Expires','0');res.sendFile(path.join(__dirname,'public','index.html'));});
(async()=>{try{await persistence.init();read()}catch(e){console.error('FVMarket persistence bootstrap:',e)}app.listen(PORT,'0.0.0.0',()=>console.log(`FVMarket listening on ${PORT}`))})();
