from pathlib import Path

p = Path('appsrc/public/admin.html')
s = p.read_text(encoding='utf-8')
MARK = 'FVM_CATALOG_REFERENCE_PARSER_V4'
if MARK in s:
    print('v4 already applied')
    raise SystemExit(0)

js = r'''
<script>
/* FVM_CATALOG_REFERENCE_PARSER_V4 */
(function(){
  const PREFIXES=['BT','FT','LH','DG','AM','AC','TK','PM','SW','VL'];
  const REF_RE=new RegExp('^(?:'+PREFIXES.join('|')+')\\d{2,8}$','i');
  let pdfDoc4=null,pageCache4=new Map(),pdfJs4Promise=null;

  function getPdfJs4(){
    if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
    if(pdfJs4Promise)return pdfJs4Promise;
    pdfJs4Promise=new Promise((resolve,reject)=>{
      const sc=document.createElement('script');
      sc.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      sc.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';resolve(window.pdfjsLib)};
      sc.onerror=()=>reject(new Error('No se pudo cargar PDF.js'));
      document.head.appendChild(sc);
    });
    return pdfJs4Promise;
  }
  function money4(s=''){
    let x=String(s).replace(/[€\\s]/g,'').trim(); if(!x)return 0;
    if(/^\\d{1,3}(?:\\.\\d{3})+(?:,\\d{2})?$/.test(x))x=x.replace(/\\./g,'').replace(',','.');
    else if(x.includes(',')&&x.includes('.'))x=x.lastIndexOf(',')>x.lastIndexOf('.')?x.replace(/\\./g,'').replace(',','.'):x.replace(/,/g,'');
    else if(x.includes(','))x=x.replace(',','.');
    else if(/^\\d+\\.\\d{3}$/.test(x))x=x.replace('.','');
    const n=Number(x);return Number.isFinite(n)&&n>0&&n<50000?n:0;
  }
  function recFromItem(it,viewport,pdfjs){
    const text=String(it.str||'').trim(); if(!text)return null;
    const m=pdfjs.Util.transform(viewport.transform,it.transform);
    const w=Math.max(1,Math.abs(Number(it.width||0)*viewport.scale));
    const h=Math.max(6,Math.hypot(m[2]||0,m[3]||0)||Math.abs(Number(it.height||0)*viewport.scale)||8);
    const x0=m[4],y0=m[5]-h;
    return {text,x0,y0,x1:x0+w,y1:y0+h,cx:x0+w/2,cy:y0+h/2,w,h,fontName:it.fontName||''};
  }
  function piecesFromRec(r){
    const out=[];let m;const rx=/\\S+/g;
    while((m=rx.exec(r.text))){
      const a=m.index/Math.max(1,r.text.length),b=(m.index+m[0].length)/Math.max(1,r.text.length);
      const x0=r.x0+r.w*a,x1=r.x0+r.w*b;
      out.push({...r,text:m[0],x0,x1,cx:(x0+x1)/2,w:x1-x0});
    }
    return out;
  }
  function pageText4(tc,viewport,pdfjs){
    const records=[],pieces=[];
    for(const it of tc.items||[]){const r=recFromItem(it,viewport,pdfjs);if(r){records.push(r);pieces.push(...piecesFromRec(r))}}
    const refs=[];
    for(const p of pieces){const t=String(p.text).replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi,'').replace(/\\s/g,'').toUpperCase();if(REF_RE.test(t))refs.push({...p,ref:t})}
    const prices=[];
    for(const p of pieces){if(/€/.test(p.text)){const v=money4(p.text);if(v)prices.push({...p,price:v})}}
    const euros=pieces.filter(p=>p.text==='€');
    const nums=pieces.filter(p=>/^\\d{1,4}(?:[.,]\\d{1,2})?$/.test(p.text));
    for(const e of euros){const c=nums.filter(n=>Math.abs(n.cy-e.cy)<11&&n.cx<e.cx&&e.x0-n.x1<80);if(c.length){const n=c.sort((a,b)=>b.cx-a.cx)[0],v=money4(n.text+'€');if(v)prices.push({...n,x1:e.x1,cx:(n.x0+e.x1)/2,price:v})}}
    return {records,pieces,refs:dedupe4(refs,x=>x.ref+'|'+Math.round(x.cx)+'|'+Math.round(x.cy)),prices:dedupe4(prices,x=>x.price+'|'+Math.round(x.cx)+'|'+Math.round(x.cy))};
  }
  function dedupe4(a,key){const seen=new Set();return a.filter(x=>{const k=key(x);if(seen.has(k))return false;seen.add(k);return true})}
  function colInfo4(ref,allRefs,W){
    const cw=W/8,col=Math.max(0,Math.min(7,Math.floor(ref.cx/cw)));let x0=col*cw,x1=(col+1)*cw;
    const same=allRefs.filter(r=>r!==ref&&Math.abs(r.cy-ref.cy)<18&&Math.floor(r.cx/cw)===col).sort((a,b)=>a.cx-b.cx);
    const left=same.filter(r=>r.cx<ref.cx).pop(),right=same.find(r=>r.cx>ref.cx);
    let sx0=left?(left.cx+ref.cx)/2:x0,sx1=right?(right.cx+ref.cx)/2:x1;
    if(sx1-sx0<28){sx0=Math.max(x0,ref.cx-22);sx1=Math.min(x1,ref.cx+22)}
    return {cw,col,x0,x1,sx0,sx1};
  }
  function priceFor4(ref,prices,allRefs,W){
    const c=colInfo4(ref,allRefs,W);
    let pool=prices.filter(p=>p.cx>=c.x0-8&&p.cx<=c.x1+8&&Math.abs(p.cy-ref.cy)<180);
    const sl=pool.filter(p=>p.cx>=c.sx0-12&&p.cx<=c.sx1+12);if(sl.length)pool=sl;
    if(!pool.length)pool=prices.filter(p=>Math.abs(p.cx-ref.cx)<180&&Math.abs(p.cy-ref.cy)<180);
    if(!pool.length)return null;
    return pool.sort((a,b)=>scorePrice4(a,ref)-scorePrice4(b,ref))[0];
  }
  function scorePrice4(p,r){return Math.abs(p.cx-r.cx)*2+Math.abs(p.cy-r.cy)+(p.cy>r.cy+14?90:0)}
  function rows4(records){
    const rows=[];
    for(const r of [...records].sort((a,b)=>a.cy-b.cy||a.x0-b.x0)){
      let row=rows.find(q=>Math.abs(q.cy-r.cy)<5.5);
      if(!row){row={cy:r.cy,items:[]};rows.push(row)} row.items.push(r);
    }
    return rows.map(row=>{row.items.sort((a,b)=>a.x0-b.x0);row.x0=Math.min(...row.items.map(x=>x.x0));row.x1=Math.max(...row.items.map(x=>x.x1));row.h=Math.max(...row.items.map(x=>x.h));row.text=row.items.map(x=>x.text).join(' ').replace(/\\s+/g,' ').trim();return row});
  }
  function noisy4(s=''){
    const x=String(s).trim();if(!x)return true;
    if(/^(?:NOVE|DAD|REF\\.?|PRECIO|€)$/i.test(x)||/Julio|Agosto|mibricolaje/i.test(x))return true;
    const z=x.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi,'').replace(/\\s/g,'').toUpperCase();return REF_RE.test(z);
  }
  function attr4(s=''){return /^(?:medidas?|alto|altura|ancho|largo|peso|potencia|capacidad|color(?:es)?|diámetro|serie|ref\\.?|precio|ø|max|min|rango)\\b/i.test(String(s).trim())}
  function headingOk4(s=''){
    const x=String(s).trim();if(noisy4(x)||x.length<4||x.length>100||attr4(x))return false;
    if(/^[\\d(].*(?:cm|mm|kg|w|v|hp|litros?|piezas?|toneladas?|€)/i.test(x))return false;
    if(!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3}/.test(x))return false;
    return true;
  }
  function textFor4(ref,allRefs,records,pieces,W,pageNo){
    const c=colInfo4(ref,allRefs,W),allRows=rows4(records);
    const pool=allRows.filter(r=>r.cy<ref.cy-3&&ref.cy-r.cy<360&&Math.max(0,Math.min(r.x1,c.x1)-Math.max(r.x0,c.x0))>14&&headingOk4(r.text));
    let seed=pool.sort((a,b)=>((ref.cy-a.cy)-a.h*5)-((ref.cy-b.cy)-b.h*5))[0]||null;
    let title='Producto '+ref.ref,titleY=Math.max(0,ref.cy-220);
    if(seed){
      const linked=allRows.filter(r=>Math.abs(r.cy-seed.cy)<=18&&r.x1>=c.x0&&r.x0<=c.x1&&!noisy4(r.text)&&!/[€]/.test(r.text)).sort((a,b)=>a.cy-b.cy||a.x0-b.x0);
      let tt=linked.map(r=>r.text).join(' ').replace(/\\s+/g,' ').trim();
      if(tt.length>120)tt=seed.text; title=tt||seed.text;titleY=Math.min(...linked.map(r=>r.cy),seed.cy);
    }
    const local=pieces.filter(p=>p.cy>=Math.max(0,titleY-8)&&p.cy<=ref.cy+70&&p.cx>=c.sx0-5&&p.cx<=c.sx1+5&&!noisy4(p.text)&&!/[€]/.test(p.text));
    const localRows=rows4(local.map(p=>({...p,text:p.text}))).map(r=>r.text).filter(x=>x&&!/^\\d+(?:[.,]\\d+)?$/.test(x));
    const general=allRows.filter(r=>r.cy>=Math.max(0,titleY-5)&&r.cy<=ref.cy+55&&r.x0>=c.x0-5&&r.x1<=c.x1+5&&!noisy4(r.text)&&!/[€]/.test(r.text)&&r.text.length<150).map(r=>r.text);
    const desc=[title,...general,...localRows].map(x=>String(x).trim()).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ').slice(0,900);
    return {title:title.slice(0,150),description:desc||('Referencia '+ref.ref+' · página '+pageNo),bounds:{x0:c.x0,x1:c.x1,sx0:c.sx0,sx1:c.sx1,y0:Math.max(0,titleY-20),y1:ref.cy+20}};
  }
  function section4(records,pageNo){const t=records.filter(r=>r.cy<105).map(r=>r.text).join(' ');const m=t.match(/(Baños(?:\\s*·\\s*Ocio y deporte)?|Electrodoméstico industrial|Pequeño electrodoméstico|Jardín(?:\\s*·\\s*Ordenación)?|Camping|Agricultura|Herramienta eléctrica(?:\\s*·\\s*Maquinaria)?|Bricolaje(?:\\s*·\\s*Soldadura)?|Automoción|Ventilación)/i);return m?m[1]:'Catálogo pág. '+pageNo}
  function cat4(section,title){const s=(section+' '+title).toLowerCase();if(/herramient|soldadura|automoci|taladro|sierra|martillo|soldador|compresor|gato|neumát/.test(s))return'Herramientas';if(/baño|ducha|mampara|lavabo|inodoro|grifo|fregadero|electrodoméstico|ventilación|horno|nevera|cocina/.test(s))return'Reformas';if(/jardín|camping|agricultura|césped|barbacoa|carpa|sombrilla|sulfat|estanter/.test(s))return'Bricolaje';return typeof guessCat==='function'?guessCat(title):'Bricolaje'}

  function mm4(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]}
  function pt4(m,x,y){return[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]}
  async function imageBoxes4(page,viewport,pdfjs){
    try{const op=await page.getOperatorList(),OPS=pdfjs.OPS;let ctm=[1,0,0,1,0,0],stack=[],out=[];
      for(let i=0;i<op.fnArray.length;i++){const fn=op.fnArray[i],a=op.argsArray[i]||[];if(fn===OPS.save){stack.push(ctm.slice());continue}if(fn===OPS.restore){ctm=stack.pop()||[1,0,0,1,0,0];continue}if(fn===OPS.transform){ctm=mm4(ctm,a);continue}if(fn===OPS.paintImageXObject||fn===OPS.paintInlineImageXObject||fn===OPS.paintJpegXObject){const m=mm4(viewport.transform,ctm),q=[pt4(m,0,0),pt4(m,1,0),pt4(m,0,1),pt4(m,1,1)],xs=q.map(x=>x[0]),ys=q.map(x=>x[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),w=x1-x0,h=y1-y0,area=w*h;if(w>22&&h>22&&area>900)out.push({x0,x1,y0,y1,cx:(x0+x1)/2,cy:(y0+y1)/2,w,h,area})}}
      return dedupe4(out,b=>[b.x0,b.y0,b.x1,b.y1].map(v=>Math.round(v/3)*3).join('|'));
    }catch(e){console.warn('imageBoxes4',e);return[]}
  }
  function imageFor4(ref,boxes,bounds,viewport){
    const pageArea=viewport.width*viewport.height,cellX0=bounds.x0,cellX1=bounds.x1;let pool=boxes.filter(b=>b.area<pageArea*.42&&b.area>900&&b.x1>cellX0-15&&b.x0<cellX1+15&&b.y0<ref.cy+25&&b.y1>Math.max(0,bounds.y0-120));
    if(!pool.length)pool=boxes.filter(b=>b.area<pageArea*.42&&b.area>900&&Math.abs(b.cx-ref.cx)<220&&b.y0<ref.cy+25);
    if(!pool.length)return null;
    return pool.sort((a,b)=>{const da=(a.cx<cellX0?cellX0-a.cx:a.cx>cellX1?a.cx-cellX1:0)+Math.max(0,ref.cy-a.y1)*.7+Math.abs(a.cx-ref.cx)*.12;const db=(b.cx<cellX0?cellX0-b.cx:b.cx>cellX1?b.cx-cellX1:0)+Math.max(0,ref.cy-b.y1)*.7+Math.abs(b.cx-ref.cx)*.12;return da-db})[0];
  }
  async function parse4(file){
    const pdfjs=await getPdfJs4(),buf=await file.arrayBuffer();pdfDoc4=await pdfjs.getDocument({data:new Uint8Array(buf)}).promise;pageCache4.clear();const out=[],seen=new Set();
    for(let n=1;n<=pdfDoc4.numPages;n++){
      if(window.catalogMsg)catalogMsg.textContent='Leyendo página '+n+' de '+pdfDoc4.numPages+' por referencia y celda…';
      const page=await pdfDoc4.getPage(n),viewport=page.getViewport({scale:1.25}),tc=await page.getTextContent({normalizeWhitespace:true}),t=pageText4(tc,viewport,pdfjs),boxes=await imageBoxes4(page,viewport,pdfjs),sec=section4(t.records,n);
      for(const ref of t.refs){if(seen.has(ref.ref))continue;const pr=priceFor4(ref,t.prices,t.refs,viewport.width);if(!pr)continue;const tx=textFor4(ref,t.refs,t.records,t.pieces,viewport.width,n);seen.add(ref.ref);const sp=Number(pr.price)||0,margin=40,added=+(sp*.4).toFixed(2);out.push({title:tx.title,description:tx.description,sourceRef:ref.ref,sourcePrice:sp,margin,addedValue:added,price:+(sp+added).toFixed(2),sourceProvider:'Catálogo Mi Bricolaje',sourceUrl:'',ref:'',published:false,featured:false,selected:false,category:cat4(sec,tx.title),catalogPage:n,catalogSection:sec,_r4:ref,_b4:tx.bounds,_img4:imageFor4(ref,boxes,tx.bounds,viewport)})}
    }
    return {pages:pdfDoc4.numPages,catalog:{name:file.name,defaultMargin:40},candidates:out};
  }
  async function pageCanvas4(n){if(pageCache4.has(n))return pageCache4.get(n);const p=await pdfDoc4.getPage(n),v=p.getViewport({scale:1.25}),c=document.createElement('canvas');c.width=Math.ceil(v.width);c.height=Math.ceil(v.height);await p.render({canvasContext:c.getContext('2d',{alpha:false}),viewport:v}).promise;const z={p,v,c};pageCache4.set(n,z);return z}
  function crop4(src,b){let x0=Math.max(0,Math.floor(b.x0)),y0=Math.max(0,Math.floor(b.y0)),x1=Math.min(src.width,Math.ceil(b.x1)),y1=Math.min(src.height,Math.ceil(b.y1)),w=Math.max(1,x1-x0),h=Math.max(1,y1-y0),sc=Math.min(1,520/Math.max(w,h));const o=document.createElement('canvas');o.width=Math.max(1,Math.round(w*sc));o.height=Math.max(1,Math.round(h*sc));o.getContext('2d',{alpha:false}).drawImage(src,x0,y0,w,h,0,0,o.width,o.height);return o.toDataURL('image/jpeg',.82)}
  async function image4(c){if(c.image&&String(c.image).startsWith('data:image/'))return c.image;const r=await pageCanvas4(c.catalogPage);let b=c._img4;if(!b){const q=c._b4||{},x0=Math.max(0,q.x0||0),x1=Math.min(r.v.width,q.x1||r.v.width),y0=Math.max(0,(q.y0||0)-10),y1=Math.min(r.v.height,Math.max(y0+90,(c._r4?.cy||q.y1||200)-35));b={x0,y0,x1,y1}}const url=crop4(r.c,b);c.image=url;c.images=[{url,origin:'catalog-pdf',source:'Catálogo PDF · página '+c.catalogPage,license:'Imagen del catálogo de origen; revisar permiso de uso antes de publicar',author:''}];return url}

  window.analyzeCatalogFile=async function(){const f=document.getElementById('catalogFile')?.files?.[0];if(!f){if(window.catalogMsg)catalogMsg.textContent='Selecciona primero un PDF.';return}try{if(window.catalogMsg)catalogMsg.textContent='Analizando referencias exactas y su celda…';const d=await parse4(f);catalogCandidates=(d.candidates||[]).map((c,i)=>({...c,idx:i,selected:false}));const sf=document.getElementById('catalogSectionFilter'),secs=[...new Set(catalogCandidates.map(c=>c.catalogSection).filter(Boolean))];if(sf)sf.innerHTML='<option value="">Todas las secciones</option>'+secs.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');const sm=document.getElementById('catalogSummary');if(sm)sm.textContent=catalogCandidates.length+' referencias válidas · '+d.pages+' páginas';document.getElementById('catalogResult')?.classList.add('show');if(window.catalogMsg)catalogMsg.textContent='Listo. Cada referencia está asociada únicamente a su propia celda, precio, descripción e imagen.';if(typeof renderCatalogRows==='function')renderCatalogRows()}catch(e){console.error(e);if(window.catalogMsg)catalogMsg.textContent='Error al analizar PDF: '+e.message}};
  window.importSelected=async function(){const idx=catalogCandidates.map((c,i)=>c.selected&&!c.imported?i:-1).filter(i=>i>=0);if(!idx.length){if(window.catalogMsg)catalogMsg.textContent='Selecciona al menos una referencia.';return}try{let done=0;for(let p=0;p<idx.length;p+=10){const g=idx.slice(p,p+10);if(window.catalogMsg)catalogMsg.textContent='Preparando imágenes '+(p+1)+'-'+Math.min(p+10,idx.length)+' de '+idx.length+'…';for(const i of g)await image4(catalogCandidates[i]);const products=g.map(i=>{const c={...catalogCandidates[i],published:false,featured:false};['_r4','_b4','_img4','idx','selected','imported','aiDone'].forEach(k=>delete c[k]);return c});const r=await api('/api/admin/import-catalog-products',{method:'POST',body:JSON.stringify({products,published:false})});g.forEach(i=>catalogCandidates[i].imported=true);done+=Number(r.created||g.length)}if(window.catalogMsg)catalogMsg.textContent=done+' productos importados como borrador con datos e imagen de su ficha exacta.';renderCatalogRows();if(typeof loadProducts==='function')await loadProducts()}catch(e){console.error(e);if(window.catalogMsg)catalogMsg.textContent='Error al importar: '+e.message}};

  const priorRender4=window.renderCatalogRows;
  window.renderCatalogRows=function(){if(typeof priorRender4==='function')priorRender4();document.querySelectorAll('#catalogRows tr').forEach(tr=>{const ai=tr.querySelector('button[onclick^="aiCandidate"]');if(!ai||tr.querySelector('.fvmV4Preview'))return;const m=ai.getAttribute('onclick')?.match(/\\((\\d+)\\)/),i=m?Number(m[1]):-1;if(i<0)return;const b=document.createElement('button');b.className='btn ghost fvmV4Preview';b.style.marginTop='5px';b.textContent='🖼 Ficha exacta';b.onclick=async()=>{b.disabled=true;b.textContent='Cargando…';try{const u=await image4(catalogCandidates[i]);const w=window.open();if(w)w.document.write('<title>'+catalogCandidates[i].sourceRef+'</title><img style="max-width:100%;height:auto" src="'+u+'">')}finally{b.disabled=false;b.textContent='🖼 Ficha exacta'}};ai.parentElement.appendChild(b)})};
})();
</script>
'''

s = s.replace('</body></html>', js + '\n</body></html>')
p.write_text(s, encoding='utf-8')
print('v4 applied')
