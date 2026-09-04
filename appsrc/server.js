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

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.createHash('sha256').update('fvmarket-dev-' + (process.env.RENDER_SERVICE_ID || 'local')).digest('hex');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
const ADMIN_PIN = String(process.env.ADMIN_PIN || '');
app.use(express.json({limit:'2mb'}));
const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});
app.use(express.static(path.join(__dirname,'public')));

const defaultProducts = [
  {id:'p1',title:'Cemento Portland CEM II/B-M 32,5R 25 kg',category:'Construcción',ref:'FVM-CEM-325',price:4.25,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p2',title:'Taladro percutor profesional 710 W',category:'Herramientas',ref:'FVM-TAL-710',price:119.90,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p3',title:'Pintura plástica interior mate 15 L',category:'Pintura',ref:'FVM-PIN-15L',price:39.95,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p4',title:'Inodoro completo salida dual',category:'Baño y cocina',ref:'FVM-WC-DUAL',price:189.00,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=700&q=80',published:true,featured:true},
  {id:'p5',title:'Carretilla de jardín 100 L rueda neumática',category:'Jardín',ref:'FVM-CAR-100',price:74.90,stock:'bajo_pedido',image:'https://images.unsplash.com/photo-1599685315640-68d303c222b9?auto=format&fit=crop&w=700&q=80',published:true,featured:true}
];
function seed(){return {users:[],products:defaultProducts,orders:[],settings:{deliveryBase:0,igic:7,storeName:'FVMarket'}}}
function save(d){fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2))}
function ensureAdmin(d){
  if(!Array.isArray(d.users))d.users=[];
  let changed=false;
  let u=d.users.find(x=>String(x.username||'').toLowerCase()===ADMIN_USERNAME);
  if(!u){
    u={id:id('usr'),name:'Administrador FVMarket',username:ADMIN_USERNAME,email:ADMIN_USERNAME+'@fvmarket.local',password:ADMIN_PIN?bcrypt.hashSync(ADMIN_PIN,12):'',role:'admin',createdAt:new Date().toISOString()};
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
    if(ensureAdmin(d))save(d);
    return d;
  }catch(e){
    const d=seed();ensureAdmin(d);save(d);return d;
  }
}
function id(prefix){return prefix+'_'+crypto.randomBytes(7).toString('hex')}
function token(u){return jwt.sign({id:u.id,email:u.email,username:u.username||'',role:u.role},JWT_SECRET,{expiresIn:'7d'})}
function auth(req,res,next){const h=req.headers.authorization||'';const t=h.startsWith('Bearer ')?h.slice(7):'';try{req.user=jwt.verify(t,JWT_SECRET);next()}catch(e){res.status(401).json({error:'Sesión no válida'})}}
function admin(req,res,next){auth(req,res,()=>req.user.role==='admin'?next():res.status(403).json({error:'Acceso de administrador requerido'}))}
function safeUser(u){return {id:u.id,name:u.name,email:u.email,username:u.username||'',role:u.role,createdAt:u.createdAt}}

app.get('/api/health',(req,res)=>res.json({ok:true,app:'FVMarket'}));
app.get('/api/products',(req,res)=>{const d=read();const q=(req.query.q||'').toLowerCase();const category=(req.query.category||'').toLowerCase();res.json(d.products.filter(p=>p.published && (!q || `${p.title} ${p.category} ${p.ref}`.toLowerCase().includes(q)) && (!category || p.category.toLowerCase()===category)))});
app.post('/api/auth/register',async(req,res)=>{const {name,email,password}=req.body||{};if(!name||!email||!password||password.length<6)return res.status(400).json({error:'Nombre, email y contraseña de al menos 6 caracteres son obligatorios'});const d=read();if(d.users.some(u=>String(u.email||'').toLowerCase()===String(email).toLowerCase()))return res.status(409).json({error:'Ese email ya está registrado'});const u={id:id('usr'),name:String(name).trim(),username:'',email:String(email).trim().toLowerCase(),password:await bcrypt.hash(password,12),role:'customer',createdAt:new Date().toISOString()};d.users.push(u);save(d);res.json({token:token(u),user:safeUser(u)});});
app.post('/api/auth/login',async(req,res)=>{const body=req.body||{};const identifier=String(body.user||body.username||body.email||'').trim().toLowerCase();const secret=String(body.pin??body.password??'');const d=read();const u=d.users.find(x=>String(x.username||'').toLowerCase()===identifier||String(x.email||'').toLowerCase()===identifier);if(!u||!u.password||!(await bcrypt.compare(secret,u.password)))return res.status(401).json({error:'Usuario/email o PIN/contraseña incorrectos'});res.json({token:token(u),user:safeUser(u)});});
app.get('/api/me',auth,(req,res)=>{const u=read().users.find(x=>x.id===req.user.id);res.json(u?safeUser(u):null)});
app.get('/api/my-orders',auth,(req,res)=>res.json(read().orders.filter(o=>o.userId===req.user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))));

