from pathlib import Path
import re

root=Path('appsrc')
server=root/'server.js'
admin=root/'public'/'admin.html'
index=root/'public'/'index.html'

s=server.read_text(encoding='utf-8')
a=admin.read_text(encoding='utf-8')
i=index.read_text(encoding='utf-8')

MARK='FVM_CATALOG_TRANSPORT_V1'
if MARK not in s:
    # Configuración RutaFV y taxonomía
    s=s.replace("const BRAVE_SEARCH_API_KEY = String(process.env.BRAVE_SEARCH_API_KEY || '');", "const BRAVE_SEARCH_API_KEY = String(process.env.BRAVE_SEARCH_API_KEY || '');\nconst RUTAFV_API_URL = String(process.env.RUTAFV_API_URL || '').trim().replace(/\\/$/,'');\nconst RUTAFV_API_KEY = String(process.env.RUTAFV_API_KEY || '').trim();\nconst RUTAFV_CLIENT_CODE = String(process.env.RUTAFV_CLIENT_CODE || 'FVMarket').trim();\nconst RUTAFV_QUOTE_PATH = String(process.env.RUTAFV_QUOTE_PATH || '/api/integrations/fvmarket/quote').trim();\nconst RUTAFV_DELIVERY_PATH = String(process.env.RUTAFV_DELIVERY_PATH || '/api/integrations/fvmarket/deliveries').trim();\n// FVM_CATALOG_TRANSPORT_V1")

    # Democión estricta de cualquier usuario no-admin a customer.
    s=s.replace("function ensureAdmin(d){\n  if(!Array.isArray(d.users))d.users=[];", "function ensureAdmin(d){\n  if(!Array.isArray(d.users))d.users=[];\n  for(const x of d.users){if(String(x.username||'').toLowerCase()!==ADMIN_USERNAME && x.role!=='customer')x.role='customer'}")

    # Defaults de catálogo en seed.
    s=s.replace("settings:{deliveryBase:0,igic:7,storeName:'FVMarket'}", "settings:{deliveryBase:0,igic:7,storeName:'FVMarket',categories:['Baño','Cocina','Bricolaje','Construcción','Herramientas','Fontanería','Electricidad','Otros'],subcategories:{'Baño':['Mamparas','Platos de ducha','Muebles de baño','Sanitarios','Grifería'],'Cocina':['Fregaderos','Grifería','Muebles de cocina','Encimeras'],'Bricolaje':['Adhesivos y selladores','Fijaciones','Organización','Reparación']}}")

    # Helpers añadidos antes de las rutas públicas.
    anchor="app.get('/api/health'"
    helper=r'''
function ensureCatalogSettings(d){
  d.settings=d.settings||{};
  if(!Array.isArray(d.settings.categories))d.settings.categories=['Baño','Cocina','Bricolaje','Construcción','Herramientas','Fontanería','Electricidad','Otros'];
  d.settings.categories=d.settings.categories.filter(x=>!['Pintura','Jardín','Baño y cocina'].includes(x));
  for(const c of ['Baño','Cocina','Bricolaje','Construcción','Herramientas'])if(!d.settings.categories.includes(c))d.settings.categories.push(c);
  if(!d.settings.subcategories||typeof d.settings.subcategories!=='object')d.settings.subcategories={};
  d.settings.subcategories['Baño']=d.settings.subcategories['Baño']||['Mamparas','Platos de ducha','Muebles de baño','Sanitarios','Grifería'];
  d.settings.subcategories['Cocina']=d.settings.subcategories['Cocina']||['Fregaderos','Grifería','Muebles de cocina','Encimeras'];
  d.settings.subcategories['Bricolaje']=d.settings.subcategories['Bricolaje']||['Adhesivos y selladores','Fijaciones','Organización','Reparación'];
  for(const p of d.products||[]){
    if(p.category==='Baño y cocina')p.category=/fregader|cocina|encimera/i.test(p.title||'')?'Cocina':'Baño';
    if(p.category==='Pintura'||p.category==='Jardín')p.category='Bricolaje';
    if(p.onOffer==null)p.onOffer=false;
    if(p.discountPct==null)p.discountPct=0;
    if(p.subcategory==null)p.subcategory='';
  }
}
function refPrefix(title='',category=''){
  const t=(title+' '+category).toLowerCase();
  if(/mampara/.test(t)&&/panel|fij[oa]|walk.?in/.test(t))return 'MPF';
  if(/mampara/.test(t)&&/cuadrad|circular|semicircular|curv/.test(t))return 'MCC';
  if(/mampara/.test(t))return 'MAM';
  if(/plato.*ducha/.test(t))return 'PDU';
  if(/mueble.*bañ/.test(t))return 'MBA';
  if(/inodoro|sanitario|wc/.test(t))return 'SAN';
  if(/fregader/.test(t))return 'FRE';
  if(/grifer/.test(t))return 'GRF';
  if(/taladro/.test(t))return 'TAL';
  if(/atornill/.test(t))return 'ATO';
  if(/cement/.test(t))return 'CEM';
  const words=String(title||category||'PRO').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(Boolean);
  return (words.slice(0,3).map(x=>x[0]).join('')||'PRO').slice(0,4);
}
function nextProductRef(d,title,category){
  const prefix=refPrefix(title,category);let max=0;
  for(const p of d.products||[]){const m=String(p.ref||'').match(new RegExp('^'+prefix+'-(\\d{4})$'));if(m)max=Math.max(max,Number(m[1])||0)}
  return `${prefix}-${String(max+1).padStart(4,'0')}`;
}
function offerPrice(p){const pct=Math.max(0,Math.min(90,Number(p.discountPct)||0));return p.onOffer&&pct?+(Number(p.price||0)*(1-pct/100)).toFixed(2):Number(p.price||0)}
async function rutaFVRequest(pathname,payload){
  if(!RUTAFV_API_URL)throw new Error('RutaFV no está configurado');
  const headers={'Content-Type':'application/json'};if(RUTAFV_API_KEY)headers.Authorization='Bearer '+RUTAFV_API_KEY;
  const r=await fetch(RUTAFV_API_URL+pathname,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data.error||data.detail||`RutaFV HTTP ${r.status}`);return data;
}
'''
    s=s.replace(anchor, helper+"\n"+anchor)

    # Asegura migración en cada lectura.
    s=s.replace("if(ensureAdmin(d))save(d);\n    return d;", "const changedAdmin=ensureAdmin(d);ensureCatalogSettings(d);if(changedAdmin)save(d);else save(d);\n    return d;")
    s=s.replace("const d=seed();ensureAdmin(d);save(d);return d;", "const d=seed();ensureAdmin(d);ensureCatalogSettings(d);save(d);return d;")

    # API pública: oferta calculada sin datos privados.
    s=s.replace("return safe;\n}", "safe.regularPrice=Number(safe.price||0);safe.salePrice=offerPrice(safe);safe.hasDiscount=!!(safe.onOffer&&Number(safe.discountPct)>0);return safe;\n}",1)

    # Creación de producto: referencia corta + campos de oferta/subcategoría.
    s=s.replace("ref:String(req.body.ref||ownReference(title,sourcePrice,category))", "ref:String(req.body.ref&&!String(req.body.ref).startsWith('FVM-')?req.body.ref:nextProductRef(d,title,category))")
    s=s.replace("featured:!!req.body.featured};p.images=normalizeProductImages", "featured:!!req.body.featured,subcategory:String(req.body.subcategory||''),onOffer:!!req.body.onOffer,discountPct:Math.max(0,Math.min(90,Number(req.body.discountPct)||0))};p.images=normalizeProductImages")

    # Precio efectivo en pedido y Stripe.
    s=s.replace("unitPrice:p.price,qty,lineTotal:+(p.price*qty).toFixed(2)", "unitPrice:offerPrice(p),regularUnitPrice:Number(p.price||0),discountPct:Number(p.discountPct||0),qty,lineTotal:+(offerPrice(p)*qty).toFixed(2)")
    s=s.replace("subtotal+=p.price*qty", "subtotal+=offerPrice(p)*qty")
    s=s.replace("unit_amount:Math.round(p.price*100)", "unit_amount:Math.round(offerPrice(p)*100)")

    # Transporte separado y sincronización de reparto en creación de pedido.
    old="const delivery=Number(d.settings.deliveryBase||0);const total=+(subtotal+delivery).toFixed(2);const order={id:id('ord'),number:'FVM-'+Date.now().toString().slice(-8),userId:req.user.id,items:normalized,subtotal:+subtotal.toFixed(2),delivery,total,address:String(address||''),phone:String(phone||''),paymentMethod,status:paymentMethod==='transfer'?'pendiente_pago':'pendiente_pago',createdAt:new Date().toISOString()};d.orders.push(order);save(d);res.json(order)"
    new="const requestedTransport=!!req.body.useRutaFV;const q=req.body.rutaFVQuote||{};const delivery=requestedTransport?Math.max(0,Number(q.amount||q.total||0)):0;const total=+(subtotal+delivery).toFixed(2);const order={id:id('ord'),number:'FVM-'+Date.now().toString().slice(-8),userId:req.user.id,items:normalized,subtotal:+subtotal.toFixed(2),delivery,transport:{provider:requestedTransport?'RutaFV':'',requested:requestedTransport,amount:delivery,quoteId:String(q.id||q.quoteId||''),status:requestedTransport?'pendiente_crear_reparto':'sin_transporte'},total,address:String(address||''),phone:String(phone||''),paymentMethod,status:'pendiente_pago',createdAt:new Date().toISOString()};d.orders.push(order);save(d);res.json(order)"
    if old in s:s=s.replace(old,new)

    # Endpoints catálogo y RutaFV antes de app.listen.
    routes=r'''
app.get('/api/admin/catalog-taxonomy',admin,(req,res)=>{const d=read();ensureCatalogSettings(d);res.json({categories:d.settings.categories,subcategories:d.settings.subcategories})});
app.put('/api/admin/catalog-taxonomy',admin,(req,res)=>{const d=read();ensureCatalogSettings(d);const cats=Array.isArray(req.body.categories)?req.body.categories.map(x=>String(x).trim()).filter(Boolean):d.settings.categories;d.settings.categories=[...new Set(cats.filter(x=>!['Pintura','Jardín','Baño y cocina','Ofertas'].includes(x)))];d.settings.subcategories=req.body.subcategories&&typeof req.body.subcategories==='object'?req.body.subcategories:d.settings.subcategories;save(d);res.json({categories:d.settings.categories,subcategories:d.settings.subcategories})});
app.post('/api/rutafv/quote',auth,async(req,res)=>{try{const d=read();const items=[];for(const x of req.body.items||[]){const p=d.products.find(y=>y.id===x.id);if(p)items.push({ref:p.ref,title:p.title,qty:Math.max(1,Number(x.qty)||1),weightKg:Number(p.weightKg||0),sourceProvider:p.sourceProvider||'',sourceUrl:p.sourceUrl||''})}const payload={clientCode:RUTAFV_CLIENT_CODE,customer:{name:req.user.name||'',email:req.user.email||'',phone:String(req.body.phone||'')},destination:String(req.body.address||''),items,orderSource:'FVMarket'};const q=await rutaFVRequest(RUTAFV_QUOTE_PATH,payload);res.json(q)}catch(e){res.status(503).json({error:e.message})}});
app.post('/api/admin/orders/:id/create-rutafv-delivery',admin,async(req,res)=>{try{const d=read();const o=d.orders.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:'Pedido no encontrado'});if(!o.transport?.requested)return res.status(400).json({error:'Este pedido no tiene transporte RutaFV'});const u=d.users.find(x=>x.id===o.userId)||{};const payload={clientCode:RUTAFV_CLIENT_CODE,externalOrderId:o.id,externalOrderNumber:o.number,customer:{name:u.name||'',email:u.email||'',phone:o.phone||''},destination:o.address,transportAmount:o.delivery,transportPaid:['pagado','paid','cobrado'].includes(String(o.status).toLowerCase()),items:o.items.map(x=>({ref:x.ref,title:x.title,qty:x.qty}))};const r=await rutaFVRequest(RUTAFV_DELIVERY_PATH,payload);o.transport.deliveryId=String(r.id||r.deliveryId||r.expeditionId||'');o.transport.status='creado_en_rutafv';o.transport.syncedAt=new Date().toISOString();save(d);res.json(o)}catch(e){res.status(503).json({error:e.message})}});
'''
    s=s.replace("app.listen(", routes+"\napp.listen(")

