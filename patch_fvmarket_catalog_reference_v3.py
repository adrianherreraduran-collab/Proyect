from pathlib import Path

path = Path("appsrc/public/admin.html")
text = path.read_text(encoding="utf-8")
marker = "FVM_CATALOG_REFERENCE_PARSER_V3"
if marker in text:
    print("Catalog reference parser v3 already applied")
    raise SystemExit(0)

injection = r'''<script>
/* FVM_CATALOG_REFERENCE_PARSER_V3 */
(function(){
  const REF_PREFIXES=['BT','FT','LH','DG','AM','AC','TK','PM','SW','VL'];
  const REF_RX=new RegExp('\\b(?:'+REF_PREFIXES.join('|')+')\\s*\\d{2,8}\\b','gi');
  let catalogPdfDoc=null,catalogPdfFile=null,catalogPageCache=new Map(),pdfJsPromise=null;

  function loadPdfJs(){
    if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
    if(pdfJsPromise)return pdfJsPromise;
    pdfJsPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload=()=>{try{
        window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      }catch(e){reject(e)}};
      s.onerror=()=>reject(new Error('No se pudo cargar el lector PDF.'));
      document.head.appendChild(s);
    });
    return pdfJsPromise;
  }
  function normRef(s=''){return String(s).replace(/\s/g,'').toUpperCase()}
  function parseMoney(s=''){
    let x=String(s).replace(/[€\s]/g,'').trim();
    if(!x)return 0;
    if(/^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/.test(x))x=x.replace(/\./g,'').replace(',','.');
    else if(x.includes(',')&&x.includes('.'))x=x.lastIndexOf(',')>x.lastIndexOf('.')?x.replace(/\./g,'').replace(',','.'):x.replace(/,/g,'');
    else if(x.includes(','))x=x.replace(',','.');
    else if(/^\d+\.\d{3}$/.test(x))x=x.replace('.','');
    const n=Number(x);return Number.isFinite(n)&&n>0&&n<50000?n:0;
  }
  function textPieces(item,viewport,pdfjs){
    const str=String(item.str||'');if(!str.trim())return [];
    const m=pdfjs.Util.transform(viewport.transform,item.transform);
    const totalW=Math.max(1,Math.abs(Number(item.width||0)*viewport.scale));
    const h=Math.max(7,Math.hypot(m[2]||0,m[3]||0)||Math.abs(Number(item.height||0)*viewport.scale)||8);
    const y=m[5]-h;
    const out=[];let mt;
    const rx=/\S+/g;
    while((mt=rx.exec(str))){
      const a=mt.index/Math.max(1,str.length),b=(mt.index+mt[0].length)/Math.max(1,str.length);
      const x=m[4]+totalW*a,w=Math.max(2,totalW*(b-a));
      out.push({text:mt[0],x0:x,y0:y,x1:x+w,y1:y+h,cx:x+w/2,cy:y+h/2,h,w});
    }
    return out;
  }
  function tokensFromTextContent(tc,viewport,pdfjs){
    const pieces=[];(tc.items||[]).forEach(it=>pieces.push(...textPieces(it,viewport,pdfjs)));
    const refs=[],prices=[];
    for(const p of pieces){
      const cleaned=String(p.text||'').replace(/[(),;:]/g,'');
      const rm=cleaned.match(REF_RX);
      if(rm)for(const r0 of rm){refs.push({...p,ref:normRef(r0)})}
      if(/€/.test(p.text)){
        const n=parseMoney(p.text);if(n)prices.push({...p,price:n});
      }
    }
    for(const e of pieces.filter(x=>x.text==='€')){
      const nums=pieces.filter(n=>/^\d{1,4}(?:[.,]\d{2})?$/.test(n.text)&&Math.abs(n.cy-e.cy)<10&&n.cx<e.cx&&e.cx-n.cx<90);
      if(nums.length){const n=nums.sort((a,b)=>b.cx-a.cx)[0],v=parseMoney(n.text+'€');if(v)prices.push({...n,x1:e.x1,cx:(n.x0+e.x1)/2,price:v})}
    }
    return {pieces,refs:dedupeRefs(refs),prices:dedupePrices(prices)};
  }
  function dedupeRefs(a){const seen=new Set();return a.filter(x=>{const k=x.ref+'|'+Math.round(x.cx)+'|'+Math.round(x.cy);if(seen.has(k))return false;seen.add(k);return true})}
  function dedupePrices(a){const seen=new Set();return a.filter(x=>{const k=x.price+'|'+Math.round(x.cx)+'|'+Math.round(x.cy);if(seen.has(k))return false;seen.add(k);return true})}
  function findPrice(ref,prices){
    let best=null,score=1e9;
    for(const p of prices){
      const dx=Math.abs(p.cx-ref.cx),dy=Math.abs(p.cy-ref.cy);
      if(dx>150||dy>115)continue;
      let s=dx*1.75+dy+(p.cy>ref.cy+8?34:0);
      if(s<score){score=s;best=p}
    }
    return best;
  }
  function noiseText(s=''){
    const x=String(s).trim();
    REF_RX.lastIndex=0;
    return !x||/^(?:€|Ref\.?|Precio|NOVE|DAD)$/i.test(x)||/Julio|Agosto|mibricolaje/i.test(x)||REF_RX.test(x);
  }
  function isAttribute(s=''){
    return /^(?:medidas?|alto|altura|ancho|largo|peso|potencia|capacidad|color(?:es)?|diámetro|serie|ref\.?|precio|ø|máx|min)\b/i.test(String(s).trim());
  }
  function lineGroups(pieces){
    const sorted=[...pieces].sort((a,b)=>a.cy-b.cy||a.x0-b.x0),rows=[];
    for(const p of sorted){
      let r=rows.find(x=>Math.abs(x.cy-p.cy)<6);
      if(!r){r={cy:p.cy,items:[]};rows.push(r)}
      r.items.push(p);r.cy=(r.cy*(r.items.length-1)+p.cy)/r.items.length;
    }
    return rows.map(r=>{
      r.items.sort((a,b)=>a.x0-b.x0);
      r.x0=Math.min(...r.items.map(x=>x.x0));r.x1=Math.max(...r.items.map(x=>x.x1));
      r.text=r.items.map(x=>x.text).join(' ').replace(/\s+/g,' ').trim();
      r.h=Math.max(...r.items.map(x=>x.h||8));return r;
    });
  }
  function productText(ref,allRefs,pieces,pageNo){
    const sameRow=allRefs.filter(r=>r!==ref&&Math.abs(r.cy-ref.cy)<14).sort((a,b)=>a.cx-b.cx);
    const left=sameRow.filter(r=>r.cx<ref.cx).pop(),right=sameRow.find(r=>r.cx>ref.cx);
    let x0=left?(left.cx+ref.cx)/2:Math.max(0,ref.cx-145);
    let x1=right?(right.cx+ref.cx)/2:ref.cx+145;
    if(x1-x0<55){x0=ref.cx-45;x1=ref.cx+45}
    const above=allRefs.filter(r=>r.cy<ref.cy-35&&Math.abs(r.cx-ref.cx)<Math.max(95,(x1-x0)*1.4))
      .sort((a,b)=>b.cy-a.cy)[0];
    const y0=above?Math.max(0,(above.cy+ref.cy)/2):Math.max(0,ref.cy-250),y1=ref.cy-4;
    const rows=lineGroups(pieces.filter(p=>p.cy>=y0&&p.cy<=y1&&p.cx>=x0-18&&p.cx<=x1+18));
    const cleanRows=rows.filter(r=>!noiseText(r.text)&&!/^[0-9]+$/.test(r.text));
    let heading='';
    const headingPool=cleanRows.filter(r=>!isAttribute(r.text)&&!/^\d+(?:[.,]\d+)?\s*(?:kg|g|cm|mm|m|w|v|hp|litros?|piezas?)\b/i.test(r.text)&&r.text.length>=4&&r.text.length<=85);
    if(headingPool.length){
      heading=[...headingPool].sort((a,b)=>(b.h-a.h)||((ref.cy-b.cy)-(ref.cy-a.cy)))[0].text;
    }
    const dim=cleanRows.map(r=>r.text).filter(x=>/\d+(?:[.,]\d+)?\s*[x×+]\s*\d+/i.test(x)||/\b(?:litros?|kg|w|v|hp|fuegos?|piezas?)\b/i.test(x)).slice(-2).join(' · ');
    const desc=[heading,...cleanRows.map(r=>r.text)].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ').slice(0,850);
    const title=(heading||('Producto '+ref.ref))+(dim&& !heading.includes(dim)?' · '+dim:'');
    return {title:title.slice(0,150),description:desc||('Referencia '+ref.ref+' del catálogo, página '+pageNo),bounds:{x0,y0,x1,y1:ref.cy+12}};
  }
  function matMul(a,b){
    return [
      a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
      a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
      a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]
    ];
  }
  function point(m,x,y){return [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]}
  async function imageBoxes(page,viewport,pdfjs){
    try{
      const op=await page.getOperatorList(),OPS=pdfjs.OPS;let ctm=[1,0,0,1,0,0],stack=[],boxes=[];
      for(let i=0;i<op.fnArray.length;i++){
        const fn=op.fnArray[i],args=op.argsArray[i]||[];
        if(fn===OPS.save){stack.push(ctm.slice());continue}
        if(fn===OPS.restore){ctm=stack.pop()||[1,0,0,1,0,0];continue}
        if(fn===OPS.transform){ctm=matMul(ctm,args);continue}
        if(fn===OPS.paintImageXObject||fn===OPS.paintInlineImageXObject||fn===OPS.paintJpegXObject){
          const m=matMul(viewport.transform,ctm),pts=[point(m,0,0),point(m,1,0),point(m,0,1),point(m,1,1)];
          const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
          const w=x1-x0,h=y1-y0,area=w*h;
          if(w>24&&h>24&&area>1200)boxes.push({x0,y0,x1,y1,cx:(x0+x1)/2,cy:(y0+y1)/2,w,h,area});
        }
      }
      const seen=new Set();return boxes.filter(b=>{const k=[b.x0,b.y0,b.x1,b.y1].map(v=>Math.round(v/3)*3).join('|');if(seen.has(k))return false;seen.add(k);return true});
    }catch(e){console.warn('FVMarket image boxes:',e);return []}
  }
  function bestImageBox(ref,boxes,viewport){
    let best=null,score=1e9;const pageArea=viewport.width*viewport.height;
    for(const b of boxes){
      if(b.area>pageArea*.48||b.area<1400)continue;
      const dx=ref.cx<b.x0?b.x0-ref.cx:(ref.cx>b.x1?ref.cx-b.x1:0);
      if(dx>170)continue;
      let gap=0;
      if(b.y1<ref.cy)gap=ref.cy-b.y1;
      else if(b.y0>ref.cy)gap=(b.y0-ref.cy)+150;
      if(gap>390)continue;
      let s=dx*1.7+gap+Math.abs(b.cx-ref.cx)*.12+(b.area>pageArea*.18?80:0);
      if(s<score){score=s;best=b}
    }
    return best;
  }
  function fallbackImageBox(c,viewport){
    const b=c._bounds||{},w=Math.max(100,(b.x1||c._ref.cx+130)-(b.x0||c._ref.cx-130));
    const x0=Math.max(0,(b.x0??c._ref.cx-w/2)-12),x1=Math.min(viewport.width,(b.x1??c._ref.cx+w/2)+12);
    const y0=Math.max(0,(b.y0??c._ref.cy-230)-15),y1=Math.min(viewport.height,Math.max(y0+90,c._ref.cy-36));
    return {x0,y0,x1,y1};
  }
  function pageSection(pieces,pageNo){
    const top=lineGroups(pieces.filter(x=>x.cy<95)).map(r=>r.text).join(' ');
    const m=top.match(/\b(Baños(?:\s*·\s*Ocio y deporte)?|Electrodoméstico industrial|Pequeño electrodoméstico|Jardín(?:\s*·\s*Ordenación)?|Camping|Agricultura|Herramienta eléctrica(?:\s*·\s*Maquinaria)?|Bricolaje(?:\s*·\s*Soldadura)?|Automoción|Ventilación)\b/i);
    return m?m[1]:'Catálogo pág. '+pageNo;
  }
  function fvCategory(section,title){
    const s=(section+' '+title).toLowerCase();
    if(/herramient|soldadura|automoci|taladro|sierra|martillo|soldador|compresor/.test(s))return'Herramientas';
    if(/baño|ducha|mampara|lavabo|inodoro|grifo|fregadero|electrodoméstico|ventilación|horno|nevera|cocina/.test(s))return'Reformas';
    if(/jardín|camping|agricultura|césped|barbacoa|carpa|sombrilla|sulfat|estanter/.test(s))return'Bricolaje';
    return typeof guessCat==='function'?guessCat(title):'Bricolaje';
  }
  async function parseCatalogPdf(file){
    const pdfjs=await loadPdfJs(),buf=await file.arrayBuffer();
    catalogPdfDoc=await pdfjs.getDocument({data:new Uint8Array(buf)}).promise;catalogPdfFile=file;catalogPageCache.clear();
    const all=[],seen=new Set();
    for(let pageNo=1;pageNo<=catalogPdfDoc.numPages;pageNo++){
      if(window.catalogMsg)catalogMsg.textContent='Leyendo referencias: página '+pageNo+' de '+catalogPdfDoc.numPages+'…';
      const page=await catalogPdfDoc.getPage(pageNo),viewport=page.getViewport({scale:1.25}),tc=await page.getTextContent({normalizeWhitespace:true});
      const t=tokensFromTextContent(tc,viewport,pdfjs),boxes=await imageBoxes(page,viewport,pdfjs),section=pageSection(t.pieces,pageNo);
      for(const ref of t.refs){
        if(seen.has(ref.ref))continue;seen.add(ref.ref);
        const price=findPrice(ref,t.prices);if(!price)continue;
        const tx=productText(ref,t.refs,t.pieces,pageNo),imgBox=bestImageBox(ref,boxes,viewport);
        const sourcePrice=Number(price.price)||0;if(!sourcePrice)continue;
        const margin=40,addedValue=+(sourcePrice*margin/100).toFixed(2),pricePvp=+(sourcePrice+addedValue).toFixed(2);
        all.push({
          title:tx.title,description:tx.description,sourceRef:ref.ref,sourcePrice,margin,addedValue,price:pricePvp,
          sourceProvider:'Catálogo Mi Bricolaje',sourceUrl:'',ref:'',published:false,featured:false,selected:false,
          category:fvCategory(section,tx.title),catalogPage:pageNo,catalogSection:section,
          _ref:ref,_bounds:tx.bounds,_imageBox:imgBox,_viewport:{width:viewport.width,height:viewport.height,scale:1.25}
        });
      }
    }
    return {pages:catalogPdfDoc.numPages,catalog:{name:file.name,defaultMargin:40},candidates:all};
  }
  async function renderPage(pageNo){
    if(catalogPageCache.has(pageNo))return catalogPageCache.get(pageNo);
    const page=await catalogPdfDoc.getPage(pageNo),viewport=page.getViewport({scale:1.25}),canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport}).promise;
    const value={page,viewport,canvas};catalogPageCache.set(pageNo,value);return value;
  }
  function cropCanvas(source,b){
    let x0=Math.max(0,Math.floor(b.x0)),y0=Math.max(0,Math.floor(b.y0)),x1=Math.min(source.width,Math.ceil(b.x1)),y1=Math.min(source.height,Math.ceil(b.y1));
    let w=Math.max(1,x1-x0),h=Math.max(1,y1-y0),scale=Math.min(1,520/Math.max(w,h));
    const out=document.createElement('canvas');out.width=Math.max(1,Math.round(w*scale));out.height=Math.max(1,Math.round(h*scale));
    out.getContext('2d',{alpha:false}).drawImage(source,x0,y0,w,h,0,0,out.width,out.height);
    return out.toDataURL('image/jpeg',.76);
  }
  async function ensureCatalogImage(c){
    if(c.image&&String(c.image).startsWith('data:image/'))return c.image;
    const r=await renderPage(c.catalogPage),box=c._imageBox||fallbackImageBox(c,r.viewport),url=cropCanvas(r.canvas,box);
    c.image=url;c.images=[{url,origin:'catalog-pdf',source:'Catálogo PDF · página '+c.catalogPage,license:'Imagen del catálogo de origen; revisar permiso de uso antes de publicar',author:''}];
    return url;
  }
  window.analyzeCatalogFile=async function(){
    const f=document.getElementById('catalogFile')?.files?.[0];
    if(!f){if(window.catalogMsg)catalogMsg.textContent='Selecciona primero un PDF.';return}
    try{
      if(window.catalogMsg)catalogMsg.textContent='Analizando únicamente referencias válidas…';
      const d=await parseCatalogPdf(f);
      catalogCandidates=(d.candidates||[]).map((c,i)=>({...c,idx:i,selected:false}));
      const secs=[...new Set(catalogCandidates.map(c=>c.catalogSection).filter(Boolean))];
      const sf=document.getElementById('catalogSectionFilter');
      if(sf)sf.innerHTML='<option value="">Todas las secciones</option>'+secs.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
      const sm=document.getElementById('catalogSummary');if(sm)sm.textContent=catalogCandidates.length+' referencias válidas detectadas · '+d.pages+' páginas';
      document.getElementById('catalogResult')?.classList.add('show');
      if(window.catalogMsg)catalogMsg.textContent='Listo. Solo se han creado productos a partir de referencias '+REF_PREFIXES.join(', ')+'. Nada está seleccionado.';
      if(typeof renderCatalogRows==='function')renderCatalogRows();
    }catch(e){console.error(e);if(window.catalogMsg)catalogMsg.textContent='No se pudo analizar el PDF: '+e.message}
  };
  window.importSelected=async function(){
    const idx=catalogCandidates.map((c,i)=>c.selected&&!c.imported?i:-1).filter(i=>i>=0);
    if(!idx.length){if(window.catalogMsg)catalogMsg.textContent='Selecciona al menos una referencia.';return}
    try{
      let done=0;
      for(let p=0;p<idx.length;p+=12){
        const group=idx.slice(p,p+12);
        if(window.catalogMsg)catalogMsg.textContent='Preparando imagen original '+(p+1)+'-'+Math.min(p+12,idx.length)+' de '+idx.length+'…';
        for(const i of group)await ensureCatalogImage(catalogCandidates[i]);
        const products=group.map(i=>{
          const c=catalogCandidates[i];
          const clean={...c,published:false,featured:false};
          delete clean._ref;delete clean._bounds;delete clean._imageBox;delete clean._viewport;delete clean.idx;delete clean.selected;delete clean.imported;delete clean.aiDone;
          return clean;
        });
        const r=await api('/api/admin/import-catalog-products',{method:'POST',body:JSON.stringify({products,published:false})});
        group.forEach(i=>catalogCandidates[i].imported=true);done+=Number(r.created||group.length);
      }
      if(window.catalogMsg)catalogMsg.textContent=done+' productos importados como borrador con referencia, precio, descripción e imagen del PDF.';
      if(typeof renderCatalogRows==='function')renderCatalogRows();
      if(typeof loadProducts==='function')await loadProducts();
    }catch(e){console.error(e);if(window.catalogMsg)catalogMsg.textContent='Error al importar: '+e.message}
  };
  const oldRender=window.renderCatalogRows;
  window.renderCatalogRows=function(){
    if(typeof oldRender==='function')oldRender();
    const rows=document.querySelectorAll('#catalogRows tr');
    rows.forEach((tr,ix)=>{
      const btn=tr.querySelector('button[onclick^="aiCandidate"]');
      if(btn&&!tr.querySelector('.fvmSourceImgBtn')){
        const m=btn.getAttribute('onclick')?.match(/\((\d+)\)/),i=m?Number(m[1]):-1;
        if(i>=0){
          const b=document.createElement('button');b.className='btn ghost fvmSourceImgBtn';b.style.marginTop='5px';b.textContent='🖼 Imagen PDF';
          b.onclick=async()=>{b.disabled=true;b.textContent='Cargando…';try{await ensureCatalogImage(catalogCandidates[i]);const w=window.open();if(w)w.document.write('<img style="max-width:100%;height:auto" src="'+catalogCandidates[i].image+'">')}finally{b.disabled=false;b.textContent='🖼 Imagen PDF'}};
          btn.parentElement.appendChild(b);
        }
      }
    });
  };
})();
</script>
'''
if "</body>" in text:
    text = text.replace("</body>", injection + "\n</body>", 1)
else:
    text += "\n" + injection + "\n"
path.write_text(text, encoding="utf-8")
print("Applied catalog reference parser v3")
