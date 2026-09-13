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
const {registerProviderSourceRoutes} = require('./provider_sources_v12');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.createHash('sha256').update('fvmarket-dev-' + (process.env.RENDER_SERVICE_ID || 'local')).digest('hex');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
// FVM_CUSTOMER_ACCOUNTS_V2
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || '').trim();
const PUBLIC_URL = String(process.env.PUBLIC_URL || '').trim().replace(/\/$/,'');
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
const ADMIN_PIN = String(process.env.ADMIN_PIN || '');
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
// FVM_CATALOG_TRANSPORT_V1
// FVM_PROVIDER_BRAVE_IMAGES_V3
app.use(express.json({limit:'12mb'}));
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});
app.use(express.static(path.join(__dirname,'public')));

const defaultProducts = [
  {id:'p1',title:'Cemento Portland CEM II/B-M 32,5R 25 kg',category:'Construcción',ref:'FVM-CEM-325',price:4.25,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p2',title:'Taladro percutor profesional 710 W',category:'Herramientas',ref:'FVM-TAL-710',price:119.90,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p3',title:'Pintura plástica interior mate 15 L',category:'Pintura',ref:'FVM-PIN-15L',price:39.95,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p4',title:'Inodoro completo salida dual',category:'Baño y cocina',ref:'FVM-WC-DUAL',price:189.00,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p5',title:'Carretilla de jardín 100 L rueda neumática',category:'Jardín',ref:'FVM-CAR-100',price:74.90,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1599685315640-68d303c222b9?auto=format&fit=crop&w=700&q=80',published:true,featured:true}
];
function seed(){return {users:[],products:defaultProducts,orders:[],quotes:[],settings:{deliveryBase:0,igic:7,storeName:'FVMarket',categories:['Construcción','Bricolaje','Herramientas','Reformas'],subcategories:{'Reformas':['Baño','Cocina','Fontanería','Electricidad'],'Bricolaje':['Adhesivos y selladores','Fijaciones','Organización','Reparación']}}}}
function save(d){fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2))}
function ensureAdmin(d){
  if(!Array.isArray(d.users))d.users=[];
  for(const x of d.users){if(String(x.username||'').toLowerCase()!==ADMIN_USERNAME && x.role!=='customer')x.role='customer'}
  let changed=false;
  let u=d.users.find(x=>String(x.username||'').toLowerCase()===ADMIN_USERNAME);
  if(!u){
    u={id:id('usr'),name:'Administrador FVMarket',username:ADMIN_USERNAME,email:ADMIN_USERNAME+'@fvmarket.local',password:ADMIN_PIN?bcrypt.hashSync(ADMIN_PIN,12):'',role:'admin',emailVerified:true,createdAt:new Date().toISOString()};
    d.users.unshift(u);changed=true;
  }else{
    if(u.role!=='admin'){u.role='admin';changed=true}
    if(u.username!==ADMIN_USERNAME){u.username=ADMIN_USERNAME;changed=true}
    if(ADMIN_PIN && (!u.password || !bcrypt.compareSync(ADMIN_PIN,u.password))){u.password=bcrypt.hashSync(ADMIN_PIN,12);changed=true}
  }
  return changed;
}
function read(){
  try{
    const d=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    const changedAdmin=ensureAdmin(d);ensureCustomerData(d);ensureCatalogSettings(d);if(changedAdmin)save(d);else save(d);
    return d;
  }catch(e){
    const d=seed();ensureAdmin(d);ensureCustomerData(d);ensureCatalogSettings(d);save(d);return d;
  }
}
function id(prefix){return prefix+'_'+crypto.randomBytes(7).toString('hex')}
function token(u){return jwt.sign({id:u.id,email:u.email,username:u.username||'',role:u.role},JWT_SECRET,{expiresIn:'7d'})}
function auth(req,res,next){const h=req.headers.authorization||'';const t=h.startsWith('Bearer ')?h.slice(7):'';try{req.user=jwt.verify(t,JWT_SECRET);next()}catch(e){res.status(401).json({error:'Sesión no válida'})}}
function admin(req,res,next){auth(req,res,()=>req.user.role==='admin'?next():res.status(403).json({error:'Acceso de administrador requerido'}))}
function ensureCustomerData(d){
  if(!Array.isArray(d.quotes))d.quotes=[];
  if(!Array.isArray(d.users))d.users=[];
  for(const u of d.users){
    if(u.role==='admin'){u.emailVerified=true;continue}
    if(u.emailVerified==null)u.emailVerified=true;
    if(!u.deliveryAddress||typeof u.deliveryAddress!=='object')u.deliveryAddress={};
    if(u.firstName==null)u.firstName='';if(u.lastName==null)u.lastName='';if(u.nifNie==null)u.nifNie='';if(u.phone==null)u.phone='';if(u.billingAddress==null)u.billingAddress='';
  }
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
  if(u.role==='admin')return true;
  const a=u.deliveryAddress||{};
  return !!(u.emailVerified&&String(u.firstName||'').trim()&&String(u.lastName||'').trim()&&validNifNie(u.nifNie)&&String(u.billingAddress||'').trim()&&String(a.address||'').trim()&&a.validated===true);
}
function safeUser(u){return {id:u.id,name:String(u.name||[u.firstName,u.lastName].filter(Boolean).join(' ')).trim(),firstName:u.firstName||'',lastName:u.lastName||'',nifNie:u.nifNie||'',phone:u.phone||'',billingAddress:u.billingAddress||'',deliveryAddress:u.deliveryAddress||{},email:u.email,username:u.username||'',role:u.role,emailVerified:!!u.emailVerified,profileComplete:customerProfileComplete(u),createdAt:u.createdAt}}
function verificationHash(v=''){return crypto.createHash('sha256').update(String(v)).digest('hex')}
function newVerificationToken(){return crypto.randomBytes(32).toString('hex')}
function baseUrl(req){return PUBLIC_URL||`${req.protocol}://${req.get('host')}`}
async function sendVerificationEmail(req,u,rawToken){
  if(!RESEND_API_KEY||!EMAIL_FROM)return {sent:false,reason:'email_not_configured'};
  const verifyUrl=`${baseUrl(req)}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:EMAIL_FROM,to:[u.email],subject:'Verifica tu cuenta FVMarket',html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2 style="color:#06345f">Verifica tu cuenta FVMarket</h2><p>Confirma tu correo electrónico para activar tu cuenta.</p><p><a href="${verifyUrl}" style="display:inline-block;background:#35a33a;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Verificar correo</a></p><p style="font-size:12px;color:#64748b">El enlace caduca en 24 horas.</p></div>`})});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data.message||'No se pudo enviar el correo de verificación');return {sent:true,id:data.id||''};
}
function requireCustomerReady(req,res,next){
  const u=read().users.find(x=>x.id===req.user.id);if(!u)return res.status(401).json({error:'Cuenta no encontrada'});
  if(u.role==='admin')return next();
  if(!u.emailVerified)return res.status(403).json({error:'Debes verificar tu correo electrónico antes de continuar'});
  if(!customerProfileComplete(u))return res.status(409).json({error:'Completa tu perfil: nombre, apellidos, NIF/NIE, dirección de facturación y dirección de entrega validada'});
  req.customer=u;next();
}