# ADMIN UI
if 'FVM_ADMIN_CATALOG_V1' not in a:
    a=a.replace('<option>Pintura</option><option>Jardín</option><option>Baño y cocina</option>', '<option>Baño</option><option>Cocina</option><option>Bricolaje</option>')
    a=a.replace('Referencias + búsqueda de imágenes activas · IA generativa no conectada','✓ Referencias automáticas · ✓ Búsqueda inteligente de imágenes · ✓ Catálogo asistido')
    admin_inject=r'''
<style>
.fvmTax{margin-top:14px}.fvmTaxRow{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end}.fvmOffer{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#f6fbf1;border:1px solid #d8eacb;padding:10px;border-radius:9px}.fvmOffer label{font-size:11px;font-weight:900}.fvmChip{display:inline-flex;gap:6px;align-items:center;padding:5px 8px;border-radius:999px;background:#edf8e7;font-size:10px;font-weight:850;margin:3px}.fvmChip button{border:0;background:transparent;cursor:pointer}.fvmRouteBox{background:#edf6ff;border:1px solid #cfe0ef;border-radius:10px;padding:12px;margin-top:12px;font-size:11px}
</style>
<script>
// FVM_ADMIN_CATALOG_V1
const FVM_BASE_CATS=['Baño','Cocina','Bricolaje','Construcción','Herramientas','Fontanería','Electricidad','Otros'];
let fvmTax={categories:FVM_BASE_CATS.slice(),subcategories:{}};
async function fvmLoadTax(){try{fvmTax=await api('/api/admin/catalog-taxonomy');}catch{};fvmRefreshCategorySelects();fvmRenderTaxAdmin()}
function fvmRefreshCategorySelects(){document.querySelectorAll('select').forEach(sel=>{const lab=sel.closest('.field')?.querySelector('label')?.textContent||'';if(/categor/i.test(lab)&&!/subcategor/i.test(lab)){const cur=sel.value;sel.innerHTML=fvmTax.categories.map(c=>`<option>${c}</option>`).join('');if(fvmTax.categories.includes(cur))sel.value=cur}})}
function fvmFindSettings(){return document.getElementById('view-settings')||document.querySelector('[id*=settings]')}
function fvmRenderTaxAdmin(){const host=fvmFindSettings();if(!host||document.getElementById('fvmTaxAdmin'))return;const box=document.createElement('div');box.id='fvmTaxAdmin';box.className='card wide fvmTax';box.innerHTML=`<h2>Categorías y subcategorías</h2><p class="sub">Las categorías principales permanecen estables. Puedes crear subcategorías para futuros productos.</p><div id="fvmCatChips"></div><div class="fvmTaxRow"><div class="field"><label>Categoría</label><select id="fvmSubCatParent"></select></div><div class="field"><label>Nueva subcategoría</label><input id="fvmNewSub" placeholder="Ej. Columnas de ducha"></div><button class="btn" onclick="fvmAddSub()">Agregar</button></div><div id="fvmSubList"></div>`;host.prepend(box);fvmDrawTax()}
function fvmDrawTax(){const pc=document.getElementById('fvmSubCatParent'),chips=document.getElementById('fvmCatChips'),list=document.getElementById('fvmSubList');if(!pc)return;pc.innerHTML=fvmTax.categories.map(c=>`<option>${c}</option>`).join('');chips.innerHTML=fvmTax.categories.map(c=>`<span class="fvmChip">${c}</span>`).join('');list.innerHTML=Object.entries(fvmTax.subcategories||{}).map(([c,arr])=>`<div style="margin-top:8px"><b>${c}</b><div>${(arr||[]).map(x=>`<span class="fvmChip">${x}<button onclick="fvmRemoveSub('${c.replace(/'/g,"\\'")}','${String(x).replace(/'/g,"\\'")}')">×</button></span>`).join('')||'<small>Sin subcategorías</small>'}</div></div>`).join('')}
async function fvmSaveTax(){await api('/api/admin/catalog-taxonomy',{method:'PUT',body:JSON.stringify(fvmTax)});fvmRefreshCategorySelects();fvmDrawTax()}
async function fvmAddSub(){const c=fvmSubCatParent.value,x=fvmNewSub.value.trim();if(!x)return;fvmTax.subcategories[c]=fvmTax.subcategories[c]||[];if(!fvmTax.subcategories[c].includes(x))fvmTax.subcategories[c].push(x);fvmNewSub.value='';await fvmSaveTax()}
async function fvmRemoveSub(c,x){fvmTax.subcategories[c]=(fvmTax.subcategories[c]||[]).filter(y=>y!==x);await fvmSaveTax()}
function fvmEnhanceProductForm(){const category=document.getElementById('category');if(!category||document.getElementById('fvmOfferCreate'))return;const wrap=document.createElement('div');wrap.id='fvmOfferCreate';wrap.innerHTML=`<div class="row2"><div class="field"><label>Subcategoría</label><select id="subcategory"><option value="">Sin subcategoría</option></select></div><div class="field"><label>Referencia FVMarket</label><input id="refHint" placeholder="Se genera automáticamente: MPF-0001" readonly></div></div><div class="fvmOffer"><label><input id="onOffer" type="checkbox"> Incluir en Ofertas</label><div class="field" style="margin:0"><label>Descuento %</label><input id="discountPct" type="number" min="0" max="90" step="1" value="0"></div></div>`;category.closest('.row2')?.insertAdjacentElement('afterend',wrap)||category.parentElement.insertAdjacentElement('afterend',wrap);const fill=()=>{const arr=fvmTax.subcategories[category.value]||[];subcategory.innerHTML='<option value="">Sin subcategoría</option>'+arr.map(x=>`<option>${x}</option>`).join('')};category.addEventListener('change',fill);fill()}
// Añade campos de catálogo al JSON de altas/ediciones sin alterar el resto del panel.
const fvmOrigFetch=window.fetch;window.fetch=async function(input,init={}){try{const u=String(input);if(/\/api\/admin\/products(?:\/[^/]+)?$/.test(u)&&['POST','PUT'].includes(String(init.method||'GET').toUpperCase())&&init.body){const b=JSON.parse(init.body);const modal=document.querySelector('.editModal');const root=modal||document;b.subcategory=root.querySelector('#subcategory,[name=subcategory]')?.value||b.subcategory||'';b.onOffer=!!(root.querySelector('#onOffer,[name=onOffer]')?.checked??b.onOffer);b.discountPct=Number(root.querySelector('#discountPct,[name=discountPct]')?.value??b.discountPct??0);init={...init,body:JSON.stringify(b)}}}catch{}return fvmOrigFetch(input,init)};
const fvmObserver=new MutationObserver(()=>{fvmRefreshCategorySelects();fvmEnhanceProductForm()});fvmObserver.observe(document.body,{childList:true,subtree:true});
setTimeout(()=>{fvmLoadTax();fvmEnhanceProductForm()},500);
</script>
'''
    a=a.replace('</body>',admin_inject+'\n</body>')

