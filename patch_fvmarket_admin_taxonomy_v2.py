from pathlib import Path
import re

root=Path('appsrc')
server=root/'server.js'
admin=root/'public'/'admin.html'
index=root/'public'/'index.html'
s=server.read_text(encoding='utf-8')
a=admin.read_text(encoding='utf-8')
i=index.read_text(encoding='utf-8')

# --- Backend: taxonomía principal exacta y migración de categorías antiguas ---
new_catalog = r'''function ensureCatalogSettings(d){
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
function refPrefix'''
s=re.sub(r"function ensureCatalogSettings\(d\)\{.*?\n\}\nfunction refPrefix",new_catalog,s,flags=re.S)

# Seed coherente para nuevas instalaciones.
s=re.sub(r"categories:\[[^\]]*\],subcategories:\{.*?\}\}\}\}","categories:['Construcción','Bricolaje','Herramientas','Reformas'],subcategories:{'Reformas':['Baño','Cocina','Fontanería','Electricidad'],'Bricolaje':['Adhesivos y selladores','Fijaciones','Organización','Reparación']}}}}",s,count=1,flags=re.S)

# El endpoint de administración conserva solo las cuatro categorías principales.
s=re.sub(r"app\.put\('/api/admin/catalog-taxonomy'.*?\);", "app.put('/api/admin/catalog-taxonomy',admin,(req,res)=>{const d=read();ensureCatalogSettings(d);d.settings.categories=['Construcción','Bricolaje','Herramientas','Reformas'];d.settings.subcategories=req.body.subcategories&&typeof req.body.subcategories==='object'?req.body.subcategories:d.settings.subcategories;const r=Array.isArray(d.settings.subcategories['Reformas'])?d.settings.subcategories['Reformas']:[];d.settings.subcategories['Reformas']=[...new Set([...r,'Baño','Cocina'])];save(d);res.json({categories:d.settings.categories,subcategories:d.settings.subcategories})});", s, count=1, flags=re.S)

# Clasificación automática compatible con la nueva estructura.
for old,new in [
    ("return'Fontanería'","return'Reformas'"),
    ("return'Electricidad'","return'Reformas'"),
    ("return'Pintura'","return'Bricolaje'"),
    ("return'Jardín'","return'Bricolaje'"),
    ("return'Baño y cocina'","return'Reformas'"),
]:
    s=s.replace(old,new)

# --- Administración: corregir carga y mantener la misma taxonomía en todo el panel ---
old_init="async function init(){if(!session){showAdminLogin();return}try{const me=await api('/api/me');if(me.role!=='admin')throw Error('Tu cuenta no tiene permisos de administración');guard.style.display='none';panel.style.display='block';await Promise.all([loadProducts(),loadOrders(),loadUsers(),loadSettings(),loadAIStatus()])}catch(e){session=null;localStorage.removeItem('fv_session');showAdminLogin(e.message)}}"
new_init="async function init(){const guardEl=$('guard'),panelEl=$('panel');if(!session){showAdminLogin();return}try{const me=await api('/api/me');if(!me||me.role!=='admin')throw Error('Tu cuenta no tiene permisos de administración');guardEl.style.display='none';panelEl.style.display='block';const jobs=[loadProducts(),loadOrders(),loadUsers(),loadSettings(),loadAIStatus()];const results=await Promise.allSettled(jobs);const failed=results.filter(x=>x.status==='rejected');if(failed.length){console.error('FVMarket admin: carga parcial',failed);const state=$('aiState');if(state)state.textContent='Panel abierto · algunos datos se están reintentando';}}catch(e){session=null;localStorage.removeItem('fv_session');showAdminLogin(e.message)}}"
a=a.replace(old_init,new_init)

# Define referencias DOM críticas explícitamente para evitar depender de variables globales por id.
a=a.replace("let session=JSON.parse(localStorage.getItem('fv_session')||'null'),draft={},catalogCandidates=[],productCache=[],editDraft={},editImages=[];const $=id=>document.getElementById(id);", "let session=JSON.parse(localStorage.getItem('fv_session')||'null'),draft={},catalogCandidates=[],productCache=[],editDraft={},editImages=[];const $=id=>document.getElementById(id);const guard=$('guard'),panel=$('panel');")

