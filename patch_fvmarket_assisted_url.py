from pathlib import Path

p=Path('appsrc/public/admin.html')
s=p.read_text(encoding='utf-8')

start=s.find("async function importUrl(){")
end=s.find("async function createProduct(){", start)
if start < 0 or end < 0:
    raise SystemExit('No se encontró importUrl/createProduct')

new=r'''async function importUrl(){
  const u=$('url').value.trim();
  if(!u){importMsg.textContent='Introduce una URL de producto.';return}
  importMsg.textContent='Leyendo ficha y precio real...';
  try{
    draft=await api('/api/admin/import-url',{method:'POST',body:JSON.stringify({url:u})});
    $('title').value=draft.title||'';$('category').value=draft.category||'Otros';$('ref').value=draft.ref||'';
    if($('sourceProvider'))$('sourceProvider').value=draft.sourceProvider||'';
    if($('sourceRef'))$('sourceRef').value=draft.sourceRef||'';
    if($('sourceEan'))$('sourceEan').value=draft.sourceEan||'';
    if($('sourceUrl'))$('sourceUrl').value=draft.sourceUrl||u;
    $('sourcePrice').value=Number(draft.sourcePrice||0).toFixed(2);$('margin').value='0.00';$('addedValue').value='0.00';$('price').value=Number(draft.sourcePrice||draft.price||0).toFixed(2);
    $('image').value=draft.image||'';$('description').value=draft.description||'';draft.images=[];draft.alternativeImages=[];renderSingleImages();
    importMsg.textContent=draft.sourcePrice>0?'Precio real detectado: '+Number(draft.sourcePrice).toFixed(2)+' €. Introduce el margen o el valor agregado para calcular el PVP.':'Ficha leída, pero no se pudo detectar un precio fiable. Puedes escribir el precio origen manualmente.';
    try{await enrichSingleAI(true)}catch{}
  }catch(e){
    let parsed=null;try{parsed=new URL(u)}catch{}
    const slug=decodeURIComponent((parsed?.pathname||'').split('/').filter(Boolean).pop()||'producto').replace(/[-_]+/g,' ').replace(/\b\d{5,}\b/g,' ').replace(/\s+/g,' ').trim();
    const titleGuess=slug.replace(/\b\w/g,c=>c.toUpperCase())||'Producto';
    const host=(parsed?.hostname||'').replace(/^www\./,'');
    const providers={'leroymerlin.es':'Leroy Merlin','obramat.es':'Obramat','mibricolaje.com':'Mi Bricolaje','bauhaus.es':'BAUHAUS','bricodepot.es':'Brico Depôt','manomano.es':'ManoMano'};
    const provider=providers[host]||host;
    draft={title:titleGuess,category:guessCat(titleGuess),description:'',sourceUrl:u,sourceProvider:provider,sourcePrice:0,price:0,margin:0,addedValue:0,images:[],sourceImages:[],alternativeImages:[],assistedImport:true};
    $('title').value=draft.title;$('category').value=draft.category;$('ref').value='';
    if($('sourceProvider'))$('sourceProvider').value=provider;if($('sourceRef'))$('sourceRef').value='';if($('sourceEan'))$('sourceEan').value='';if($('sourceUrl'))$('sourceUrl').value=u;
    $('sourcePrice').value='0.00';$('margin').value='0.00';$('addedValue').value='0.00';$('price').value='0.00';$('image').value='';$('description').value='';renderSingleImages();
    importMsg.textContent='La tienda bloquea la lectura directa. Activando modo asistido: buscando información e imágenes públicas relacionadas. Revisa título, características y escribe el precio real de origen antes de publicar.';
    try{
      await enrichSingleAI(true);
      if($('sourceUrl'))$('sourceUrl').value=u;if($('sourceProvider'))$('sourceProvider').value=provider;
      importMsg.textContent='Modo asistido activo. Se han propuesto datos e imágenes a partir de información pública accesible. Revisa todo y escribe el precio real de origen antes de guardar.';
    }catch(aiErr){
      importMsg.textContent='Modo asistido activo. No se pudo completar la búsqueda automáticamente; puedes editar los datos, introducir el precio y añadir tus propias imágenes.';
    }
  }
}
'''

s=s[:start]+new+s[end:]
if '<!-- FVM_ASSISTED_URL_V1 -->' not in s:
    s=s.replace('<!-- FVM_ADMIN_TAXONOMY_V2 -->','<!-- FVM_ASSISTED_URL_V1 -->\n<!-- FVM_ADMIN_TAXONOMY_V2 -->',1)
p.write_text(s,encoding='utf-8')
print('OK modo asistido URL aplicado')
