from pathlib import Path
import re

ROOT=Path('appsrc')
server_path=ROOT/'server.js'
admin_path=ROOT/'public'/'admin.html'
server=server_path.read_text(encoding='utf-8')
admin=admin_path.read_text(encoding='utf-8')

# --- Backend: nunca exponer datos de origen en API pública ---
if 'FVM_PRIVATE_PROCUREMENT_V1' not in server:
    marker="app.get('/api/health',(req,res)=>res.json({ok:true,app:'FVMarket'}));"
    helper=r'''// FVM_PRIVATE_PROCUREMENT_V1
function publicProduct(p={}){
  const {sourceUrl,sourcePrice,sourceRef,sourceEan,sourceProvider,margin,addedValue,imageSource,imageLicense,imageAuthor,sourceImages,...safe}=p;
  if(Array.isArray(safe.images))safe.images=safe.images.map(x=>typeof x==='string'?x:{url:x.url}).filter(x=>x.url);
  return safe;
}
function publicOrder(o={}){
  return {...o,items:(o.items||[]).map(({procurement,...item})=>item)};
}
function providerFromUrl(raw=''){
  try{const h=new URL(raw).hostname.toLowerCase().replace(/^www\./,'');return h.split('.')[0].replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}catch{return ''}
}
'''
    if marker not in server: raise SystemExit('health marker missing')
    server=server.replace(marker,helper+'\n'+marker,1)

# Public product endpoint sanitized.
server=re.sub(
    r"app\.get\('/api/products',\(req,res\)=>\{const d=read\(\);const q=.*?\}\);",
    "app.get('/api/products',(req,res)=>{const d=read();const q=(req.query.q||'').toLowerCase();const category=(req.query.category||'').toLowerCase();res.json(d.products.filter(p=>p.published && (!q || `${p.title} ${p.category} ${p.ref}`.toLowerCase().includes(q)) && (!category || p.category.toLowerCase()===category)).map(publicProduct))});",
    server,count=1,flags=re.S)

# Customer orders sanitized.
server=re.sub(
    r"app\.get\('/api/my-orders',auth,\(req,res\)=>res\.json\(read\(\)\.orders\.filter\(o=>o\.userId===req\.user\.id\)\.sort\(\(a,b\)=>b\.createdAt\.localeCompare\(a\.createdAt\)\)\)\);",
    "app.get('/api/my-orders',auth,(req,res)=>res.json(read().orders.filter(o=>o.userId===req.user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(publicOrder)));",
    server,count=1)

# Snapshot de aprovisionamiento dentro de cada línea de pedido (solo admin).
old="normalized.push({productId:p.id,title:p.title,ref:p.ref,unitPrice:p.price,qty,lineTotal:+(p.price*qty).toFixed(2)});"
new="normalized.push({productId:p.id,title:p.title,ref:p.ref,unitPrice:p.price,qty,lineTotal:+(p.price*qty).toFixed(2),procurement:{provider:String(p.sourceProvider||providerFromUrl(p.sourceUrl)||''),sourceRef:String(p.sourceRef||''),sourceEan:String(p.sourceEan||''),sourceUrl:String(p.sourceUrl||''),sourcePrice:Number(p.sourcePrice)||0}});"
if old in server: server=server.replace(old,new,1)

# Store fields on product create/import/update.
server=server.replace("sourceUrl:String(req.body.sourceUrl||''),description:String(req.body.description||''),sourcePrice,", "sourceUrl:String(req.body.sourceUrl||''),sourceProvider:String(req.body.sourceProvider||providerFromUrl(req.body.sourceUrl)||''),sourceRef:String(req.body.sourceRef||''),sourceEan:String(req.body.sourceEan||''),description:String(req.body.description||''),sourcePrice,",1)
server=server.replace("for(const k of ['title','category','ref','stock','image','imageSource','imageLicense','imageAuthor','sourceUrl','description'])", "for(const k of ['title','category','ref','stock','image','imageSource','imageLicense','imageAuthor','sourceUrl','sourceProvider','sourceRef','sourceEan','description'])",1)
server=server.replace("sourceUrl:String(item.sourceUrl||''),description:String(item.description||''),published:", "sourceUrl:String(item.sourceUrl||''),sourceProvider:String(item.sourceProvider||providerFromUrl(item.sourceUrl)||''),sourceRef:String(item.sourceRef||''),sourceEan:String(item.sourceEan||''),description:String(item.description||''),published:",1)

