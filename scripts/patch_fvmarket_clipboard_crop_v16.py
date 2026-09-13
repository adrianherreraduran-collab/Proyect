from pathlib import Path

admin_js=Path('appsrc/public/fvmarket-admin-v13.js')
admin_html=Path('appsrc/public/admin.html')
crop_js=Path('appsrc/public/fvmarket-admin-crop-v16.js')

a=admin_js.read_text(encoding='utf-8')

# 1) Supplier capture: allow direct Ctrl+V from clipboard.
old_capture='''<div class="v13CaptureBox"><b>Captura de la web del proveedor</b><div class="aiMeta" style="max-width:none;margin:4px 0 8px">La captura se conserva como evidencia interna del precio de origen.</div><input id="v13CaptureFile" type="file" accept="image/png,image/jpeg,image/webp">'''
new_capture='''<div class="v13CaptureBox" id="v13CaptureBox" tabindex="0"><b>Captura de la web del proveedor</b><div class="aiMeta" style="max-width:none;margin:4px 0 8px">Selecciona un archivo o pega directamente una captura con <b>Ctrl+V</b>. La captura se conserva como evidencia interna del precio de origen.</div><input id="v13CaptureFile" type="file" accept="image/png,image/jpeg,image/webp">'''
if old_capture not in a:
    raise SystemExit('No se encontró el bloque de captura v13')
a=a.replace(old_capture,new_capture,1)

old_handler="""$('v13CaptureFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;const status=$('v13AiStatus');status.className='v13AiStatus';status.textContent='Preparando captura…';try{state.capture=await imageData(f,1800,.86);$('v13CapturePreview').src=state.capture;$('v13CapturePreview').style.display='block';$('v13AnalyzeCapture').disabled=false;$('v13UseCapture').disabled=false;status.textContent='Captura lista. Pulsa “Analizar captura con IA”.'}catch{status.textContent='No se pudo leer la imagen.'}};"""
new_handler="""const applyCaptureFile=async(f,viaPaste=false)=>{if(!f||!String(f.type||'').startsWith('image/'))return;const status=$('v13AiStatus');status.className='v13AiStatus';status.textContent=viaPaste?'Pegando captura…':'Preparando captura…';try{state.capture=await imageData(f,1800,.86);$('v13CapturePreview').src=state.capture;$('v13CapturePreview').style.display='block';$('v13AnalyzeCapture').disabled=false;$('v13UseCapture').disabled=false;status.className='v13AiStatus ok';status.textContent=viaPaste?'Captura pegada desde el portapapeles. Pulsa “Analizar captura con IA”.':'Captura lista. Pulsa “Analizar captura con IA”.'}catch{status.className='v13AiStatus warn';status.textContent='No se pudo leer la imagen.'}};$('v13CaptureFile').onchange=async e=>{const f=e.target.files?.[0];if(f)await applyCaptureFile(f,false)};m.addEventListener('paste',async e=>{const item=[...(e.clipboardData?.items||[])].find(x=>String(x.type||'').startsWith('image/'));if(!item)return;e.preventDefault();const f=item.getAsFile();if(f)await applyCaptureFile(f,true)});setTimeout(()=>$('v13CaptureBox')?.focus(),30);"""
if old_handler not in a:
    raise SystemExit('No se encontró el handler de captura v13')
a=a.replace(old_handler,new_handler,1)

# 2) Supplier product gallery: click or Recortar opens generic crop editor.
old_gallery="""  function renderPhotos(){const el=$('v13PhotoGrid');if(!el)return;el.innerHTML=state.photos.length?state.photos.map((im,i)=>`<div class=\"v13Photo ${i===0?'main':''}\"><img src=\"${esc(im.url)}\"><div class=\"v13PhotoBtns\"><button onclick=\"v13MakeMain(${i})\">${i===0?'Principal':'Hacer principal'}</button><button onclick=\"v13RemovePhoto(${i})\">Eliminar</button></div></div>`).join(''):'<div class=\"aiMeta\" style=\"max-width:none;grid-column:1/-1\">Todavía no has añadido fotografías.</div>'}\n  window.v13MakeMain=i=>{if(i>0&&state.photos[i])state.photos.unshift(state.photos.splice(i,1)[0]);renderPhotos()};window.v13RemovePhoto=i=>{state.photos.splice(i,1);renderPhotos()};"""
new_gallery="""  function renderPhotos(){const el=$('v13PhotoGrid');if(!el)return;el.innerHTML=state.photos.length?state.photos.map((im,i)=>`<div class=\"v13Photo ${i===0?'main':''}\"><img src=\"${esc(im.url)}\" onclick=\"v13CropPhoto(${i})\" title=\"Clic para recortar\"><div class=\"v13PhotoBtns\"><button onclick=\"v13MakeMain(${i})\">${i===0?'Principal':'Hacer principal'}</button><button onclick=\"v13CropPhoto(${i})\">Recortar</button><button onclick=\"v13RemovePhoto(${i})\">Eliminar</button></div></div>`).join(''):'<div class=\"aiMeta\" style=\"max-width:none;grid-column:1/-1\">Todavía no has añadido fotografías.</div>'}\n  window.v13MakeMain=i=>{if(i>0&&state.photos[i])state.photos.unshift(state.photos.splice(i,1)[0]);renderPhotos()};window.v13RemovePhoto=i=>{state.photos.splice(i,1);renderPhotos()};window.v13CropPhoto=i=>{const im=state.photos[i];if(!im||typeof window.fvmOpenCropV16!=='function')return;window.fvmOpenCropV16(im.url,data=>{state.photos[i]={...im,url:data,origin:'manual-crop',source:'Recorte FVMarket'};renderPhotos()})};"""
if old_gallery not in a:
    raise SystemExit('No se encontró renderPhotos v13')
a=a.replace(old_gallery,new_gallery,1)
admin_js.write_text(a,encoding='utf-8')

# 3) Generic crop editor used by supplier gallery and product edit gallery.
crop_js.write_text(r'''// FVM_CLIPBOARD_CROP_V16
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
''',encoding='utf-8')

# 4) Load v16 editor after the existing admin scripts.
h=admin_html.read_text(encoding='utf-8')
tag='<script src="/fvmarket-admin-crop-v16.js?v=16"></script>'
if tag not in h:
    anchor='<script src="/fvmarket-admin-security-v14.js?v=14"></script>'
    if anchor not in h: raise SystemExit('No se encontró el script de seguridad v14')
    h=h.replace(anchor,anchor+'\n'+tag,1)
admin_html.write_text(h,encoding='utf-8')

print('FVMarket v16 clipboard paste + crop editor applied')
