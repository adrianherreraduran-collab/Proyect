from pathlib import Path

server=Path('appsrc/server.js')
s=server.read_text(encoding='utf-8')
s=s.replace("app.use(express.json({limit:'2mb'}));", "app.use(express.json({limit:'12mb'}));")

old="""async function rutaFVRequest(pathname,payload){
  if(!RUTAFV_API_URL)throw new Error('RutaFV no está configurado');
  const headers={'Content-Type':'application/json'};if(RUTAFV_API_KEY)headers.Authorization='Bearer '+RUTAFV_API_KEY;
  const r=await fetch(RUTAFV_API_URL+pathname,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data.error||data.detail||`RutaFV HTTP ${r.status}`);return data;
}
"""
new=old+"""async function rutaFVGet(pathname,params={}){
  if(!RUTAFV_API_URL)throw new Error('RutaFV no está configurado');
  const headers={};if(RUTAFV_API_KEY)headers.Authorization='Bearer '+RUTAFV_API_KEY;
  const qs=new URLSearchParams(params).toString();
  const r=await fetch(RUTAFV_API_URL+pathname+(qs?'?'+qs:''),{headers,signal:AbortSignal.timeout(15000)});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data.error||data.detail||`RutaFV HTTP ${r.status}`);return data;
}
"""
if 'async function rutaFVGet' not in s:
    s=s.replace(old,new)

oldq="""app.post('/api/rutafv/quote',auth,async(req,res)=>{try{const d=read();const u=d.users.find(x=>x.id===req.user.id)||{};const items=[];for(const x of req.body.items||[]){const p=d.products.find(y=>y.id===x.id);if(p)items.push({ref:p.ref,title:p.title,qty:Math.max(1,Number(x.qty)||1),weightKg:Number(p.weightKg||0),sourceProvider:p.sourceProvider||'',sourceUrl:p.sourceUrl||''})}const customer=req.body.customer||{};const payload={clientCode:RUTAFV_CLIENT_CODE,customer:{name:String(customer.name||u.name||''),email:String(customer.email||u.email||''),phone:String(customer.phone||req.body.phone||''),city:String(customer.city||''),postalCode:String(customer.postalCode||''),notes:String(customer.notes||'')},destination:String(req.body.address||''),items,orderSource:'FVMarket'};const q=await rutaFVRequest(RUTAFV_QUOTE_PATH,payload);res.json(q)}catch(e){res.status(503).json({error:/timeout|aborted/i.test(String(e.message))?'RutaFV no respondió a tiempo. Puedes revisar los datos y volver a intentarlo.':e.message})}});"""
if oldq in s:
    newq=oldq.replace("destination:String(req.body.address||''),items", "origin:String(d.settings?.rutaFVOrigin||''),destination:String(req.body.address||''),items")
    s=s.replace(oldq,newq)

marker="app.post('/api/admin/orders/:id/create-rutafv-delivery'"
route="""app.get('/api/rutafv/address-search',auth,async(req,res)=>{try{const q=String(req.query.q||'').trim();if(q.length<3)return res.json({results:[]});const data=await rutaFVGet('/api/integrations/fvmarket/address-search',{q,limit:'5'});res.json(data)}catch(e){res.status(503).json({error:e.message})}});\n"""
if route.strip() not in s and marker in s:
    s=s.replace(marker,route+marker)
server.write_text(s,encoding='utf-8')

admin=Path('appsrc/public/admin.html')
a=admin.read_text(encoding='utf-8')
a=a.replace('<div class="field"><label>Imagen URL</label><input id="image"></div><button class="btn ghost" onclick="enrichSingleAI()">', '<div class="field"><label>Imagen URL principal</label><input id="image"></div><div class="row2"><div class="field"><label>Añadir imagen encontrada por ti (URL)</label><input id="manualImageUrl" placeholder="https://..."></div><div class="field"><label>Subir imágenes desde tu equipo</label><input id="manualImageFiles" type="file" accept="image/*" multiple onchange="manualSingleImageFiles(this)"></div></div><div class="bar"><button class="btn ghost" onclick="manualSingleImageUrl()">＋ Añadir URL a la galería</button></div><button class="btn ghost" onclick="enrichSingleAI()">')
a=a.replace('<div class="field"><label>Entrega base RutaFV (€)</label><input id="deliveryBase" type="number" step="0.01"></div><button class="btn navy" onclick="saveSettings()">', '<div class="field"><label>Entrega base RutaFV (€)</label><input id="deliveryBase" type="number" step="0.01"></div><div class="field"><label>Origen logístico FVMarket para RutaFV</label><input id="rutaFVOrigin" placeholder="Dirección completa del punto de salida/recogida en Fuerteventura"></div><div class="notice">RutaFV necesita este origen para calcular los kilómetros reales hasta el domicilio del cliente.</div><button class="btn navy" onclick="saveSettings()">')
a=a.replace('<button class="btn ghost" onclick="addEditImageUrl()">＋ Añadir imagen por URL</button><button class="btn ghost" onclick="editAI()">', '<button class="btn ghost" onclick="addEditImageUrl()">＋ Añadir imagen por URL</button><label class="btn ghost" style="display:inline-block">⬆ Subir imágenes<input type="file" accept="image/*" multiple onchange="addEditImageFiles(this)" style="display:none"></label><button class="btn ghost" onclick="editAI()">')

