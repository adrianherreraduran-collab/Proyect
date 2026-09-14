// FVM_ADMIN_V17 · real crop + similar web images + cleaner supplier UI
(()=>{
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const css=document.createElement('style');
  css.id='fvmAdminV17Style';
  css.textContent=`
    #aiState,.v13Flow{display:none!important}
    .heroAdmin .pill{display:none!important}
    .v13CaptureGrid{grid-template-columns:minmax(300px,.9fr) minmax(0,1.65fr)!important;gap:30px!important;align-items:start}
    .v13CaptureBox,.v13Form,.v13CaptureGrid>div{min-width:0!important}
    .v13CaptureBox input[type=file]{max-width:100%;width:100%;overflow:hidden}
    .v17FileRow{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap;margin:8px 0}.v17FileRow input{display:none!important}.v17FileBtn{display:inline-flex;align-items:center;background:#eef4f8;color:#06345f;font-size:11px;font-weight:900;border-radius:8px;padding:9px 11px;cursor:pointer}.v17FileName{font-size:10px;color:#6b7787;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .v13CaptureBox .v13Actions{display:flex;flex-wrap:wrap;gap:7px}.v13CaptureBox .v13Actions .btn{min-width:0;white-space:normal}
    .v17Similar{grid-column:1/-1;margin-top:11px;border-top:1px solid #dfe7ee;padding-top:10px}.v17SimilarHead{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.v17SimilarHead b{margin-right:auto}.v17SimilarNote{font-size:10px;color:#77520d;background:#fff8df;border:1px solid #f0dda5;border-radius:8px;padding:8px 10px;margin-top:8px}.v17SimilarGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:9px}.v17WebImg{border:1px solid #dfe7ee;border-radius:9px;padding:7px;background:#f8fbfd;min-width:0}.v17WebImg img{width:100%;height:120px;object-fit:contain;background:#fff;border-radius:6px}.v17WebImg b{display:block;font-size:9px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v17WebImg small{display:block;font-size:8px;color:#6b7787;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v17WebImg button{width:100%;border:0;border-radius:6px;padding:7px;margin-top:6px;background:#06345f;color:#fff;font-size:9px;font-weight:900;cursor:pointer}
    .fvmCropOverlay{position:fixed;inset:0;z-index:800;background:#03264ae8;display:flex;align-items:center;justify-content:center;padding:14px}.fvmCropPanel{width:min(980px,98vw);max-height:97vh;overflow:auto;background:#fff;border-radius:16px;padding:18px;box-shadow:0 30px 100px #0008}.fvmCropTop{display:flex;gap:10px;align-items:center;margin-bottom:12px}.fvmCropTop h2{margin:0 auto 0 0}.fvmCropTop p{margin:2px 0 0;font-size:11px;color:#6b7787}.fvmCropStageWrap{background:#dce5eb;border-radius:12px;padding:12px;display:flex;justify-content:center;overflow:auto}.fvmCropStage{position:relative;display:inline-block;line-height:0;user-select:none;touch-action:none}.fvmCropStage img{display:block;max-width:min(860px,90vw);max-height:62vh;width:auto;height:auto;pointer-events:none}.fvmCropShade{position:absolute;inset:0;background:rgba(3,38,74,.52);pointer-events:none}.fvmCropSel{position:absolute;border:2px solid #f28a00;box-shadow:0 0 0 1px #fff8;cursor:move;touch-action:none}.fvmCropSel:before{content:'';position:absolute;inset:0;box-shadow:0 0 0 9999px rgba(3,38,74,.52);pointer-events:none}.fvmHandle{position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #f28a00;z-index:3}.fvmHandle.nw{left:-8px;top:-8px;cursor:nwse-resize}.fvmHandle.ne{right:-8px;top:-8px;cursor:nesw-resize}.fvmHandle.sw{left:-8px;bottom:-8px;cursor:nesw-resize}.fvmHandle.se{right:-8px;bottom:-8px;cursor:nwse-resize}.fvmHandle.n{left:50%;top:-8px;transform:translateX(-50%);cursor:ns-resize}.fvmHandle.s{left:50%;bottom:-8px;transform:translateX(-50%);cursor:ns-resize}.fvmHandle.w{left:-8px;top:50%;transform:translateY(-50%);cursor:ew-resize}.fvmHandle.e{right:-8px;top:50%;transform:translateY(-50%);cursor:ew-resize}.fvmCropControls{display:grid;grid-template-columns:1fr 220px;gap:12px;margin-top:12px;align-items:end}.fvmCropControls label{display:block;font-size:11px;font-weight:900;margin-bottom:5px}.fvmCropControls select{width:100%;padding:9px;border:1px solid #dfe7ee;border-radius:8px}.fvmCropHint{font-size:11px;color:#6b7787}.fvmCropBtns{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}
    @media(max-width:900px){.v13CaptureGrid{grid-template-columns:1fr!important;gap:15px!important}.v17SimilarGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.v17FileName{max-width:260px}}
    @media(max-width:560px){.v17SimilarGrid{grid-template-columns:1fr 1fr}.fvmCropControls{grid-template-columns:1fr}}
  `;
  document.head.appendChild(css);

  function hostOf(v=''){try{return new URL(v).hostname.replace(/^www\./,'')}catch{return 'origen web'}}
  function apiState(){return window.fvmSupplierV13||null}

  function decorateSupplierModal(){
    const modal=$('.v13Modal');if(!modal)return;
    const input=modal.querySelector('#v13CaptureFile');
    if(input&&!input.dataset.v17){
      input.dataset.v17='1';
      const row=document.createElement('div');row.className='v17FileRow';
      const label=document.createElement('label');label.className='v17FileBtn';label.htmlFor='v13CaptureFile';label.textContent='Seleccionar archivo';
      const name=document.createElement('span');name.className='v17FileName';name.textContent='También puedes pegar con Ctrl+V';
      input.parentNode.insertBefore(row,input);row.append(input,label,name);
      input.addEventListener('change',()=>{name.textContent=input.files?.[0]?.name||'También puedes pegar con Ctrl+V'});
    }
    const btn=modal.querySelector('#v13FreeRender');
    if(btn&&!btn.dataset.v17){
      btn.dataset.v17='1';btn.textContent='🔎 Buscar imágenes similares en internet';btn.className='btn navy';
      btn.onclick=searchSimilarImages;
      const msg=modal.querySelector('#v13RenderMsg');if(msg)msg.textContent='Busca por referencia, marca y nombre. Incluye resultados de dominios europeos.';
    }
    const grid=modal.querySelector('#v13PhotoGrid');
    if(grid&&!modal.querySelector('#v17Similar')){
      const sec=document.createElement('section');sec.id='v17Similar';sec.className='v17Similar';sec.style.display='none';sec.innerHTML='<div class="v17SimilarHead"><b>Imágenes similares encontradas</b><span id="v17SimilarStatus" class="aiMeta"></span></div><div class="v17SimilarNote">Las imágenes encontradas en Internet no se consideran libres de derechos automáticamente. Revisa el origen y la licencia antes de publicarlas.</div><div id="v17SimilarGrid" class="v17SimilarGrid"></div>';
      grid.parentNode.appendChild(sec);
    }
    const tech=modal.querySelector('#editImage')?.closest('.field');if(tech)tech.style.display='none';
  }

  async function searchSimilarImages(){
    const modal=$('.v13Modal'),bridge=apiState(),supplier=bridge?.state?.selectedSupplier;if(!modal||!supplier)return;
    const btn=modal.querySelector('#v13FreeRender'),sec=modal.querySelector('#v17Similar'),status=modal.querySelector('#v17SimilarStatus'),grid=modal.querySelector('#v17SimilarGrid');
    const title=modal.querySelector('#v13Title')?.value||'',brand=modal.querySelector('#v13Brand')?.value||'',sourceRef=modal.querySelector('#v13SourceRef')?.value||'';
    if(!title&&!sourceRef){if(status)status.textContent='Indica al menos nombre o referencia.';if(sec)sec.style.display='block';return}
    btn.disabled=true;btn.textContent='Buscando…';sec.style.display='block';status.textContent='Consultando imágenes públicas…';grid.innerHTML='';
    try{
      const r=await window.api('/api/admin/suppliers/'+encodeURIComponent(supplier.id)+'/search-images',{method:'POST',body:JSON.stringify({title,brand,sourceRef,limit:12})});
      const rows=Array.isArray(r.images)?r.images:[];window.fvmV17Similar=rows;status.textContent=rows.length+' resultados';
      grid.innerHTML=rows.length?rows.map((im,i)=>`<article class="v17WebImg"><img src="${esc(im.url)}" loading="lazy" referrerpolicy="no-referrer"><b title="${esc(im.title||'')}">${esc(im.title||'Imagen similar')}</b><small title="${esc(im.source||'')}">${esc(hostOf(im.source||im.url))}</small><small>${esc(im.license||'Comprobar derechos')}</small><button type="button" onclick="fvmV17AddSimilar(${i})">Añadir al producto</button></article>`).join(''):'<div class="aiMeta">No se encontraron resultados suficientemente relacionados.</div>';
    }catch(e){status.textContent=e.message||'No se pudo completar la búsqueda.'}
    finally{btn.disabled=false;btn.textContent='🔎 Buscar imágenes similares en internet'}
  }

  window.fvmV17AddSimilar=function(i){
    const bridge=apiState(),im=window.fvmV17Similar?.[i];if(!bridge||!im)return;
    const photos=bridge.state.photos||(bridge.state.photos=[]);if(photos.some(x=>String(x.url)===String(im.url)))return;
    photos.push({url:im.url,source:im.source||'',license:im.license||'Comprobar derechos/licencia antes de publicar',author:im.author||'',origin:'web-similar'});
    bridge.renderPhotos?.();
  };

  function aspectValue(v){return v==='1:1'?1:v==='4:3'?4/3:v==='4:5'?4/5:0}
  window.fvmOpenCropV16=function(src,onSave){
    if(!src)return;document.querySelector('.fvmCropOverlay')?.remove();
    const ov=document.createElement('div');ov.className='fvmCropOverlay';ov.innerHTML=`<div class="fvmCropPanel"><div class="fvmCropTop"><div><h2>Recortar imagen</h2><p>Dibuja el área que quieres conservar. Puedes moverla y cambiar su tamaño desde los tiradores.</p></div><button class="closeX" id="v17CropClose">✕</button></div><div class="fvmCropStageWrap"><div class="fvmCropStage" id="v17CropStage"><img id="v17CropImg"><div class="fvmCropSel" id="v17CropSel">${['nw','n','ne','e','se','s','sw','w'].map(x=>'<i class="fvmHandle '+x+'" data-h="'+x+'"></i>').join('')}</div></div></div><div class="fvmCropControls"><div class="fvmCropHint">Arrastra fuera del marco para crear una selección nueva. Arrastra el centro para moverla.</div><div><label>Formato</label><select id="v17CropFormat"><option value="free">Libre</option><option value="1:1">Cuadrado 1:1</option><option value="4:3">Horizontal 4:3</option><option value="4:5">Vertical 4:5</option></select></div></div><div class="fvmCropBtns"><button class="btn ghost" id="v17CropFull">Imagen completa</button><button class="btn ghost" id="v17CropCancel">Cancelar</button><button class="btn navy" id="v17CropSave">Guardar recorte</button></div></div>`;document.body.appendChild(ov);
    const stage=ov.querySelector('#v17CropStage'),img=ov.querySelector('#v17CropImg'),sel=ov.querySelector('#v17CropSel'),fmt=ov.querySelector('#v17CropFormat');
    let r={x:0,y:0,w:0,h:0},action='',sx=0,sy=0,start=null,min=24;
    const render=()=>{sel.style.left=r.x+'px';sel.style.top=r.y+'px';sel.style.width=r.w+'px';sel.style.height=r.h+'px'};
    const bounds=()=>({w:stage.clientWidth,h:stage.clientHeight});
    const clamp=()=>{const b=bounds();r.w=Math.max(min,Math.min(b.w,r.w));r.h=Math.max(min,Math.min(b.h,r.h));r.x=Math.max(0,Math.min(b.w-r.w,r.x));r.y=Math.max(0,Math.min(b.h-r.h,r.y))};
    const applyAspect=(w,h)=>{const a=aspectValue(fmt.value);if(!a)return {w,h};if(w/Math.max(1,h)>a)w=h*a;else h=w/a;return {w,h}};
    const full=()=>{const b=bounds();r={x:0,y:0,w:b.w,h:b.h};const a=aspectValue(fmt.value);if(a){let z=applyAspect(r.w,r.h);r.w=z.w;r.h=z.h;r.x=(b.w-r.w)/2;r.y=(b.h-r.h)/2}clamp();render()};
    img.onload=()=>setTimeout(()=>{stage.style.width=img.getBoundingClientRect().width+'px';stage.style.height=img.getBoundingClientRect().height+'px';full()},0);img.src=src;
    fmt.onchange=full;
    const point=e=>{const q=stage.getBoundingClientRect();return {x:e.clientX-q.left,y:e.clientY-q.top}};
    const down=e=>{e.preventDefault();const p=point(e);sx=p.x;sy=p.y;start={...r};const h=e.target.dataset?.h;if(h)action='resize-'+h;else if(e.target===sel||sel.contains(e.target))action='move';else{action='new';r={x:p.x,y:p.y,w:min,h:min};render()}stage.setPointerCapture?.(e.pointerId)};
    const move=e=>{if(!action)return;const p=point(e),dx=p.x-sx,dy=p.y-sy,b=bounds();if(action==='move'){r.x=start.x+dx;r.y=start.y+dy;clamp();render();return}if(action==='new'){let x=Math.min(sx,p.x),y=Math.min(sy,p.y),w=Math.abs(p.x-sx),h=Math.abs(p.y-sy);let z=applyAspect(Math.max(min,w),Math.max(min,h));r={x,y,w:z.w,h:z.h};clamp();render();return}const hnd=action.slice(7);let x=start.x,y=start.y,w=start.w,h=start.h;if(hnd.includes('e'))w=start.w+dx;if(hnd.includes('s'))h=start.h+dy;if(hnd.includes('w')){x=start.x+dx;w=start.w-dx}if(hnd.includes('n')){y=start.y+dy;h=start.h-dy}w=Math.max(min,w);h=Math.max(min,h);const a=aspectValue(fmt.value);if(a){const z=applyAspect(w,h);if(hnd.includes('w'))x=start.x+start.w-z.w;if(hnd.includes('n'))y=start.y+start.h-z.h;w=z.w;h=z.h}r={x,y,w,h};clamp();render()};
    const up=e=>{action='';stage.releasePointerCapture?.(e.pointerId)};stage.addEventListener('pointerdown',down);stage.addEventListener('pointermove',move);stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',up);
    const close=()=>ov.remove();ov.querySelector('#v17CropClose').onclick=close;ov.querySelector('#v17CropCancel').onclick=close;ov.querySelector('#v17CropFull').onclick=full;
    ov.querySelector('#v17CropSave').onclick=()=>{if(!img.naturalWidth||!r.w)return;const rect=img.getBoundingClientRect();const scaleX=img.naturalWidth/rect.width,scaleY=img.naturalHeight/rect.height;const sxn=Math.max(0,Math.round(r.x*scaleX)),syn=Math.max(0,Math.round(r.y*scaleY)),swn=Math.max(1,Math.round(r.w*scaleX)),shn=Math.max(1,Math.round(r.h*scaleY));const max=1400,ratio=Math.min(1,max/Math.max(swn,shn));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(swn*ratio));c.height=Math.max(1,Math.round(shn*ratio));try{c.getContext('2d').drawImage(img,sxn,syn,swn,shn,0,0,c.width,c.height);const data=c.toDataURL('image/jpeg',.93);onSave?.(data);close()}catch(e){alert('No se puede recortar directamente esta imagen externa. Añádela o súbela primero y vuelve a intentarlo.')}};
  };

  // keep existing product editor integration but force our cropper
  window.cropEditImage=function(j){try{const imgs=window.editDraft?.images||editDraft?.images||[],im=imgs[j];if(!im)return;window.fvmOpenCropV16(im.url,data=>{imgs[j]={...im,url:data,origin:'manual-crop',source:'Recorte FVMarket'};(window.renderEditImages||renderEditImages)?.()})}catch(e){console.warn(e)}};

  const observer=new MutationObserver(()=>{document.querySelectorAll('.v13Flow').forEach(x=>x.remove());decorateSupplierModal();const f=document.getElementById('editImage')?.closest('.field');if(f)f.style.display='none'});observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('.v13Flow').forEach(x=>x.remove());decorateSupplierModal()});
})();
