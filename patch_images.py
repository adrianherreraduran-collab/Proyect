from pathlib import Path

server_path=Path('appsrc/server.js')
admin_path=Path('appsrc/public/admin.html')
server=server_path.read_text(encoding='utf-8')
admin=admin_path.read_text(encoding='utf-8')
MARK='FVM_IMAGE_MANAGER_V2'
if MARK in server and MARK in admin:
    print('Image manager patch already applied')
    raise SystemExit(0)

def rep(text, old, new, label):
    if old not in text:
        raise SystemExit('NO MATCH '+label)
    return text.replace(old,new,1)

# ---------------- Backend ----------------
server=rep(server,
"app.get('/api/admin/products',admin,(req,res)=>res.json(read().products));",
"""// FVM_IMAGE_MANAGER_V2
function normalizeProductImages(value=[],fallback=''){
  const arr=Array.isArray(value)?value:[];const out=[];const seen=new Set();
  for(const raw of arr){const x=typeof raw==='string'?{url:raw}:(raw||{});const url=String(x.url||'').trim();if(!url||seen.has(url))continue;seen.add(url);out.push({url,source:String(x.source||''),license:String(x.license||''),author:String(x.author||''),origin:String(x.origin||'manual')});if(out.length>=12)break}
  if(fallback&&!seen.has(String(fallback))){out.unshift({url:String(fallback),source:'',license:'',author:'',origin:'legacy'})}
  return out;
}
function scoreSourceImage(url='',el=null){let s=0;const u=String(url).toLowerCase();const hint=String(el?.attr?.('class')||'')+' '+String(el?.attr?.('id')||'')+' '+String(el?.attr?.('alt')||'');if(/product|producto|gallery|galeria|zoom|main|principal|detail|detalle/i.test(hint))s+=5;if(/logo|icon|sprite|avatar|banner|payment|star|flag/i.test(u+' '+hint))s-=8;const w=Number(el?.attr?.('width')||0),h=Number(el?.attr?.('height')||0);if(w>=300||h>=300)s+=2;return s}
function collectSourceImages($,prod,url){const found=[];const push=(v,score=0)=>{const abs=absoluteUrl(v,url);if(!abs||!/^https?:/i.test(abs))return;if(/logo|icon|sprite|favicon|payment|badge/i.test(abs))return;found.push({url:abs,score})};const j=Array.isArray(prod?.image)?prod.image:[prod?.image];j.filter(Boolean).forEach(v=>push(typeof v==='string'?v:(v?.url||v?.contentUrl||''),12));push($('meta[property=\"og:image\"]').attr('content')||'',10);push($('link[rel=\"image_src\"]').attr('href')||'',9);$('img').each((_,el)=>{const e=$(el);const src=e.attr('data-zoom-image')||e.attr('data-large')||e.attr('data-src')||e.attr('src')||'';push(src,scoreSourceImage(src,e))});const seen=new Set();return found.sort((a,b)=>b.score-a.score).filter(x=>{if(seen.has(x.url))return false;seen.add(x.url);return true}).slice(0,8).map(x=>({url:x.url,source:url,license:'Imagen de la ficha de origen: revisar permiso/licencia antes de publicar',author:'',origin:'source'}))}
app.get('/api/admin/products',admin,(req,res)=>res.json(read().products));""","backend helpers")

server=rep(server,
"const p={id:id('prd'),title,category,ref:String(req.body.ref||ownReference(title,sourcePrice,category)),price:Number(req.body.price)||0,stock:req.body.stock||'bajo_pedido',image:String(req.body.image||''),imageSource:String(req.body.imageSource||''),imageLicense:String(req.body.imageLicense||''),imageAuthor:String(req.body.imageAuthor||''),sourceUrl:String(req.body.sourceUrl||''),description:String(req.body.description||''),sourcePrice,addedValue:Number(req.body.addedValue)||Math.max(0,(Number(req.body.price)||0)-sourcePrice),margin:Number(req.body.margin)||0,published:!!req.body.published,featured:!!req.body.featured};d.products.unshift(p);",
"const p={id:id('prd'),title,category,ref:String(req.body.ref||ownReference(title,sourcePrice,category)),price:Number(req.body.price)||0,stock:req.body.stock||'bajo_pedido',image:String(req.body.image||''),imageSource:String(req.body.imageSource||''),imageLicense:String(req.body.imageLicense||''),imageAuthor:String(req.body.imageAuthor||''),sourceUrl:String(req.body.sourceUrl||''),description:String(req.body.description||''),sourcePrice,addedValue:Number(req.body.addedValue)||Math.max(0,(Number(req.body.price)||0)-sourcePrice),margin:Number(req.body.margin)||0,published:!!req.body.published,featured:!!req.body.featured};p.images=normalizeProductImages(req.body.images,p.image);if(p.images[0]){p.image=p.images[0].url;p.imageSource=p.images[0].source||p.imageSource;p.imageLicense=p.images[0].license||p.imageLicense;p.imageAuthor=p.images[0].author||p.imageAuthor}d.products.unshift(p);",
"product create images")

