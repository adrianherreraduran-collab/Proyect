// FVM_CLIPBOARD_CROP_V16
(()=>{
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const css=document.createElement('style');
  css.id='fvmCropV16Style';
  css.textContent=`
    .v13Photo img,.manageImage img{cursor:zoom-in}
    #v13CaptureBox:focus{outline:3px solid rgba(242,138,0,.22);border-color:#f28a00}
    .fvmCropOverlay{position:fixed;inset:0;z-index:600;background:rgba(3,38,74,.88);display:flex;align-items:center;justify-content:center;padding:16px}
    .fvmCropPanel{width:min(900px,97vw);max-height:96vh;overflow:auto;background:#fff;border-radius:16px;padding:18px;box-shadow:0 30px 100px #0008}
    .fvmCropTop{display:flex;gap:10px;align-items:center;margin-bottom:12px}.fvmCropTop h2{margin:0 auto 0 0;font-size:20px}.fvmCropTop p{margin:2px 0 0;color:#6b7787;font-size:11px}
    .fvmCropCanvasWrap{background:#d9e1e7;border-radius:12px;padding:12px;display:flex;justify-content:center;overflow:hidden;touch-action:none}
    .fvmCropCanvasWrap canvas{display:block;max-width:100%;max-height:62vh;background:#fff;box-shadow:0 4px 18px #0002;cursor:grab;touch-action:none}.fvmCropCanvasWrap canvas.dragging{cursor:grabbing}
    .fvmCropControls{display:grid;grid-template-columns:1fr 220px;gap:12px;margin-top:12px;align-items:end}.fvmCropControls label{display:block;font-size:11px;font-weight:900;margin-bottom:5px}.fvmCropControls input,.fvmCropControls select{width:100%}
    .fvmCropBtns{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}.fvmCropMsg{font-size:11px;color:#8b4d00;margin-top:8px}
    @media(max-width:650px){.fvmCropControls{grid-template-columns:1fr}}
  `;
  document.head.appendChild(css);

  function hideTechnicalField(){
    const input=document.getElementById('editImage');
    const field=input?.closest('.field');
    if(field)field.style.display='none';
  }

  window.fvmOpenCropV16=function(src,onSave){
    if(!src)return;
    document.querySelector('.fvmCropOverlay')?.remove();
    const overlay=document.createElement('div');overlay.className='fvmCropOverlay';
    overlay.innerHTML=`<div class="fvmCropPanel"><div class="fvmCropTop"><div><h2>Recortar imagen</h2><p>Arrastra la imagen y usa el zoom hasta dejar visible solo la zona que quieres conservar.</p></div><button class="closeX" id="fvmCropClose">✕</button></div><div class="fvmCropCanvasWrap"><canvas id="fvmCropCanvas" width="1024" height="1024"></canvas></div><div class="fvmCropControls"><div><label>Zoom</label><input id="fvmCropZoom" type="range" min="1" max="3" step="0.01" value="1"></div><div><label>Formato</label><select id="fvmCropFormat"><option value="square">Cuadrado 1:1</option><option value="original">Proporción original</option><option value="landscape">Horizontal 4:3</option><option value="portrait">Vertical 4:5</option></select></div></div><div id="fvmCropMsg" class="fvmCropMsg"></div><div class="fvmCropBtns"><button class="btn ghost" id="fvmCropReset">Restablecer</button><button class="btn ghost" id="fvmCropCancel">Cancelar</button><button class="btn navy" id="fvmCropSave">Guardar recorte</button></div></div>`;
    document.body.appendChild(overlay);
    const canvas=document.getElementById('fvmCropCanvas'),ctx=canvas.getContext('2d');
    const zoomEl=document.getElementById('fvmCropZoom'),formatEl=document.getElementById('fvmCropFormat'),msg=document.getElementById('fvmCropMsg');
    const img=new Image();if(!String(src).startsWith('data:'))img.crossOrigin='anonymous';
    let zoom=1,offX=0,offY=0,drag=false,lastX=0,lastY=0,loaded=false;
    const sizeForFormat=()=>{if(formatEl.value==='landscape')return [1024,768];if(formatEl.value==='portrait')return [819,1024];if(formatEl.value==='original'&&img.naturalWidth&&img.naturalHeight){const r=img.naturalWidth/img.naturalHeight;return r>=1?[1024,Math.max(1,Math.round(1024/r))]:[Math.max(1,Math.round(1024*r)),1024]}return [1024,1024]};
    const resizeCanvas=()=>{const [w,h]=sizeForFormat();canvas.width=w;canvas.height=h;draw()};
    const clampOffsets=()=>{if(!loaded)return;const base=Math.max(canvas.width/img.naturalWidth,canvas.height/img.naturalHeight),scale=base*zoom,dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;const mx=Math.max(0,(dw-canvas.width)/2),my=Math.max(0,(dh-canvas.height)/2);offX=Math.max(-mx,Math.min(mx,offX));offY=Math.max(-my,Math.min(my,offY))};
    const draw=()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);if(!loaded)return;clampOffsets();const base=Math.max(canvas.width/img.naturalWidth,canvas.height/img.naturalHeight),scale=base*zoom,dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;ctx.drawImage(img,(canvas.width-dw)/2+offX,(canvas.height-dh)/2+offY,dw,dh)};
    const reset=()=>{zoom=1;offX=0;offY=0;zoomEl.value='1';draw()};
    img.onload=()=>{loaded=true;resizeCanvas();reset()};
    img.onerror=()=>{msg.textContent='No se pudo abrir esta imagen para recortarla.'};
    img.src=src;
    zoomEl.oninput=()=>{zoom=Number(zoomEl.value)||1;draw()};
    formatEl.onchange=()=>{offX=0;offY=0;resizeCanvas();reset()};
    canvas.addEventListener('pointerdown',e=>{if(!loaded)return;drag=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId);canvas.classList.add('dragging')});
    canvas.addEventListener('pointermove',e=>{if(!drag)return;const rect=canvas.getBoundingClientRect();const sx=canvas.width/Math.max(1,rect.width),sy=canvas.height/Math.max(1,rect.height);offX+=(e.clientX-lastX)*sx;offY+=(e.clientY-lastY)*sy;lastX=e.clientX;lastY=e.clientY;draw()});
    const end=e=>{drag=false;canvas.releasePointerCapture?.(e.pointerId);canvas.classList.remove('dragging')};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    const close=()=>overlay.remove();document.getElementById('fvmCropClose').onclick=close;document.getElementById('fvmCropCancel').onclick=close;document.getElementById('fvmCropReset').onclick=reset;
    document.getElementById('fvmCropSave').onclick=()=>{if(!loaded)return;try{const data=canvas.toDataURL('image/jpeg',.93);if(typeof onSave==='function')onSave(data);close()}catch(e){msg.textContent='Esta imagen externa no permite recorte directo. Súbela primero a FVMarket y vuelve a intentarlo.'}};
  };

  window.cropEditImage=function(j){
    try{
      const imgs=editDraft?.images||[],im=imgs[j];if(!im)return;
      window.fvmOpenCropV16(im.url,data=>{imgs[j]={...im,url:data,origin:'manual-crop',source:'Recorte FVMarket'};window.renderEditGallery?.()});
    }catch(e){console.error('FVMarket crop edit',e)}
  };

  window.renderEditGallery=function(){
    const box=document.getElementById('editGallery');if(!box)return;
    const imgs=editDraft?.images||[];
    box.innerHTML=imgs.length?imgs.map((im,j)=>`<div class="manageImage ${j===0?'main':''}"><img src="${safe(im.url)}" onclick="cropEditImage(${j})" title="Clic para recortar"><small>${j===0?'★ Principal · ':''}${safe(im.origin==='source'?'Origen':(im.license||'Imagen'))}</small><div class="imgBtns"><button onclick="makeEditPrimary(${j})">Principal</button><button onclick="moveEditImage(${j},-1)">←</button><button onclick="moveEditImage(${j},1)">→</button><button onclick="cropEditImage(${j})">Recortar</button><button onclick="editEditImageUrl(${j})">Editar URL</button><button onclick="deleteEditImage(${j})">Eliminar</button></div></div>`).join(''):'<div class="msg">Este producto no tiene imágenes.</div>';
    const main=document.getElementById('editImage');if(main)main.value=imgs[0]?.url||'';hideTechnicalField();
  };

  hideTechnicalField();
  new MutationObserver(hideTechnicalField).observe(document.body,{childList:true,subtree:true});
})();

