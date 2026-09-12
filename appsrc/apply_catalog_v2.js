// FVM_CATALOG_WORKFLOW_V2
// Idempotent runtime patch for FVMarket catalog selection/review flow.
const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
const adminPath = path.join(__dirname, 'public', 'admin.html');

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const a = source.indexOf(startMarker);
  const b = a >= 0 ? source.indexOf(endMarker, a) : -1;
  if (a < 0 || b < 0) throw new Error(`FVMarket catalog v2: no se encontró ${label}`);
  return source.slice(0, a) + replacement + source.slice(b);
}

function patchServer() {
  let src = fs.readFileSync(serverPath, 'utf8');
  if (src.includes('// FVM_CATALOG_PARSER_V2')) return;

  const parser = String.raw`// FVM_CATALOG_PARSER_V2
const FVM_CATALOG_DEFAULT_MARGIN = 40;
const FVM_CATALOG_REF_RX = /\b(?:FT|BT|LH|AT|DG|AM|AC|TK|PM|SW|VL|PACK)\s*\d{2,8}\b/gi;
const FVM_CATALOG_PRICE_RX = /\b(?:\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{1,5}(?:[.,]\d{2})?)\s*€/g;

function catalogPriceNumber(raw=''){
  let s=String(raw).replace(/€/g,'').replace(/\s/g,'').trim();
  if(!s)return 0;
  if(/^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/.test(s)){
    s=s.replace(/\./g,'').replace(',','.');
  }else if(s.includes(',')&&s.includes('.')){
    if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
  }else if(s.includes(',')){
    s=s.replace(',','.');
  }else if(/^\d+\.\d{3}$/.test(s)){
    s=s.replace('.','');
  }
  const n=Number(s);
  return Number.isFinite(n)&&n>0&&n<=50000?n:0;
}
function catalogRefs(line=''){
  return [...String(line).matchAll(new RegExp(FVM_CATALOG_REF_RX.source,'gi'))]
    .map(m=>String(m[0]).replace(/\s/g,'').toUpperCase());
}
function catalogPrices(line=''){
  return [...String(line).matchAll(new RegExp(FVM_CATALOG_PRICE_RX.source,'g'))]
    .map(m=>catalogPriceNumber(m[0])).filter(Boolean);
}
function cleanCatalogLine(line=''){
  return String(line).replace(/\s+/g,' ').replace(/\u0000/g,'').trim();
}
function catalogSection(lines=[],page=1){
  const joined=lines.slice(0,18).join(' · ');
  const sections=[
    'Herramienta eléctrica · Maquinaria','Jardín · Ordenación','Baños · Ocio y deporte',
    'Bricolaje · Soldadura','Electrodoméstico industrial','Pequeño electrodoméstico',
    'Herramienta eléctrica','Automoción','Agricultura','Ventilación','Camping','Baños','Jardín'
  ];
  const found=sections.find(x=>joined.toLowerCase().includes(x.toLowerCase()));
  return found||(page===1?'Destacados':'Otros');
}
function catalogCategory(section='',text=''){
  const s=String(section).toLowerCase(),t=String(text).toLowerCase();
  if(/herramient|maquinaria|soldadura|automoci/.test(s)||/taladro|sierra|martillo|gato hidrául|compresor|soldador/.test(t))return 'Herramientas';
  if(/baño/.test(s)||/mampara|ducha|lavabo|inodoro|grifo|fregadero/.test(t))return 'Reformas';
  if(/electrodoméstico|ventilación/.test(s)||/ventilador|cocina|horno|frigor|congelador|freidora/.test(t))return 'Reformas';
  if(/jardín|camping|agricultura|ocio|ordenación/.test(s)||/barbacoa|carpa|sombrilla|estanter|sulfat|césped/.test(t))return 'Bricolaje';
  return guessCategory(text);
}
function catalogVariantTokens(line=''){
  const s=String(line);
  const rx=/\(?\d+(?:[.,]\d+)?(?:\s*(?:x|×|\+|-)\s*\d+(?:[.,]\d+)?){1,2}\s*(?:cm|mm|m)?\)?/gi;
  return [...s.matchAll(rx)].map(m=>cleanCatalogLine(m[0])).filter(Boolean);
}
function catalogLineLooksLikeTitle(line=''){
  const s=cleanCatalogLine(line);
  if(!s||s.length<4||s.length>100)return false;
  if(/Julio\s*·?\s*Agosto|mibricolaje|NOVE\s*DAD|PRECIO|REF\b/i.test(s))return false;
  if(catalogRefs(s).length||catalogPrices(s).length)return false;
  if(/^(Medidas?|Alto|Altura|Ancho|Largo|Peso|Potencia|Velocidad|Capacidad|Color|Colores|Diámetro|Ø|Serie)\b/i.test(s))return false;
  if(/^\d+(?:[.,]\d+)?\s*(?:kg|g|cm|mm|m|W|V|Hp|litros?|piezas?|toneladas?)\b/i.test(s))return false;
  if(/[:;]/.test(s)&&s.split(/\s+/).length>10)return false;
  const letters=(s.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)||[]).length;
  return letters>=4;
}
function catalogBaseTitle(lines=[],idx=0,section=''){
  let fallback='';
  for(let j=idx-1;j>=Math.max(0,idx-14);j--){
    const s=cleanCatalogLine(lines[j]);
    if(!s)continue;
    if(!fallback&&catalogLineLooksLikeTitle(s))fallback=s;
    if(catalogLineLooksLikeTitle(s)&&!/^(Serie|Color|Medidas?)/i.test(s)){
      const words=s.split(/\s+/).length;
      if(words<=12)return s;
    }
  }
  return fallback||section||'Producto';
}
function catalogNearbyDescription(lines=[],idx=0){
  const parts=[];
  for(let j=Math.max(0,idx-5);j<=Math.min(lines.length-1,idx+3);j++){
    const s=cleanCatalogLine(lines[j]);
    if(!s||catalogRefs(s).length||catalogPrices(s).length)continue;
    if(/Julio\s*·?\s*Agosto|NOVE\s*DAD|mibricolaje/i.test(s))continue;
    if(s.length>=12&&s.length<=210)parts.push(s);
  }
  return [...new Set(parts)].join(' · ').slice(0,650);
}
async function catalogPageRender(pageData){
  const content=await pageData.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false});
  const rows=[];
  for(const item of content.items||[]){
    const text=cleanCatalogLine(item.str||'');
    if(!text)continue;
    const tr=item.transform||[];const x=Number(tr[4]||0),y=Number(tr[5]||0);
    let row=rows.find(r=>Math.abs(r.y-y)<2.4);
    if(!row){row={y,parts:[]};rows.push(row)}
    row.parts.push({x,text});
  }
  rows.sort((a,b)=>b.y-a.y);
  return rows.map(r=>r.parts.sort((a,b)=>a.x-b.x).map(p=>p.text).join(' ')).join('\n');
}
function catalogCandidatesFromPages(pages=[]){
  const out=[],seen=new Set();
  for(const pg of pages){
    const lines=(pg.lines||[]).map(cleanCatalogLine).filter(Boolean);
    const section=catalogSection(lines,pg.page);
    for(let i=0;i<lines.length;i++){
      const refs=catalogRefs(lines[i]);
      if(!refs.length)continue;
      let priceLine=i,prices=catalogPrices(lines[i]);
      if(!prices.length){
        for(let j=i-1;j>=Math.max(0,i-4);j--){
          const p=catalogPrices(lines[j]);
          if(p.length){priceLine=j;prices=p;break}
        }
      }
      if(!prices.length)continue;
      let variants=[];
      for(let j=priceLine-1;j>=Math.max(0,priceLine-3);j--){
        const v=catalogVariantTokens(lines[j]);
        if(v.length){variants=v;break}
      }
      const baseTitle=catalogBaseTitle(lines,Math.min(i,priceLine),section);
      refs.forEach((sourceRef,k)=>{
        if(seen.has(sourceRef))return;
        const sourcePrice=prices.length===refs.length?prices[k]:(prices[k]||prices[prices.length-1]||0);
        if(!sourcePrice)return;
        const variant=(variants.length===refs.length?variants[k]:(variants.length===1?variants[0]:''))||'';
        let title=cleanProductTitle([baseTitle,variant].filter(Boolean).join(' · '));
        title=title.replace(/\s*·\s*·\s*/g,' · ').slice(0,150);
        if(!title||/^producto$/i.test(title))title='Producto '+sourceRef;
        const category=catalogCategory(section,title);
        const margin=FVM_CATALOG_DEFAULT_MARGIN;
        const addedValue=+(sourcePrice*margin/100).toFixed(2);
        const price=+(sourcePrice+addedValue).toFixed(2);
        out.push({
          title,sourcePrice,margin,addedValue,price,category,
          sourceRef,sourceProvider:'Mi Bricolaje',sourceUrl:'',sourceEan:'',
          catalogPage:pg.page,catalogSection:section,catalogVariant:variant,
          description:catalogNearbyDescription(lines,Math.min(i,priceLine)),
          ref:'',stock:'bajo_pedido',image:'',images:[],
          imageSource:'',imageLicense:'',imageAuthor:'',
          published:false,featured:false,reviewStatus:'borrador'
        });
        seen.add(sourceRef);
      });
      if(out.length>=450)break;
    }
  }
  return out;
}
async function parseCatalogBuffer(buffer,name='catalogo.pdf'){
  let pageNo=0;
  const data=await pdfParse(buffer,{pagerender:async pageData=>{
    pageNo+=1;
    return '[[FVM_PAGE:'+pageNo+']]\n'+await catalogPageRender(pageData);
  }});
  const chunks=String(data.text||'').split(/\[\[FVM_PAGE:(\d+)\]\]/);
  const pages=[];
  for(let i=1;i<chunks.length;i+=2){
    const page=Number(chunks[i])||pages.length+1;
    pages.push({page,lines:String(chunks[i+1]||'').split(/\r?\n/)});
  }
  if(!pages.length){
    pages.push({page:1,lines:String(data.text||'').split(/\r?\n/)});
  }
  const candidates=catalogCandidatesFromPages(pages);
  const sections=[...new Set(candidates.map(x=>x.catalogSection).filter(Boolean))];
  return {
    catalog:{name:String(name||'catalogo.pdf'),provider:'Mi Bricolaje',pages:data.numpages||pages.length,defaultMargin:FVM_CATALOG_DEFAULT_MARGIN},
    pages:data.numpages||pages.length,sections,candidates
  };
}
`;

  src = replaceBetween(
    src,
    'function catalogCandidatesFromText(text){',
    '\n\nfunction isUnsafeUrl',
    parser,
    'el parser de catálogo'
  );

  src = src.replace(
    'const result=await parseCatalogBuffer(req.file.buffer);res.json(result)',
    'const result=await parseCatalogBuffer(req.file.buffer,req.file.originalname);res.json(result)'
  );
  src = src.replace(
    'const result=await parseCatalogBuffer(Buffer.from(r.data));res.json(result)',
    "const result=await parseCatalogBuffer(Buffer.from(r.data),String(url).split('/').pop()||'catalogo.pdf');res.json(result)"
  );

  const importRoute = String.raw`app.post('/api/admin/import-catalog-products',admin,(req,res)=>{
  const items=Array.isArray(req.body.products)?req.body.products.slice(0,450):[];
  if(!items.length)return res.status(400).json({error:'No hay productos seleccionados'});
  const d=read();let created=0,skipped=0;
  for(const item of items){
    const title=String(item.title||'').trim();if(!title)continue;
    const sourceRef=String(item.sourceRef||'').trim().toUpperCase();
    if(sourceRef&&d.products.some(p=>String(p.sourceRef||'').trim().toUpperCase()===sourceRef)){skipped++;continue}
    const category=String(item.category||guessCategory(title));
    const sourcePrice=Number(item.sourcePrice)||0;
    const margin=Math.max(0,Number(item.margin)||0);
    const addedValue=item.addedValue!=null?Math.max(0,Number(item.addedValue)||0):+(sourcePrice*margin/100).toFixed(2);
    const price=Number(item.price)||+(sourcePrice+addedValue).toFixed(2);
    const p={
      id:id('prd'),title,category,ref:nextProductRef(d,title,category),price,stock:'bajo_pedido',
      image:String(item.image||''),imageSource:String(item.imageSource||''),imageLicense:String(item.imageLicense||''),imageAuthor:String(item.imageAuthor||''),
      sourceUrl:String(item.sourceUrl||''),sourceProvider:String(item.sourceProvider||'Mi Bricolaje'),sourceRef,sourceEan:String(item.sourceEan||''),
      description:String(item.description||''),published:false,featured:!!item.featured,
      sourcePrice,addedValue,margin,
      catalogPage:Number(item.catalogPage)||0,catalogSection:String(item.catalogSection||''),catalogVariant:String(item.catalogVariant||''),
      catalogName:String(item.catalogName||req.body.catalogName||''),reviewStatus:'borrador',
      importedAt:new Date().toISOString()
    };
    p.images=normalizeProductImages(item.images,p.image);
    if(p.images[0])p.image=p.images[0].url;
    d.products.unshift(p);created++;
  }
  save(d);res.json({created,skipped});
});`;

  src = replaceBetween(
    src,
    "app.post('/api/admin/import-catalog-products'",
    '\n\nfunction numberPrice',
    importRoute,
    'la ruta de importación de productos'
  );

  fs.writeFileSync(serverPath, src);
}

