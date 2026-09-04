from pathlib import Path

server = Path('appsrc/server.js')
admin = Path('appsrc/public/admin.html')
s = server.read_text()
a = admin.read_text()

marker = '// FVM_PROVIDER_GOOGLE_IMAGES_V2'
if marker not in s:
    s = s.replace("const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-5.6-luna');", "const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-5.6-luna');\nconst GOOGLE_CSE_API_KEY = String(process.env.GOOGLE_CSE_API_KEY || '');\nconst GOOGLE_CSE_CX = String(process.env.GOOGLE_CSE_CX || '');\n" + marker)

old_provider = "function providerFromUrl(raw=''){\n  try{const h=new URL(raw).hostname.toLowerCase().replace(/^www\\./,'');return h.split('.')[0].replace(/[-_]/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase())}catch{return ''}\n}"
new_provider = """function providerFromUrl(raw=''){
  try{
    const h=new URL(String(raw)).hostname.toLowerCase().replace(/^www\\./,'');
    const known={
      'mibricolaje.com':'Mi Bricolaje','obramat.es':'Obramat','leroymerlin.es':'Leroy Merlin','bauhaus.es':'BAUHAUS',
      'bricodepot.es':'Brico Depôt','manomano.es':'ManoMano','amazon.es':'Amazon','bigmat.es':'BigMat'
    };
    if(known[h])return known[h];
    const parts=h.split('.');
    const base=(parts.length>2&&['com','co','net','org'].includes(parts[parts.length-2]))?parts[parts.length-3]:parts[0];
    return String(base||h).replace(/[-_]/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());
  }catch{return ''}
}"""
if old_provider in s:
    s = s.replace(old_provider, new_provider)

# Make the importer always return provider/source URL/SKU/EAN, deriving provider from URL.
needle = "const sourceProvider=providerFromUrl(url);const bodyText=$('body').text().replace(/\\s+/g,' ');"
if needle not in s:
    raise SystemExit('Expected extraction block not found')

# Google Images search + stricter semantic ranking. Do not pad with generic searches.
insert_before = "async function searchExternalImages(query='',limit=8){"
if 'async function searchGoogleImages' not in s:
    helpers = r'''function searchTokens(text=''){
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
async function searchGoogleImages(query='',limit=8){
  if(!GOOGLE_CSE_API_KEY||!GOOGLE_CSE_CX)return [];
  try{
    const r=await axios.get('https://www.googleapis.com/customsearch/v1',{timeout:12000,params:{key:GOOGLE_CSE_API_KEY,cx:GOOGLE_CSE_CX,q:String(query).slice(0,180),searchType:'image',safe:'active',num:Math.min(Math.max(Number(limit)||8,1),10)}});
    return (r.data?.items||[]).map(x=>({title:x.title||'',url:x.link||'',original:x.link||'',source:x.image?.contextLink||x.displayLink||'',license:'Comprobar derechos/licencia antes de publicar',author:'',origin:'google'})).filter(x=>x.url&&!isSpanishImageDomain(x.url)&&!isSpanishImageDomain(x.source));
  }catch(e){console.warn('Google image search failed:',e.response?.status||e.message);return []}
}
'''
    s = s.replace(insert_before, helpers + insert_before)

start = s.index("async function searchExternalImages(query='',limit=8){")
end = s.index("\n}\n\nfunction catalogCandidatesFromText", start) + 2
new_search = r'''async function searchExternalImages(query='',limit=8){
  const target=Math.max(3,Math.min(Number(limit)||8,12));const seen=new Set(),pool=[];
  const add=items=>{for(const x of items||[]){const url=String(x.url||'');const src=String(x.source||'');if(!url||seen.has(url)||isSpanishImageDomain(url)||isSpanishImageDomain(src))continue;seen.add(url);pool.push({...x,origin:x.origin||'similar'})}};
  add(await searchGoogleImages(query,Math.min(target+4,10)));
  add(await searchOpenverseImages(query,target+5));
  add((await searchCommonsImages(query,target+5)).map(x=>({...x,origin:'similar'})));
  const ranked=pool.map(x=>({...x,matchScore:imageCandidateScore(x,query)})).sort((a,b)=>b.matchScore-a.matchScore);
  const good=ranked.filter(x=>x.matchScore>=4);
  return (good.length>=3?good:ranked.filter(x=>x.matchScore>=1)).slice(0,target);
}'''
s = s[:start] + new_search + s[end:]

# Include exact original product title in image search and keep source images available for comparison by admin.
s = s.replace("const alternativeImages=await searchExternalImages((p.title+' '+(p.imageQuery||'')).slice(0,140),8);", "const searchQuery=[item.title,p.title,p.imageQuery,item.sourceRef].filter(Boolean).join(' ');const alternativeImages=await searchExternalImages(searchQuery.slice(0,180),8);")
s = s.replace("app.get('/api/admin/ai-status',admin,(req,res)=>res.json({openai:!!OPENAI_API_KEY,model:OPENAI_MODEL,imageSearch:'Openverse + Wikimedia · excluye dominios de España'}));", "app.get('/api/admin/ai-status',admin,(req,res)=>res.json({openai:!!OPENAI_API_KEY,model:OPENAI_MODEL,googleImages:!!(GOOGLE_CSE_API_KEY&&GOOGLE_CSE_CX),imageSearch:(GOOGLE_CSE_API_KEY&&GOOGLE_CSE_CX?'Google Images + Openverse + Wikimedia':'Openverse + Wikimedia (Google pendiente de credenciales)')+' · excluye dominios de España'}));")

# Admin: show exact source URL and fill private procurement fields immediately after URL import.
old_fields = '<div class="field"><label>EAN / GTIN origen (opcional)</label><input id="sourceEan"></div><div class="priceGrid">'
new_fields = '<div class="field"><label>EAN / GTIN origen (opcional)</label><input id="sourceEan"></div><div class="field"><label>URL exacta del producto en origen</label><input id="sourceUrl" readonly placeholder="Se guardará automáticamente al analizar la URL"></div><div class="priceGrid">'
if old_fields in a and 'id="sourceUrl" readonly' not in a:
    a = a.replace(old_fields,new_fields)

old_import = "$('ref').value=draft.ref||'';$('sourcePrice').value=Number(draft.sourcePrice||0).toFixed(2);"
new_import = "$('ref').value=draft.ref||'';if($('sourceProvider'))$('sourceProvider').value=draft.sourceProvider||'';if($('sourceRef'))$('sourceRef').value=draft.sourceRef||'';if($('sourceEan'))$('sourceEan').value=draft.sourceEan||'';if($('sourceUrl'))$('sourceUrl').value=draft.sourceUrl||u;$('sourcePrice').value=Number(draft.sourcePrice||0).toFixed(2);"
if old_import in a:
    a = a.replace(old_import,new_import)

old_body = "sourceEan:$('sourceEan')?.value||draft.sourceEan||'',margin:"
new_body = "sourceEan:$('sourceEan')?.value||draft.sourceEan||'',sourceUrl:$('sourceUrl')?.value||draft.sourceUrl||$('url').value.trim()||'',margin:"
if old_body in a:
    a = a.replace(old_body,new_body)

# Better labels/messages for automatic image search.
a = a.replace("Alternativas similares</div>", "Alternativas más coincidentes</div>")
a = a.replace("Analizando producto y buscando imágenes similares...", "Buscando por nombre exacto y características del artículo, y ordenando las imágenes por coincidencia...")

server.write_text(s)
admin.write_text(a)
print('FVMarket provider / Google image patch applied')
