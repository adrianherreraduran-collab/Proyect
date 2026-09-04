from pathlib import Path
import re

# trigger v1.7 gallery patch
ROOT=Path('appsrc')
server_path=ROOT/'server.js'
index_path=ROOT/'public'/'index.html'
server=server_path.read_text(encoding='utf-8')
index=index_path.read_text(encoding='utf-8')

if 'FVM_EXTERNAL_IMAGE_SEARCH_V3' not in server:
    marker="function catalogCandidatesFromText(text)"
    helper=r'''
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
async function searchExternalImages(query='',limit=8){
  const target=Math.max(3,Math.min(Number(limit)||8,12));const seen=new Set(),out=[];
  const add=items=>{for(const x of items||[]){const url=String(x.url||'');const src=String(x.source||'');if(!url||seen.has(url)||isSpanishImageDomain(url)||isSpanishImageDomain(src))continue;seen.add(url);out.push({...x,origin:'similar'});if(out.length>=target)break}};
  add(await searchOpenverseImages(query,target+4));
  if(out.length<target)add((await searchCommonsImages(query,target+4)).map(x=>({...x,origin:'similar'})));
  if(out.length<target){const short=String(query).split(/\s+/).slice(0,4).join(' ');if(short&&short!==query)add(await searchOpenverseImages(short,target+4))}
  return out.slice(0,target);
}
'''
    if marker not in server: raise SystemExit('server marker not found')
    server=server.replace(marker,helper+'\n'+marker,1)

server=re.sub(
    r"app\.get\('/api/admin/ai-status'.*?\napp\.post\('/api/admin/ai-catalog'.*?\n",
    """app.get('/api/admin/ai-status',admin,(req,res)=>res.json({openai:!!OPENAI_API_KEY,model:OPENAI_MODEL,imageSearch:'Openverse + Wikimedia · excluye dominios de España'}));
app.post('/api/admin/ai-product',admin,async(req,res)=>{const item=req.body||{};const result=await aiAnalyzeItems([item]);const p=result.products?.[0]||fallbackProductAnalysis(item,0);const sourceImages=normalizeProductImages(item.sourceImages||[],item.sourceUrl?item.image:'').map(x=>({...x,origin:'source'}));const alternativeImages=await searchExternalImages((p.title+' '+(p.imageQuery||'')).slice(0,140),8);const images=alternativeImages.slice(0,8);const first=alternativeImages[0]||null;res.json({...p,aiMode:result.mode,warning:result.warning||'',sourceImages,alternativeImages,images,image:first?.url||'',imageSource:first?.source||'',imageLicense:first?.license||'',imageAuthor:first?.author||''})});
app.post('/api/admin/ai-catalog',admin,async(req,res)=>{const items=Array.isArray(req.body.products)?req.body.products.slice(0,30):[];if(!items.length)return res.status(400).json({error:'No hay productos para analizar'});const result=await aiAnalyzeItems(items);const products=[];for(const p of (result.products||[])){const images=await searchExternalImages((p.title+' '+(p.imageQuery||'')).slice(0,140),6);const first=images[0]||null;products.push({...p,images,alternativeImages:images,image:first?.url||'',imageSource:first?.source||'',imageLicense:first?.license||'',imageAuthor:first?.author||''})}res.json({mode:result.mode,warning:result.warning||'',products})});
""",
    server,count=1,flags=re.S)

server=server.replace("p.images=normalizeProductImages(req.body.images,p.image);if(p.images[0])", "p.images=normalizeProductImages(req.body.images,p.image);if(req.body.published&&p.images.length<3)return res.status(400).json({error:'Para publicar un anuncio se requieren al menos 3 imágenes.'});if(p.images[0])",1)
server=server.replace("if(req.body.published!=null)next.published=!!req.body.published;if(req.body.featured!=null)", "if(req.body.published!=null){if(req.body.published){const checkImages=normalizeProductImages(req.body.images!=null?req.body.images:next.images,next.image);if(checkImages.length<3)return res.status(400).json({error:'Para publicar un anuncio se requieren al menos 3 imágenes.'})}next.published=!!req.body.published}if(req.body.featured!=null)",1)

