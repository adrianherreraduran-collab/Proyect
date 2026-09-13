from pathlib import Path

server=Path('appsrc/server.js')
admin=Path('appsrc/public/admin.html')
v9=Path('appsrc/public/fvmarket-admin-v9.js')
v10=Path('appsrc/public/fvmarket-admin-v10.js')

s=server.read_text(encoding='utf-8')
if "const {prepareImages} = require('./free_image_prep');" not in s:
    anchor="const pdfParse = require('pdf-parse');"
    if anchor not in s: raise SystemExit('pdfParse anchor not found')
    s=s.replace(anchor,anchor+"\nconst {prepareImages} = require('./free_image_prep');",1)

route_anchor="app.post('/api/admin/mibricolaje/render-images',admin,async(req,res)=>{"
if "app.post('/api/admin/mibricolaje/prepare-images'" not in s:
    if route_anchor not in s: raise SystemExit('render-images route anchor not found')
    route="""app.post('/api/admin/mibricolaje/prepare-images',admin,async(req,res)=>{\n  const src=(Array.isArray(req.body.sourceImages)?req.body.sourceImages:[]).map(x=>typeof x==='string'?x:x?.url).filter(Boolean).slice(0,3);\n  if(!src.length)return res.status(400).json({error:'No hay imágenes del artículo para preparar'});\n  try{\n    const dataUrls=[];for(const u of src){try{dataUrls.push(await mbImageDataUrl(u))}catch{}}\n    if(!dataUrls.length)return res.status(422).json({error:'No se pudieron leer las imágenes del artículo origen'});\n    const images=await prepareImages(dataUrls,req.body.count||3);\n    res.json({images,mode:'free',cost:0});\n  }catch(e){console.error('free image prep',e);res.status(500).json({error:'No se pudieron preparar las imágenes: '+String(e.message||e)})}\n});\n\n"""
    s=s.replace(route_anchor,route+route_anchor,1)

s=s.replace("imageSource:'IA FVMarket'","imageSource:(aiImages.some(im=>im.origin==='ai-render')?'IA FVMarket':'Preparación FVMarket')")
server.write_text(s,encoding='utf-8')

j=v9.read_text(encoding='utf-8')
repls=[
('// FVM_ADMIN_MIBRICOLAJE_V9','// FVM_ADMIN_MIBRICOLAJE_V10_FREE_PREP'),
('Importar desde MiBricolaje · FVMarket IA','Importar desde MiBricolaje · FVMarket'),
('FVMarket crea su propia referencia, texto e imágenes.','FVMarket crea su propia referencia y texto; las imágenes se preparan gratis antes de importar.'),
('renderizar imágenes con IA → elegir imágenes','preparar imágenes gratis → elegir imágenes'),
('<b>Imágenes:</b> las fotos del proveedor se muestran solo como referencia interna. Al pulsar <b>Renderizar imágenes IA</b>, FVMarket genera nuevas imágenes del producto con composición/fondo propios; eliges cuáles se guardan.','<b>Preparación gratuita:</b> FVMarket recorta márgenes, centra, normaliza iluminación y coloca las fotos sobre fondos limpios. No consume créditos de OpenAI.'),
('✨ Renderizar imágenes IA','Preparar imágenes gratis'),
('Genera 3 opciones nuevas','Sin coste · prepara hasta 3 opciones'),
('IA FVMarket ${j+1}','FVMarket preparada ${j+1}'),
('↻ Generar otras','↻ Preparar de nuevo'),
('/api/admin/mibricolaje/render-images','/api/admin/mibricolaje/prepare-images'),
("if(!p.images.length)throw new Error('La IA no devolvió imágenes.');","if(!p.images.length)throw new Error('No se pudieron preparar imágenes.');"),
("p.renderError=e.message||'No se pudieron generar las imágenes.'","p.renderError=e.message||'No se pudieron preparar las imágenes.'"),
('Renderizando ${k+1} de ${ids.length}…','Preparando ${k+1} de ${ids.length}…'),
('Imágenes IA preparadas. Revisa y desmarca las que no quieras.','Imágenes preparadas gratis. Revisa y desmarca las que no quieras.'),
('Antes de importar, genera y selecciona al menos una imagen IA para cada producto.','Antes de importar, prepara y selecciona al menos una imagen para cada producto.'),
('<th>Valor añadido</th>','<th>Margen</th>'),
('${eur(added)}','${Number(p.margin||0).toFixed(1)} %'),
('Editar ficha</button>','Editar</button>'),
('✨ IA imágenes</button>','Preparar imágenes</button>'),
('Generar nuevas imágenes IA usando la referencia visual del producto','Preparar gratis las imágenes del producto: recorte, centrado, iluminación y fondo limpio'),
("if(!fresh.length)throw new Error('La IA no devolvió imágenes.');","if(!fresh.length)throw new Error('No se pudieron preparar imágenes.');"),
("alert(e.message||'No se pudieron generar imágenes IA.')","alert(e.message||'No se pudieron preparar las imágenes.')")
]
for a,b in repls:j=j.replace(a,b)
v10.write_text(j,encoding='utf-8')

h=admin.read_text(encoding='utf-8')
h=h.replace('<script src="/fvmarket-admin-v9.js?v=9"></script>','<script src="/fvmarket-admin-v10.js?v=10"></script>')
admin.write_text(h,encoding='utf-8')
print('FVMarket v10 free image preparation applied')