# Selectores estáticos y listas dinámicas.
for old in [
    "<option>Construcción</option><option>Herramientas</option><option>Fontanería</option><option>Electricidad</option><option>Baño</option><option>Cocina</option><option>Bricolaje</option><option>Otros</option>",
    "<option>Construcción</option><option>Herramientas</option><option>Fontanería</option><option>Electricidad</option><option>Bricolaje</option><option>Otros</option>",
]:
    a=a.replace(old,"<option>Construcción</option><option>Bricolaje</option><option>Herramientas</option><option>Reformas</option>")
a=a.replace("['Construcción','Herramientas','Fontanería','Electricidad','Pintura','Jardín','Baño y cocina','Otros']","['Construcción','Bricolaje','Herramientas','Reformas']")
a=a.replace("const FVM_BASE_CATS=['Baño','Cocina','Bricolaje','Construcción','Herramientas','Fontanería','Electricidad','Otros'];","const FVM_BASE_CATS=['Construcción','Bricolaje','Herramientas','Reformas'];")
a=a.replace("let fvmTax={categories:FVM_BASE_CATS.slice(),subcategories:{}};","let fvmTax={categories:FVM_BASE_CATS.slice(),subcategories:{'Reformas':['Baño','Cocina','Fontanería','Electricidad']}};")

# Clasificación local de catálogo.
for old,new in [
    ("return'Fontanería'","return'Reformas'"),
    ("return'Electricidad'","return'Reformas'"),
    ("return'Pintura'","return'Bricolaje'"),
    ("return'Jardín'","return'Bricolaje'"),
    ("return'Baño y cocina'","return'Reformas'"),
]:
    a=a.replace(old,new)

# Texto administrativo acorde con la jerarquía.
a=a.replace('Las categorías principales permanecen estables. Puedes crear subcategorías para futuros productos.','Categorías principales: Construcción, Bricolaje, Herramientas y Reformas. Baño y Cocina se gestionan como subcategorías de Reformas.')

# --- Tienda: mismo orden arriba y abajo ---
new_cats='''<div class="catsWrap"><div class="cats" id="cats"><div class="cat" onclick="filterCategory('Construcción')"><span class="catIcon">▦</span><div><b>Construcción</b><small>Ver productos <span>›</span></small></div></div><div class="cat" onclick="filterCategory('Bricolaje')"><span class="catIcon">⌘</span><div><b>Bricolaje</b><small>Ver productos <span>›</span></small></div></div><div class="cat" onclick="filterCategory('Herramientas')"><span class="catIcon">⌕</span><div><b>Herramientas</b><small>Ver productos <span>›</span></small></div></div><div class="cat" onclick="filterCategory('Reformas')"><span class="catIcon">▤</span><div><b>Reformas</b><small>Baño, cocina y más <span>›</span></small></div></div><div class="cat" onclick="filterOffers()"><span class="catIcon">%</span><div><b>Ofertas</b><small>Ver descuentos <span>›</span></small></div></div></div></div>'''
i=re.sub(r'<div class="catsWrap"><div class="cats" id="cats">.*?</div></div>\n<section class="section"',new_cats+'\n<section class="section"',i,count=1,flags=re.S)
i=re.sub(r'<div class="fcol"><b>Categorías</b>.*?</div><div class="fcol"><b>Medios de pago</b>', '<div class="fcol"><b>Categorías</b><a onclick="filterCategory(\'Construcción\')">Construcción</a><a onclick="filterCategory(\'Bricolaje\')">Bricolaje</a><a onclick="filterCategory(\'Herramientas\')">Herramientas</a><a onclick="filterCategory(\'Reformas\')">Reformas</a><a onclick="filterOffers()">Ofertas</a></div><div class="fcol"><b>Medios de pago</b>', i, count=1, flags=re.S)

# Marcadores para validación.
if 'FVM_ADMIN_TAXONOMY_V2' not in a:a='<!-- FVM_ADMIN_TAXONOMY_V2 -->\n'+a
if 'FVM_TAXONOMY_V2' not in s:s='// FVM_TAXONOMY_V2\n'+s
if 'FVM_STOREFRONT_TAXONOMY_V2' not in i:i='<!-- FVM_STOREFRONT_TAXONOMY_V2 -->\n'+i

server.write_text(s,encoding='utf-8')
admin.write_text(a,encoding='utf-8')
index.write_text(i,encoding='utf-8')
print('FVMarket admin/taxonomy v2 applied')
