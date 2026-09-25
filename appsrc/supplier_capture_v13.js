const axios=require('axios');
const {recognizeCapture}=require('./local_capture_ocr');

const OPENAI_API_KEY=String(process.env.OPENAI_API_KEY||'').trim();
const OPENAI_MODEL=String(process.env.OPENAI_VISION_MODEL||process.env.OPENAI_MODEL||'gpt-5.6-luna').trim();
const OPENAI_CAPTURE_FALLBACK=String(process.env.FVM_OPENAI_CAPTURE_FALLBACK||'').trim().toLowerCase()==='true';
const DEFAULT_CATEGORIES={
  'Construcción':['Cementos y morteros','Bloques y ladrillos','Azulejos y pavimentos','Aislamiento','Madera'],
  'Herramientas':['Eléctricas','Manuales','Medición','Taller','Accesorios'],
  'Fontanería':['Tuberías','Racores','Válvulas','Bombas','Accesorios'],
  'Electricidad':['Mecanismos','Cableado','Protección','Iluminación','Accesorios'],
  'Pintura':['Interior','Exterior','Esmaltes','Preparación','Accesorios'],
  'Jardín':['Riego','Herramientas de jardín','Mobiliario','Maquinaria','Cultivo'],
  'Baño y cocina':['Grifería','Sanitarios','Mamparas','Muebles de baño','Cocina']
};

function compact(v=''){return String(v??'').replace(/\s+/g,' ').trim()}
function money(v){if(v==null)return 0;let s=String(v).replace(/[^0-9,.-]/g,'').trim();if(!s)return 0;if(s.includes(',')&&s.includes('.')){if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'')}else if(s.includes(','))s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)&&n>=0?n:0}
function clamp(v,min,max){return Math.max(min,Math.min(max,Number(v)||0))}
function dataImageOk(v=''){return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(String(v))}
function cleanRef(v=''){return compact(v).toUpperCase().replace(/[^A-Z0-9._/-]/g,'').slice(0,60)}
function ensureStores(d){if(!Array.isArray(d.suppliers))d.suppliers=[];if(!Array.isArray(d.supplierCaptures))d.supplierCaptures=[];if(!d.catalogTaxonomy||typeof d.catalogTaxonomy!=='object')d.catalogTaxonomy={};for(const [cat,subs] of Object.entries(DEFAULT_CATEGORIES)){if(!Array.isArray(d.catalogTaxonomy[cat]))d.catalogTaxonomy[cat]=[];d.catalogTaxonomy[cat]=[...new Set([...d.catalogTaxonomy[cat],...subs])]}return d}
function taxonomyFromData(d){ensureStores(d);const out={};for(const [k,v] of Object.entries(d.catalogTaxonomy||{}))out[k]=[...new Set((v||[]).map(compact).filter(Boolean))];for(const p of d.products||[]){const c=compact(p.category),s=compact(p.subcategory);if(!c)continue;if(!out[c])out[c]=[];if(s&&!out[c].includes(s))out[c].push(s)}return out}
function upsertTaxonomy(d,category,subcategory){const c=compact(category),s=compact(subcategory);if(!c)return;ensureStores(d);if(!Array.isArray(d.catalogTaxonomy[c]))d.catalogTaxonomy[c]=[];if(s&&!d.catalogTaxonomy[c].includes(s))d.catalogTaxonomy[c].push(s)}
function publicSupplier(s,d){return {...s,productCount:(d.products||[]).filter(p=>p.supplierId===s.id).length}}
function parseJsonText(text=''){const t=String(text||'').trim();try{return JSON.parse(t)}catch{}const m=t.match(/\{[\s\S]*\}/);if(m){try{return JSON.parse(m[0])}catch{}}return null}
function responseText(data={}){if(typeof data.output_text==='string'&&data.output_text.trim())return data.output_text;const chunks=[];for(const o of data.output||[]){for(const c of o.content||[]){if(typeof c.text==='string')chunks.push(c.text);else if(typeof c?.text?.value==='string')chunks.push(c.text.value)}}return chunks.join('\n')}
function normalizeAiDraft(raw={},supplier={},deps,margin=40){const title=deps.cleanProductTitle(compact(raw.title||raw.productName||''));const sourcePrice=money(raw.sourcePrice??raw.price??raw.precio);const m=clamp(margin,0,300);const price=sourcePrice?+(sourcePrice*(1+m/100)).toFixed(2):0;let category=compact(raw.category);if(!category&&title)category=deps.guessCategory(title+' '+compact(raw.description));return {title,sourceRef:cleanRef(raw.sourceRef||raw.reference||raw.ref),sourcePrice,price,margin:m,brand:compact(raw.brand).slice(0,100),category,subcategory:compact(raw.subcategory).slice(0,100),description:compact(raw.description).slice(0,1200),availability:compact(raw.availability).slice(0,100),supplierId:supplier.id,sourceProvider:supplier.name}}
function manualDraft(supplier,deps,margin,warning){return {mode:'manual',warning:warning||'No se pudo ejecutar el análisis visual. Puedes completar los campos manualmente.',draft:normalizeAiDraft({},supplier,deps,margin)}}

