(function(){
  'use strict';

  const byId=id=>document.getElementById(id);
  let resetToken='';

  function addStyles(){
    if(byId('fvmPasswordResetStyles'))return;
    const style=document.createElement('style');
    style.id='fvmPasswordResetStyles';
    style.textContent=`
      #fvmForgotPasswordLink{display:block;width:100%;margin:10px 0 0;padding:0;border:0;background:transparent;color:#06345f;font:700 13px/1.4 inherit;text-align:center;text-decoration:underline;cursor:pointer}
      .fvmPasswordResetView{margin-top:8px}
      .fvmPasswordResetView h3{margin:0 0 8px;color:#06345f;font-size:20px}
      .fvmPasswordResetView p{margin:0 0 16px;color:#60748a;font-size:13px;line-height:1.45}
      .fvmPasswordResetBack{display:block;width:100%;margin-top:12px;padding:0;border:0;background:transparent;color:#06345f;font:700 13px/1.4 inherit;text-align:center;text-decoration:underline;cursor:pointer}
    `;
    document.head.appendChild(style);
  }

  function showOnly(view){
    const auth=byId('authView'),logged=byId('loggedView'),forgot=byId('fvmForgotView'),reset=byId('fvmResetView');
    if(auth)auth.style.display=view==='auth'?'block':'none';
    if(logged&&view!=='auth')logged.style.display='none';
    if(forgot)forgot.style.display=view==='forgot'?'block':'none';
    if(reset)reset.style.display=view==='reset'?'block':'none';
  }

  function showLogin(message){
    showOnly('auth');
    const msg=byId('authMsg');
    if(msg&&message)msg.textContent=message;
  }

  function showForgot(){
    const modal=byId('accountModal');if(modal)modal.classList.add('show');
    showOnly('forgot');
    const input=byId('fvmForgotEmail'),source=byId('authEmail');
    if(input&&!input.value&&source)input.value=source.value||'';
    setTimeout(()=>input?.focus(),0);
  }

  function showReset(token){
    if(!token)return;
    resetToken=token;
    const modal=byId('accountModal');if(modal)modal.classList.add('show');
    showOnly('reset');
    const msg=byId('fvmResetMsg');if(msg)msg.textContent='';
    setTimeout(()=>byId('fvmResetPassword')?.focus(),0);
  }

  function protectResetView(){
    const refresh=window.refreshAccount;
    if(typeof refresh!=='function'||refresh.__fvmPasswordResetWrapped)return;
    const wrapped=async function(){
      const result=await refresh.apply(this,arguments);
      if(resetToken&&byId('fvmResetView'))showOnly('reset');
      return result;
    };
    wrapped.__fvmPasswordResetWrapped=true;
    window.refreshAccount=wrapped;
  }

  async function requestReset(){
    const email=String(byId('fvmForgotEmail')?.value||'').trim();
    const msg=byId('fvmForgotMsg');
    if(!email){if(msg)msg.textContent='Introduce tu correo electrónico.';return}
    const button=byId('fvmForgotSubmit');if(button)button.disabled=true;
    if(msg)msg.textContent='Enviando enlace de recuperación…';
    try{
      const result=await api('/api/auth/forgot-password',{method:'POST',body:JSON.stringify({email})});
      if(msg)msg.textContent=result.message||'Si existe una cuenta con ese correo, recibirás un enlace de recuperación.';
    }catch(error){if(msg)msg.textContent=error.message||'No se pudo solicitar la recuperación.'}
    finally{if(button)button.disabled=false}
  }

  async function saveNewPassword(){
    const password=String(byId('fvmResetPassword')?.value||'');
    const confirmation=String(byId('fvmResetPasswordConfirm')?.value||'');
    const msg=byId('fvmResetMsg');
    if(password.length<8){if(msg)msg.textContent='La contraseña debe tener al menos 8 caracteres.';return}
    if(password!==confirmation){if(msg)msg.textContent='Las contraseñas no coinciden.';return}
    if(!resetToken){if(msg)msg.textContent='El enlace de recuperación no es válido o ha caducado.';return}
    const button=byId('fvmResetSubmit');if(button)button.disabled=true;
    if(msg)msg.textContent='Guardando nueva contraseña…';
    try{
      const result=await api('/api/auth/reset-password',{method:'POST',body:JSON.stringify({token:resetToken,password})});
      resetToken='';
      const url=new URL(location.href);url.searchParams.delete('reset');history.replaceState({},'',url.pathname+url.search+url.hash);
      const email=byId('fvmForgotEmail')?.value;
      showLogin(result.message||'Contraseña actualizada. Ya puedes iniciar sesión.');
      if(email&&byId('authEmail'))byId('authEmail').value=email;
      if(byId('authPassword'))byId('authPassword').value='';
    }catch(error){if(msg)msg.textContent=error.message||'No se pudo actualizar la contraseña.'}
    finally{if(button)button.disabled=false}
  }

  function buildViews(){
    const auth=byId('authView');if(!auth||byId('fvmForgotView'))return;
    addStyles();
    protectResetView();
    const link=document.createElement('button');
    link.type='button';link.id='fvmForgotPasswordLink';link.textContent='¿Has olvidado tu contraseña?';link.addEventListener('click',showForgot);
    byId('authSubmit')?.insertAdjacentElement('afterend',link);

    const forgot=document.createElement('div');forgot.id='fvmForgotView';forgot.className='fvmPasswordResetView';forgot.style.display='none';
    forgot.innerHTML='<h3>Restablecer contraseña</h3><p>Introduce tu correo y te enviaremos un enlace para crear una contraseña nueva.</p><div class="field"><label>Correo electrónico</label><input id="fvmForgotEmail" type="email" autocomplete="email" placeholder="correo@ejemplo.com"></div><button type="button" class="cta" id="fvmForgotSubmit" style="width:100%">Enviar enlace</button><div class="msg" id="fvmForgotMsg"></div><button type="button" class="fvmPasswordResetBack" id="fvmForgotBack">Volver a iniciar sesión</button>';
    auth.insertAdjacentElement('afterend',forgot);

    const reset=document.createElement('div');reset.id='fvmResetView';reset.className='fvmPasswordResetView';reset.style.display='none';
    reset.innerHTML='<h3>Crear nueva contraseña</h3><p>Elige una contraseña nueva para tu cuenta de FVMarket.</p><div class="field"><label>Nueva contraseña</label><input id="fvmResetPassword" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres"></div><div class="field"><label>Repite la contraseña</label><input id="fvmResetPasswordConfirm" type="password" autocomplete="new-password" placeholder="Repite la contraseña"></div><button type="button" class="cta" id="fvmResetSubmit" style="width:100%">Guardar nueva contraseña</button><div class="msg" id="fvmResetMsg"></div><button type="button" class="fvmPasswordResetBack" id="fvmResetBack">Volver a iniciar sesión</button>';
    forgot.insertAdjacentElement('afterend',reset);

    byId('fvmForgotSubmit').addEventListener('click',requestReset);
    byId('fvmForgotBack').addEventListener('click',()=>showLogin(''));
    byId('fvmResetSubmit').addEventListener('click',saveNewPassword);
    byId('fvmResetBack').addEventListener('click',()=>showLogin(''));
    byId('fvmForgotEmail').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();requestReset()}});
    [byId('fvmResetPassword'),byId('fvmResetPasswordConfirm')].forEach(input=>input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();saveNewPassword()}}));

    byId('tabLogin')?.addEventListener('click',()=>{link.style.display='block'});
    byId('tabRegister')?.addEventListener('click',()=>{link.style.display='none'});
    if(window.mode==='register')link.style.display='none';

    const token=new URL(location.href).searchParams.get('reset');
    if(token)showReset(token);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',buildViews);else buildViews();
  window.addEventListener('load',buildViews);
})();