# Extract provider, real supplier ref/SKU and EAN/GTIN from product page.
pattern=r"function extractProductFromHtml\(html,url\)\{.*?\napp\.post\('/api/admin/import-url'"
m=re.search(pattern,server,re.S)
if not m: raise SystemExit('extractProductFromHtml block missing')
block=m.group(0)
func=block[:block.rfind("\napp.post('/api/admin/import-url'")]
if 'sourceRef' not in func:
    func_new=func[:-1] + r""";const sourceProvider=providerFromUrl(url);const bodyText=$('body').text().replace(/\s+/g,' ');const sourceRef=String(prod.sku||prod.mpn||prod.productID||meta('meta[itemprop=\"sku\"]')||$('[itemprop=\"sku\"]').first().attr('content')||$('[itemprop=\"sku\"]').first().text()||(bodyText.match(/(?:Ref(?:erencia)?\.?|SKU|Código)\s*[:#-]?\s*([A-Z0-9._\/-]{3,40})/i)||[])[1]||'').trim().slice(0,60);const sourceEan=String(prod.gtin13||prod.gtin14||prod.gtin12||prod.gtin8||prod.gtin||meta('meta[itemprop=\"gtin13\"]')||meta('meta[itemprop=\"gtin\"]')||$('[itemprop^=\"gtin\"]').first().attr('content')||(bodyText.match(/(?:EAN|GTIN)\s*[:#-]?\s*(\d{8,14})/i)||[])[1]||'').replace(/\s/g,'').slice(0,20);return {title,description,image:main,sourceImages,images:sourceImages,sourceUrl:url,sourceProvider,sourceRef,sourceEan,sourcePrice,margin:0,addedValue:0,price:sourcePrice?+sourcePrice.toFixed(2):0,category,ref:ownReference(title,sourcePrice,category),stock:'bajo_pedido',published:false,featured:false}}"""
    # remove original return embedded near end by replacing last return expression robustly
    func_new=re.sub(r"return \{title,description,image:main,sourceImages,images:sourceImages,sourceUrl:url,sourcePrice,margin:0,addedValue:0,price:sourcePrice\?\+sourcePrice\.toFixed\(2\):0,category,ref:ownReference\(title,sourcePrice,category\),stock:'bajo_pedido',published:false,featured:false\}\}$", r"const sourceProvider=providerFromUrl(url);const bodyText=$('body').text().replace(/\\s+/g,' ');const sourceRef=String(prod.sku||prod.mpn||prod.productID||meta('meta[itemprop=\"sku\"]')||$('[itemprop=\"sku\"]').first().attr('content')||$('[itemprop=\"sku\"]').first().text()||(bodyText.match(/(?:Ref(?:erencia)?\\.?|SKU|Código)\\s*[:#-]?\\s*([A-Z0-9._\\/-]{3,40})/i)||[])[1]||'').trim().slice(0,60);const sourceEan=String(prod.gtin13||prod.gtin14||prod.gtin12||prod.gtin8||prod.gtin||meta('meta[itemprop=\"gtin13\"]')||meta('meta[itemprop=\"gtin\"]')||$('[itemprop^=\"gtin\"]').first().attr('content')||(bodyText.match(/(?:EAN|GTIN)\\s*[:#-]?\\s*(\\d{8,14})/i)||[])[1]||'').replace(/\\s/g,'').slice(0,20);return {title,description,image:main,sourceImages,images:sourceImages,sourceUrl:url,sourceProvider,sourceRef,sourceEan,sourcePrice,margin:0,addedValue:0,price:sourcePrice?+sourcePrice.toFixed(2):0,category,ref:ownReference(title,sourcePrice,category),stock:'bajo_pedido',published:false,featured:false}}", func)
    server=server.replace(func,func_new,1)

# --- Admin UI: fields only inside administration ---
if 'FVM_PROCUREMENT_ADMIN_UI_V1' not in admin:
    admin=admin.replace('<!-- FVM_IMAGE_MANAGER_V2 -->','<!-- FVM_IMAGE_MANAGER_V2 -->\n<!-- FVM_PROCUREMENT_ADMIN_UI_V1 -->',1)
    admin=admin.replace('.imgWarn{font-size:10px;color:#8a5a00;background:#fff8dd;padding:7px;border-radius:7px;margin-top:6px}', '.imgWarn{font-size:10px;color:#8a5a00;background:#fff8dd;padding:7px;border-radius:7px;margin-top:6px}.procure{background:#fff8e6;border:1px solid #f2d79a;border-radius:9px;padding:10px;font-size:10px;line-height:1.45}.procure b{color:#7b5200}.procure a{color:var(--navy);font-weight:900}.privateTag{display:inline-block;background:#fff1c9;color:#7c5500;padding:3px 6px;border-radius:999px;font-size:9px;font-weight:900}',1)

    # Single-product draft: insert private sourcing fields before pricing grid.
    token='<div class="priceGrid"><div class="field"><label>Precio real origen (€)</label>'
    insert='<div class="notice"><b>Datos internos de aprovisionamiento</b> · Nunca se muestran al cliente.</div><div class="row2"><div class="field"><label>Proveedor / tienda origen</label><input id="sourceProvider" placeholder="Detectado automáticamente"></div><div class="field"><label>Referencia real proveedor / SKU</label><input id="sourceRef" placeholder="Ej. BT3021"></div></div><div class="field"><label>EAN / GTIN origen (opcional)</label><input id="sourceEan"></div>'
    if token in admin: admin=admin.replace(token,insert+token,1)

    # Edit modal: after source URL add internal fields.
    token2='<div class="field"><label>URL de origen</label><input id="editSourceUrl"></div>'
    insert2=token2+'<div class="notice"><b>Datos privados de aprovisionamiento</b> · Solo visibles para administración.</div><div class="row2"><div class="field"><label>Proveedor / tienda origen</label><input id="editSourceProvider"></div><div class="field"><label>Referencia real proveedor / SKU</label><input id="editSourceRef"></div></div><div class="field"><label>EAN / GTIN origen</label><input id="editSourceEan"></div>'
    if token2 in admin: admin=admin.replace(token2,insert2,1)

