from pathlib import Path
import re

server=Path('appsrc/server.js')
supplier=Path('appsrc/supplier_capture_v13.js')
admin_js=Path('appsrc/public/fvmarket-admin-v13.js')
admin_html=Path('appsrc/public/admin.html')
index_html=Path('appsrc/public/index.html')

# --- Backend: credenciales iniciales y mutables ---
s=server.read_text(encoding='utf-8')
s=s.replace("const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();\nconst ADMIN_PIN = String(process.env.ADMIN_PIN || '');",
"const INITIAL_ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase() || 'admin';\nconst INITIAL_ADMIN_PIN = String(process.env.ADMIN_PIN || '3669').trim() || '3669';")

new_ensure=r'''function ensureAdmin(d){
  if(!Array.isArray(d.users))d.users=[];
  d.settings=d.settings||{};
  let changed=false;
  let u=d.users.find(x=>x.role==='admin');
  if(!u){
    u={id:id('usr'),name:'Administrador FVMarket',username:INITIAL_ADMIN_USERNAME,email:INITIAL_ADMIN_USERNAME+'@fvmarket.local',password:bcrypt.hashSync(INITIAL_ADMIN_PIN,12),role:'admin',emailVerified:true,createdAt:new Date().toISOString()};
    d.users.unshift(u);changed=true;
  }
  if(!d.settings.adminCredentialsInitializedV14){
    u.username='admin';u.email='admin@fvmarket.local';u.password=bcrypt.hashSync('3669',12);u.role='admin';u.emailVerified=true;
    d.settings.adminCredentialsInitializedV14=true;changed=true;
  }else{
    if(!String(u.username||'').trim()){u.username=INITIAL_ADMIN_USERNAME;changed=true}
    if(!u.password){u.password=bcrypt.hashSync(INITIAL_ADMIN_PIN,12);changed=true}
    if(!u.emailVerified){u.emailVerified=true;changed=true}
  }
  return changed;
}'''
s,n=re.subn(r"function ensureAdmin\(d\)\{[\s\S]*?\n\}\nfunction read\(\)\{",new_ensure+"\nfunction read(){",s,count=1)
if n!=1: raise SystemExit('No se pudo reemplazar ensureAdmin')

security_routes=r'''
// FVM_ADMIN_SECURITY_V14
app.get('/api/admin/security',admin,(req,res)=>{
  const d=read();const u=d.users.find(x=>x.id===req.user.id&&x.role==='admin');
  if(!u)return res.status(404).json({error:'Administrador no encontrado'});
  res.set('Cache-Control','no-store');res.json({username:String(u.username||'admin')});
});
app.put('/api/admin/security',admin,async(req,res)=>{
  const d=read();const u=d.users.find(x=>x.id===req.user.id&&x.role==='admin');
  if(!u)return res.status(404).json({error:'Administrador no encontrado'});
  const currentPin=String(req.body?.currentPin||'');
  if(!currentPin||!u.password||!(await bcrypt.compare(currentPin,u.password)))return res.status(401).json({error:'El PIN actual no es correcto'});
  const newUsername=String(req.body?.newUsername??u.username??'').trim().toLowerCase();
  const newPin=String(req.body?.newPin||'').trim();
  if(!/^[a-z0-9._-]{3,32}$/.test(newUsername))return res.status(400).json({error:'El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo'});
  if(d.users.some(x=>x.id!==u.id&&String(x.username||'').trim().toLowerCase()===newUsername))return res.status(409).json({error:'Ese usuario ya está en uso'});
  if(newPin&&!/^\d{4,12}$/.test(newPin))return res.status(400).json({error:'El nuevo PIN debe tener entre 4 y 12 dígitos'});
  u.username=newUsername;u.email=newUsername+'@fvmarket.local';if(newPin)u.password=await bcrypt.hash(newPin,12);u.updatedAt=new Date().toISOString();save(d);
  res.json({ok:true,token:token(u),user:safeUser(u)});
});
'''
marker="app.get('/api/me',auth,(req,res)=>{const u=read().users.find(x=>x.id===req.user.id);res.json(u?safeUser(u):null)});"
if '// FVM_ADMIN_SECURITY_V14' not in s:
    if marker not in s: raise SystemExit('No se encontró marcador /api/me')
    s=s.replace(marker,marker+security_routes,1)
server.write_text(s,encoding='utf-8')