function patchAdmin() {
  let src = fs.readFileSync(adminPath, 'utf8');
  if (src.includes('FVM_CATALOG_WORKFLOW_UI_V2')) return;

  const anchor = '<section class="view active" id="view-catalog"><div class="grid">\n';
  if (!src.includes(anchor)) throw new Error('FVMarket catalog v2: no se encontró la vista de catálogo');

  const card = String.raw`<!-- FVM_CATALOG_WORKFLOW_UI_V2 -->
<div class="card wide fvmCatalogV2">
  <div class="bar">
    <div><h2 style="margin:0">Importar catálogo PDF</h2><p class="sub" style="margin:5px 0 0">Analiza el catálogo, selecciona solo los artículos que quieras vender y pásalos a revisión antes de publicar.</p></div>
    <span class="badge" id="catalogSelectedCount">0 seleccionados</span>
  </div>
  <div class="catalogSteps">
    <div class="step"><b>1 · Analizar</b>Sube el PDF. FVMarket detecta referencia, precio, página y sección.</div>
    <div class="step"><b>2 · Seleccionar</b>Filtra, marca productos y ajusta margen/PVP si hace falta.</div>
    <div class="step"><b>3 · Revisar</b>Los seleccionados se guardan como borradores. Añade/revisa imágenes y publica desde Productos.</div>
  </div>
  <div class="catalogDrop">
    <b>Catálogo PDF</b>
    <span>Para este formato se reconocen referencias como BT, FT, LH, DG, AM, AC, TK, PM, SW, VL y PACK, incluso en tablas de variantes.</span>
    <div class="bar" style="justify-content:center;margin-top:12px">
      <input id="catalogFile" type="file" accept="application/pdf,.pdf" style="max-width:420px">
      <button class="btn navy" onclick="analyzeCatalogFile()">Analizar catálogo</button>
    </div>
    <div class="msg" id="catalogMsg"></div>
  </div>
  <div id="catalogResult" class="catalogResult">
    <div class="catalogTools">
      <b id="catalogSummary"></b>
      <input id="catalogSearch" placeholder="Buscar producto o referencia…" oninput="renderCatalogRows()" style="min-width:230px;padding:9px;border:1px solid var(--line);border-radius:8px">
      <select id="catalogSectionFilter" onchange="renderCatalogRows()" style="padding:9px;border:1px solid var(--line);border-radius:8px"><option value="">Todas las secciones</option></select>
      <select id="catalogSelectionFilter" onchange="renderCatalogRows()" style="padding:9px;border:1px solid var(--line);border-radius:8px"><option value="">Todos</option><option value="selected">Seleccionados</option><option value="pending">No seleccionados</option></select>
      <button class="btn ghost" onclick="selectVisibleCandidates(true)">Seleccionar visibles</button>
      <button class="btn ghost" onclick="selectVisibleCandidates(false)">Quitar visibles</button>
    </div>
    <div class="catalogTable">
      <table>
        <thead><tr><th>✓</th><th>Producto detectado</th><th>Ref. origen</th><th>Pág.</th><th>Sección</th><th>Categoría FVMarket</th><th>Origen</th><th>Margen</th><th>PVP</th><th>Revisión</th></tr></thead>
        <tbody id="catalogRows"></tbody>
      </table>
    </div>
    <div class="bar" style="margin-top:12px">
      <button class="btn ghost" onclick="aiSelected()">✨ Mejorar seleccionados</button>
      <button class="btn navy" onclick="importSelected(false)">Importar seleccionados como borrador</button>
      <button class="btn ghost" onclick="openProductsTab()">Ver borradores</button>
      <span class="msg">No se publica nada directamente desde el catálogo.</span>
    </div>
  </div>
</div>
`;
  src = src.replace(anchor, anchor + card);

  const extra = String.raw`
<style>
/* FVM_CATALOG_WORKFLOW_UI_V2 */
.fvmCatalogV2 .catalogDrop{margin-top:12px}
.fvmCatalogV2 .catalogTable{max-height:610px}
.fvmCatalogV2 .catalogTable th{white-space:nowrap}
.fvmCatalogV2 .catalogTable td{min-width:88px}
.fvmCatalogV2 .catalogTable td:nth-child(2){min-width:280px}
.fvmCatalogV2 .catalogTable td:nth-child(5){min-width:150px}
.fvmCatalogV2 .catalogTable select{max-width:155px}
.fvmCatalogV2 .catalogImported{background:#f2f8ed}
.fvmCatalogV2 .pageBadge{display:inline-block;min-width:28px;text-align:center;border-radius:999px;background:#eef4f8;padding:4px 7px;font-weight:900;color:var(--navy)}
@media(max-width:760px){.fvmCatalogV2 .catalogTools input,.fvmCatalogV2 .catalogTools select{width:100%;max-width:none!important}.fvmCatalogV2 .catalogSteps{grid-template-columns:1fr}}
</style>
<script>
(function(){
  const FVM_CATS_V2=['Construcción','Bricolaje','Herramientas','Reformas'];
  function el(id){return document.getElementById(id)}
  window.catalogVisibleIndexes=function(){
    const q=String(el('catalogSearch')?.value||'').trim().toLowerCase();
    const section=String(el('catalogSectionFilter')?.value||'');
    const sel=String(el('catalogSelectionFilter')?.value||'');
    return catalogCandidates.map((c,i)=>({c,i})).filter(({c})=>{
      const hay=[c.title,c.sourceRef,c.catalogSection,c.catalogVariant].filter(Boolean).join(' ').toLowerCase();
      if(q&&!hay.includes(q))return false;
      if(section&&c.catalogSection!==section)return false;
      if(sel==='selected'&&!c.selected)return false;
      if(sel==='pending'&&c.selected)return false;
      return true;
    }).map(x=>x.i);
  };
  window.updateCatalogSelectedCount=function(){
    const n=catalogCandidates.filter(c=>c.selected).length;
    const badge=el('catalogSelectedCount');if(badge)badge.textContent=n+' seleccionado'+(n===1?'':'s');
  };
  window.showCatalog=function(d){
    const defaultMargin=Number(d?.catalog?.defaultMargin??40);
    catalogCandidates=(d.candidates||[]).map((c,i)=>{
      const base=Math.max(0,Number(c.sourcePrice)||0);
      const margin=c.margin==null?defaultMargin:Math.max(0,Number(c.margin)||0);
      const added=c.addedValue==null?base*margin/100:Math.max(0,Number(c.addedValue)||0);
      const price=c.price==null?base+added:Math.max(0,Number(c.price)||0);
      return {...c,idx:i,selected:false,margin:+margin.toFixed(2),addedValue:+added.toFixed(2),price:+price.toFixed(2),category:c.category||guessCat(c.title||''),catalogName:d?.catalog?.name||''};
    });
    const secs=[...new Set(catalogCandidates.map(c=>c.catalogSection).filter(Boolean))];
    const sf=el('catalogSectionFilter');
    if(sf)sf.innerHTML='<option value="">Todas las secciones</option>'+secs.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
    const summary=el('catalogSummary');
    if(summary)summary.textContent=catalogCandidates.length+' productos detectados · '+(d.pages||d?.catalog?.pages||0)+' páginas';
    el('catalogResult')?.classList.add('show');
    if(el('catalogMsg'))el('catalogMsg').textContent=catalogCandidates.length?'Análisis terminado. Nada está seleccionado todavía.':'No se pudieron asociar referencias y precios en este PDF.';
    renderCatalogRows();
  };
  window.renderCatalogRows=function(){
    const body=el('catalogRows');if(!body)return;
    const visible=catalogVisibleIndexes();
    body.innerHTML=visible.map(i=>{
      const c=catalogCandidates[i];
      if(c.addedValue==null)c.addedValue=Math.max(0,(Number(c.price)||0)-(Number(c.sourcePrice)||0));
      const opts=FVM_CATS_V2.map(x=>'<option '+(x===c.category?'selected':'')+'>'+x+'</option>').join('');
      const review=c.imported?'<span class="badge">Importado</span>':(c.aiDone?'<span class="badge">Revisado IA</span>':'<span class="msg">Pendiente</span>');
      return '<tr class="'+(c.imported?'catalogImported':'')+'">'+
        '<td><input class="candidateCheck" type="checkbox" '+(c.selected?'checked':'')+' onchange="catalogCandidates['+i+'].selected=this.checked;updateCatalogSelectedCount()"></td>'+
        '<td><input class="miniTitle" value="'+esc(c.title||'')+'" onchange="catalogCandidates['+i+'].title=this.value;catalogCandidates['+i+'].aiDone=false"></td>'+
        '<td><b>'+esc(c.sourceRef||'—')+'</b>'+(c.catalogVariant?'<div class="aiMeta">'+esc(c.catalogVariant)+'</div>':'')+'</td>'+
        '<td><span class="pageBadge">'+esc(c.catalogPage||'—')+'</span></td>'+
        '<td>'+esc(c.catalogSection||'Otros')+'</td>'+
        '<td><select onchange="catalogCandidates['+i+'].category=this.value;catalogCandidates['+i+'].aiDone=false">'+opts+'</select></td>'+
        '<td>'+Number(c.sourcePrice||0).toFixed(2)+' €</td>'+
        '<td><input id="candMargin'+i+'" class="miniInput" type="number" min="0" step="0.1" value="'+Number(c.margin||0).toFixed(2)+'" oninput="setCandidateMargin('+i+',this.value)"></td>'+
        '<td><input id="candPrice'+i+'" class="miniInput" type="number" min="0" step="0.01" value="'+Number(c.price||0).toFixed(2)+'" oninput="setCandidatePvp('+i+',this.value)"></td>'+
        '<td><button class="btn ghost" onclick="aiCandidate('+i+')">✨ Mejorar</button><div style="margin-top:5px">'+review+'</div></td>'+
      '</tr>';
    }).join('')||'<tr><td colspan="10" class="empty">No hay productos que coincidan con estos filtros.</td></tr>';
    updateCatalogSelectedCount();
  };
  window.selectVisibleCandidates=function(v){catalogVisibleIndexes().forEach(i=>catalogCandidates[i].selected=!!v);renderCatalogRows()};
  window.selectAllCandidates=function(v){catalogCandidates.forEach(c=>c.selected=!!v);renderCatalogRows()};
  window.importSelected=async function(){
    const idx=catalogCandidates.map((c,i)=>c.selected&&!c.imported?i:-1).filter(i=>i>=0);
    if(!idx.length){if(el('catalogMsg'))el('catalogMsg').textContent='Selecciona al menos un producto que no haya sido importado.';return}
    try{
      const selected=idx.map(i=>({...catalogCandidates[i],published:false,featured:false,reviewStatus:'borrador'}));
      if(el('catalogMsg'))el('catalogMsg').textContent='Importando '+selected.length+' productos como borradores...';
      const r=await api('/api/admin/import-catalog-products',{method:'POST',body:JSON.stringify({products:selected,published:false,catalogName:selected[0]?.catalogName||''})});
      idx.forEach(i=>{catalogCandidates[i].selected=false;catalogCandidates[i].imported=true});
      if(el('catalogMsg'))el('catalogMsg').textContent=(r.created||0)+' borradores creados'+(r.skipped?' · '+r.skipped+' omitidos por referencia ya existente':'')+'. Revísalos en Productos antes de publicar.';
      renderCatalogRows();await loadProducts();
    }catch(e){if(el('catalogMsg'))el('catalogMsg').textContent=e.message}
  };
  window.openProductsTab=function(){
    const b=[...document.querySelectorAll('.tab')].find(x=>x.dataset.view==='products');if(b)b.click();
  };
})();
</script>
`;
  const bodyPos = src.lastIndexOf('</body>');
  if (bodyPos < 0) throw new Error('FVMarket catalog v2: no se encontró </body>');
  src = src.slice(0, bodyPos) + extra + src.slice(bodyPos);
  fs.writeFileSync(adminPath, src);
}

patchServer();
patchAdmin();
console.log('FVMarket catalog workflow v2 aplicado');