# STOREFRONT
if 'FVM_STOREFRONT_OFFERS_RUTAFV_V1' not in i:
    oldcats="<div class=\"catsWrap\"><div class=\"cats\" id=\"cats\"><div class=\"cat\" onclick=\"filterCategory('Construcción')\"><span class=\"catIcon\">▦</span><div><b>Construcción</b><small>Ver productos <span>›</span></small></div></div><div class=\"cat\" onclick=\"filterCategory('Herramientas')\"><span class=\"catIcon\">⌕</span><div><b>Herramientas</b><small>Ver productos <span>›</span></small></div></div><div class=\"cat\" onclick=\"filterCategory('Fontanería')\"><span class=\"catIcon\">♨</span><div><b>Fontanería</b><small>Ver productos <span>›</span></small></div></div><div class=\"cat\" onclick=\"filterCategory('Electricidad')\"><span class=\"catIcon\">♆</span><div><b>Electricidad</b><small>Ver productos <span>›</span></small></div></div><div class=\"cat\" onclick=\"filterCategory('Pintura')\"><span class=\"catIcon\">▱</span><div><b>Pintura</b><small>Ver productos <span>›</span></small></div></div><div class=\"cat\" onclick=\"filterCategory('Jardín')\"><span class=\"catIcon\">♧</span><div><b>Jardín</b><small>Ver productos <span>›</span></small></div></div><div class=\"cat\" onclick=\"filterCategory('Baño y cocina')\"><span class=\"catIcon\">♨</span><div><b>Baño y cocina</b><small>Ver productos <span>›</span></small></div></div></div></div>"
    newcats="<div class=\"catsWrap\"><div class=\"cats\" id=\"cats\"><div class=\"cat\" onclick=\"filterCategory('Baño')\"><span class=\"catIcon\">◫</span><div><b>Baño</b><small>Ver productos <span>›</span></small></div></div><div class=\"cat\" onclick=\"filterCategory('Cocina')\"><span class=\"catIcon\">▤</span><div><b>Cocina</b><small>Ver productos <span>›</span></small></div></div><div class=\"cat\" onclick=\"filterCategory('Bricolaje')\"><span class=\"catIcon\">⌘</span><div><b>Bricolaje</b><small>Ver productos <span>›</span></small></div></div><div class=\"cat\" onclick=\"filterCategory('Construcción')\"><span class=\"catIcon\">▦</span><div><b>Construcción</b><small>Ver productos <span>›</span></small></div></div><div class=\"cat\" onclick=\"filterCategory('Herramientas')\"><span class=\"catIcon\">⌕</span><div><b>Herramientas</b><small>Ver productos <span>›</span></small></div></div><div class=\"cat\" onclick=\"filterOffers()\"><span class=\"catIcon\">%</span><div><b>Ofertas</b><small>Ver descuentos <span>›</span></small></div></div></div></div>"
    if oldcats in i:i=i.replace(oldcats,newcats)
    i=i.replace('<a>Construcción</a><a>Herramientas</a><a>Fontanería</a><a>Electricidad</a><a>Pintura</a><a>Jardín</a><a>Baño y cocina</a>','<a>Baño</a><a>Cocina</a><a>Bricolaje</a><a>Construcción</a><a>Herramientas</a><a>Ofertas</a>')
    i=i.replace('<div class="field"><label>Teléfono</label><input id="orderPhone" placeholder="Teléfono de contacto"></div>', '<div class="field"><label>Teléfono</label><input id="orderPhone" placeholder="Teléfono de contacto"></div><div class="field"><label><input id="useRutaFV" type="checkbox" onchange="toggleRutaFV()"> Entrega con RutaFV</label></div><div id="rutaFVQuoteBox" class="msg" style="display:none"></div>')
    i=i.replace('.product{cursor:pointer}', '.offerBadge{position:absolute;left:10px;top:10px;background:#d93232;color:#fff;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:950;z-index:2}.oldPrice{text-decoration:line-through;color:var(--muted);font-size:11px;margin-right:5px}.routeQuote{background:#edf6ff;border:1px solid #cfe0ef;border-radius:9px;padding:10px;margin:8px 0}.product{cursor:pointer}')
    i=i.replace("function renderProducts(){const g=document.getElementById('productGrid');g.innerHTML=products.map(p=>`<article class=\"product\"", "function renderProducts(){const g=document.getElementById('productGrid');g.innerHTML=products.map(p=>`<article class=\"product\"")
    # Reemplazos localizados de precio y badge en plantilla.
    i=i.replace("<button class=\"heart\" onclick=\"event.stopPropagation()\">♡</button><div class=\"photo\"", "${p.hasDiscount?`<span class=\"offerBadge\">-${Number(p.discountPct||0)}%</span>`:''}<button class=\"heart\" onclick=\"event.stopPropagation()\">♡</button><div class=\"photo\"")
    i=i.replace("<div class=\"price\">${eur(p.price)}</div>", "<div>${p.hasDiscount?`<span class=\"oldPrice\">${eur(p.regularPrice)}</span>`:''}<span class=\"price\">${eur(p.salePrice??p.price)}</span></div>")
    i=i.replace("<div class=\"pdPrice\">${eur(p.price)}</div>", "<div>${p.hasDiscount?`<span class=\"oldPrice\">${eur(p.regularPrice)}</span>`:''}<span class=\"pdPrice\">${eur(p.salePrice??p.price)}</span></div>")
    i=i.replace("if(p)total+=p.price*i.qty", "if(p)total+=(p.salePrice??p.price)*i.qty")
    i=i.replace("total+=p.price*i.qty;return`<div class=\"cartItem\"><div><b>${p.title}</b><br><small>${i.qty} × ${eur(p.price)}</small>", "total+=(p.salePrice??p.price)*i.qty;return`<div class=\"cartItem\"><div><b>${p.title}</b><br><small>${i.qty} × ${eur(p.salePrice??p.price)}</small>")
    transport_js=r'''
// FVM_STOREFRONT_OFFERS_RUTAFV_V1
let rutaFVQuote=null;
function filterOffers(){loadProducts().then(()=>{products=products.filter(p=>p.onOffer||p.hasDiscount);renderProducts();document.getElementById('productos').scrollIntoView({behavior:'smooth'})})}
async function toggleRutaFV(){const box=document.getElementById('rutaFVQuoteBox');if(!useRutaFV.checked){rutaFVQuote=null;box.style.display='none';renderCart();return}if(!await requireLogin()){useRutaFV.checked=false;return}if(!orderAddress.value.trim()){box.style.display='block';box.textContent='Introduce primero la dirección de entrega.';useRutaFV.checked=false;return}box.style.display='block';box.className='routeQuote';box.textContent='Calculando transporte con RutaFV…';try{rutaFVQuote=await api('/api/rutafv/quote',{method:'POST',body:JSON.stringify({items:cart,address:orderAddress.value,phone:orderPhone.value})});const amount=Number(rutaFVQuote.amount??rutaFVQuote.total??0);box.textContent=`RutaFV · Transporte ${eur(amount)} · se cobrará junto con los productos`;renderCart()}catch(e){rutaFVQuote=null;useRutaFV.checked=false;box.textContent='No se pudo calcular RutaFV: '+e.message}}
'''
    i=i.replace("async function requireLogin()", transport_js+"\nasync function requireLogin()")
    i=i.replace("{items:cart,address:orderAddress.value,phone:orderPhone.value,paymentMethod:'transfer'}", "{items:cart,address:orderAddress.value,phone:orderPhone.value,paymentMethod:'transfer',useRutaFV:!!useRutaFV?.checked,rutaFVQuote:rutaFVQuote||null}")
    # Stripe transport quote is shown now; backend Stripe line item for quote can be added once payment finalization/webhook is connected.

server.write_text(s,encoding='utf-8')
admin.write_text(a,encoding='utf-8')
index.write_text(i,encoding='utf-8')
print('FVMarket catalog/transport patch applied')