# --- Backend proveedores: nunca cachear listado ---
p=supplier.read_text(encoding='utf-8')
old="app.get('/api/admin/suppliers',admin,(req,res)=>{const d=ensureStores(deps.read());res.json(d.suppliers.map(s=>publicSupplier(s,d)))});"
new="app.get('/api/admin/suppliers',admin,(req,res)=>{const d=ensureStores(deps.read());res.set('Cache-Control','no-store');res.json(d.suppliers.map(s=>publicSupplier(s,d)))});"
if old in p:p=p.replace(old,new,1)
else: raise SystemExit('No se encontró GET suppliers')
supplier.write_text(p,encoding='utf-8')

# --- Frontend proveedores: GET sin caché y abrir el contenedor recién creado ---
a=admin_js.read_text(encoding='utf-8')
old="const apiCall=(url,opt={})=>window.api?window.api(url,opt):Promise.reject(new Error('API no disponible'));"
new="const apiCall=(url,opt={})=>{const method=String(opt.method||'GET').toUpperCase();const finalUrl=method==='GET'?url+(url.includes('?')?'&':'?')+'_v14='+Date.now():url;return window.api?window.api(finalUrl,{...opt,cache:'no-store'}):Promise.reject(new Error('API no disponible'))};"
if old in a:a=a.replace(old,new,1)
else: raise SystemExit('No se encontró apiCall v13')

old_save=re.search(r"  async function saveSupplier\(\)\{[\s\S]*?\n  \}\n  window\.v13DeleteSupplier",a)
if not old_save: raise SystemExit('No se encontró saveSupplier')
new_save=r'''  async function saveSupplier(){
    const btn=$('v13SupplierSave'),msg=$('v13SupplierMsg'),editing=state.editingSupplier,body={name:$('v13SupplierName').value,website:$('v13SupplierWeb').value,defaultMargin:Number($('v13SupplierMargin').value)||0,notes:$('v13SupplierNotes').value};
    if(!body.name.trim()){msg.textContent='Indica el nombre.';return}btn.disabled=true;btn.textContent='Guardando…';
    try{
      const saved=editing?await apiCall('/api/admin/suppliers/'+editing.id,{method:'PUT',body:JSON.stringify(body)}):await apiCall('/api/admin/suppliers',{method:'POST',body:JSON.stringify(body)});
      document.querySelector('.v13Modal')?.remove();
      if(saved?.id){
        const pos=state.suppliers.findIndex(x=>x.id===saved.id);if(pos>=0)state.suppliers[pos]=saved;else state.suppliers.unshift(saved);
        state.selectedSupplier=saved;renderSuppliers();await loadSupplierProducts(saved.id);
      }
      await loadAll();
      if(saved?.id){state.selectedSupplier=state.suppliers.find(x=>x.id===saved.id)||saved;renderSuppliers();await loadSupplierProducts(saved.id)}
    }catch(e){msg.textContent=e.message||'No se pudo guardar';btn.disabled=false;btn.textContent='Guardar proveedor'}
  }
  window.v13DeleteSupplier'''
a=a[:old_save.start()]+new_save+a[old_save.end():]
admin_js.write_text(a,encoding='utf-8')

# --- Administración: solo una pestaña autorizada desde el enlace público ---
h=admin_html.read_text(encoding='utf-8')
gate="""<script id=\"fvmAdminGateV14\">(()=>{try{if(sessionStorage.getItem('fvm_admin_authorized_tab')!=='1'){location.replace('/?admin=login')}}catch(e){location.replace('/?admin=login')}})();</script>"""
if 'fvmAdminGateV14' not in h:
    h=h.replace('<title>FVMarket · Administración</title>','<title>FVMarket · Administración</title>'+gate,1)
if '/fvmarket-admin-security-v14.js?v=14' not in h:
    h=h.replace('</body>','<script src="/fvmarket-admin-security-v14.js?v=14"></script>\n</body>',1)
admin_html.write_text(h,encoding='utf-8')

# --- Tienda: único enlace visible que solicita usuario/PIN antes de abrir /admin ---
i=index_html.read_text(encoding='utf-8')
if '/fvmarket-admin-entry-v14.js?v=14' not in i:
    i=i.replace('</body>','<script src="/fvmarket-admin-entry-v14.js?v=14"></script>\n</body>',1)
index_html.write_text(i,encoding='utf-8')

print('FVMarket admin + supplier v14 patch applied')