// FVM_MULTI_CAPTURE_V18 · multiple clipboard snippets are analysed as one product evidence sheet
(()=>{
  const MAX_CAPTURES=8;
  const MAX_SIDE=1700;
  const bridge=()=>window.fvmSupplierV13||null;
  const q=(root,sel)=>root?.querySelector(sel)||null;

  const style=document.createElement('style');
  style.id='fvmMultiCaptureV18Style';
  style.textContent=`
    .fvmMultiCaptures{margin-top:10px;border-top:1px solid #dfe7ee;padding-top:9px}
    .fvmMultiCaptureHead{display:flex;align-items:center;gap:8px;margin-bottom:7px}.fvmMultiCaptureHead b{font-size:11px;color:#06345f;margin-right:auto}.fvmMultiCaptureHead span{font-size:9px;color:#6b7787}.fvmMultiCaptureHead button{border:0;background:#eef3f7;color:#06345f;border-radius:7px;padding:6px 8px;font-size:9px;font-weight:900;cursor:pointer}
    .fvmMultiCaptureGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.fvmCaptureThumb{position:relative;border:1px solid #dfe7ee;border-radius:8px;background:#fff;padding:4px;min-width:0}.fvmCaptureThumb img{width:100%;height:82px!important;max-height:none!important;object-fit:contain!important;margin:0!important;background:#f7f9fb!important;border-radius:5px!important;cursor:zoom-in}.fvmCaptureThumb small{display:block;font-size:8px;color:#5d6f82;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fvmCaptureBtns{display:flex;gap:4px;margin-top:4px}.fvmCaptureBtns button{flex:1;border:0;border-radius:5px;padding:5px 3px;font-size:8px;font-weight:800;cursor:pointer;background:#edf3f8;color:#06345f}.fvmCaptureBtns button:last-child{background:#fff0f0;color:#9c2929}
    .fvmCaptureHint{font-size:9px;color:#6b7787;line-height:1.35;margin-top:7px}
    @media(max-width:650px){.fvmMultiCaptureGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.fvmCaptureThumb img{height:92px!important}}
  `;
  document.head.appendChild(style);

  function fileToData(file,max=MAX_SIDE,quality=.88){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onerror=reject;reader.onload=()=>{
        const img=new Image();img.onerror=reject;img.onload=()=>{
          let w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
          const scale=Math.min(1,max/Math.max(w,h));w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));
          const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality));
        };img.src=reader.result;
      };reader.readAsDataURL(file);
    });
  }

  function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src})}

  async function compose(captures){
    if(!captures.length)return '';
    if(captures.length===1)return captures[0];
    const imgs=await Promise.all(captures.map(loadImage));
    let width=Math.min(1600,Math.max(...imgs.map(im=>im.naturalWidth||im.width),900));
    const gap=14;
    let rows=imgs.map(im=>{const iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height;const s=Math.min(1,width/iw);return {im,w:Math.round(iw*s),h:Math.round(ih*s)}});
    let total=rows.reduce((n,r)=>n+r.h,0)+gap*(rows.length-1);
    if(total>9500){const k=9500/total;width=Math.max(850,Math.round(width*k));rows=imgs.map(im=>{const iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height;const s=Math.min(1,width/iw);return {im,w:Math.round(iw*s),h:Math.round(ih*s)}});total=rows.reduce((n,r)=>n+r.h,0)+gap*(rows.length-1)}
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.max(1,total);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    let y=0;rows.forEach((r,i)=>{const x=Math.max(0,Math.round((width-r.w)/2));ctx.drawImage(r.im,x,y,r.w,r.h);y+=r.h;if(i<rows.length-1){ctx.fillStyle='#d9e4ed';ctx.fillRect(0,y,width,gap);y+=gap}});
    return canvas.toDataURL('image/jpeg',.84);
  }

  async function syncState(modal,message=''){
    const b=bridge();if(!b)return;const st=b.state||(b.state={});const caps=Array.isArray(st.captures)?st.captures:[];
    try{st.capture=await compose(caps)}catch{st.capture=caps[caps.length-1]||''}
    const preview=q(modal,'#v13CapturePreview'),analyze=q(modal,'#v13AnalyzeCapture'),use=q(modal,'#v13UseCapture'),status=q(modal,'#v13AiStatus');
    if(preview){if(caps.length){preview.src=caps[caps.length-1];preview.style.display='block'}else{preview.removeAttribute('src');preview.style.display='none'}}
    if(analyze)analyze.disabled=!caps.length;if(use)use.disabled=!caps.length;
    if(status){status.className='v13AiStatus '+(caps.length?'ok':'');status.textContent=caps.length?(message||`${caps.length} recorte${caps.length===1?'':'s'} listo${caps.length===1?'':'s'}. La IA los analizará juntos para completar el producto.`):'Pega o selecciona uno o varios recortes para comenzar.'}
    renderGallery(modal);
  }

  function renderGallery(modal){
    const b=bridge(),st=b?.state;if(!st)return;const caps=Array.isArray(st.captures)?st.captures:[];const grid=q(modal,'#fvmMultiCaptureGrid'),count=q(modal,'#fvmMultiCaptureCount');if(count)count.textContent=`${caps.length}/${MAX_CAPTURES}`;if(!grid)return;
    grid.innerHTML=caps.length?caps.map((src,i)=>`<div class="fvmCaptureThumb"><img src="${src}" data-cap="${i}" title="Abrir recorte"><small>Recorte ${i+1}</small><div class="fvmCaptureBtns"><button type="button" data-crop="${i}">Recortar</button><button type="button" data-del="${i}">Eliminar</button></div></div>`).join(''):'<div class="fvmCaptureHint" style="grid-column:1/-1">Puedes pegar varios recortes seguidos con Ctrl+V. No sustituyen al anterior: se acumulan para el análisis.</div>';
    grid.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=async()=>{const i=Number(btn.dataset.del);st.captures.splice(i,1);await syncState(modal)});
    grid.querySelectorAll('[data-crop]').forEach(btn=>btn.onclick=()=>{const i=Number(btn.dataset.crop),src=st.captures[i];if(!src||typeof window.fvmOpenCropV16!=='function')return;window.fvmOpenCropV16(src,async data=>{st.captures[i]=data;await syncState(modal,'Recorte actualizado. La IA analizará todos los recortes juntos.')})});
    grid.querySelectorAll('img[data-cap]').forEach(img=>img.onclick=()=>{const i=Number(img.dataset.cap),src=st.captures[i];if(src&&typeof window.fvmOpenCropV16==='function')window.fvmOpenCropV16(src,async data=>{st.captures[i]=data;await syncState(modal,'Recorte actualizado. La IA analizará todos los recortes juntos.')})});
  }

  async function addFiles(modal,files,viaPaste=false){
    const b=bridge(),st=b?.state;if(!st)return;if(!Array.isArray(st.captures))st.captures=[];
    const candidates=[...files].filter(f=>String(f?.type||'').startsWith('image/')).slice(0,Math.max(0,MAX_CAPTURES-st.captures.length));if(!candidates.length)return;
    const status=q(modal,'#v13AiStatus');if(status){status.className='v13AiStatus';status.textContent=viaPaste?'Pegando recortes…':'Preparando recortes…'}
    for(const f of candidates){try{const data=await fileToData(f);if(data&&!st.captures.includes(data))st.captures.push(data)}catch{}}
    await syncState(modal,`${st.captures.length} recorte${st.captures.length===1?'':'s'} añadido${st.captures.length===1?'':'s'}. Puedes seguir pegando o pulsar “Analizar captura con IA”.`);
  }

  function decorate(modal){
    if(!modal||modal.dataset.multiCaptureV18==='1'||!q(modal,'#v13CaptureBox'))return;modal.dataset.multiCaptureV18='1';
    const b=bridge();if(!b)return;const st=b.state||(b.state={});st.captures=[];st.capture='';
    const input=q(modal,'#v13CaptureFile');if(input){input.multiple=true;input.setAttribute('multiple','multiple')}
    const captureBox=q(modal,'#v13CaptureBox');const meta=captureBox?.querySelector('.aiMeta');if(meta)meta.innerHTML='Selecciona uno o varios archivos o pega <b>varios recortes</b> con <b>Ctrl+V</b>. Todos se analizarán juntos para completar nombre, referencia, precio, marca y descripción.';
    const holder=document.createElement('div');holder.className='fvmMultiCaptures';holder.innerHTML=`<div class="fvmMultiCaptureHead"><b>Recortes del producto</b><span id="fvmMultiCaptureCount">0/${MAX_CAPTURES}</span><button type="button" id="fvmClearCaptures">Vaciar</button></div><div id="fvmMultiCaptureGrid" class="fvmMultiCaptureGrid"></div><div class="fvmCaptureHint">Pega un recorte, vuelve a la web del proveedor, copia otro y pégalo: FVMarket conservará todos hasta que analices el producto.</div>`;
    const row=input?.closest('.v17FileRow');(row||input)?.insertAdjacentElement('afterend',holder);if(!row&&!input)captureBox?.appendChild(holder);
    holder.querySelector('#fvmClearCaptures').onclick=async()=>{st.captures=[];await syncState(modal)};
    if(input)input.onchange=async e=>{await addFiles(modal,[...(e.target.files||[])],false);e.target.value=''};
    modal.addEventListener('paste',async e=>{const files=[...(e.clipboardData?.items||[])].filter(x=>String(x.type||'').startsWith('image/')).map(x=>x.getAsFile()).filter(Boolean);if(!files.length)return;e.preventDefault();e.stopImmediatePropagation();await addFiles(modal,files,true)},true);
    const use=q(modal,'#v13UseCapture');if(use)use.onclick=()=>{const src=st.captures?.[st.captures.length-1];if(!src)return;st.photos=Array.isArray(st.photos)?st.photos:[];if(st.photos.length<12&&!st.photos.some(x=>x.url===src)){st.photos.unshift({url:src,origin:'capture-photo',source:'Recorte proveedor'});b.renderPhotos?.()}};
    syncState(modal);
  }

  const observer=new MutationObserver(()=>document.querySelectorAll('.v13Modal').forEach(decorate));observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>document.querySelectorAll('.v13Modal').forEach(decorate));
})();
