// FVM_ADMIN_SECURITY_V14
(()=>{
  const $=id=>document.getElementById(id);
  function apiCall(url,opt={}){return window.api?window.api(url,opt):Promise.reject(new Error('API no disponible'))}
  function mount(){
    const view=$('view-settings');if(!view||$('fvmAdminSecurityV14'))return;
    const card=document.createElement('div');card.className='card';card.id='fvmAdminSecurityV14';card.style.maxWidth='650px';card.style.marginTop='16px';card.innerHTML=`<h2>Seguridad de administración</h2><p class="sub">Cambia el usuario y el PIN utilizados para acceder al panel desde la tienda.</p><div class="field"><label>Usuario actual</label><input id="fvmSecCurrentUser" disabled></div><div class="field"><label>PIN actual *</label><input id="fvmSecCurrentPin" type="password" inputmode="numeric" autocomplete="current-password"></div><div class="field"><label>Nuevo usuario</label><input id="fvmSecNewUser" autocomplete="username" placeholder="admin"></div><div class="field"><label>Nuevo PIN</label><input id="fvmSecNewPin" type="password" inputmode="numeric" autocomplete="new-password" placeholder="4 a 12 dígitos"></div><div class="field"><label>Repetir nuevo PIN</label><input id="fvmSecNewPin2" type="password" inputmode="numeric" autocomplete="new-password"></div><button class="btn navy" id="fvmSecSave">Actualizar acceso</button><div class="msg" id="fvmSecMsg"></div><div class="notice">Por seguridad, para cualquier cambio debes introducir primero el PIN actual.</div>`;
    view.appendChild(card);$('fvmSecSave').onclick=saveSecurity;loadSecurity();
  }
  async function loadSecurity(){try{const d=await apiCall('/api/admin/security?_='+Date.now());$('fvmSecCurrentUser').value=d.username||'';$('fvmSecNewUser').value=d.username||''}catch(e){if($('fvmSecMsg'))$('fvmSecMsg').textContent=e.message||'No se pudo cargar la seguridad'}}
  async function saveSecurity(){
    const currentPin=$('fvmSecCurrentPin').value.trim(),newUsername=$('fvmSecNewUser').value.trim(),newPin=$('fvmSecNewPin').value.trim(),newPin2=$('fvmSecNewPin2').value.trim(),msg=$('fvmSecMsg'),btn=$('fvmSecSave');
    msg.textContent='';if(!currentPin){msg.textContent='Introduce el PIN actual.';return}if(newPin&&newPin!==newPin2){msg.textContent='Los nuevos PIN no coinciden.';return}if(newPin&&!/^\d{4,12}$/.test(newPin)){msg.textContent='El nuevo PIN debe tener entre 4 y 12 dígitos.';return}
    btn.disabled=true;btn.textContent='Actualizando…';
    try{const d=await apiCall('/api/admin/security',{method:'PUT',body:JSON.stringify({currentPin,newUsername,newPin})});if(d.token&&d.user){window.session={token:d.token,user:d.user};try{localStorage.setItem('fv_session',JSON.stringify(window.session))}catch{}}$('fvmSecCurrentPin').value='';$('fvmSecNewPin').value='';$('fvmSecNewPin2').value='';$('fvmSecCurrentUser').value=d.user?.username||newUsername;msg.textContent='Acceso de administración actualizado correctamente.'}catch(e){msg.textContent=e.message||'No se pudo actualizar'}finally{btn.disabled=false;btn.textContent='Actualizar acceso'}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,250));else setTimeout(mount,250);
})();
