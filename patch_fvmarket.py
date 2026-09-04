from pathlib import Path
import re, tarfile, io, base64, json

ROOT = Path("appsrc")
server_path = ROOT / "server.js"
admin_path = ROOT / "public" / "admin.html"
index_path = ROOT / "public" / "index.html"

server = server_path.read_text(encoding="utf-8")
admin = admin_path.read_text(encoding="utf-8")
index = index_path.read_text(encoding="utf-8")

def rep_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"NO MATCH: {label}")
    return text.replace(old, new, 1)

def sub_once(text, pattern, repl, label, flags=re.S):
    out, n = re.subn(pattern, lambda _m: repl, text, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f"NO REGEX MATCH {label}: {n}")
    return out

# --- Backend: admin por usuario + PIN seguro vía variables de entorno ---
server = rep_once(
    server,
    "const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;\n",
    "const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;\n"
    "const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();\n"
    "const ADMIN_PIN = String(process.env.ADMIN_PIN || '');\n",
    "admin env constants"
)

server = sub_once(
    server,
    r"function seed\(\)\{return \{users:\[\],products:defaultProducts,orders:\[\],settings:\{deliveryBase:0,igic:7,storeName:'FVMarket'\}\}\}\n"
    r"function read\(\)\{try\{return JSON\.parse\(fs\.readFileSync\(DATA_FILE,'utf8'\)\)\}catch\(e\)\{const d=seed\(\);save\(d\);return d\}\}\n"
    r"function save\(d\)\{fs\.writeFileSync\(DATA_FILE,JSON\.stringify\(d,null,2\)\)\}",
    """function seed(){return {users:[],products:defaultProducts,orders:[],settings:{deliveryBase:0,igic:7,storeName:'FVMarket'}}}
function save(d){fs.writeFileSync(DATA_FILE,JSON.stringify(d,null,2))}
function ensureAdmin(d){
  if(!Array.isArray(d.users))d.users=[];
  let changed=false;
  let u=d.users.find(x=>String(x.username||'').toLowerCase()===ADMIN_USERNAME);
  if(!u){
    u={id:id('usr'),name:'Administrador FVMarket',username:ADMIN_USERNAME,email:ADMIN_USERNAME+'@fvmarket.local',password:ADMIN_PIN?bcrypt.hashSync(ADMIN_PIN,12):'',role:'admin',createdAt:new Date().toISOString()};
    d.users.unshift(u);changed=true;
  }else{
    if(u.role!=='admin'){u.role='admin';changed=true}
    if(u.username!==ADMIN_USERNAME){u.username=ADMIN_USERNAME;changed=true}
    if(ADMIN_PIN && (!u.password || !bcrypt.compareSync(ADMIN_PIN,u.password))){u.password=bcrypt.hashSync(ADMIN_PIN,12);changed=true}
  }
  return changed;
}
function read(){
  try{
    const d=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    if(ensureAdmin(d))save(d);
    return d;
  }catch(e){
    const d=seed();ensureAdmin(d);save(d);return d;
  }
}""",
    "seed/read/admin bootstrap"
)

server = rep_once(
    server,
    "function token(u){return jwt.sign({id:u.id,email:u.email,role:u.role},JWT_SECRET,{expiresIn:'7d'})}\n",
    "function token(u){return jwt.sign({id:u.id,email:u.email,username:u.username||'',role:u.role},JWT_SECRET,{expiresIn:'7d'})}\n",
    "token username"
)
server = rep_once(
    server,
    "function safeUser(u){return {id:u.id,name:u.name,email:u.email,role:u.role,createdAt:u.createdAt}}\n",
    "function safeUser(u){return {id:u.id,name:u.name,email:u.email,username:u.username||'',role:u.role,createdAt:u.createdAt}}\n",
    "safeUser username"
)

