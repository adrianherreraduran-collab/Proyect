from pathlib import Path

server=Path('appsrc/server.js')
supplier=Path('appsrc/supplier_capture_v13.js')
admin=Path('appsrc/public/fvmarket-admin-v13.js')
freeprep=Path('appsrc/free_image_prep.js')

# 1) Route order: provider GET routes MUST be registered before app.get('*').
s=server.read_text(encoding='utf-8')
old="""app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));\n\n\n// FVM_PROVIDER_BLOCKS_V11\nregisterProviderSourceRoutes(app,admin,{read,save,id,nextProductRef,aiAnalyzeItems,guessCategory,cleanProductTitle,normalizeProductImages});"""
new="""// FVM_PROVIDER_ROUTES_V15 - API routes must be registered before the storefront catch-all.\nregisterProviderSourceRoutes(app,admin,{read,save,id,nextProductRef,aiAnalyzeItems,guessCategory,cleanProductTitle,normalizeProductImages,prepareImages});\n\napp.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));"""
if old not in s:
    raise SystemExit('No se encontró el bloque final de rutas proveedor/catch-all')
s=s.replace(old,new,1)
server.write_text(s,encoding='utf-8')

# 2) Add free local renderer endpoint to supplier capture API.
p=supplier.read_text(encoding='utf-8')
anchor="""  app.post('/api/admin/suppliers/:id/analyze-capture',admin,async(req,res)=>{const d=ensureStores(deps.read());const supplier=d.suppliers.find(s=>s.id===req.params.id);if(!supplier)return res.status(404).json({error:'Proveedor no encontrado'});const capture=String(req.body.capture||'');if(!dataImageOk(capture))return res.status(400).json({error:'Sube una captura PNG, JPG o WEBP válida'});const margin=clamp(req.body.margin??supplier.defaultMargin??40,0,300);const result=await analyzeVision(capture,supplier,deps,margin,taxonomyFromData(d));result.supplier=publicSupplier(supplier,d);result.taxonomy=taxonomyFromData(d);res.json(result)});\n"""
route="""
  // FVM_FREE_LOCAL_RENDER_V15
  app.post('/api/admin/suppliers/:id/render-image',admin,async(req,res)=>{
    const d=ensureStores(deps.read());
    const supplier=d.suppliers.find(s=>s.id===req.params.id);
    if(!supplier)return res.status(404).json({error:'Proveedor no encontrado'});
    if(typeof deps.prepareImages!=='function')return res.status(503).json({error:'Renderizador local no disponible'});
    const input=String(req.body?.image||'');
    if(!dataImageOk(input))return res.status(400).json({error:'Añade primero una foto o usa la captura como foto'});
    const count=Math.max(1,Math.min(3,Number(req.body?.count)||3));
    try{
      const images=await deps.prepareImages([input],count);
      res.set('Cache-Control','no-store');
      res.json({images,mode:'local-smart-render',cost:0,count:images.length});
    }catch(e){
      console.error('FVMarket local render',e);
      res.status(422).json({error:'No se pudo renderizar la imagen: '+String(e.message||e)});
    }
  });
"""
if 'FVM_FREE_LOCAL_RENDER_V15' not in p:
    if anchor not in p: raise SystemExit('No se encontró analyze-capture para insertar renderer')
    p=p.replace(anchor,anchor+route,1)
supplier.write_text(p,encoding='utf-8')

# 3) Replace free image prep with local smart renderer: edge-connected light background cleanup + variants.
freeprep.write_text(r'''const sharp = require('sharp');

function decodeDataImage(dataUrl=''){
  const m=String(dataUrl).match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if(!m) throw new Error('Formato de imagen no válido');
  return Buffer.from(m[1],'base64');
}

function isLightNeutral(data,p){
  const r=data[p],g=data[p+1],b=data[p+2],a=data[p+3];
  if(a<10)return true;
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
  return lo>=236 && (hi-lo)<=22;
}

async function removeEdgeBackground(buffer){
  const base=sharp(buffer,{failOn:'none'}).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).ensureAlpha();
  const {data,info}=await base.raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height,n=w*h;
  if(!w||!h||n>1600000)return base.png().toBuffer();
  const seen=new Uint8Array(n);
  const queue=new Uint32Array(n);
  let head=0,tail=0;
  const add=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const i=y*w+x;if(seen[i])return;const p=i*4;if(!isLightNeutral(data,p))return;seen[i]=1;queue[tail++]=i};
  for(let x=0;x<w;x++){add(x,0);add(x,h-1)}
  for(let y=1;y<h-1;y++){add(0,y);add(w-1,y)}
  while(head<tail){const i=queue[head++],x=i%w,y=(i/w)|0;add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1)}
  for(let i=0;i<n;i++){
    if(!seen[i])continue;
    const p=i*4,r=data[p],g=data[p+1],b=data[p+2];
    const lo=Math.min(r,g,b);
    const feather=Math.max(0,Math.min(1,(lo-232)/23));
    data[p+3]=Math.round(data[p+3]*(1-feather));
  }
  return sharp(data,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
}

async function prepareOne(dataUrl,index=0){
  const backgrounds=['#ffffff','#f5f7f9','#eef4f8'];
  const scales=[0.82,0.86,0.78];
  const cleaned=await removeEdgeBackground(decodeDataImage(dataUrl));
  let image=sharp(cleaned,{failOn:'none'}).rotate();
  try{image=image.trim({threshold:10})}catch{}
  const side=Math.round(1024*scales[index%scales.length]);
  const product=await image
    .modulate({brightness:index===1?1.045:1.025,saturation:index===2?1.04:1.02})
    .sharpen({sigma:0.7,m1:0.5,m2:1.5})
    .resize({width:side,height:side,fit:'inside',withoutEnlargement:false})
    .png()
    .toBuffer();
  const bg=backgrounds[index%backgrounds.length];
  const output=await sharp({create:{width:1024,height:1024,channels:3,background:bg}})
    .composite([{input:product,gravity:'centre'}])
    .jpeg({quality:90,mozjpeg:true})
    .toBuffer();
  return {url:'data:image/jpeg;base64,'+output.toString('base64'),source:'Render inteligente FVMarket · local',license:'',author:'',origin:'local-smart-render'};
}

async function prepareImages(dataUrls=[],count=3){
  const src=dataUrls.filter(Boolean).slice(0,3);
  if(!src.length) throw new Error('No hay imágenes para renderizar');
  const total=Math.max(1,Math.min(3,Number(count)||3));
  const out=[];
  for(let i=0;i<total;i++) out.push(await prepareOne(src[i%src.length],i));
  return out;
}

module.exports={prepareImages};
''',encoding='utf-8')

