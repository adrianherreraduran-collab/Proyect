from pathlib import Path

server=Path('appsrc/server.js')
admin=Path('appsrc/public/admin.html')
index=Path('appsrc/public/index.html')

s=server.read_text(encoding='utf-8')
s=s.replace("const {registerProviderSourceRoutes} = require('./provider_sources_v12');","const {registerProviderSourceRoutes} = require('./supplier_capture_v13');")
s=s.replace("app.use(express.json({limit:'12mb'}));","app.use(express.json({limit:'30mb'}));")
old="const {sourceUrl,sourcePrice,sourceRef,sourceEan,sourceProvider,sourceBrand,sourceAvailability,sourceTaxNote,sourceCheckedAt,sourceSync,margin,addedValue,imageSource,imageLicense,imageAuthor,sourceImages,sourceStore,sourceSeller,providerKey,...safe}=p;"
new="const {sourceUrl,sourcePrice,sourceRef,sourceEan,sourceProvider,sourceBrand,sourceAvailability,sourceTaxNote,sourceCheckedAt,sourceSync,margin,addedValue,imageSource,imageLicense,imageAuthor,sourceImages,sourceStore,sourceSeller,providerKey,supplierId,...safe}=p;"
if old in s:
    s=s.replace(old,new,1)

old_catalog="""function ensureCatalogSettings(d){
  d.settings=d.settings||{};
  const main=['Construcción','Bricolaje','Herramientas','Reformas'];
  d.settings.categories=main.slice();
  if(!d.settings.subcategories||typeof d.settings.subcategories!=='object')d.settings.subcategories={};
  const reforms=Array.isArray(d.settings.subcategories['Reformas'])?d.settings.subcategories['Reformas']:[];
  d.settings.subcategories['Reformas']=[...new Set([...reforms,'Baño','Cocina','Fontanería','Electricidad'])];
  d.settings.subcategories['Bricolaje']=Array.isArray(d.settings.subcategories['Bricolaje'])?d.settings.subcategories['Bricolaje']:['Adhesivos y selladores','Fijaciones','Organización','Reparación'];
  for(const p of d.products||[]){
    const old=String(p.category||'');
    const title=String(p.title||'');
    if(['Baño','Cocina','Baño y cocina','Fontanería','Electricidad'].includes(old)){
      p.category='Reformas';
      if(!p.subcategory){
        if(old==='Baño'||old==='Cocina'||old==='Fontanería'||old==='Electricidad')p.subcategory=old;
        else p.subcategory=/fregader|cocina|encimera/i.test(title)?'Cocina':'Baño';
      }
    }else if(['Pintura','Jardín','Otros'].includes(old)){
      p.category='Bricolaje';
    }
    if(p.onOffer==null)p.onOffer=false;
    if(p.discountPct==null)p.discountPct=0;
    if(p.subcategory==null)p.subcategory='';
  }
}
"""
new_catalog="""function ensureCatalogSettings(d){
  d.settings=d.settings||{};
  const main=['Construcción','Herramientas','Fontanería','Electricidad','Pintura','Jardín','Baño y cocina','Bricolaje','Reformas'];
  d.settings.categories=main.slice();
  if(!d.settings.subcategories||typeof d.settings.subcategories!=='object')d.settings.subcategories={};
  const defaults={
    'Construcción':['Cementos y morteros','Bloques y ladrillos','Azulejos y pavimentos','Aislamiento','Madera'],
    'Herramientas':['Eléctricas','Manuales','Medición','Taller','Accesorios'],
    'Fontanería':['Tuberías','Racores','Válvulas','Bombas','Accesorios'],
    'Electricidad':['Mecanismos','Cableado','Protección','Iluminación','Accesorios'],
    'Pintura':['Interior','Exterior','Esmaltes','Preparación','Accesorios'],
    'Jardín':['Riego','Herramientas de jardín','Mobiliario','Maquinaria','Cultivo'],
    'Baño y cocina':['Grifería','Sanitarios','Mamparas','Muebles de baño','Cocina'],
    'Bricolaje':['Adhesivos y selladores','Fijaciones','Organización','Reparación'],
    'Reformas':[]
  };
  for(const [cat,subs] of Object.entries(defaults)){
    const current=Array.isArray(d.settings.subcategories[cat])?d.settings.subcategories[cat]:[];
    d.settings.subcategories[cat]=[...new Set([...current,...subs])];
  }
  for(const p of d.products||[]){
    const old=String(p.category||'');
    const sub=String(p.subcategory||'');
    const title=String(p.title||'');
    if(old==='Baño'||old==='Cocina'){
      p.category='Baño y cocina';
      if(!sub)p.subcategory=old;
    }else if(old==='Reformas'){
      if(sub==='Fontanería'||sub==='Electricidad')p.category=sub;
      else if(sub==='Baño'||sub==='Cocina'||/inodoro|sanitario|grifer|mampara|lavabo|fregader|cocina|encimera|mueble de baño/i.test(title))p.category='Baño y cocina';
    }else if(old==='Bricolaje'){
      if(/pintur|esmalte|imprimaci|barniz|rodillo|brocha/i.test(title))p.category='Pintura';
      else if(/jard[ií]n|riego|césped|cesped|maceta|carretilla|piscina|podador|cortacésped|cortacesped/i.test(title))p.category='Jardín';
    }
    if(p.onOffer==null)p.onOffer=false;
    if(p.discountPct==null)p.discountPct=0;
    if(p.subcategory==null)p.subcategory='';
  }
}
"""
if old_catalog in s:
    s=s.replace(old_catalog,new_catalog,1)
server.write_text(s,encoding='utf-8')

h=admin.read_text(encoding='utf-8')
for oldtag in [
    '<script src="/fvmarket-admin-v12.js?v=12"></script>',
    '<script src="/fvmarket-admin-v11.js?v=11"></script>'
]:
    h=h.replace(oldtag,'<script src="/fvmarket-admin-v13.js?v=13"></script>')
if '/fvmarket-admin-v13.js?v=13' not in h:
    h=h.replace('</body>','<script src="/fvmarket-admin-v13.js?v=13"></script>\n</body>',1)
admin.write_text(h,encoding='utf-8')

x=index.read_text(encoding='utf-8')
if '/fvmarket-home-v13.js?v=13' not in x:
    x=x.replace('</body>','<script src="/fvmarket-home-v13.js?v=13"></script>\n</body>',1)
index.write_text(x,encoding='utf-8')

print('FVMarket supplier capture v13 patch applied')