server = sub_once(
    server,
    r"app\.post\('/api/auth/register',async\(req,res\)=>\{.*?\}\);\napp\.post\('/api/auth/login',async\(req,res\)=>\{.*?\}\);",
    """app.post('/api/auth/register',async(req,res)=>{const {name,email,password}=req.body||{};if(!name||!email||!password||password.length<6)return res.status(400).json({error:'Nombre, email y contraseña de al menos 6 caracteres son obligatorios'});const d=read();if(d.users.some(u=>String(u.email||'').toLowerCase()===String(email).toLowerCase()))return res.status(409).json({error:'Ese email ya está registrado'});const u={id:id('usr'),name:String(name).trim(),username:'',email:String(email).trim().toLowerCase(),password:await bcrypt.hash(password,12),role:'customer',createdAt:new Date().toISOString()};d.users.push(u);save(d);res.json({token:token(u),user:safeUser(u)});});
app.post('/api/auth/login',async(req,res)=>{const body=req.body||{};const identifier=String(body.user||body.username||body.email||'').trim().toLowerCase();const secret=String(body.pin??body.password??'');const d=read();const u=d.users.find(x=>String(x.username||'').toLowerCase()===identifier||String(x.email||'').toLowerCase()===identifier);if(!u||!u.password||!(await bcrypt.compare(secret,u.password)))return res.status(401).json({error:'Usuario/email o PIN/contraseña incorrectos'});res.json({token:token(u),user:safeUser(u)});});""",
    "auth register/login"
)

server = rep_once(
    server,
    "description:String(req.body.description||''),published:!!req.body.published,featured:!!req.body.featured};",
    "description:String(req.body.description||''),sourcePrice:Number(req.body.sourcePrice)||0,margin:Number(req.body.margin)||0,published:!!req.body.published,featured:!!req.body.featured};",
    "product source/margin"
)

server = sub_once(
    server,
    r"function catalogCandidatesFromText\(text,margin=40\)\{.*?\}\nasync function parseCatalogBuffer\(buffer,margin\)\{.*?\}",
    """function catalogCandidatesFromText(text){const lines=String(text||'').split(/\\r?\\n/).map(x=>x.replace(/\\s+/g,' ').trim()).filter(Boolean);const out=[];const seen=new Set();const priceRx=/(?:€\\s*)?(\\d{1,5}[.,]\\d{2})(?:\\s*€)?/g;for(let i=0;i<lines.length;i++){const line=lines[i];let m;while((m=priceRx.exec(line))){const sourcePrice=Number(m[1].replace(',','.'));if(!sourcePrice||sourcePrice>50000)continue;let title=(line.slice(0,m.index)+' '+line.slice(m.index+m[0].length)).replace(/\\b(?:PVP|PRECIO|OFERTA|IVA|IGIC)\\b[:\\s-]*/gi,' ').replace(/\\s+/g,' ').trim();if(title.length<5){for(let j=i-1;j>=Math.max(0,i-3);j--){const prev=lines[j].replace(/\\d{1,5}[.,]\\d{2}\\s*€?/g,'').trim();if(prev.length>=6&&!/^\\d+$/.test(prev)){title=prev;break}}}title=title.replace(/^[-–—•·\\s]+|[-–—•·\\s]+$/g,'').slice(0,170);if(title.length<5)continue;const key=(title.toLowerCase()+'|'+sourcePrice.toFixed(2));if(seen.has(key))continue;seen.add(key);out.push({title,sourcePrice,margin:0,price:+sourcePrice.toFixed(2),category:guessCategory(title),ref:'FVM-'+String(Date.now()).slice(-5)+'-'+String(out.length+1).padStart(2,'0'),stock:'bajo_pedido',description:'',image:'',published:false,featured:false});if(out.length>=100)return out}}return out}
async function parseCatalogBuffer(buffer){const data=await pdfParse(buffer);return {pages:data.numpages||0,candidates:catalogCandidatesFromText(data.text)}}""",
    "catalog parser manual margin"
)

server = server.replace("parseCatalogBuffer(req.file.buffer,Number(req.body.margin||40))","parseCatalogBuffer(req.file.buffer)")
server = server.replace("parseCatalogBuffer(Buffer.from(r.data),Number(req.body.margin||40))","parseCatalogBuffer(Buffer.from(r.data))")