server=rep(server,
"if(req.body.published!=null)next.published=!!req.body.published;if(req.body.featured!=null)next.featured=!!req.body.featured;d.products[i]=next;save(d);res.json(next)});",
"if(req.body.published!=null)next.published=!!req.body.published;if(req.body.featured!=null)next.featured=!!req.body.featured;if(req.body.images!=null)next.images=normalizeProductImages(req.body.images,next.image);else if(!Array.isArray(next.images))next.images=normalizeProductImages([],next.image);if(next.images.length){next.image=next.images[0].url;next.imageSource=next.images[0].source||'';next.imageLicense=next.images[0].license||'';next.imageAuthor=next.images[0].author||''}else if(req.body.images!=null){next.image='';next.imageSource='';next.imageLicense='';next.imageAuthor=''}d.products[i]=next;save(d);res.json(next)});",
"product update images")

old="const category=guessCategory(title+' '+description);return {title,description,image:absoluteUrl(imageRaw,url),sourceUrl:url,sourcePrice,margin:0,addedValue:0,price:sourcePrice?+sourcePrice.toFixed(2):0,category,ref:ownReference(title,sourcePrice,category),stock:'bajo_pedido',published:false,featured:false}}"
new="const category=guessCategory(title+' '+description);const sourceImages=collectSourceImages($,prod,url);const main=sourceImages[0]?.url||absoluteUrl(imageRaw,url);return {title,description,image:main,sourceImages,images:sourceImages,sourceUrl:url,sourcePrice,margin:0,addedValue:0,price:sourcePrice?+sourcePrice.toFixed(2):0,category,ref:ownReference(title,sourcePrice,category),stock:'bajo_pedido',published:false,featured:false}}"
server=rep(server,old,new,'extract source images')

server=rep(server,
"app.get('/api/admin/ai-status',admin,(req,res)=>res.json({openai:!!OPENAI_API_KEY,model:OPENAI_MODEL,imageSearch:'Wikimedia Commons'}));",
"app.get('/api/admin/ai-status',admin,(req,res)=>res.json({openai:!!OPENAI_API_KEY,model:OPENAI_MODEL,imageSearch:'imágenes de origen + Wikimedia Commons'}));",
"ai status")

server=rep(server,
"app.post('/api/admin/ai-product',admin,async(req,res)=>{const item=req.body||{};const result=await aiAnalyzeItems([item]);const p=result.products?.[0]||fallbackProductAnalysis(item,0);const images=await searchCommonsImages(p.imageQuery||p.title,4);const first=images[0]||null;res.json({...p,aiMode:result.mode,warning:result.warning||'',images,image:first?.url||'',imageSource:first?.source||'',imageLicense:first?.license||'',imageAuthor:first?.author||''})});",
"app.post('/api/admin/ai-product',admin,async(req,res)=>{const item=req.body||{};const result=await aiAnalyzeItems([item]);const p=result.products?.[0]||fallbackProductAnalysis(item,0);const sourceImages=normalizeProductImages(item.sourceImages||item.images||[],item.sourceUrl?item.image:'').map(x=>({...x,origin:'source'}));const alternativeImages=(await searchCommonsImages((p.title+' '+(p.imageQuery||'')).slice(0,120),6)).map(x=>({...x,origin:'similar'}));const images=[...sourceImages,...alternativeImages].slice(0,10);const first=sourceImages[0]||alternativeImages[0]||null;res.json({...p,aiMode:result.mode,warning:result.warning||'',sourceImages,alternativeImages,images,image:first?.url||'',imageSource:first?.source||'',imageLicense:first?.license||'',imageAuthor:first?.author||''})});",
"ai product source first")

