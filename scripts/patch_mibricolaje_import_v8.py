from pathlib import Path

SERVER = Path('appsrc/server.js')
ADMIN = Path('appsrc/public/admin.html')

s = SERVER.read_text(encoding='utf-8')
if 'FVM_MIBRICOLAJE_IMPORT_V8' not in s:
    old_public = "const {sourceUrl,sourcePrice,sourceRef,sourceEan,sourceProvider,margin,addedValue,imageSource,imageLicense,imageAuthor,sourceImages,...safe}=p;"
    new_public = "const {sourceUrl,sourcePrice,sourceRef,sourceEan,sourceProvider,sourceBrand,sourceAvailability,sourceTaxNote,sourceCheckedAt,sourceSync,margin,addedValue,imageSource,imageLicense,imageAuthor,sourceImages,...safe}=p;"
    if old_public not in s:
        raise SystemExit('publicProduct private fields anchor not found')
    s = s.replace(old_public, new_public, 1)

    anchor = "app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));"
    if anchor not in s:
        raise SystemExit('admin route anchor not found')

    block = r'''
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
  return {sourceTitle,sourceDescription,sourcePrice,sourceRef,sourceEan,sourceBrand,sourceAvailability,sourceTaxNote,sourceUrl:url};
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
  return {...own,ref:ownReference(own.title,f.sourcePrice,own.category),sourceProvider:'Mi Bricolaje',sourceRef:f.sourceRef,sourceEan:f.sourceEan,sourceBrand:f.sourceBrand,sourceAvailability:f.sourceAvailability,sourceTaxNote:f.sourceTaxNote,sourceUrl:f.sourceUrl,sourcePrice:f.sourcePrice,margin:m,addedValue,price,stock:'bajo_pedido',published:false,featured:false,image:'',images:[],imageSource:'',imageLicense:'',imageAuthor:'',reviewStatus:'borrador',aiMode:ai.mode||'local'}
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
    const p={id:id('prd'),title,category,subcategory:String(x.subcategory||''),ref:nextProductRef(d,title,category),price,stock:'bajo_pedido',image:'',images:[],imageSource:'',imageLicense:'',imageAuthor:'',description:String(x.description||'').slice(0,900),published:false,featured:false,onOffer:false,discountPct:0,sourceProvider:'Mi Bricolaje',sourceRef,sourceEan:String(x.sourceEan||''),sourceBrand:String(x.sourceBrand||''),sourceAvailability:String(x.sourceAvailability||''),sourceTaxNote:String(x.sourceTaxNote||''),sourceUrl:String(x.sourceUrl||''),sourcePrice,margin,addedValue,sourceCheckedAt:new Date().toISOString(),sourceSync:'mibricolaje_v8',reviewStatus:'borrador',importedAt:new Date().toISOString()};d.products.unshift(p);products.push(p);created++}
  save(d);res.json({created,skipped,products})
});
app.post('/api/admin/mibricolaje/refresh/:id',admin,async(req,res)=>{
  const d=read();const p=d.products.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:'Producto no encontrado'});if(p.sourceProvider!=='Mi Bricolaje'||!isMiBricolajeUrl(p.sourceUrl))return res.status(400).json({error:'El producto no está asociado a MiBricolaje'});
  try{const r=await mbGet(p.sourceUrl);const f=mbFactsFromHtml(r.data,p.sourceUrl);const oldSourcePrice=Number(p.sourcePrice)||0;p.sourcePrice=f.sourcePrice;p.sourceAvailability=f.sourceAvailability;p.sourceTaxNote=f.sourceTaxNote;p.sourceCheckedAt=new Date().toISOString();p.addedValue=+(f.sourcePrice*(Number(p.margin)||0)/100).toFixed(2);p.price=+(f.sourcePrice+p.addedValue).toFixed(2);save(d);res.json({product:p,change:{oldSourcePrice,newSourcePrice:f.sourcePrice}})}catch(e){res.status(422).json({error:String(e.message||'No se pudo actualizar el origen')})}
});

'''
    s = s.replace(anchor, block + anchor, 1)
    SERVER.write_text(s, encoding='utf-8')