if 'FVM_PRODUCT_DETAIL_V3' not in index:
    css=r'''
/* FVM_PRODUCT_DETAIL_V3 */
.product{cursor:pointer}.productDetailBox{position:relative;background:#fff;width:min(980px,94vw);max-height:90vh;overflow:auto;margin:5vh auto;border-radius:16px;padding:22px;box-shadow:0 28px 90px #0006}.pdGrid{display:grid;grid-template-columns:minmax(320px,1.05fr) 1fr;gap:26px}.pdMain{height:390px;background:#f7f9fb center/contain no-repeat;border-radius:12px;border:1px solid var(--line)}.pdThumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:9px}.pdThumb{height:82px;background:#f8fafc center/contain no-repeat;border:1px solid var(--line);border-radius:8px;cursor:pointer}.pdThumb.active{outline:2px solid var(--orange)}.pdCategory{font-size:11px;font-weight:900;color:var(--orange)}.pdTitle{font-size:28px;line-height:1.12;margin:8px 0}.pdRef{font-size:11px;color:var(--muted)}.pdDescription{font-size:14px;line-height:1.55;color:#33465d;margin:18px 0}.pdPrice{font-size:31px;font-weight:950}.pdActions{display:flex;gap:10px;align-items:center;margin-top:18px}.pdAdd{border:0;background:var(--navy);color:#fff;padding:13px 20px;border-radius:8px;font-weight:900;cursor:pointer}.pdDelivery{margin-top:14px;background:#f1f8ed;border-radius:9px;padding:11px;font-size:12px;font-weight:750}.pdClose{position:absolute;right:15px;top:15px;border:0;background:#edf2f6;border-radius:50%;width:38px;height:38px;cursor:pointer;z-index:2}@media(max-width:760px){.productDetailBox{margin:2vh auto;padding:15px;max-height:96vh}.pdGrid{grid-template-columns:1fr}.pdMain{height:300px}.pdTitle{font-size:23px}.pdThumb{height:68px}}
'''
    index=index.replace('</style>',css+'\n</style>',1)
    modal='''<div id="productDetailModal" class="modal"><div class="shade" onclick="closeProductDetail()"></div><div class="productDetailBox"><button class="pdClose" onclick="closeProductDetail()">×</button><div id="productDetailContent"></div></div></div>\n'''
    index=index.replace('<script>',modal+'<script>',1)

    old="function renderProducts(){const g=document.getElementById('productGrid');g.innerHTML=products.map(p=>`<article class=\"product\"><button class=\"heart\">♡</button><div class=\"photo\" style=\"background-image:url('${(p.image||'').replace(/'/g,'')}')\"></div><div class=\"pcat\">${p.category}</div><h3>${p.title}</h3><div class=\"pref\">Ref. ${p.ref}</div><div class=\"pfoot\"><div><div class=\"price\">${eur(p.price)}</div><div class=\"stock\">● Disponible bajo pedido</div><div class=\"deliverytxt\">🚚 Entrega con RutaFV</div></div><button class=\"add\" onclick=\"addToCart('${p.id}')\">+</button></div></article>`).join('')||'<p>No hay productos en esta selección.</p>'}"
    new="function renderProducts(){const g=document.getElementById('productGrid');g.innerHTML=products.map(p=>`<article class=\"product\" onclick=\"openProductDetail('${p.id}')\"><button class=\"heart\" onclick=\"event.stopPropagation()\">♡</button><div class=\"photo\" style=\"background-image:url('${(p.image||'').replace(/'/g,'')}')\"></div><div class=\"pcat\">${p.category}</div><h3>${p.title}</h3><div class=\"pref\">Ref. ${p.ref}</div><div class=\"pfoot\"><div><div class=\"price\">${eur(p.price)}</div><div class=\"stock\">● Disponible bajo pedido</div><div class=\"deliverytxt\">🚚 Entrega con RutaFV</div></div><button class=\"add\" onclick=\"event.stopPropagation();addToCart('${p.id}')\">+</button></div></article>`).join('')||'<p>No hay productos en esta selección.</p>'}"
    if old not in index: raise SystemExit('renderProducts exact marker not found')
    index=index.replace(old,new,1)
    detail=r'''
function productGallery(p){const raw=Array.isArray(p.images)?p.images:[];const urls=[];const seen=new Set();for(const x of raw){const u=typeof x==='string'?x:x?.url;if(u&&!seen.has(u)){seen.add(u);urls.push(u)}}if(p.image&&!seen.has(p.image))urls.unshift(p.image);return urls.slice(0,12)}
function setDetailImage(url,el){const main=document.getElementById('pdMainImage');if(main)main.style.backgroundImage="url('"+String(url||'').replace(/'/g,'')+"')";document.querySelectorAll('.pdThumb').forEach(x=>x.classList.remove('active'));if(el)el.classList.add('active')}
function openProductDetail(id){const p=products.find(x=>x.id===id);if(!p)return;const imgs=productGallery(p);const first=imgs[0]||'';const thumbs=imgs.map((u,i)=>`<button class="pdThumb ${i===0?'active':''}" style="background-image:url('${String(u).replace(/'/g,'')}')" onclick="setDetailImage('${String(u).replace(/'/g,'')}',this)"></button>`).join('');document.getElementById('productDetailContent').innerHTML=`<div class="pdGrid"><div><div id="pdMainImage" class="pdMain" style="background-image:url('${String(first).replace(/'/g,'')}')"></div><div class="pdThumbs">${thumbs}</div></div><div><div class="pdCategory">${p.category||''}</div><h2 class="pdTitle">${p.title||''}</h2><div class="pdRef">Ref. ${p.ref||''}</div><div class="pdDescription">${p.description||'Consulta disponibilidad y características del artículo. Producto disponible bajo pedido.'}</div><div class="pdPrice">${eur(p.price)}</div><div class="stock">● Disponible bajo pedido</div><div class="pdDelivery">🚚 Entrega profesional en Fuerteventura con RutaFV</div><div class="pdActions"><button class="pdAdd" onclick="addToCart('${p.id}');closeProductDetail()">Añadir al carrito</button></div></div></div>`;document.getElementById('productDetailModal').classList.add('show')}
function closeProductDetail(){document.getElementById('productDetailModal').classList.remove('show')}
'''
    index=index.replace('function filterCategory(c)',detail+'\nfunction filterCategory(c)',1)

server_path.write_text(server,encoding='utf-8')
index_path.write_text(index,encoding='utf-8')
print('FVMarket external gallery patch applied')