# Catalog imports also preserve image arrays.
server=rep(server,
"description:String(item.description||''),published:req.body.published===true||item.published===true,featured:!!item.featured,sourcePrice:Number(item.sourcePrice)||0,addedValue:Number(item.addedValue)||Math.max(0,(Number(item.price)||0)-(Number(item.sourcePrice)||0)),margin:Number(item.margin)||0};d.products.unshift(p);created++}",
"description:String(item.description||''),published:req.body.published===true||item.published===true,featured:!!item.featured,sourcePrice:Number(item.sourcePrice)||0,addedValue:Number(item.addedValue)||Math.max(0,(Number(item.price)||0)-(Number(item.sourcePrice)||0)),margin:Number(item.margin)||0};p.images=normalizeProductImages(item.images,p.image);if(p.images[0])p.image=p.images[0].url;d.products.unshift(p);created++}",
"catalog import images")

# ---------------- Admin UI ----------------
admin=rep(admin,
".editImages{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.editImages .aiImage img{height:90px}",
".editImages{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.editImages .aiImage img{height:90px}.imgGroupTitle{font-size:11px;font-weight:950;color:var(--navy);margin:12px 0 6px}.manageImage{border:1px solid var(--line);border-radius:9px;padding:7px;background:#f8fbfd}.manageImage.main{outline:2px solid var(--lime)}.manageImage img{width:100%;height:105px;object-fit:contain;background:#fff;border-radius:6px}.manageImage .imgBtns{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}.manageImage .imgBtns button{border:0;border-radius:6px;padding:5px 6px;font-size:9px;cursor:pointer}.imgWarn{font-size:10px;color:#8a5a00;background:#fff8dd;padding:7px;border-radius:7px;margin-top:6px}",
"admin css image manager")

admin=rep(admin,
"<div class=\"field\"><label>Imagen URL</label><input id=\"editImage\"></div><button class=\"btn ghost\" onclick=\"editAI()\">✨ Mejorar + buscar imagen similar</button><div id=\"editImageSuggest\" class=\"editImages\"></div>",
"<div class=\"field\"><label>Imagen principal URL</label><input id=\"editImage\" oninput=\"syncMainImageField()\"></div><div class=\"bar\"><button class=\"btn ghost\" onclick=\"addEditImageUrl()\">＋ Añadir imagen por URL</button><button class=\"btn ghost\" onclick=\"editAI()\">✨ Buscar imágenes relacionadas</button></div><div class=\"imgWarn\">Las imágenes tomadas de la ficha de origen conservan sus derechos/licencia. FVMarket las identifica como imágenes de origen para que puedas revisar su uso antes de publicar.</div><div class=\"imgGroupTitle\">Imágenes del producto</div><div id=\"editGallery\" class=\"editImages\"></div><div class=\"imgGroupTitle\">Propuestas relacionadas</div><div id=\"editImageSuggest\" class=\"editImages\"></div>",
"edit modal image manager")

admin=rep(admin,
"function renderSingleImages(){const box=$('imageSuggest');if(!box)return;const imgs=draft.images||[];box.innerHTML=imgs.length?imgs.map((im,j)=>'<div class=\"aiImage\" onclick=\"chooseSingleImage('+j+')\"><img src=\"'+esc(im.url)+'\"><small>'+esc(im.license||'Licencia indicada en origen')+(im.author?' · '+esc(im.author):'')+'</small></div>').join(''):'<div class=\"msg\">No se encontraron imágenes libres similares. Puedes introducir otra URL de imagen manualmente.</div>'}",
"function renderSingleImages(){const box=$('imageSuggest');if(!box)return;const src=draft.sourceImages||[];const alt=draft.alternativeImages||[];const cards=(arr,kind)=>arr.map((im,j)=>'<div class=\"aiImage\" onclick=\"chooseSingleImage(\\''+kind+'\\','+j+')\"><img src=\"'+esc(im.url)+'\"><small>'+esc(kind==='source'?'Imagen de origen · revisar licencia':(im.license||'Imagen similar'))+'</small></div>').join('');box.innerHTML=(src.length?'<div class=\"imgGroupTitle\" style=\"grid-column:1/-1\">Imágenes reales de la ficha de origen</div>'+cards(src,'source'):'')+(alt.length?'<div class=\"imgGroupTitle\" style=\"grid-column:1/-1\">Alternativas similares</div>'+cards(alt,'similar'):'')+(!src.length&&!alt.length?'<div class=\"msg\">No se encontraron imágenes relacionadas. Puedes introducir una URL manualmente.</div>':'')}",
"single grouped images")