server = sub_once(
    server,
    r"app\.post\('/api/admin/import-url',admin,async\(req,res\)=>\{.*?\}\);\n\napp\.get\('/admin'",
    """app.post('/api/admin/import-url',admin,async(req,res)=>{const url=String(req.body.url||'').trim();if(isUnsafeUrl(url))return res.status(400).json({error:'URL no permitida'});try{const r=await axios.get(url,{timeout:8000,maxContentLength:1200000,headers:{'User-Agent':'FVMarket/1.3'}});const $=cheerio.load(r.data);const title=($('meta[property="og:title"]').attr('content')||$('h1').first().text()||$('title').text()||'').trim().slice(0,180);const image=($('meta[property="og:image"]').attr('content')||$('img').first().attr('src')||'').trim();const description=($('meta[property="og:description"]').attr('content')||$('meta[name="description"]').attr('content')||'').trim().slice(0,800);const text=$('body').text().replace(/\\s+/g,' ');const m=text.match(/(?:€\\s*([0-9]+(?:[.,][0-9]{1,2})?)|([0-9]+(?:[.,][0-9]{1,2})?)\\s*€)/);const sourcePrice=m?Number((m[1]||m[2]).replace(',','.')):0;res.json({title,image,description,sourceUrl:url,sourcePrice,margin:0,price:sourcePrice?+sourcePrice.toFixed(2):0,category:'Otros',ref:'FVM-'+Date.now().toString().slice(-6),stock:'bajo_pedido',published:false,featured:false})}catch(e){res.status(422).json({error:'No se pudo leer esa URL. Puedes crear el producto manualmente con la URL como referencia.'})}});

app.get('/admin'""",
    "single URL no auto margin"
)

admin = sub_once(
    admin,
    r'<div class="row2"><div class="field"><label>Margen a aplicar \(%\)</label><input id="catalogMargin"[^>]*></div><div class="field"><label>URL directa del catálogo PDF \(opcional\)</label><input id="catalogUrl" placeholder="https://\.\.\./catalogo\.pdf"></div></div>',
    '<div class="field"><label>URL directa del catálogo PDF (opcional)</label><input id="catalogUrl" placeholder="https://.../catalogo.pdf"></div><div class="notice">El margen no es global: se introduce manualmente para cada producto detectado antes de importarlo.</div>',
    "remove global catalog margin",
    flags=0
)
admin = rep_once(admin,"<th>Precio origen</th><th>Precio FVMarket</th>","<th>Precio origen</th><th>Margen %</th><th>Precio FVMarket</th>","catalog header margin")
admin = admin.replace("fd.append('margin',$('catalogMargin').value||40);","")
admin = admin.replace("body:JSON.stringify({url:u,margin:Number($('catalogMargin').value)||40})","body:JSON.stringify({url:u})")

admin = sub_once(
    admin,
    r"function renderCatalogRows\(\)\{.*?\}\nfunction esc",
    """function setCandidateMargin(i,v){const c=catalogCandidates[i];c.margin=Math.max(0,Number(v)||0);c.price=+(Number(c.sourcePrice||0)*(1+c.margin/100)).toFixed(2);const priceEl=document.getElementById('candPrice'+i);if(priceEl)priceEl.value=c.price.toFixed(2)}
function renderCatalogRows(){catalogRows.innerHTML=catalogCandidates.map((c,i)=>`<tr><td><input class="candidateCheck" type="checkbox" ${c.selected?'checked':''} onchange="catalogCandidates[${i}].selected=this.checked"></td><td><input class="miniTitle" value="${esc(c.title)}" onchange="catalogCandidates[${i}].title=this.value"></td><td><select onchange="catalogCandidates[${i}].category=this.value">${['Construcción','Herramientas','Fontanería','Electricidad','Pintura','Jardín','Baño y cocina','Otros'].map(x=>`<option ${x===c.category?'selected':''}>${x}</option>`).join('')}</select></td><td>${Number(c.sourcePrice||0).toFixed(2)} €</td><td><input class="miniInput" type="number" min="0" step="0.1" value="${Number(c.margin||0)}" oninput="setCandidateMargin(${i},this.value)"></td><td><input id="candPrice${i}" class="miniInput" type="number" step="0.01" value="${Number(c.price||0).toFixed(2)}" onchange="catalogCandidates[${i}].price=Number(this.value)||0"></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No se detectaron productos con precio. Puedes usar la importación por URL o crear productos manualmente.</td></tr>'}
function esc""",
    "catalog rows margin per product"
)

admin = admin.replace(
    '<div class="field"><label>Margen (%)</label><input id="margin" type="number" value="40"></div>',
    '<div class="field"><label>Margen manual para este producto (%)</label><input id="margin" type="number" min="0" step="0.1" placeholder="Ej. 18" oninput="recalcSingle()"></div>'
)