// FVM_PRIVATE_PROCUREMENT_V1
function publicProduct(p={}){
  const {sourceUrl,sourcePrice,sourceRef,sourceEan,sourceProvider,sourceBrand,sourceAvailability,sourceTaxNote,sourceCheckedAt,sourceSync,margin,addedValue,imageSource,imageLicense,imageAuthor,sourceImages,sourceStore,sourceSeller,providerKey,...safe}=p;
  if(Array.isArray(safe.images))safe.images=safe.images.map(x=>typeof x==='string'?x:{url:x.url}).filter(x=>x.url);
  safe.regularPrice=Number(safe.price||0);safe.salePrice=offerPrice(safe);safe.hasDiscount=!!(safe.onOffer&&Number(safe.discountPct)>0);return safe;
}
function publicOrder(o={}){
  return {...o,items:(o.items||[]).map(({procurement,...item})=>item)};
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
  const main=['Construcción','Bricolaje','Herramientas','Reformas'];
  d.settings.categories=main.slice();
  if(!d.settings.subcategories||typeof d.settings.subcategories!=='object')d.settings.subcategories={};
  const reforms=Array.isArray(d.settings.subcategories['Reformas'])?d.settings.subcategories['Reformas']:[];
  d.settings.subcategories['Reformas']=[...new Set([...reforms,'Baño','Cocina','Fontanería','Electricidad'])];
  d.settings.subcategories['Bricolaje']=Array.isArray(d.settings.subcategories['Bricolaje'])?d.settings.subcategories['Bricolaje']:['Adhesivos y selladores','Fijaciones','Organización','Reparación'];
  for(const p of d.products||[]){
    const old=String(p.category||'');
    const title=String(p.title||'');
    if(['Baño','Cocina','Baño y cocina','Fontanería','Electricidad'].includes(old)){
      p.category='Reformas';
      if(!p.subcategory){
        if(old==='Baño'||old==='Cocina'||old==='Fontanería'||old==='Electricidad')p.subcategory=old;
        else p.subcategory=/fregader|cocina|encimera/i.test(title)?'Cocina':'Baño';
      }
    }else if(['Pintura','Jardín','Otros'].includes(old)){
      p.category='Bricolaje';
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
async function rutaFVRequest(pathname,payload){
  if(!RUTAFV_API_URL)throw new Error('RutaFV no está configurado');
  const headers={'Content-Type':'application/json'};if(RUTAFV_API_KEY)headers.Authorization='Bearer '+RUTAFV_API_KEY;
  const r=await fetch(RUTAFV_API_URL+pathname,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data.error||data.detail||`RutaFV HTTP ${r.status}`);return data;
}
async function rutaFVGet(pathname,params={}){
  if(!RUTAFV_API_URL)throw new Error('RutaFV no está configurado');
  const headers={};if(RUTAFV_API_KEY)headers.Authorization='Bearer '+RUTAFV_API_KEY;
  const qs=new URLSearchParams(params).toString();
  const r=await fetch(RUTAFV_API_URL+pathname+(qs?'?'+qs:''),{headers,signal:AbortSignal.timeout(15000)});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data.error||data.detail||`RutaFV HTTP ${r.status}`);return data;
}

app.get('/api/health',(req,res)=>res.json({ok:true,app:'FVMarket'}));
app.get('/api/products',(req,res)=>{const d=read();const q=(req.query.q||'').toLowerCase();const category=(req.query.category||'').toLowerCase();res.json(d.products.filter(p=>p.published && (!q || `${p.title} ${p.category} ${p.ref}`.toLowerCase().includes(q)) && (!category || p.category.toLowerCase()===category)).map(publicProduct))});
app.post('/api/auth/register',async(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<8)return res.status(400).json({error:'Introduce un correo válido y una contraseña de al menos 8 caracteres'});
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
app.get('/api/auth/verify-email',(req,res)=>{
  const raw=String(req.query.token||'');if(!raw)return res.redirect('/?verified=invalid');const d=read();const h=verificationHash(raw);const u=d.users.find(x=>x.verificationTokenHash===h&&x.role==='customer');
  if(!u||Number(u.verificationExpiresAt||0)<Date.now())return res.redirect('/?verified=expired');u.emailVerified=true;u.verificationTokenHash='';u.verificationExpiresAt=0;save(d);res.redirect('/?verified=1');
});
app.post('/api/auth/login',async(req,res)=>{
  const body=req.body||{};const identifier=String(body.email||body.user||body.username||'').trim().toLowerCase();const secret=String(body.password??body.pin??'');const d=read();
  const u=d.users.find(x=>String(x.email||'').toLowerCase()===identifier||(x.role==='admin'&&String(x.username||'').toLowerCase()===identifier));
  if(!u||!u.password||!(await bcrypt.compare(secret,u.password)))return res.status(401).json({error:'Correo o contraseña incorrectos'});
  if(u.role==='customer'&&!u.emailVerified)return res.status(403).json({error:'Confirma tu correo electrónico antes de iniciar sesión'});
  res.json({token:token(u),user:safeUser(u)});
});
app.get('/api/me',auth,(req,res)=>{const u=read().users.find(x=>x.id===req.user.id);res.json(u?safeUser(u):null)});
app.put('/api/me/profile',auth,async(req,res)=>{
  const d=read();const u=d.users.find(x=>x.id===req.user.id);if(!u)return res.status(404).json({error:'Cuenta no encontrada'});if(u.role==='customer'&&!u.emailVerified)return res.status(403).json({error:'Verifica primero tu correo electrónico'});
  const firstName=String(req.body?.firstName||'').trim(),lastName=String(req.body?.lastName||'').trim(),nifNie=cleanNifNie(req.body?.nifNie||''),billingAddress=String(req.body?.billingAddress||'').trim(),phone=String(req.body?.phone||'').trim();const dv=req.body?.deliveryAddress||{};
  if(!firstName||!lastName||!validNifNie(nifNie)||!billingAddress)return res.status(400).json({error:'Completa nombre, apellidos, un NIF/NIE válido y la dirección de facturación'});
  const query=[dv.address,dv.city,dv.postalCode].filter(Boolean).join(', ').trim();if(!query)return res.status(400).json({error:'Selecciona una dirección de entrega válida'});
  try{
    const found=await rutaFVGet('/api/integrations/fvmarket/address-search',{q:query,limit:'5'});const rows=Array.isArray(found?.results)?found.results:[];
    const wanted=String(dv.placeId||'');const norm=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
    const match=rows.find(r=>wanted&&String(r.placeId||r.place_id||'')===wanted)||rows.find(r=>norm(r.address||r.label).includes(norm(dv.address))||norm(dv.address).includes(norm(r.address||r.label)));
    if(!match)return res.status(400).json({error:'La dirección de entrega no pudo validarse. Selecciónala desde las sugerencias de Google.'});
    u.firstName=firstName;u.lastName=lastName;u.name=(firstName+' '+lastName).trim();u.nifNie=nifNie;u.billingAddress=billingAddress;u.phone=phone;u.deliveryAddress={address:String(match.address||match.label||dv.address),city:String(match.city||dv.city||''),postalCode:String(match.postalCode||match.postal_code||dv.postalCode||''),municipality:String(match.municipality||''),placeId:String(match.placeId||match.place_id||dv.placeId||''),lat:match.lat??match.latitude??dv.lat??null,lng:match.lng??match.longitude??dv.lng??null,validated:true,source:'google'};save(d);res.json({user:safeUser(u)});
  }catch(e){res.status(503).json({error:'No se pudo validar la dirección con Google/RutaFV: '+e.message})}
});
app.get('/api/my-orders',auth,(req,res)=>res.json(read().orders.filter(o=>o.userId===req.user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(publicOrder)));
app.get('/api/my-quotes',auth,(req,res)=>res.json((read().quotes||[]).filter(q=>q.userId===req.user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))));
app.post('/api/quotes',auth,requireCustomerReady,async(req,res)=>{
  const d=read();const normalized=[];let subtotal=0;for(const item of req.body?.items||[]){const p=d.products.find(x=>x.id===item.id&&x.published);if(!p)continue;const qty=Math.max(1,Math.min(99,Number(item.qty)||1));const unit=offerPrice(p);normalized.push({productId:p.id,title:p.title,ref:p.ref,qty,unitPrice:unit,lineTotal:+(unit*qty).toFixed(2)});subtotal+=unit*qty}
  if(!normalized.length)return res.status(400).json({error:'El carrito está vacío'});let delivery=0,transport=null;
  if(req.body?.useRutaFV){try{const u=req.customer||{};const a=u.deliveryAddress||{};const payload={clientCode:RUTAFV_CLIENT_CODE,customer:{name:u.name,email:u.email,phone:u.phone||''},destination:{address:a.address||'',city:a.city||'',postalCode:a.postalCode||''},destinationText:[a.address,a.city,a.postalCode].filter(Boolean).join(', '),items:normalized.map(x=>({ref:x.ref,title:x.title,qty:x.qty})),orderSource:'FVMarket',requestType:'quote'};const r=await rutaFVRequest(RUTAFV_QUOTE_PATH,payload);delivery=Math.max(0,Number(r.amount||r.total||0));transport={provider:'RutaFV',amount:delivery,quoteId:String(r.id||r.quoteId||'')}}catch(e){return res.status(503).json({error:'No se pudo calcular el transporte: '+e.message})}}
  const now=new Date(),until=new Date(now.getTime()+15*24*60*60*1000);const total=+(subtotal+delivery).toFixed(2);const q={id:id('quo'),number:'PRE-FVM-'+Date.now().toString().slice(-8),userId:req.user.id,items:normalized,subtotal:+subtotal.toFixed(2),delivery,total,transport,status:'emitido',validUntil:until.toISOString(),customer:{name:req.customer.name,email:req.customer.email,nifNie:req.customer.nifNie,billingAddress:req.customer.billingAddress,deliveryAddress:req.customer.deliveryAddress},createdAt:now.toISOString()};d.quotes.push(q);save(d);res.status(201).json(q);
});

app.post('/api/orders',auth,requireCustomerReady,(req,res)=>{const {items,address,phone,paymentMethod='transfer'}=req.body||{};const customer=req.body.customer||{};if(!Array.isArray(items)||!items.length)return res.status(400).json({error:'El carrito está vacío'});const d=read();const normalized=[];let subtotal=0;for(const item of items){const p=d.products.find(x=>x.id===item.id&&x.published);if(!p)continue;const qty=Math.max(1,Math.min(99,Number(item.qty)||1));normalized.push({productId:p.id,title:p.title,ref:p.ref,unitPrice:offerPrice(p),regularUnitPrice:Number(p.price||0),discountPct:Number(p.discountPct||0),qty,lineTotal:+(offerPrice(p)*qty).toFixed(2),procurement:{provider:String(p.sourceProvider||providerFromUrl(p.sourceUrl)||''),sourceRef:String(p.sourceRef||''),sourceEan:String(p.sourceEan||''),sourceUrl:String(p.sourceUrl||''),sourcePrice:Number(p.sourcePrice)||0}});subtotal+=offerPrice(p)*qty}if(!normalized.length)return res.status(400).json({error:'No hay productos válidos'});const requestedTransport=!!req.body.useRutaFV;const q=req.body.rutaFVQuote||{};const delivery=requestedTransport?Math.max(0,Number(q.amount||q.total||0)):0;const total=+(subtotal+delivery).toFixed(2);const order={id:id('ord'),number:'FVM-'+Date.now().toString().slice(-8),userId:req.user.id,items:normalized,subtotal:+subtotal.toFixed(2),delivery,transport:{provider:requestedTransport?'RutaFV':'',requested:requestedTransport,amount:delivery,quoteId:String(q.id||q.quoteId||''),status:requestedTransport?'pendiente_crear_reparto':'sin_transporte'},total,customer:{name:String(customer.name||''),email:String(customer.email||req.user.email||''),phone:String(customer.phone||phone||''),address:String(customer.address||address||''),city:String(customer.city||req.body.city||''),postalCode:String(customer.postalCode||req.body.postalCode||''),notes:String(customer.notes||req.body.notes||'')},address:String(customer.address||address||''),city:String(customer.city||req.body.city||''),postalCode:String(customer.postalCode||req.body.postalCode||''),notes:String(customer.notes||req.body.notes||''),phone:String(customer.phone||phone||''),paymentMethod,status:'pendiente_pago',createdAt:new Date().toISOString()};d.orders.push(order);save(d);res.json(order)});
app.post('/api/checkout/stripe',auth,requireCustomerReady,async(req,res)=>{
  // FVM_TRANSPORT_CHECKOUT_V2
  if(!stripe)return res.status(503).json({error:'Pago con tarjeta pendiente de activación'});
  const body=req.body||{};
  const items=Array.isArray(body.items)?body.items:[];
  const useRutaFV=!!body.useRutaFV;
  const quote=body.rutaFVQuote||{};
  const d=read();
  const line_items=[];
  for(const item of items){
    const p=d.products.find(x=>x.id===item.id&&x.published);
    if(!p)continue;
    line_items.push({quantity:Math.max(1,Number(item.qty)||1),price_data:{currency:'eur',unit_amount:Math.round(offerPrice(p)*100),product_data:{name:p.title,metadata:{ref:p.ref}}}});
  }
  if(!line_items.length)return res.status(400).json({error:'Carrito vacío'});
  const transportAmount=useRutaFV?Math.max(0,Number(quote.amount||quote.total||0)):0;
  if(transportAmount>0){
    line_items.push({quantity:1,price_data:{currency:'eur',unit_amount:Math.round(transportAmount*100),product_data:{name:'Transporte RutaFV',description:'Servicio de entrega asociado a la compra FVMarket'}}});
  }
  const base=process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`;
  const session=await stripe.checkout.sessions.create({
    mode:'payment',
    line_items,
    success_url:`${base}/?payment=success`,
    cancel_url:`${base}/?payment=cancel`,
    customer_email:req.user.email,
    metadata:{source:'FVMarket',rutafv:String(useRutaFV),transport_amount:String(transportAmount),rutafv_quote_id:String(quote.id||quote.quoteId||''),delivery_address:String(body.address||'').slice(0,450),delivery_phone:String(body.phone||'').slice(0,100)}
  });
  res.json({url:session.url,transportAmount,totalIncludesTransport:transportAmount>0});
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
app.get('/api/admin/products',admin,(req,res)=>res.json(read().products));
app.post('/api/admin/products',admin,(req,res)=>{const d=read();const title=String(req.body.title||'Producto sin título');const category=String(req.body.category||guessCategory(title));const sourcePrice=Number(req.body.sourcePrice)||0;const p={id:id('prd'),title,category,ref:String(req.body.ref&&!String(req.body.ref).startsWith('FVM-')?req.body.ref:nextProductRef(d,title,category)),price:Number(req.body.price)||0,stock:req.body.stock||'bajo_pedido',image:String(req.body.image||''),imageSource:String(req.body.imageSource||''),imageLicense:String(req.body.imageLicense||''),imageAuthor:String(req.body.imageAuthor||''),sourceUrl:String(req.body.sourceUrl||''),sourceProvider:String(req.body.sourceProvider||providerFromUrl(req.body.sourceUrl)||''),sourceRef:String(req.body.sourceRef||''),sourceEan:String(req.body.sourceEan||''),description:String(req.body.description||''),sourcePrice,addedValue:Number(req.body.addedValue)||Math.max(0,(Number(req.body.price)||0)-sourcePrice),margin:Number(req.body.margin)||0,published:!!req.body.published,featured:!!req.body.featured,subcategory:String(req.body.subcategory||''),onOffer:!!req.body.onOffer,discountPct:Math.max(0,Math.min(90,Number(req.body.discountPct)||0))};p.images=normalizeProductImages(req.body.images,p.image);if(req.body.published&&p.images.length<1)return res.status(400).json({error:'Para publicar un producto se requiere al menos 1 imagen.'});if(p.images[0]){p.image=p.images[0].url;p.imageSource=p.images[0].source||p.imageSource;p.imageLicense=p.images[0].license||p.imageLicense;p.imageAuthor=p.images[0].author||p.imageAuthor}d.products.unshift(p);save(d);res.json(p)});
app.put('/api/admin/products/:id',admin,(req,res)=>{const d=read();const i=d.products.findIndex(p=>p.id===req.params.id);if(i<0)return res.status(404).json({error:'Producto no encontrado'});const old=d.products[i];const next={...old,...req.body,id:old.id};for(const k of ['price','sourcePrice','margin','addedValue'])if(req.body[k]!=null)next[k]=Number(req.body[k])||0;for(const k of ['title','category','ref','stock','image','imageSource','imageLicense','imageAuthor','sourceUrl','sourceProvider','sourceRef','sourceEan','description'])if(req.body[k]!=null)next[k]=String(req.body[k]);if(req.body.published!=null){if(req.body.published){const checkImages=normalizeProductImages(req.body.images!=null?req.body.images:next.images,next.image);if(checkImages.length<1)return res.status(400).json({error:'Para publicar un producto se requiere al menos 1 imagen.'})}next.published=!!req.body.published}if(req.body.featured!=null)next.featured=!!req.body.featured;if(req.body.images!=null)next.images=normalizeProductImages(req.body.images,next.image);else if(!Array.isArray(next.images))next.images=normalizeProductImages([],next.image);if(next.images.length){next.image=next.images[0].url;next.imageSource=next.images[0].source||'';next.imageLicense=next.images[0].license||'';next.imageAuthor=next.images[0].author||''}else if(req.body.images!=null){next.image='';next.imageSource='';next.imageLicense='';next.imageAuthor=''}d.products[i]=next;save(d);res.json(next)});
app.delete('/api/admin/products/:id',admin,(req,res)=>{const d=read();d.products=d.products.filter(p=>p.id!==req.params.id);save(d);res.json({ok:true})});
app.get('/api/admin/orders',admin,(req,res)=>res.json(read().orders.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))));
app.put('/api/admin/orders/:id',admin,(req,res)=>{const d=read();const o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Pedido no encontrado'});o.status=String(req.body.status||o.status);save(d);res.json(o)});
app.get('/api/admin/users',admin,(req,res)=>res.json(read().users.map(safeUser)));
app.get('/api/admin/settings',admin,(req,res)=>res.json(read().settings));
app.put('/api/admin/settings',admin,(req,res)=>{const d=read();d.settings={...d.settings,...req.body};save(d);res.json(d.settings)});


function guessCategory(text=''){const x=String(text).toLowerCase();if(/cement|mortero|ladrill|bloque|yeso|hormig|azulej|cerám/.test(x))return'Construcción';if(/taladro|sierra|martillo|atornill|broca|herramient/.test(x))return'Herramientas';if(/grifo|tuber|válvula|fontan|fregadero/.test(x))return'Reformas';if(/cable|enchufe|interruptor|led|lámpara|electric/.test(x))return'Reformas';if(/pintura|esmalte|barniz|rodillo/.test(x))return'Bricolaje';if(/jardín|manguera|carretilla|poda/.test(x))return'Bricolaje';if(/inodoro|ducha|mampara|baño|lavabo|cocina/.test(x))return'Reformas';return'Otros'}
function categoryCode(category='Otros'){return ({'Construcción':'CON','Herramientas':'HER','Fontanería':'FON','Electricidad':'ELE','Pintura':'PIN','Jardín':'JAR','Baño y cocina':'BAN','Otros':'OTR'})[category]||'OTR'}
function ownReference(title='',sourcePrice=0,category='Otros'){const key=String(title).toLowerCase().replace(/\s+/g,' ').trim()+'|'+Number(sourcePrice||0).toFixed(2);const h=crypto.createHash('sha1').update(key).digest('hex').slice(0,6).toUpperCase();return 'FVM-'+categoryCode(category)+'-'+h}
function cleanProductTitle(title=''){return String(title).replace(/\s+/g,' ').replace(/[|•]+/g,' ').trim().slice(0,150)}
function imageSearchQuery(title='',category='Otros'){const x=String(title).toLowerCase();const pairs=[[/inodoro|wc|sanitario/,'toilet bathroom fixture'],[/plato.*ducha|ducha/,'shower tray bathroom'],[/mampara/,'shower screen glass'],[/grifo|monomando/,'faucet tap'],[/fregadero/,'kitchen sink'],[/taladro/,'electric drill tool'],[/sierra/,'power saw tool'],[/martillo/,'hammer hand tool'],[/pintura/,'paint bucket interior'],[/cemento/,'cement bag construction'],[/mortero/,'mortar bag construction'],[/carretilla/,'wheelbarrow garden'],[/puerta/,'interior door'],[/ventana/,'aluminium window'],[/lavabo/,'bathroom sink'],[/cable/,'electrical cable'],[/enchufe/,'electrical socket outlet']];for(const [rx,q] of pairs)if(rx.test(x))return q;return ({'Construcción':'construction material','Herramientas':'hardware tool','Fontanería':'plumbing fixture','Electricidad':'electrical hardware','Pintura':'painting supplies','Jardín':'garden hardware','Baño y cocina':'bathroom kitchen fixture','Otros':'hardware product'})[category]||'hardware product'}
function fallbackProductAnalysis(item={},index=0){const title=cleanProductTitle(item.title||'Producto');const category=guessCategory(title+' '+(item.description||''));const sourcePrice=Number(item.sourcePrice||0);const baseDesc=String(item.description||'').replace(/\s+/g,' ').trim().slice(0,700);return {index,title,description:baseDesc||('Artículo de '+category.toLowerCase()+' seleccionado para FVMarket. Disponible bajo pedido con entrega en Fuerteventura mediante RutaFV.'),category,imageQuery:imageSearchQuery(title,category),keywords:title.toLowerCase().split(/\s+/).filter(x=>x.length>3).slice(0,6),ref:ownReference(title,sourcePrice,category)}}
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
    return (r.data?.results||[]).map(x=>({title:x.title||'',url:x.thumbnail||x.url||'',original:x.url||'',source:x.foreign_landing_url||x.detail_url||'',license:[x.license,x.license_version].filter(Boolean).join(' ').toUpperCase(),author:x.creator||'',origin:'similar'})).filter(x=>x.url&&!isSpanishImageDomain(x.url)&&!isSpanishImageDomain(x.source));
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
    })).filter(x=>x.url&&!isSpanishImageDomain(x.url)&&!isSpanishImageDomain(x.source));
  }catch(e){
    console.warn('Brave image search failed:',e.response?.status||e.message);
    return [];
  }
}
async function searchExternalImages(query='',limit=8){
  const target=Math.max(3,Math.min(Number(limit)||8,12));const seen=new Set(),pool=[];
  const add=items=>{for(const x of items||[]){const url=String(x.url||'');const src=String(x.source||'');if(!url||seen.has(url)||isSpanishImageDomain(url)||isSpanishImageDomain(src))continue;seen.add(url);pool.push({...x,origin:x.origin||'similar'})}};
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

app.post('/api/admin/import-catalog',admin,upload.single('catalog'),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:'Selecciona un archivo PDF'});if(!/pdf/i.test(req.file.mimetype||'')&&!/\.pdf$/i.test(req.file.originalname||''))return res.status(400).json({error:'El archivo debe ser PDF'});const result=await parseCatalogBuffer(req.file.buffer,req.file.originalname);res.json(result)}catch(e){res.status(422).json({error:'No se pudo analizar el catálogo PDF. Si es un PDF escaneado necesitaremos procesarlo como imágenes.'})}});
app.post('/api/admin/import-catalog-url',admin,async(req,res)=>{const url=String(req.body.url||'').trim();if(isUnsafeUrl(url))return res.status(400).json({error:'URL no permitida'});try{const r=await axios.get(url,{responseType:'arraybuffer',timeout:15000,maxContentLength:25*1024*1024,headers:{'User-Agent':'FVMarket/1.2'}});const result=await parseCatalogBuffer(Buffer.from(r.data),String(url).split('/').pop()||'catalogo.pdf');res.json(result)}catch(e){res.status(422).json({error:'No se pudo descargar o leer ese catálogo PDF'})}});
app.post('/api/admin/import-catalog-products',admin,(req,res)=>{
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
app.post('/api/admin/import-url',admin,async(req,res)=>{const url=String(req.body.url||'').trim();if(isUnsafeUrl(url))return res.status(400).json({error:'URL no permitida'});try{const r=await axios.get(url,{timeout:15000,maxRedirects:5,maxContentLength:3*1024*1024,headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Safari/537.36','Accept':'text/html,application/xhtml+xml','Accept-Language':'es-ES,es;q=0.9,en;q=0.7','Cache-Control':'no-cache'}});const p=extractProductFromHtml(r.data,url);if(!p.title||p.title==='Producto')return res.status(422).json({error:'La página no expone una ficha de producto legible.'});res.json(p)}catch(e){const status=e.response?.status;res.status(422).json({error:status?('La tienda respondió '+status+' y no permite leer esa ficha automáticamente. Puedes introducir el precio origen manualmente y usar la IA/imágenes.'):('No se pudo leer esa URL. Comprueba que sea una ficha pública de producto.')})}});


app.get('/api/admin/ai-status',admin,(req,res)=>res.json({openai:!!OPENAI_API_KEY,model:OPENAI_MODEL,braveImages:!!BRAVE_SEARCH_API_KEY,imageSearch:(BRAVE_SEARCH_API_KEY?'Brave Images + Openverse + Wikimedia':'Openverse + Wikimedia (Brave pendiente de credencial)')+' · excluye dominios de España'}));
app.post('/api/admin/ai-product',admin,async(req,res)=>{const item=req.body||{};const result=await aiAnalyzeItems([item]);const p=result.products?.[0]||fallbackProductAnalysis(item,0);const sourceImages=normalizeProductImages(item.sourceImages||[],item.sourceUrl?item.image:'').map(x=>({...x,origin:'source'}));const searchQuery=[item.title,p.title,p.imageQuery,item.sourceRef].filter(Boolean).join(' ');const alternativeImages=await searchExternalImages(searchQuery.slice(0,180),8);const images=alternativeImages.slice(0,8);const first=alternativeImages[0]||null;res.json({...p,aiMode:result.mode,warning:result.warning||'',sourceImages,alternativeImages,images,image:first?.url||'',imageSource:first?.source||'',imageLicense:first?.license||'',imageAuthor:first?.author||''})});
app.post('/api/admin/ai-catalog',admin,async(req,res)=>{const items=Array.isArray(req.body.products)?req.body.products.slice(0,30):[];if(!items.length)return res.status(400).json({error:'No hay productos para analizar'});const result=await aiAnalyzeItems(items);const products=[];for(const p of (result.products||[])){const images=await searchExternalImages((p.title+' '+(p.imageQuery||'')).slice(0,140),6);const first=images[0]||null;products.push({...p,images,alternativeImages:images,image:first?.url||'',imageSource:first?.source||'',imageLicense:first?.license||'',imageAuthor:first?.author||''})}res.json({mode:result.mode,warning:result.warning||'',products})});


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
  return {title,category,description:'Producto de '+category.toLowerCase()+' disponible bajo pedido en FVMarket. La ficha comercial se revisa y redacta de forma independiente antes de su publicación.'}
}
async function mbCandidate(input,margin=40){
  const sourceUrl=await resolveMiBricolajeInput(input);const r=await mbGet(sourceUrl);const f=mbFactsFromHtml(r.data,sourceUrl);
  let own=mbFallbackCopy(f);const ai=await aiAnalyzeItems([{title:f.sourceTitle,description:f.sourceDescription,sourcePrice:f.sourcePrice,sourceRef:f.sourceRef}]);
  if(ai.mode==='openai'&&ai.products?.[0]){const p=ai.products[0];own={title:cleanProductTitle(p.title||own.title),category:p.category||own.category,description:String(p.description||own.description).replace(/\s+/g,' ').trim().slice(0,700)}}
  const m=Math.max(0,Math.min(300,Number(margin)||40));const addedValue=+(f.sourcePrice*m/100).toFixed(2);const price=+(f.sourcePrice+addedValue).toFixed(2);
  return {...own,ref:nextProductRef(read(),own.title,own.category),sourceProvider:'Mi Bricolaje',sourceRef:f.sourceRef,sourceEan:f.sourceEan,sourceBrand:f.sourceBrand,sourceAvailability:f.sourceAvailability,sourceTaxNote:f.sourceTaxNote,sourceUrl:f.sourceUrl,sourceImages:f.sourceImages||[],sourcePrice:f.sourcePrice,margin:m,addedValue,price,stock:'bajo_pedido',published:false,featured:false,image:'',images:[],imageSource:'',imageLicense:'',imageAuthor:'',reviewStatus:'borrador',aiMode:ai.mode||'local'}
}
app.post('/api/admin/mibricolaje/analyze',admin,async(req,res)=>{
  const raw=Array.isArray(req.body.inputs)?req.body.inputs:[req.body.input];const inputs=raw.map(x=>String(x||'').trim()).filter(Boolean).slice(0,20);if(!inputs.length)return res.status(400).json({error:'Introduce al menos una referencia o URL'});
  const margin=Math.max(0,Math.min(300,Number(req.body.margin)||40));const products=[],errors=[];
  for(const input of inputs){try{products.push(await mbCandidate(input,margin))}catch(e){errors.push({input,error:String(e.message||e)})}}
  res.json({products,errors,policy:{source:'Mi Bricolaje',copyImages:false,copyDescriptions:false,internalAssociation:true,defaultMargin:margin}})
});
app.post('/api/admin/mibricolaje/import',admin,(req,res)=>{
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
app.post('/api/admin/mibricolaje/prepare-images',admin,async(req,res)=>{
  const src=(Array.isArray(req.body.sourceImages)?req.body.sourceImages:[]).map(x=>typeof x==='string'?x:x?.url).filter(Boolean).slice(0,3);
  if(!src.length)return res.status(400).json({error:'No hay imágenes del artículo para preparar'});
  try{
    const dataUrls=[];for(const u of src){try{dataUrls.push(await mbImageDataUrl(u))}catch{}}
    if(!dataUrls.length)return res.status(422).json({error:'No se pudieron leer las imágenes del artículo origen'});
    const images=await prepareImages(dataUrls,req.body.count||3);
    res.json({images,mode:'free',cost:0});
  }catch(e){console.error('free image prep',e);res.status(500).json({error:'No se pudieron preparar las imágenes: '+String(e.message||e)})}
});

app.post('/api/admin/mibricolaje/render-images',admin,async(req,res)=>{
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

app.post('/api/admin/mibricolaje/refresh/:id',admin,async(req,res)=>{
  const d=read();const p=d.products.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Producto no encontrado'});if(p.sourceProvider!=='Mi Bricolaje'||!isMiBricolajeUrl(p.sourceUrl))return res.status(400).json({error:'El producto no está asociado a MiBricolaje'});
  try{const r=await mbGet(p.sourceUrl);const f=mbFactsFromHtml(r.data,p.sourceUrl);const oldSourcePrice=Number(p.sourcePrice)||0;p.sourcePrice=f.sourcePrice;p.sourceAvailability=f.sourceAvailability;p.sourceTaxNote=f.sourceTaxNote;p.sourceCheckedAt=new Date().toISOString();p.addedValue=+(f.sourcePrice*(Number(p.margin)||0)/100).toFixed(2);p.price=+(f.sourcePrice+p.addedValue).toFixed(2);save(d);res.json({product:p,change:{oldSourcePrice,newSourcePrice:f.sourcePrice}})}catch(e){res.status(422).json({error:String(e.message||'No se pudo actualizar el origen')})}
});

app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));


app.get('/api/admin/catalog-taxonomy',admin,(req,res)=>{const d=read();ensureCatalogSettings(d);res.json({categories:d.settings.categories,subcategories:d.settings.subcategories})});
app.put('/api/admin/catalog-taxonomy',admin,(req,res)=>{const d=read();ensureCatalogSettings(d);d.settings.categories=['Construcción','Bricolaje','Herramientas','Reformas'];d.settings.subcategories=req.body.subcategories&&typeof req.body.subcategories==='object'?req.body.subcategories:d.settings.subcategories;const r=Array.isArray(d.settings.subcategories['Reformas'])?d.settings.subcategories['Reformas']:[];d.settings.subcategories['Reformas']=[...new Set([...r,'Baño','Cocina'])];save(d);res.json({categories:d.settings.categories,subcategories:d.settings.subcategories})});
app.post('/api/rutafv/quote',auth,async(req,res)=>{try{const d=read();const u=d.users.find(x=>x.id===req.user.id)||{};const c=req.body.customer||{};const customer={name:String(c.name||u.name||''),email:String(c.email||u.email||req.user.email||''),phone:String(c.phone||req.body.phone||'')};const destination={address:String(c.address||req.body.address||''),city:String(c.city||req.body.city||''),postalCode:String(c.postalCode||req.body.postalCode||''),notes:String(c.notes||req.body.notes||'')};if(!customer.name||!customer.email||!customer.phone||!destination.address||!destination.city||!destination.postalCode)return res.status(400).json({error:'Faltan datos del cliente o de entrega'});const items=[];for(const x of req.body.items||[]){const p=d.products.find(y=>y.id===x.id);if(p)items.push({ref:p.ref,title:p.title,qty:Math.max(1,Number(x.qty)||1),weightKg:Number(p.weightKg||0),sourceProvider:p.sourceProvider||'',sourceUrl:p.sourceUrl||''})}const payload={clientCode:RUTAFV_CLIENT_CODE,customer,destination,destinationText:[destination.address,destination.city,destination.postalCode].filter(Boolean).join(', '),items,orderSource:'FVMarket'};const q=await rutaFVRequest(RUTAFV_QUOTE_PATH,payload);res.json(q)}catch(e){res.status(503).json({error:e.name==='TimeoutError'?'RutaFV no respondió dentro del tiempo esperado':e.message})}});
app.get('/api/rutafv/address-search',auth,async(req,res)=>{try{const q=String(req.query.q||'').trim();if(q.length<3)return res.json({results:[]});const data=await rutaFVGet('/api/integrations/fvmarket/address-search',{q,limit:'5'});res.json(data)}catch(e){res.status(503).json({error:e.message})}});
app.post('/api/admin/orders/:id/create-rutafv-delivery',admin,async(req,res)=>{try{const d=read();const o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Pedido no encontrado'});if(!o.transport?.requested)return res.status(400).json({error:'Este pedido no tiene transporte RutaFV'});const u=d.users.find(x=>x.id===o.userId)||{};const payload={clientCode:RUTAFV_CLIENT_CODE,externalOrderId:o.id,externalOrderNumber:o.number,customer:{name:o.customer?.name||u.name||'',email:o.customer?.email||u.email||'',phone:o.customer?.phone||o.phone||''},destination:{address:o.customer?.address||o.address||'',city:o.customer?.city||o.city||'',postalCode:o.customer?.postalCode||o.postalCode||'',notes:o.customer?.notes||o.notes||''},destinationText:[o.customer?.address||o.address,o.customer?.city||o.city,o.customer?.postalCode||o.postalCode].filter(Boolean).join(', '),transportAmount:o.delivery,transportPaid:['pagado','paid','cobrado'].includes(String(o.status).toLowerCase()),items:o.items.map(x=>({ref:x.ref,title:x.title,qty:x.qty}))};const r=await rutaFVRequest(RUTAFV_DELIVERY_PATH,payload);o.transport.deliveryId=String(r.id||r.deliveryId||r.expeditionId||'');o.transport.status='creado_en_rutafv';o.transport.syncedAt=new Date().toISOString();save(d);res.json(o)}catch(e){res.status(503).json({error:e.message})}});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));


// FVM_PROVIDER_BLOCKS_V11
registerProviderSourceRoutes(app,admin,{read,save,id,nextProductRef,aiAnalyzeItems,guessCategory,cleanProductTitle,normalizeProductImages});
app.listen(PORT,'0.0.0.0',()=>console.log(`FVMarket listening on ${PORT}`));
