from pathlib import Path

server=Path('appsrc/server.js')
admin=Path('appsrc/public/admin.html')
s=server.read_text(encoding='utf-8')
a=admin.read_text(encoding='utf-8')

if 'FVM_MIBRICOLAJE_IMAGES_V9' not in s:
    old="const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-5.6-luna');"
    if old not in s:
        raise SystemExit('OPENAI_MODEL anchor not found')
    s=s.replace(old,old+"\nconst OPENAI_IMAGE_MODEL = String(process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');",1)

    old_return="return {sourceTitle,sourceDescription,sourcePrice,sourceRef,sourceEan,sourceBrand,sourceAvailability,sourceTaxNote,sourceUrl:url};"
    new_return="const sourceImages=collectSourceImages($,prod,url).map(x=>x.url).filter(Boolean).slice(0,6);\n  return {sourceTitle,sourceDescription,sourcePrice,sourceRef,sourceEan,sourceBrand,sourceAvailability,sourceTaxNote,sourceUrl:url,sourceImages};"
    if old_return not in s:
        raise SystemExit('mbFacts return anchor not found')
    s=s.replace(old_return,new_return,1)

    old_candidate="sourceTaxNote:f.sourceTaxNote,sourceUrl:f.sourceUrl,sourcePrice:f.sourcePrice,margin:m,addedValue,price,stock:'bajo_pedido'"
    new_candidate="sourceTaxNote:f.sourceTaxNote,sourceUrl:f.sourceUrl,sourceImages:f.sourceImages||[],sourcePrice:f.sourcePrice,margin:m,addedValue,price,stock:'bajo_pedido'"
    if old_candidate not in s:
        raise SystemExit('mbCandidate anchor not found')
    s=s.replace(old_candidate,new_candidate,1)

    start=s.index("app.post('/api/admin/mibricolaje/import'")
    end=s.index("app.post('/api/admin/mibricolaje/refresh/:id'", start)
    block=s[start:end]
    old_line="const title=cleanProductTitle(x.title||('Producto '+sourceRef));const category=String(x.category||guessCategory(title));const sourcePrice=Number(x.sourcePrice)||0;if(!sourcePrice){skipped++;continue}const margin=Math.max(0,Math.min(300,Number(x.margin)||40));const addedValue=+(sourcePrice*margin/100).toFixed(2);const price=+(sourcePrice+addedValue).toFixed(2);"
    new_line=old_line+"\n    const aiImages=normalizeProductImages(Array.isArray(x.images)?x.images:[]).filter(im=>String(im.origin||'')==='ai-render'||/^data:image\\//i.test(String(im.url||''))).slice(0,6);const mainImage=aiImages[0]?.url||'';const requestedRef=String(x.ref||'').toUpperCase().trim();const ownRef=(requestedRef.startsWith('FVM-')&&!d.products.some(q=>String(q.ref||'').toUpperCase()===requestedRef))?requestedRef:nextProductRef(d,title,category);"
    if old_line not in block:
        raise SystemExit('import calculation anchor not found')
    block=block.replace(old_line,new_line,1)
    block=block.replace("ref:nextProductRef(d,title,category),price,stock:'bajo_pedido',image:'',images:[],imageSource:'',imageLicense:'',imageAuthor:''","ref:ownRef,price,stock:'bajo_pedido',image:mainImage,images:aiImages,imageSource:'IA FVMarket',imageLicense:'',imageAuthor:''",1)
    block=block.replace("sourceTaxNote:String(x.sourceTaxNote||''),sourceUrl:String(x.sourceUrl||''),sourcePrice","sourceTaxNote:String(x.sourceTaxNote||''),sourceUrl:String(x.sourceUrl||''),sourceImages:Array.isArray(x.sourceImages)?x.sourceImages.slice(0,6):[],sourcePrice",1)
    s=s[:start]+block+s[end:]

    anchor="app.post('/api/admin/mibricolaje/refresh/:id',admin,async(req,res)=>{"
    helper=r'''
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

'''
    if anchor not in s:
        raise SystemExit('refresh anchor not found')
    s=s.replace(anchor,helper+anchor,1)

if 'fvmarket-admin-v9.js' not in a:
    if '</body>' not in a:
        raise SystemExit('admin body anchor not found')
    a=a.replace('</body>','<script src="/fvmarket-admin-v9.js?v=9"></script>\n</body>',1)

server.write_text(s,encoding='utf-8')
admin.write_text(a,encoding='utf-8')
print('FVMarket v9 patch applied')