insert="""
function manualSingleImageUrl(){const u=String($('manualImageUrl')?.value||'').trim();if(!u)return;draft.images=Array.isArray(draft.images)?draft.images:[];if(!draft.images.some(x=>x.url===u))draft.images.push({url:u,origin:'manual',source:'Añadida manualmente'});if(!$('image').value)$('image').value=u;if(!draft.image)draft.image=u;$('manualImageUrl').value='';renderSingleImages()}
function compressImageFile(file,maxSide=1400,quality=.84){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/'))return reject(new Error('Archivo no válido'));const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{let w=im.width,h=im.height;const scale=Math.min(1,maxSide/Math.max(w,h));w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(im,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality))};im.onerror=reject;im.src=r.result};r.onerror=reject;r.readAsDataURL(file)})}
async function manualSingleImageFiles(input){const files=[...(input.files||[])].slice(0,8);draft.images=Array.isArray(draft.images)?draft.images:[];for(const f of files){try{const url=await compressImageFile(f);if(!draft.images.some(x=>x.url===url))draft.images.push({url,origin:'manual-upload',source:'Subida por administración'})}catch{}}const first=draft.images[0];draft.image=first?.url||draft.image||'';$('image').value=draft.image;input.value='';renderSingleImages()}
async function addEditImageFiles(input){const files=[...(input.files||[])].slice(0,8);editDraft.images=Array.isArray(editDraft.images)?editDraft.images:[];for(const f of files){try{const url=await compressImageFile(f);editDraft.images.push({url,origin:'manual-upload',source:'Subida por administración'})}catch{}}input.value='';renderEditImages()}
"""
if 'function manualSingleImageUrl()' not in a:
    a=a.replace('async function enrichSingleAI(silent=false)',insert+'\nasync function enrichSingleAI(silent=false)')
a=a.replace("async function loadSettings(){const s=await api('/api/admin/settings');deliveryBase.value=s.deliveryBase||0}async function saveSettings(){await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({deliveryBase:Number(deliveryBase.value)||0})});alert('Configuración guardada')}", "async function loadSettings(){const s=await api('/api/admin/settings');deliveryBase.value=s.deliveryBase||0;if($('rutaFVOrigin'))$('rutaFVOrigin').value=s.rutaFVOrigin||''}async function saveSettings(){await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({deliveryBase:Number(deliveryBase.value)||0,rutaFVOrigin:String($('rutaFVOrigin')?.value||'').trim()})});alert('Configuración guardada')}")
admin.write_text(a,encoding='utf-8')

index=Path('appsrc/public/index.html')
i=index.read_text(encoding='utf-8')
i=i.replace('.rutaFVChoice small{display:block;font-size:10px;color:#52677d;margin-top:2px}', '.rutaFVChoice small{display:block;font-size:10px;color:#52677d;margin-top:2px}.addressSuggest{display:none;border:1px solid #cfe0ef;background:#fff;border-radius:9px;box-shadow:0 12px 30px #06345f20;margin-top:5px;overflow:hidden}.addressSuggest.show{display:block}.addressSuggestion{display:block;width:100%;border:0;border-bottom:1px solid #edf1f4;background:#fff;text-align:left;padding:10px 11px;cursor:pointer;color:var(--ink)}.addressSuggestion:last-child{border-bottom:0}.addressSuggestion:hover{background:#f1f8ed}.addressSuggestion b{display:block;font-size:11px}.addressSuggestion small{font-size:9px;color:var(--muted)}')
i=i.replace('<input id="orderAddress" placeholder="Calle, número, piso/puerta"></div>', '<input id="orderAddress" autocomplete="off" placeholder="Empieza a escribir la dirección..."><div id="addressSuggestions" class="addressSuggest"></div></div>')
js="""
let addressSearchTimer=null;
async function searchDeliveryAddress(){const input=document.getElementById('orderAddress'),box=document.getElementById('addressSuggestions');if(!input||!box)return;const q=input.value.trim();if(q.length<3){box.classList.remove('show');box.innerHTML='';return}try{const d=await api('/api/rutafv/address-search?q='+encodeURIComponent(q));const rows=d.results||[];box.innerHTML=rows.map((r,idx)=>`<button type="button" class="addressSuggestion" onclick="selectDeliveryAddress(${idx})"><b>${String(r.address||r.label||'')}</b><small>${String(r.city||'')} ${String(r.postalCode||'')} · ${String(r.municipality||'')}</small></button>`).join('');box._results=rows;box.classList.toggle('show',!!rows.length)}catch{box.classList.remove('show')}}
function selectDeliveryAddress(idx){const box=document.getElementById('addressSuggestions'),r=box?._results?.[idx];if(!r)return;orderAddress.value=r.address||r.label||orderAddress.value;if(orderCity&&r.city)orderCity.value=r.city;if(orderPostalCode&&r.postalCode)orderPostalCode.value=r.postalCode;box.classList.remove('show');if(useRutaFV?.checked)toggleRutaFV()}
function setupAddressAutocomplete(){const input=document.getElementById('orderAddress');if(!input)return;input.addEventListener('input',()=>{clearTimeout(addressSearchTimer);addressSearchTimer=setTimeout(searchDeliveryAddress,280)});input.addEventListener('blur',()=>setTimeout(()=>document.getElementById('addressSuggestions')?.classList.remove('show'),180))}
"""
if 'function setupAddressAutocomplete()' not in i:
    i=i.replace('loadProducts().then(()=>{updateCart();refreshAccount()});', js+'\nloadProducts().then(()=>{updateCart();refreshAccount();setupAddressAutocomplete()});')
index.write_text(i,encoding='utf-8')
print('OK')