admin = sub_once(
    admin,
    r"async function importUrl\(\)\{.*?\}\nasync function createProduct\(\)",
    """function recalcSingle(){const m=Math.max(0,Number(margin.value)||0);draft.margin=m;if(Number(draft.sourcePrice||0)>0){draft.price=+(Number(draft.sourcePrice)*(1+m/100)).toFixed(2);price.value=draft.price.toFixed(2)}}
async function importUrl(){importMsg.textContent='Analizando...';try{draft=await api('/api/admin/import-url',{method:'POST',body:JSON.stringify({url:url.value})});title.value=draft.title||'';category.value=draft.category||'Otros';ref.value=draft.ref||'';margin.value='';price.value=draft.sourcePrice||draft.price||'';image.value=draft.image||'';description.value=draft.description||'';importMsg.textContent=draft.sourcePrice?'Precio origen detectado: '+draft.sourcePrice+' €. Introduce manualmente el margen de este producto.':'Datos recuperados. Introduce manualmente precio y margen antes de publicar.'}catch(e){importMsg.textContent=e.message}}
async function createProduct()""",
    "single URL manual margin"
)
admin = admin.replace("price:Number(price.value)||0,image:image.value","price:Number(price.value)||0,sourcePrice:Number(draft.sourcePrice)||0,margin:Number(margin.value)||0,image:image.value")

admin = sub_once(
    admin,
    r"async function init\(\)\{if\(!session\)\{guard\.innerHTML=.*?;return\}try\{",
    """function showAdminLogin(message=''){guard.innerHTML='<h2>Acceso de administración</h2><p class="sub">Introduce la cuenta administrativa de FVMarket.</p><div class="field"><label>Usuario</label><input id="guardUser" value="admin" autocomplete="username"></div><div class="field"><label>PIN</label><input id="guardPin" type="password" inputmode="numeric" autocomplete="current-password"></div><button class="btn navy" onclick="adminLogin()">Entrar al panel</button><div class="msg">'+(message||'')+'</div>'}
async function adminLogin(){try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:guardUser.value,pin:guardPin.value})});const d=await r.json();if(!r.ok)throw Error(d.error||'Acceso denegado');if(d.user.role!=='admin')throw Error('La cuenta no tiene permisos de administración');session=d;localStorage.setItem('fv_session',JSON.stringify(session));init()}catch(e){showAdminLogin(e.message)}}
async function init(){if(!session){showAdminLogin();return}try{""",
    "admin direct login"
)
admin = admin.replace("}catch(e){guard.textContent=e.message}}","}catch(e){session=null;localStorage.removeItem('fv_session');showAdminLogin(e.message)}}",1)

index = index.replace(
    '<div class="field"><label>Email</label><input id="authEmail" type="email"></div><div class="field"><label>Contraseña</label><input id="authPassword" type="password"></div>',
    '<div class="field"><label>Usuario o email</label><input id="authEmail" type="text" autocomplete="username"></div><div class="field"><label>PIN / contraseña</label><input id="authPassword" type="password" autocomplete="current-password"></div>'
)
index = sub_once(
    index,
    r"async function submitAuth\(\)\{try\{const body=\{email:authEmail\.value,password:authPassword\.value\};if\(mode==='register'\)body\.name=authName\.value;session=await api\('/api/auth/'\+\(mode==='register'\?'register':'login'\),\{method:'POST',body:JSON\.stringify\(body\)\}\);",
    """async function submitAuth(){try{const body=mode==='register'?{name:authName.value,email:authEmail.value,password:authPassword.value}:{user:authEmail.value,pin:authPassword.value};session=await api('/api/auth/'+(mode==='register'?'register':'login'),{method:'POST',body:JSON.stringify(body)});""",
    "shop login user/pin"
)

pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
pkg["version"] = "1.3.0"
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

server_path.write_text(server, encoding="utf-8")
admin_path.write_text(admin, encoding="utf-8")
index_path.write_text(index, encoding="utf-8")

buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode="w:gz") as tar:
    for p in sorted(ROOT.rglob("*")):
        if p.is_file():
            tar.add(p, arcname=str(p.relative_to(ROOT)))
Path("fvmarket-app.tgz.b64").write_text(base64.b64encode(buf.getvalue()).decode("ascii"), encoding="ascii")
print("FVMarket 1.3.0 patched and repacked")