function ocrLines(text=''){
  return String(text||'').split(/\n+/).map(line=>compact(line).replace(/[|¦]/g,'I')).filter(Boolean);
}

function parseOcrCapture(text='',deps){
  const lines=ocrLines(text);
  const joined=lines.join(' ');
  const pricePatterns=[
    /(?:pvp|precio(?:\s+de\s+venta)?|oferta|importe|desde)\s*[:#-]?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*€/i,
    /(\d{1,5}(?:[.,]\d{2}))\s*€/i
  ];
  let sourcePrice=0;
  for(const pattern of pricePatterns){const match=joined.match(pattern);if(match){sourcePrice=money(match[1]);if(sourcePrice)break}}
  const sourceRef=(joined.match(/(?:ref(?:erencia)?|sku|c[oó]digo|art[íi]culo|ean)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,})/i)||[])[1]||'';
  const brand=(joined.match(/marca\s*[:#-]?\s*([^|,;\n]{2,80})/i)||[])[1]||'';
  const availability=lines.find(line=>/(?:disponible|agotado|stock|entrega|plazo|env[ií]o|consultar)/i.test(line))||'';
  const featureStart=lines.findIndex(line=>/^(?:[-*•·]\s*)?(?:caracter[ií]sticas|especificaciones|detalles|descripci[oó]n)\s*:?(?:\s*)$/i.test(line));
  const featureLines=(featureStart>=0?lines.slice(featureStart+1):lines.filter(line=>/^[-*•·]/.test(line)))
    .map(line=>line.replace(/^[-*•·]\s*/,'')).filter(line=>line.length>2&&!/(?:pvp|precio|€)/i.test(line));
  const noisy=/^(?:inicio|buscar|men[uú]|carrito|mi cuenta|categor[ií]as?|compartir|añadir al carrito|comprar|ver m[aá]s|in stock)$/i;
  const titleCandidates=lines.filter(line=>line.length>=5&&line.length<=140&&!noisy.test(line)&&!/(?:caracter[ií]sticas|especificaciones|precio|pvp|€|\b(?:ref|sku|ean)\b)/i.test(line)&&!/^[-*•·\d]/.test(line));
  const title=titleCandidates.sort((a,b)=>a.length-b.length)[0]||'';
  const description=featureLines.slice(0,12).join(' · ').slice(0,1200)||lines.filter(line=>line!==title&&line.length>20&&!noisy.test(line)).slice(0,3).join(' · ').slice(0,1200);
  return {title,sourceRef,sourcePrice,brand,description,availability,rawText:text,hasSignal:Boolean(title||sourceRef||sourcePrice||description),category:deps.guessCategory(`${title} ${description}`)};
}

async function analyzeLocalCapture(capture,supplier,deps,margin){
  try{
    const ocr=await recognizeCapture(capture);
    const parsed=parseOcrCapture(ocr.text,deps);
    if(!parsed.hasSignal)return manualDraft(supplier,deps,margin,'El OCR local no encontró texto suficiente. Puedes completar los campos manualmente.');
    const draft=normalizeAiDraft(parsed,supplier,deps,margin);
    const confidence=Math.round(Math.max(0,Math.min(100,Number(ocr.confidence)||0)));
    return {mode:'local-ocr',warning:`Lectura OCR local completada (confianza aproximada ${confidence}%). Revisa los campos antes de guardar. No se han consumido créditos de IA.`,confidence,draft};
  }catch(error){
    const reason=String(error?.message||error||'').slice(0,180);
    return manualDraft(supplier,deps,margin,`El OCR local no está disponible ahora mismo${reason?`: ${reason}`:''}. Puedes completar los campos manualmente.`);
  }
}

async function analyzeOpenAiCapture(capture,supplier,deps,margin,taxonomy){
  const categories=Object.entries(taxonomy).map(([c,s])=>`${c}: ${s.join(', ')}`).join('\n');
  const prompt=`Analiza esta captura de una ficha de producto del proveedor ${supplier.name}. Devuelve SOLO JSON válido con estas claves: title, sourceRef, sourcePrice, brand, category, subcategory, description, availability.\nReglas: sourcePrice debe ser el precio REAL visible en la captura como número decimal, sin inventarlo. Si no es legible usa 0. sourceRef debe ser la referencia/SKU visible y si no aparece usa cadena vacía. No inventes especificaciones. Resume la descripción solo con datos visibles. Elige category y subcategory de esta taxonomía cuando encaje; si no encaja propone una categoría/subcategoría breve y clara.\n${categories}`;
  let last='';
  try{
    const r=await axios.post('https://api.openai.com/v1/responses',{model:OPENAI_MODEL,input:[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_image',image_url:capture}]}],max_output_tokens:800},{timeout:45000,headers:{Authorization:'Bearer '+OPENAI_API_KEY,'Content-Type':'application/json'}});
    const obj=parseJsonText(responseText(r.data));if(obj)return {mode:'openai-vision',warning:'',draft:normalizeAiDraft(obj,supplier,deps,margin)};last='La IA no devolvió JSON legible.';
  }catch(e){last=String(e.response?.data?.error?.message||e.message||'').slice(0,220)}
  try{
    const r=await axios.post('https://api.openai.com/v1/chat/completions',{model:OPENAI_MODEL,response_format:{type:'json_object'},messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:capture}}]}],max_tokens:800},{timeout:45000,headers:{Authorization:'Bearer '+OPENAI_API_KEY,'Content-Type':'application/json'}});
    const obj=parseJsonText(r.data?.choices?.[0]?.message?.content||'');if(obj)return {mode:'openai-vision',warning:'',draft:normalizeAiDraft(obj,supplier,deps,margin)};
  }catch(e){last=String(e.response?.data?.error?.message||e.message||last||'').slice(0,220)}
  return manualDraft(supplier,deps,margin,last?`No se pudo completar el análisis visual: ${last}`:'No se pudo completar el análisis visual.');
}