h = ADMIN.read_text(encoding='utf-8')
if 'FVM_MIBRICOLAJE_UI_V8' not in h:
    anchor = '</body>'
    if anchor not in h:
        raise SystemExit('admin body anchor not found')
    ui = r'''
<script>
/* FVM_MIBRICOLAJE_UI_V8 */
(function(){
  let mbProducts=[];
  function eur(n){return Number(n||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function mount(){
    const grid=document.querySelector('#view-catalog .grid');if(!grid||document.getElementById('mbImportCard'))return;
    const card=document.createElement('div');card.id='mbImportCard';card.className='card wide';
    card.innerHTML=`<div class="bar"><div><h2 style="margin:0">Importar desde MiBricolaje</h2><p class="sub" style="margin:5px 0 0">Fuente interna de aprovisionamiento. FVMarket conserva referencia/precio origen, crea referencia propia y no copia imágenes ni descripciones literales.</p></div><span class="badge">Método principal</span></div>
      <div class="notice"><b>Uso independiente:</b> pega referencias (FT1533, FT1526...) o URLs de fichas. Los productos se guardan como <b>borradores</b> y la asociación con MiBricolaje solo es visible en administración.</div>
      <div class="row2" style="margin-top:12px"><div class="field"><label>Referencias o URLs · una por línea</label><textarea id="mbInputs" rows="5" placeholder="FT1533\nFT1526\nhttps://mibricolaje.com/..." style="width:100%"></textarea></div><div><div class="field"><label>Valor añadido (%)</label><input id="mbMargin" type="number" min="0" max="300" step="0.1" value="40"></div><button class="btn navy" id="mbAnalyzeBtn" type="button">Analizar productos</button><div class="msg" id="mbMsg"></div></div></div>
      <div id="mbResults" style="margin-top:14px"></div>`;
    const pdf=grid.querySelector('.fvmCatalogV2');if(pdf)grid.insertBefore(card,pdf);else grid.prepend(card);
    document.getElementById('mbAnalyzeBtn').onclick=analyze;
  }
  async function analyze(){
    const box=document.getElementById('mbInputs'),msg=document.getElementById('mbMsg'),btn=document.getElementById('mbAnalyzeBtn');
    const inputs=String(box?.value||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean);if(!inputs.length){msg.textContent='Introduce al menos una referencia o URL.';return}
    btn.disabled=true;msg.textContent='Consultando fichas públicas y generando fichas propias FVMarket…';
    try{const r=await api('/api/admin/mibricolaje/analyze',{method:'POST',body:JSON.stringify({inputs,margin:Number(document.getElementById('mbMargin').value)||40})});mbProducts=r.products||[];render(r.errors||[]);msg.textContent=mbProducts.length+' productos preparados para revisión'+((r.errors||[]).length?' · '+r.errors.length+' no encontrados':'')+'.';}catch(e){msg.textContent=e.message||'No se pudo analizar.'}finally{btn.disabled=false}
  }
  function render(errors=[]){
    const el=document.getElementById('mbResults');if(!el)return;if(!mbProducts.length){el.innerHTML=errors.length?'<div class="notice">'+errors.map(x=>esc(x.input)+': '+esc(x.error)).join('<br>')+'</div>':'';return}
    el.innerHTML=`<div class="catalogTable" style="max-height:560px"><table><thead><tr><th>✓</th><th>Producto FVMarket</th><th>Ref. origen</th><th>Marca</th><th>Precio origen</th><th>Margen</th><th>PVP</th><th>Estado</th></tr></thead><tbody>${mbProducts.map((p,i)=>`<tr><td><input type="checkbox" class="mbSel" data-i="${i}"></td><td><input class="miniTitle mbTitle" data-i="${i}" value="${esc(p.title)}"><div class="aiMeta">Ref. FVMarket se asignará al importar · sin imagen del origen</div></td><td><b>${esc(p.sourceRef)}</b></td><td>${esc(p.sourceBrand||'')}</td><td>${eur(p.sourcePrice)}${p.sourceTaxNote?'<div class="aiMeta">'+esc(p.sourceTaxNote)+'</div>':''}</td><td><input class="miniInput mbMarginRow" data-i="${i}" type="number" min="0" max="300" step="0.1" value="${Number(p.margin||40)}"></td><td class="mbPvp" data-i="${i}"><b>${eur(p.price)}</b></td><td><span class="badge">Borrador</span><div class="aiMeta">${esc(p.sourceAvailability||'')}</div></td></tr>`).join('')}</tbody></table></div>
      <div class="bar" style="margin-top:10px"><button class="btn ghost" id="mbSelectAll">Seleccionar todos</button><button class="btn navy" id="mbImportSelected">Importar seleccionados como borrador</button><span class="msg" id="mbImportMsg"></span></div>${errors.length?'<div class="notice">No encontrados:<br>'+errors.map(x=>esc(x.input)+': '+esc(x.error)).join('<br>')+'</div>':''}`;
    el.querySelectorAll('.mbMarginRow').forEach(inp=>inp.oninput=()=>{const i=Number(inp.dataset.i),m=Math.max(0,Number(inp.value)||0);mbProducts[i].margin=m;mbProducts[i].addedValue=+(Number(mbProducts[i].sourcePrice||0)*m/100).toFixed(2);mbProducts[i].price=+(Number(mbProducts[i].sourcePrice||0)+mbProducts[i].addedValue).toFixed(2);el.querySelector('.mbPvp[data-i="'+i+'"]').innerHTML='<b>'+eur(mbProducts[i].price)+'</b>'});
    el.querySelectorAll('.mbTitle').forEach(inp=>inp.oninput=()=>{mbProducts[Number(inp.dataset.i)].title=inp.value});
    document.getElementById('mbSelectAll').onclick=()=>el.querySelectorAll('.mbSel').forEach(x=>x.checked=true);
    document.getElementById('mbImportSelected').onclick=doImport;
  }
  async function doImport(){
    const el=document.getElementById('mbResults'),msg=document.getElementById('mbImportMsg');const chosen=[...el.querySelectorAll('.mbSel:checked')].map(x=>mbProducts[Number(x.dataset.i)]);if(!chosen.length){msg.textContent='Selecciona al menos un producto.';return}
    msg.textContent='Importando…';try{const r=await api('/api/admin/mibricolaje/import',{method:'POST',body:JSON.stringify({products:chosen})});msg.textContent='Creados '+r.created+' borradores'+(r.skipped?' · '+r.skipped+' omitidos/duplicados':'')+'. Revisa imágenes y ficha desde Productos.';if(typeof loadProducts==='function')loadProducts()}catch(e){msg.textContent=e.message||'Error al importar.'}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else setTimeout(mount,0);
})();
</script>
'''
    h = h.replace(anchor, ui + anchor, 1)
    ADMIN.write_text(h, encoding='utf-8')

print('FVM_MIBRICOLAJE_IMPORT_V8 applied')