app.post('/api/orders',auth,(req,res)=>{const {items,address,phone,paymentMethod='transfer'}=req.body||{};if(!Array.isArray(items)||!items.length)return res.status(400).json({error:'El carrito está vacío'});const d=read();const normalized=[];let subtotal=0;for(const item of items){const p=d.products.find(x=>x.id===item.id&&x.published);if(!p)continue;const qty=Math.max(1,Math.min(99,Number(item.qty)||1));normalized.push({productId:p.id,title:p.title,ref:p.ref,unitPrice:p.price,qty,lineTotal:+(p.price*qty).toFixed(2)});subtotal+=p.price*qty}if(!normalized.length)return res.status(400).json({error:'No hay productos válidos'});const delivery=Number(d.settings.deliveryBase||0);const total=+(subtotal+delivery).toFixed(2);const order={id:id('ord'),number:'FVM-'+Date.now().toString().slice(-8),userId:req.user.id,items:normalized,subtotal:+subtotal.toFixed(2),delivery,total,address:String(address||''),phone:String(phone||''),paymentMethod,status:paymentMethod==='transfer'?'pendiente_pago':'pendiente_pago',createdAt:new Date().toISOString()};d.orders.push(order);save(d);res.json(order)});
app.post('/api/checkout/stripe',auth,async(req,res)=>{if(!stripe)return res.status(503).json({error:'Pago con tarjeta pendiente de activación'});const {items}=req.body||{};const d=read();const line_items=[];for(const item of items||[]){const p=d.products.find(x=>x.id===item.id&&x.published);if(!p)continue;line_items.push({quantity:Math.max(1,Number(item.qty)||1),price_data:{currency:'eur',unit_amount:Math.round(p.price*100),product_data:{name:p.title,metadata:{ref:p.ref}}}})}if(!line_items.length)return res.status(400).json({error:'Carrito vacío'});const base=process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`;const session=await stripe.checkout.sessions.create({mode:'payment',line_items,success_url:`${base}/?payment=success`,cancel_url:`${base}/?payment=cancel`,customer_email:req.user.email});res.json({url:session.url})});

app.get('/api/admin/products',admin,(req,res)=>res.json(read().products));
app.post('/api/admin/products',admin,(req,res)=>{const d=read();const p={id:id('prd'),title:String(req.body.title||'Producto sin título'),category:String(req.body.category||'Otros'),ref:String(req.body.ref||('FVM-'+Date.now().toString().slice(-6))),price:Number(req.body.price)||0,stock:req.body.stock||'bajo_pedido',image:String(req.body.image||''),sourceUrl:String(req.body.sourceUrl||''),description:String(req.body.description||''),sourcePrice:Number(req.body.sourcePrice)||0,margin:Number(req.body.margin)||0,published:!!req.body.published,featured:!!req.body.featured};d.products.unshift(p);save(d);res.json(p)});
app.put('/api/admin/products/:id',admin,(req,res)=>{const d=read();const i=d.products.findIndex(p=>p.id===req.params.id);if(i<0)return res.status(404).json({error:'Producto no encontrado'});d.products[i]={...d.products[i],...req.body,id:d.products[i].id,price:Number(req.body.price??d.products[i].price)};save(d);res.json(d.products[i])});
app.delete('/api/admin/products/:id',admin,(req,res)=>{const d=read();d.products=d.products.filter(p=>p.id!==req.params.id);save(d);res.json({ok:true})});
app.get('/api/admin/orders',admin,(req,res)=>res.json(read().orders.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))));
app.put('/api/admin/orders/:id',admin,(req,res)=>{const d=read();const o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Pedido no encontrado'});o.status=String(req.body.status||o.status);save(d);res.json(o)});
app.get('/api/admin/users',admin,(req,res)=>res.json(read().users.map(safeUser)));
app.get('/api/admin/settings',admin,(req,res)=>res.json(read().settings));
app.put('/api/admin/settings',admin,(req,res)=>{const d=read();d.settings={...d.settings,...req.body};save(d);res.json(d.settings)});


function guessCategory(text=''){const x=String(text).toLowerCase();if(/cement|mortero|ladrill|bloque|yeso|hormig|azulej|cerám/.test(x))return'Construcción';if(/taladro|sierra|martillo|atornill|broca|herramient/.test(x))return'Herramientas';if(/grifo|tuber|válvula|fontan|fregadero/.test(x))return'Fontanería';if(/cable|enchufe|interruptor|led|lámpara|electric/.test(x))return'Electricidad';if(/pintura|esmalte|barniz|rodillo/.test(x))return'Pintura';if(/jardín|manguera|carretilla|poda/.test(x))return'Jardín';if(/inodoro|ducha|mampara|baño|lavabo|cocina/.test(x))return'Baño y cocina';return'Otros'}
function catalogCandidatesFromText(text){const lines=String(text||'').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);const out=[];const seen=new Set();const priceRx=/(?:€\s*)?(\d{1,5}[.,]\d{2})(?:\s*€)?/g;for(let i=0;i<lines.length;i++){const line=lines[i];let m;while((m=priceRx.exec(line))){const sourcePrice=Number(m[1].replace(',','.'));if(!sourcePrice||sourcePrice>50000)continue;let title=(line.slice(0,m.index)+' '+line.slice(m.index+m[0].length)).replace(/\b(?:PVP|PRECIO|OFERTA|IVA|IGIC)\b[:\s-]*/gi,' ').replace(/\s+/g,' ').trim();if(title.length<5){for(let j=i-1;j>=Math.max(0,i-3);j--){const prev=lines[j].replace(/\d{1,5}[.,]\d{2}\s*€?/g,'').trim();if(prev.length>=6&&!/^\d+$/.test(prev)){title=prev;break}}}title=title.replace(/^[-–—•·\s]+|[-–—•·\s]+$/g,'').slice(0,170);if(title.length<5)continue;const key=(title.toLowerCase()+'|'+sourcePrice.toFixed(2));if(seen.has(key))continue;seen.add(key);out.push({title,sourcePrice,margin:0,price:+sourcePrice.toFixed(2),category:guessCategory(title),ref:'FVM-'+String(Date.now()).slice(-5)+'-'+String(out.length+1).padStart(2,'0'),stock:'bajo_pedido',description:'',image:'',published:false,featured:false});if(out.length>=100)return out}}return out}
async function parseCatalogBuffer(buffer){const data=await pdfParse(buffer);return {pages:data.numpages||0,candidates:catalogCandidatesFromText(data.text)}}}

function isUnsafeUrl(raw){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return true;const h=u.hostname.toLowerCase();return h==='localhost'||h==='127.0.0.1'||h==='::1'||/^10\./.test(h)||/^192\.168\./.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h)||h.endsWith('.local')}catch(e){return true}}

app.post('/api/admin/import-catalog',admin,upload.single('catalog'),async(req,res)=>{try{if(!req.file)return res.status(400).json({error:'Selecciona un archivo PDF'});if(!/pdf/i.test(req.file.mimetype||'')&&!/\.pdf$/i.test(req.file.originalname||''))return res.status(400).json({error:'El archivo debe ser PDF'});const result=await parseCatalogBuffer(req.file.buffer);res.json(result)}catch(e){res.status(422).json({error:'No se pudo analizar el catálogo PDF. Si es un PDF escaneado necesitaremos procesarlo como imágenes.'})}});
app.post('/api/admin/import-catalog-url',admin,async(req,res)=>{const url=String(req.body.url||'').trim();if(isUnsafeUrl(url))return res.status(400).json({error:'URL no permitida'});try{const r=await axios.get(url,{responseType:'arraybuffer',timeout:15000,maxContentLength:25*1024*1024,headers:{'User-Agent':'FVMarket/1.2'}});const result=await parseCatalogBuffer(Buffer.from(r.data));res.json(result)}catch(e){res.status(422).json({error:'No se pudo descargar o leer ese catálogo PDF'})}});
app.post('/api/admin/import-catalog-products',admin,(req,res)=>{const items=Array.isArray(req.body.products)?req.body.products.slice(0,100):[];if(!items.length)return res.status(400).json({error:'No hay productos seleccionados'});const d=read();let created=0;for(const item of items){const title=String(item.title||'').trim();if(!title)continue;const p={id:id('prd'),title,category:String(item.category||guessCategory(title)),ref:String(item.ref||('FVM-'+Date.now().toString().slice(-6)+'-'+created)),price:Number(item.price)||0,stock:'bajo_pedido',image:String(item.image||''),sourceUrl:String(item.sourceUrl||''),description:String(item.description||''),published:req.body.published===true||item.published===true,featured:!!item.featured,sourcePrice:Number(item.sourcePrice)||0,margin:Number(item.margin)||0};d.products.unshift(p);created++}save(d);res.json({created})});

app.post('/api/admin/import-url',admin,async(req,res)=>{const url=String(req.body.url||'').trim();if(isUnsafeUrl(url))return res.status(400).json({error:'URL no permitida'});try{const r=await axios.get(url,{timeout:8000,maxContentLength:1200000,headers:{'User-Agent':'FVMarket/1.3'}});const $=cheerio.load(r.data);const title=($('meta[property="og:title"]').attr('content')||$('h1').first().text()||$('title').text()||'').trim().slice(0,180);const image=($('meta[property="og:image"]').attr('content')||$('img').first().attr('src')||'').trim();const description=($('meta[property="og:description"]').attr('content')||$('meta[name="description"]').attr('content')||'').trim().slice(0,800);const text=$('body').text().replace(/\s+/g,' ');const m=text.match(/(?:€\s*([0-9]+(?:[.,][0-9]{1,2})?)|([0-9]+(?:[.,][0-9]{1,2})?)\s*€)/);const sourcePrice=m?Number((m[1]||m[2]).replace(',','.')):0;res.json({title,image,description,sourceUrl:url,sourcePrice,margin:0,price:sourcePrice?+sourcePrice.toFixed(2):0,category:'Otros',ref:'FVM-'+Date.now().toString().slice(-6),stock:'bajo_pedido',published:false,featured:false})}catch(e){res.status(422).json({error:'No se pudo leer esa URL. Puedes crear el producto manualmente con la URL como referencia.'})}});

app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log(`FVMarket listening on ${PORT}`));