async function analyzeVision(capture,supplier,deps,margin,taxonomy){
  const local=await analyzeLocalCapture(capture,supplier,deps,margin);
  if(local.mode==='local-ocr'||!OPENAI_CAPTURE_FALLBACK||!OPENAI_API_KEY)return local;
  return analyzeOpenAiCapture(capture,supplier,deps,margin,taxonomy);
}

function registerProviderSourceRoutes(app,admin,deps){
  app.get('/api/admin/suppliers',admin,(req,res)=>{const d=ensureStores(deps.read());res.set('Cache-Control','no-store');res.json(d.suppliers.map(s=>publicSupplier(s,d)))});
  app.post('/api/admin/suppliers',admin,(req,res)=>{const d=ensureStores(deps.read());const name=compact(req.body.name);if(!name)return res.status(400).json({error:'El nombre del proveedor es obligatorio'});if(d.suppliers.some(s=>compact(s.name).toLowerCase()===name.toLowerCase()))return res.status(409).json({error:'Ya existe un proveedor con ese nombre'});const s={id:deps.id('sup'),name,website:compact(req.body.website).slice(0,300),defaultMargin:clamp(req.body.defaultMargin??40,0,300),notes:compact(req.body.notes).slice(0,1000),procurementMode:['recogida_fvmarket','entrega_proveedor','pedido_online'].includes(String(req.body.procurementMode))?String(req.body.procurementMode):'recogida_fvmarket',pickupAddress:compact(req.body.pickupAddress).slice(0,240),pickupCity:compact(req.body.pickupCity).slice(0,100),pickupPostalCode:compact(req.body.pickupPostalCode).slice(0,20),active:req.body.active!==false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};d.suppliers.unshift(s);deps.save(d);res.json(publicSupplier(s,d))});
  app.put('/api/admin/suppliers/:id',admin,(req,res)=>{const d=ensureStores(deps.read());const s=d.suppliers.find(x=>x.id===req.params.id);if(!s)return res.status(404).json({error:'Proveedor no encontrado'});const name=compact(req.body.name??s.name);if(!name)return res.status(400).json({error:'El nombre es obligatorio'});if(d.suppliers.some(x=>x.id!==s.id&&compact(x.name).toLowerCase()===name.toLowerCase()))return res.status(409).json({error:'Ya existe otro proveedor con ese nombre'});s.name=name;s.website=compact(req.body.website??s.website).slice(0,300);s.defaultMargin=clamp(req.body.defaultMargin??s.defaultMargin??40,0,300);s.notes=compact(req.body.notes??s.notes).slice(0,1000);if(req.body.procurementMode!=null&&['recogida_fvmarket','entrega_proveedor','pedido_online'].includes(String(req.body.procurementMode)))s.procurementMode=String(req.body.procurementMode);if(req.body.pickupAddress!=null)s.pickupAddress=compact(req.body.pickupAddress).slice(0,240);if(req.body.pickupCity!=null)s.pickupCity=compact(req.body.pickupCity).slice(0,100);if(req.body.pickupPostalCode!=null)s.pickupPostalCode=compact(req.body.pickupPostalCode).slice(0,20);if(req.body.active!=null)s.active=!!req.body.active;s.updatedAt=new Date().toISOString();deps.save(d);res.json(publicSupplier(s,d))});
  app.delete('/api/admin/suppliers/:id',admin,(req,res)=>{const d=ensureStores(deps.read());const i=d.suppliers.findIndex(x=>x.id===req.params.id);if(i<0)return res.status(404).json({error:'Proveedor no encontrado'});const count=(d.products||[]).filter(p=>p.supplierId===req.params.id).length;if(count)return res.status(409).json({error:`Este proveedor tiene ${count} productos. Elimina o reasigna esos productos antes de borrar el proveedor.`});const [removed]=d.suppliers.splice(i,1);deps.save(d);res.json({removed:removed.id})});

  app.get('/api/admin/suppliers/:id/products',admin,(req,res)=>{const d=ensureStores(deps.read());if(!d.suppliers.some(s=>s.id===req.params.id))return res.status(404).json({error:'Proveedor no encontrado'});const list=(d.products||[]).filter(p=>p.supplierId===req.params.id||(!p.supplierId&&compact(p.sourceProvider)===compact(d.suppliers.find(s=>s.id===req.params.id)?.name))).sort((a,b)=>String(b.importedAt||b.createdAt||'').localeCompare(String(a.importedAt||a.createdAt||'')));res.json(list)});
  app.get('/api/admin/catalog-taxonomy',admin,(req,res)=>{const d=ensureStores(deps.read());res.json(taxonomyFromData(d))});
  app.post('/api/admin/catalog-taxonomy',admin,(req,res)=>{const d=ensureStores(deps.read());const category=compact(req.body.category),subcategory=compact(req.body.subcategory);if(!category)return res.status(400).json({error:'Indica una categoría'});upsertTaxonomy(d,category,subcategory);deps.save(d);res.json(taxonomyFromData(d))});

  app.post('/api/admin/suppliers/:id/analyze-capture',admin,async(req,res)=>{const d=ensureStores(deps.read());const supplier=d.suppliers.find(s=>s.id===req.params.id);if(!supplier)return res.status(404).json({error:'Proveedor no encontrado'});const capture=String(req.body.capture||'');if(!dataImageOk(capture))return res.status(400).json({error:'Sube una captura PNG, JPG o WEBP válida'});const margin=clamp(req.body.margin??supplier.defaultMargin??40,0,300);const result=await analyzeVision(capture,supplier,deps,margin,taxonomyFromData(d));result.supplier=publicSupplier(supplier,d);result.taxonomy=taxonomyFromData(d);res.json(result)});

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

  app.post('/api/admin/suppliers/:id/products',admin,(req,res)=>{const d=ensureStores(deps.read());const supplier=d.suppliers.find(s=>s.id===req.params.id);if(!supplier)return res.status(404).json({error:'Proveedor no encontrado'});const title=deps.cleanProductTitle(compact(req.body.title));if(!title)return res.status(400).json({error:'El nombre del producto es obligatorio'});const category=compact(req.body.category)||deps.guessCategory(title+' '+compact(req.body.description));const subcategory=compact(req.body.subcategory);const sourcePrice=money(req.body.sourcePrice);if(sourcePrice<=0)return res.status(400).json({error:'Indica el precio real del proveedor'});let price=money(req.body.price);const suppliedMargin=clamp(req.body.margin??supplier.defaultMargin??40,0,300);if(price<=0)price=+(sourcePrice*(1+suppliedMargin/100)).toFixed(2);const margin=sourcePrice?+(((price-sourcePrice)/sourcePrice)*100).toFixed(2):0;const addedValue=+(price-sourcePrice).toFixed(2);const images=deps.normalizeProductImages(Array.isArray(req.body.images)?req.body.images:[]).slice(0,12);const published=!!req.body.published;if(published&&images.length<1)return res.status(400).json({error:'Para publicar se requiere al menos una imagen'});const sourceRef=cleanRef(req.body.sourceRef);if(sourceRef&&d.products.some(p=>p.supplierId===supplier.id&&cleanRef(p.sourceRef)===sourceRef))return res.status(409).json({error:'Ya existe un producto de este proveedor con esa referencia'});const p={id:deps.id('prd'),title,category,subcategory,ref:deps.nextProductRef(d,title,category),price,stock:'bajo_pedido',image:images[0]?.url||'',images,description:compact(req.body.description).slice(0,1500),published,featured:!!req.body.featured,onOffer:false,discountPct:0,supplierId:supplier.id,sourceProvider:supplier.name,sourceRef,sourceBrand:compact(req.body.brand).slice(0,100),sourceAvailability:compact(req.body.availability).slice(0,100),sourcePrice,margin,addedValue,sourceCheckedAt:new Date().toISOString(),sourceSync:'capture_v13',reviewStatus:published?'publicado':'borrador',importedAt:new Date().toISOString()};d.products.unshift(p);upsertTaxonomy(d,category,subcategory);const capture=String(req.body.capture||'');if(dataImageOk(capture))d.supplierCaptures.unshift({id:deps.id('cap'),productId:p.id,supplierId:supplier.id,capture,capturedAt:new Date().toISOString(),sourcePrice,sourceRef});deps.save(d);res.json({product:p,supplier:publicSupplier(supplier,d)})});

  app.get('/api/admin/products/:id/source-capture',admin,(req,res)=>{const d=ensureStores(deps.read());const cap=d.supplierCaptures.find(c=>c.productId===req.params.id);if(!cap)return res.status(404).json({error:'No hay captura de origen guardada'});res.json(cap)});
}

module.exports={registerProviderSourceRoutes,_test:{money,cleanRef,normalizeAiDraft,parseOcrCapture,analyzeVision}};