admin=rep(admin,
"function chooseSingleImage(j){const im=draft.images?.[j];if(!im)return;draft.image=im.url;draft.imageSource=im.source||'';draft.imageLicense=im.license||'';draft.imageAuthor=im.author||'';$('image').value=im.url}",
"function chooseSingleImage(kind,j){const im=(kind==='source'?draft.sourceImages:draft.alternativeImages)?.[j];if(!im)return;draft.image=im.url;draft.imageSource=im.source||'';draft.imageLicense=im.license||'';draft.imageAuthor=im.author||'';draft.images=[{...im,origin:kind}];$('image').value=im.url}",
"single choose grouped")

admin=rep(admin,
"draft={...current,...p,sourcePrice:current.sourcePrice,margin:current.margin,addedValue:current.addedValue,price:current.price};",
"draft={...current,...p,sourceImages:p.sourceImages||current.sourceImages||[],alternativeImages:p.alternativeImages||[],sourcePrice:current.sourcePrice,margin:current.margin,addedValue:current.addedValue,price:current.price};",
"single AI preserve source")

admin=rep(admin,
"$('image').value='';$('description').value=draft.description||'';draft.image='';draft.images=[];renderSingleImages();",
"$('image').value=draft.image||'';$('description').value=draft.description||'';draft.images=draft.sourceImages||draft.images||[];draft.alternativeImages=[];renderSingleImages();",
"import url preserve source images")

admin=rep(admin,
"description:$('description').value,featured:$('featured').checked,published:$('published').checked};",
"description:$('description').value,images:draft.images||[],featured:$('featured').checked,published:$('published').checked};",
"create product images body")

admin=rep(admin,
"function openEdit(id){const p=productCache.find(x=>x.id===id);if(!p)return;editDraft={...p};editImages=[];",
"function openEdit(id){const p=productCache.find(x=>x.id===id);if(!p)return;editDraft={...p,images:(Array.isArray(p.images)&&p.images.length?p.images:(p.image?[{url:p.image,source:p.imageSource||'',license:p.imageLicense||'',author:p.imageAuthor||'',origin:'legacy'}]:[]))};editImages=[];",
"open edit normalize images")

admin=rep(admin,
"$('editMsg').textContent='';$('editImageSuggest').innerHTML='';$('editModal').style.display='flex'}",
"$('editMsg').textContent='';$('editImageSuggest').innerHTML='';renderEditGallery();$('editModal').style.display='flex'}",
"open edit render gallery")