# 4) Add UI button and handler in supplier product modal.
a=admin.read_text(encoding='utf-8')
old_photos='''<div class="v13Photos"><div class="bar"><div><b>Fotos del producto</b><div class="aiMeta" style="max-width:none">Puedes añadir varias, eliminar y elegir la principal.</div></div><input id="v13PhotoFiles" type="file" accept="image/*" multiple></div><div id="v13PhotoGrid" class="v13PhotoGrid"></div></div>'''
new_photos='''<div class="v13Photos"><div class="bar"><div><b>Fotos del producto</b><div class="aiMeta" style="max-width:none">Puedes añadir varias, eliminar y elegir la principal.</div></div><input id="v13PhotoFiles" type="file" accept="image/*" multiple><button class="btn ghost" id="v13FreeRender" type="button">✨ Render inteligente gratis</button></div><div id="v13RenderMsg" class="aiMeta" style="max-width:none;margin-top:6px">Procesamiento local: sin créditos ni API de imágenes.</div><div id="v13PhotoGrid" class="v13PhotoGrid"></div></div>'''
if old_photos not in a: raise SystemExit('No se encontró bloque de fotos v13')
a=a.replace(old_photos,new_photos,1)
old_bind="""$('v13AnalyzeCapture').onclick=()=>analyzeCapture(s);$('v13UseCapture').onclick=()=>{if(state.capture){state.photos.unshift({url:state.capture,origin:'capture-photo',source:'Captura proveedor'});renderPhotos()}};$('v13PhotoFiles').onchange=async e=>{for(const f of [...(e.target.files||[])].slice(0,12-state.photos.length)){try{state.photos.push({url:await imageData(f,1400,.88),origin:'supplier-upload',source:'Carga FVMarket'})}catch{}}renderPhotos();e.target.value=''};"""
new_bind="""$('v13AnalyzeCapture').onclick=()=>analyzeCapture(s);$('v13UseCapture').onclick=()=>{if(state.capture){state.photos.unshift({url:state.capture,origin:'capture-photo',source:'Captura proveedor'});renderPhotos()}};$('v13PhotoFiles').onchange=async e=>{for(const f of [...(e.target.files||[])].slice(0,12-state.photos.length)){try{state.photos.push({url:await imageData(f,1400,.88),origin:'supplier-upload',source:'Carga FVMarket'})}catch{}}renderPhotos();e.target.value=''};$('v13FreeRender').onclick=()=>freeRenderPhotos(s);"""
if old_bind not in a: raise SystemExit('No se encontró binding de fotos v13')
a=a.replace(old_bind,new_bind,1)
anchor_func="""  function renderPhotos(){const el=$('v13PhotoGrid');if(!el)return;el.innerHTML=state.photos.length?state.photos.map((im,i)=>`<div class=\"v13Photo ${i===0?'main':''}\"><img src=\"${esc(im.url)}\"><div class=\"v13PhotoBtns\"><button onclick=\"v13MakeMain(${i})\">${i===0?'Principal':'Hacer principal'}</button><button onclick=\"v13RemovePhoto(${i})\">Eliminar</button></div></div>`).join(''):'<div class=\"aiMeta\" style=\"max-width:none;grid-column:1/-1\">Todavía no has añadido fotografías.</div>'}\n"""
free_func="""  async function freeRenderPhotos(s){const btn=$('v13FreeRender'),msg=$('v13RenderMsg');const source=state.photos[0]?.url||state.capture;if(!source){msg.textContent='Añade una foto o usa primero la captura como foto.';return}btn.disabled=true;btn.textContent='Renderizando…';msg.textContent='Limpiando fondo, recortando y creando variantes localmente…';try{const r=await apiCall('/api/admin/suppliers/'+s.id+'/render-image',{method:'POST',body:JSON.stringify({image:source,count:3})});const fresh=Array.isArray(r.images)?r.images:[];if(!fresh.length)throw Error('El renderizador no devolvió imágenes');const seen=new Set();state.photos=[...fresh,...state.photos].filter(im=>{const u=String(im?.url||'');if(!u||seen.has(u))return false;seen.add(u);return true}).slice(0,12);renderPhotos();msg.textContent='Render gratuito completado: '+fresh.length+' variantes listas. La primera queda como principal.'}catch(e){msg.textContent=e.message||'No se pudo renderizar la imagen.'}finally{btn.disabled=false;btn.textContent='✨ Render inteligente gratis'}}\n"""
if 'async function freeRenderPhotos' not in a:
    if anchor_func not in a: raise SystemExit('No se encontró renderPhotos v13')
    a=a.replace(anchor_func,free_func+anchor_func,1)
admin.write_text(a,encoding='utf-8')

print('FVMarket v15 provider route order + free local image renderer applied')