# Populate/save new fields.
admin=admin.replace("$('description').value=draft.description||'';draft.image='';", "$('description').value=draft.description||'';if($('sourceProvider'))$('sourceProvider').value=draft.sourceProvider||'';if($('sourceRef'))$('sourceRef').value=draft.sourceRef||'';if($('sourceEan'))$('sourceEan').value=draft.sourceEan||'';draft.image='';",1)
admin=admin.replace("sourcePrice:Number($('sourcePrice').value)||0,margin:", "sourcePrice:Number($('sourcePrice').value)||0,sourceProvider:$('sourceProvider')?.value||draft.sourceProvider||'',sourceRef:$('sourceRef')?.value||draft.sourceRef||'',sourceEan:$('sourceEan')?.value||draft.sourceEan||'',margin:",1)

admin=admin.replace("$('editSourceUrl').value=p.sourceUrl||'';$('editSourcePrice')", "$('editSourceUrl').value=p.sourceUrl||'';if($('editSourceProvider'))$('editSourceProvider').value=p.sourceProvider||'';if($('editSourceRef'))$('editSourceRef').value=p.sourceRef||'';if($('editSourceEan'))$('editSourceEan').value=p.sourceEan||'';$('editSourcePrice')",1)
admin=admin.replace("sourceUrl:$('editSourceUrl').value,sourcePrice:", "sourceUrl:$('editSourceUrl').value,sourceProvider:$('editSourceProvider')?.value||'',sourceRef:$('editSourceRef')?.value||'',sourceEan:$('editSourceEan')?.value||'',sourcePrice:",1)

# Admin orders: add private procurement column and content; never goes to storefront.
admin=admin.replace('<th>Nº</th><th>Fecha</th><th>Total</th><th>Pago</th><th>Estado</th>', '<th>Nº</th><th>Fecha</th><th>Total</th><th>Pago</th><th>Aprovisionamiento <span class="privateTag">SOLO ADMIN</span></th><th>Estado</th>',1)
old_load=re.search(r"async function loadOrders\(\)\{.*?\}async function setStatus",admin,re.S)
if old_load:
    new_load=r'''async function loadOrders(){const os=await api('/api/admin/orders');statOrders.textContent=os.length;orders.innerHTML=os.map(o=>{const sourcing=(o.items||[]).map(i=>{const s=i.procurement||{};const ref=s.sourceRef?'<b>Ref. origen:</b> '+esc(s.sourceRef):'<b>Ref. origen:</b> no detectada';const ean=s.sourceEan?'<br><b>EAN:</b> '+esc(s.sourceEan):'';const provider=s.provider?'<b>Proveedor:</b> '+esc(s.provider)+'<br>':'';const cost='<br><b>Coste origen:</b> '+money(s.sourcePrice)+' × '+Number(i.qty||1);const link=s.sourceUrl?'<br><a href="'+esc(s.sourceUrl)+'" target="_blank" rel="noopener">Abrir ficha original ↗</a>':'';return '<div class="procure"><b>'+esc(i.title)+'</b><br>'+provider+ref+ean+cost+link+'</div>'}).join('<div style="height:6px"></div>');return `<tr><td>${esc(o.number)}</td><td>${new Date(o.createdAt).toLocaleString('es-ES')}</td><td>${Number(o.total).toFixed(2)} €</td><td>${esc(o.paymentMethod)}</td><td>${sourcing||'<span class="msg">Pedido antiguo sin datos de origen guardados.</span>'}</td><td><select class="ordersStatus" onchange="setStatus('${o.id}',this.value)">${['pendiente_pago','pagado','preparando','en_reparto','entregado','cancelado'].map(s=>`<option ${o.status===s?'selected':''}>${s}</option>`).join('')}</select></td></tr>`}).join('')||'<tr><td colspan="6" class="empty">No hay pedidos.</td></tr>'}async function setStatus'''
    admin=admin[:old_load.start()]+new_load+admin[old_load.end():]

server_path.write_text(server,encoding='utf-8')
admin_path.write_text(admin,encoding='utf-8')
print('FVMarket private procurement patch applied')