admin=rep(admin,
"function renderEditImages(){const box=$('editImageSuggest');box.innerHTML=editImages.length?editImages.map((im,j)=>'<div class=\"aiImage\" onclick=\"chooseEditImage('+j+')\"><img src=\"'+esc(im.url)+'\"><small>'+esc(im.license||'Licencia indicada en origen')+'</small></div>').join(''):'<div class=\"msg\">No se encontraron imágenes libres similares.</div>'}\nfunction chooseEditImage(j){const im=editImages[j];if(!im)return;$('editImage').value=im.url;editDraft.imageSource=im.source||'';editDraft.imageLicense=im.license||'';editDraft.imageAuthor=im.author||''}",
"""function renderEditGallery(){const box=$('editGallery');if(!box)return;const imgs=editDraft.images||[];box.innerHTML=imgs.length?imgs.map((im,j)=>'<div class=\"manageImage '+(j===0?'main':'')+'\"><img src=\"'+esc(im.url)+'\"><small>'+(j===0?'★ Principal · ':'')+esc(im.origin==='source'?'Origen':(im.license||'Imagen'))+'</small><div class=\"imgBtns\"><button onclick=\"makeEditPrimary('+j+')\">Principal</button><button onclick=\"moveEditImage('+j+',-1)\">←</button><button onclick=\"moveEditImage('+j+',1)\">→</button><button onclick=\"editEditImageUrl('+j+')\">Editar URL</button><button onclick=\"deleteEditImage('+j+')\">Eliminar</button></div></div>').join(''):'<div class=\"msg\">Este producto no tiene imágenes.</div>';if(imgs[0])$('editImage').value=imgs[0].url;else $('editImage').value=''}
function makeEditPrimary(j){const a=editDraft.images||[];if(!a[j])return;const [x]=a.splice(j,1);a.unshift(x);renderEditGallery()}
function moveEditImage(j,dir){const a=editDraft.images||[],n=j+dir;if(!a[j]||n<0||n>=a.length)return;[a[j],a[n]]=[a[n],a[j]];renderEditGallery()}
function editEditImageUrl(j){const a=editDraft.images||[];if(!a[j])return;const u=prompt('Nueva URL de imagen',a[j].url);if(u&&u.trim()){a[j].url=u.trim();renderEditGallery()}}
function deleteEditImage(j){const a=editDraft.images||[];if(!a[j])return;if(confirm('¿Eliminar esta imagen del producto?')){a.splice(j,1);renderEditGallery()}}
function addEditImageUrl(){const u=prompt('URL de la nueva imagen');if(!u||!u.trim())return;editDraft.images=editDraft.images||[];if(!editDraft.images.some(x=>x.url===u.trim()))editDraft.images.push({url:u.trim(),source:'',license:'',author:'',origin:'manual'});renderEditGallery()}
function syncMainImageField(){const u=$('editImage').value.trim();editDraft.images=editDraft.images||[];if(!u)return;if(editDraft.images.length)editDraft.images[0]={...editDraft.images[0],url:u};else editDraft.images=[{url:u,source:'',license:'',author:'',origin:'manual'}];renderEditGallery()}
function renderEditImages(){const box=$('editImageSuggest');box.innerHTML=editImages.length?editImages.map((im,j)=>'<div class=\"aiImage\" onclick=\"chooseEditImage('+j+')\"><img src=\"'+esc(im.url)+'\"><small>'+esc(im.origin==='source'?'Imagen de origen · revisar licencia':(im.license||'Imagen similar'))+'</small></div>').join(''):'<div class=\"msg\">No se encontraron imágenes relacionadas.</div>'}
function chooseEditImage(j){const im=editImages[j];if(!im)return;editDraft.images=editDraft.images||[];if(!editDraft.images.some(x=>x.url===im.url))editDraft.images.push({...im});makeEditPrimary(editDraft.images.findIndex(x=>x.url===im.url));editDraft.imageSource=im.source||'';editDraft.imageLicense=im.license||'';editDraft.imageAuthor=im.author||''}
""",
"edit image management functions")

admin=rep(admin,
"editImages=p.images||[];renderEditImages();if(editImages[0])chooseEditImage(0);editMsg.textContent=(editImages.length?editImages.length+' imágenes encontradas. ':'Sin imagen similar. ')",
"editImages=[...(p.sourceImages||[]),...(p.alternativeImages||[])];renderEditImages();editMsg.textContent=(editImages.length?editImages.length+' imágenes relacionadas encontradas. ':'Sin imagen relacionada. ')",
"edit AI no auto replace")

admin=rep(admin,
"price:Number($('editPrice').value)||0,image:$('editImage').value,imageSource:editDraft.imageSource||'',imageLicense:editDraft.imageLicense||'',imageAuthor:editDraft.imageAuthor||'',description:$('editDescription').value,",
"price:Number($('editPrice').value)||0,image:(editDraft.images?.[0]?.url||$('editImage').value),images:editDraft.images||[],imageSource:(editDraft.images?.[0]?.source||editDraft.imageSource||''),imageLicense:(editDraft.images?.[0]?.license||editDraft.imageLicense||''),imageAuthor:(editDraft.images?.[0]?.author||editDraft.imageAuthor||''),description:$('editDescription').value,",
"save edit images")

admin='<!-- '+MARK+' -->\n'+admin
server_path.write_text(server,encoding='utf-8')
admin_path.write_text(admin,encoding='utf-8')
print('FVMarket image manager patch applied')
