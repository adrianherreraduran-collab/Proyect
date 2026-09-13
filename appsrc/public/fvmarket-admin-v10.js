// FVM_ADMIN_MIBRICOLAJE_V10_FREE_PREP
(()=>{
  const V9={products:[],errors:[]};
  const $id=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eur=n=>Number(n||0).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
  const apiCall=(url,opt={})=>window.api?window.api(url,opt):Promise.reject(new Error('API no disponible'));
  function css(){
    if($id('fvmV9Style'))return;
    const s=document.createElement('style');s.id='fvmV9Style';s.textContent=`
      .v9Help{background:#f4f8fb;border:1px solid var(--line);border-radius:9px;padding:10px 12px;font-size:11px;color:#48617b;margin:10px 0;line-height:1.45}
      .v9Refs{line-height:1.45;min-width:145px}.v9Refs b{display:block;color:var(--navy)}.v9Refs small{display:block;color:var(--muted)}
      .v9Provider{font-weight:850;color:#315f19}.v9ImgGrid{display:grid;grid-template-columns:repeat(3,minmax(92px,1fr));gap:7px;min-width:310px}
      .v9Img{border:2px solid var(--line);border-radius:9px;padding:5px;background:#fff;cursor:pointer;position:relative}.v9Img.on{border-color:var(--lime);background:#eff9e8}
      .v9Img img{width:100%;height:82px;object-fit:contain;background:#fff;border-radius:6px}.v9Img small{display:block;font-size:9px;color:var(--muted);margin-top:3px}
      .v9Img.on:after{content:'✓';position:absolute;right:5px;top:5px;background:var(--lime);color:#17320d;width:19px;height:19px;border-radius:50%;display:grid;place-items:center;font-weight:950}
      .v9SrcImgs{display:flex;gap:4px;flex-wrap:wrap;margin:5px 0}.v9SrcImgs img{width:46px;height:42px;object-fit:contain;background:white;border:1px dashed #b9cbd7;border-radius:6px;opacity:.78}
      .v9ActionNote{font-size:9px;color:var(--muted);display:block;margin-top:4px}.v9Actions{display:flex;gap:5px;flex-wrap:wrap}.v9Actions .btn{padding:8px 10px;font-size:10px}
      .v9Busy{opacity:.55;pointer-events:none}.v9WideTable{min-width:1180px}
      @media(max-width:900px){.v9ImgGrid{grid-template-columns:repeat(2,minmax(90px,1fr));min-width:220px}}
    `;document.head.appendChild(s);
  }
  function mountImporter(){
    const card=$id('mbImportCard');if(!card||card.dataset.v9==='1')return !!card;
    card.dataset.v9='1';
    card.innerHTML=`<div class="bar"><div><h2 style="margin:0">Importar desde MiBricolaje · FVMarket</h2><p class="sub" style="margin:5px 0 0">Usa la ficha de origen solo para datos de aprovisionamiento y referencia visual. FVMarket crea su propia referencia y texto; las imágenes se preparan gratis antes de importar.</p></div><span class="badge">Importador inteligente</span></div>
      <div class="notice"><b>Flujo:</b> referencia/URL → datos de origen → Ref. FVMarket propia → preparar imágenes gratis → elegir imágenes → importar como borrador.</div>
      <div class="row2" style="margin-top:12px"><div class="field"><label>Referencias o URLs · una por línea</label><textarea id="mbV9Inputs" rows="5" placeholder="FT1533\nFT1526\nhttps://mibricolaje.com/..." style="width:100%"></textarea></div><div><div class="field"><label>Valor añadido (%)</label><input id="mbV9Margin" type="number" min="0" max="300" step="0.1" value="40"></div><button class="btn navy" id="mbV9Analyze" type="button">Analizar productos</button><div class="msg" id="mbV9Msg"></div></div></div>
      <div class="v9Help"><b>Preparación gratuita:</b> FVMarket recorta márgenes, centra, normaliza iluminación y coloca las fotos sobre fondos limpios. No consume créditos de OpenAI.</div>
      <div id="mbV9Results" style="margin-top:14px"></div>`;
    $id('mbV9Analyze').onclick=analyze;
    return true;
  }
  async function analyze(){
    const raw=($id('mbV9Inputs')?.value||'').split(/[\n;]+/).map(x=>x.trim()).filter(Boolean);
    const msg=$id('mbV9Msg'),btn=$id('mbV9Analyze');if(!raw.length){msg.textContent='Introduce al menos una referencia o URL.';return}
    btn.disabled=true;msg.textContent='Consultando productos y preparando ficha FVMarket…';
    try{
      const r=await apiCall('/api/admin/mibricolaje/analyze',{method:'POST',body:JSON.stringify({inputs:raw,margin:Number($id('mbV9Margin').value)||40})});
      V9.products=(r.products||[]).map(p=>({...p,selected:true,images:Array.isArray(p.images)?p.images:[],renderBusy:false,renderError:''}));V9.errors=r.errors||[];
      renderImporter();msg.textContent=V9.products.length+' productos preparados'+(V9.errors.length?' · '+V9.errors.length+' no encontrados':'')+'.';
    }catch(e){msg.textContent=e.message||'No se pudo analizar.'}finally{btn.disabled=false}
  }
  function srcThumbs(p){const a=(p.sourceImages||[]).slice(0,4);return a.length?`<div class="v9SrcImgs" title="Referencia visual interna">${a.map(u=>`<img src="${esc(u)}" referrerpolicy="no-referrer">`).join('')}</div><span class="v9ActionNote">Origen · no se importa</span>`:'<span class="v9ActionNote">Sin imágenes detectadas en origen</span>'}
  function genImgs(p,i){const a=p.images||[];if(!a.length)return `<button class="btn ghost" onclick="window.fvmV9Render(${i})">Preparar imágenes gratis</button>${p.renderError?`<span class="v9ActionNote" style="color:#a32929">${esc(p.renderError)}</span>`:'<span class="v9ActionNote">Sin coste · prepara hasta 3 opciones</span>'}`;return `<div class="v9ImgGrid">${a.map((im,j)=>`<div class="v9Img ${im.selected===false?'':'on'}" onclick="window.fvmV9ToggleImage(${i},${j})"><img src="${esc(im.url)}"><small>FVMarket preparada ${j+1}</small></div>`).join('')}</div><button class="btn ghost" style="margin-top:6px" onclick="window.fvmV9Render(${i})">↻ Preparar de nuevo</button>`}
  function renderImporter(){
    const el=$id('mbV9Results');if(!el)return;if(!V9.products.length){el.innerHTML=V9.errors.length?`<div class="notice">${V9.errors.map(x=>esc(x.input)+': '+esc(x.error)).join('<br>')}</div>`:'';return}
    el.innerHTML=`<div class="catalogTable" style="max-height:650px"><table class="v9WideTable"><thead><tr><th>✓</th><th>Producto FVMarket</th><th>Ref. FVMarket</th><th>Ref. original</th><th>Proveedor</th><th>Precio origen</th><th>Margen</th><th>PVP</th><th>Referencia visual</th><th>Imágenes para importar</th></tr></thead><tbody>${V9.products.map((p,i)=>`<tr class="${p.renderBusy?'v9Busy':''}"><td><input type="checkbox" class="mbV9Sel" data-i="${i}" ${p.selected?'checked':''}></td><td><input class="miniTitle mbV9Title" data-i="${i}" value="${esc(p.title)}"><div class="aiMeta">${esc(p.description||'')}</div></td><td><b>${esc(p.ref||'')}</b></td><td><b>${esc(p.sourceRef||'')}</b></td><td><span class="v9Provider">${esc(p.sourceProvider||'Mi Bricolaje')}</span><div class="aiMeta">${esc(p.sourceBrand||'')}</div></td><td>${eur(p.sourcePrice)}${p.sourceTaxNote?`<div class="aiMeta">${esc(p.sourceTaxNote)}</div>`:''}</td><td><input class="miniInput mbV9MarginRow" data-i="${i}" type="number" min="0" max="300" step="0.1" value="${Number(p.margin||40)}"></td><td class="mbV9Pvp" data-i="${i}"><b>${eur(p.price)}</b></td><td>${srcThumbs(p)}</td><td>${genImgs(p,i)}</td></tr>`).join('')}</tbody></table></div>
      <div class="bar" style="margin-top:10px"><button class="btn ghost" id="mbV9SelectAll">Seleccionar todos</button><button class="btn ghost" id="mbV9RenderSelected">✨ Renderizar imágenes de seleccionados</button><button class="btn navy" id="mbV9Import">Importar seleccionados como borrador</button><span class="msg" id="mbV9ImportMsg"></span></div>${V9.errors.length?`<div class="notice">No encontrados:<br>${V9.errors.map(x=>esc(x.input)+': '+esc(x.error)).join('<br>')}</div>`:''}`;
    el.querySelectorAll('.mbV9Sel').forEach(x=>x.onchange=()=>V9.products[Number(x.dataset.i)].selected=x.checked);
    el.querySelectorAll('.mbV9Title').forEach(x=>x.oninput=()=>V9.products[Number(x.dataset.i)].title=x.value);
    el.querySelectorAll('.mbV9MarginRow').forEach(x=>x.oninput=()=>{const i=Number(x.dataset.i),p=V9.products[i],m=Math.max(0,Number(x.value)||0);p.margin=m;p.addedValue=+(Number(p.sourcePrice||0)*m/100).toFixed(2);p.price=+(Number(p.sourcePrice||0)+p.addedValue).toFixed(2);const td=el.querySelector('.mbV9Pvp[data-i="'+i+'"]');if(td)td.innerHTML='<b>'+eur(p.price)+'</b>'});
    $id('mbV9SelectAll').onclick=()=>{V9.products.forEach(p=>p.selected=true);renderImporter()};
    $id('mbV9RenderSelected').onclick=renderSelected;
    $id('mbV9Import').onclick=doImport;
  }
  window.fvmV9ToggleImage=(i,j)=>{const p=V9.products[i],im=p?.images?.[j];if(!im)return;im.selected=im.selected===false?true:false;renderImporter()};
  window.fvmV9Render=async i=>{
    const p=V9.products[i];if(!p||p.renderBusy)return;p.renderBusy=true;p.renderError='';renderImporter();
    try{const r=await apiCall('/api/admin/mibricolaje/prepare-images',{method:'POST',body:JSON.stringify({title:p.title,sourceRef:p.sourceRef,sourceImages:p.sourceImages||[],count:3})});p.images=(r.images||[]).map(x=>({...x,selected:true}));if(!p.images.length)throw new Error('No se pudieron preparar imágenes.');}
    catch(e){p.renderError=e.message||'No se pudieron preparar las imágenes.'}finally{p.renderBusy=false;renderImporter()}
  };
  async function renderSelected(){const ids=V9.products.map((p,i)=>p.selected?i:-1).filter(i=>i>=0);const msg=$id('mbV9ImportMsg');if(!ids.length){msg.textContent='Selecciona al menos un producto.';return}for(let k=0;k<ids.length;k++){msg.textContent=`Preparando ${k+1} de ${ids.length}…`;await window.fvmV9Render(ids[k])}msg.textContent='Imágenes preparadas gratis. Revisa y desmarca las que no quieras.'}
  async function doImport(){
    const chosen=V9.products.filter(p=>p.selected);const msg=$id('mbV9ImportMsg');if(!chosen.length){msg.textContent='Selecciona al menos un producto.';return}
    const missing=chosen.filter(p=>!(p.images||[]).some(im=>im.selected!==false));if(missing.length){msg.textContent='Antes de importar, prepara y selecciona al menos una imagen para cada producto.';return}
    const payload=chosen.map(p=>({...p,images:(p.images||[]).filter(im=>im.selected!==false).map(({selected,...im})=>im)}));msg.textContent='Importando borradores…';
    try{const r=await apiCall('/api/admin/mibricolaje/import',{method:'POST',body:JSON.stringify({products:payload})});msg.textContent='Creados '+r.created+' borradores'+(r.skipped?' · '+r.skipped+' omitidos/duplicados':'')+'.';if(window.loadProducts)await window.loadProducts();}
    catch(e){msg.textContent=e.message||'Error al importar.'}
  }

  const oldQuickAI=window.quickAI;
  window.loadProducts=async function(){
    const ps=await apiCall('/api/admin/products');window.fvmV9ProductCache=ps;try{productCache=ps}catch{}
    if($id('statProducts'))$id('statProducts').textContent=ps.length;if($id('statPublished'))$id('statPublished').textContent=ps.filter(p=>p.published).length;
    const table=$id('products')?.closest('table');if(table){const h=table.querySelector('thead tr');if(h)h.innerHTML='<th>Ref. FVMarket</th><th>Ref. original</th><th>Proveedor</th><th>Producto</th><th>Categoría</th><th>Precio origen</th><th>Margen</th><th>PVP</th><th>Estado</th><th>Acciones</th>'}
    const tbody=$id('products');if(!tbody)return;
    tbody.innerHTML=ps.map(p=>{const base=Number(p.sourcePrice||0),added=p.addedValue!=null?Number(p.addedValue):Math.max(0,Number(p.price||0)-base);return `<tr><td><b>${esc(p.ref||'—')}</b></td><td>${esc(p.sourceRef||'—')}</td><td>${esc(p.sourceProvider||'—')}</td><td>${esc(p.title||'')}</td><td>${esc(p.category||'')}</td><td>${eur(base)}</td><td>${Number(p.margin||0).toFixed(1)} %</td><td><b>${eur(p.price)}</b></td><td><span class="badge">${p.published?'Publicado':'Borrador'}</span></td><td><div class="v9Actions"><button class="btn navy" onclick="openEdit('${p.id}')" title="Modificar ficha, precios, referencias e imágenes">Editar</button><button class="btn ghost" onclick="quickAI('${p.id}')" title="Preparar gratis las imágenes del producto: recorte, centrado, iluminación y fondo limpio">Preparar imágenes</button><button class="btn ghost" onclick="toggle('${p.id}',${!p.published})" title="${p.published?'Retirar el producto de la tienda sin borrarlo':'Hacer visible el producto en la tienda'}">${p.published?'Ocultar':'Publicar'}</button><button class="btn danger" onclick="delp('${p.id}')" title="Eliminar definitivamente el producto">Eliminar</button></div></td></tr>`}).join('')||'<tr><td colspan="10" class="empty">No hay productos.</td></tr>';
  };
  window.quickAI=async function(id){
    const p=(window.fvmV9ProductCache||[]).find(x=>x.id===id);if(!p||p.sourceProvider!=='Mi Bricolaje'||!(p.sourceImages||[]).length){if(oldQuickAI)return oldQuickAI(id);return openEdit(id)}
    try{const r=await apiCall('/api/admin/mibricolaje/prepare-images',{method:'POST',body:JSON.stringify({title:p.title,sourceRef:p.sourceRef,sourceImages:p.sourceImages,count:3})});const fresh=r.images||[];if(!fresh.length)throw new Error('No se pudieron preparar imágenes.');const existing=Array.isArray(p.images)?p.images:[];const merged=[...fresh,...existing].slice(0,12);await apiCall('/api/admin/products/'+id,{method:'PUT',body:JSON.stringify({images:merged,image:merged[0]?.url||p.image||''})});await window.loadProducts();openEdit(id)}catch(e){alert(e.message||'No se pudieron preparar las imágenes.')}
  };
  function init(){css();if(!mountImporter()){setTimeout(init,120);return}setTimeout(()=>window.loadProducts&&window.loadProducts(),100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,120));else setTimeout(init,120);
})();
