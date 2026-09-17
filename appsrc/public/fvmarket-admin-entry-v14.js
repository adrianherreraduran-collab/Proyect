// FVM_ADMIN_ENTRY_V14
(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function css(){if(document.getElementById('fvmAdminEntryV14Css'))return;const s=document.createElement('style');s.id='fvmAdminEntryV14Css';s.textContent=`
    #adminTop,button.adminTop,a.adminTop,.site-footer .adminLink,.v5footer .adminLink{display:none!important}
    .site-footer-inner{position:relative!important;display:flex!important;align-items:center;justify-content:space-between;gap:18px!important;padding-right:40px!important}
    .v5footer .footerin{flex-wrap:wrap!important}
    #fvmAdminEntryV14{position:absolute!important;right:0;top:50%;display:inline-flex!important;align-items:center;justify-content:center;width:30px!important;height:30px!important;margin:0;padding:0;color:#6c8499!important;background:transparent;border:1px solid #cbd8e4;border-radius:50%;font-size:0!important;font-weight:700!important;line-height:1;text-decoration:none!important;cursor:pointer;box-shadow:none;transform:translateY(-50%);transition:background .18s,border-color .18s,color .18s}
    #fvmAdminEntryV14::before{content:'⚙';font-size:15px;line-height:1;opacity:.9}
    #fvmAdminEntryV14:hover{color:#0b4a76!important;background:#edf6fb;border-color:#82c341;transform:translateY(-50%)}
    @media(max-width:650px){.site-footer-inner{padding-right:34px!important;text-align:center}.site-footer-inner>span{display:block}#fvmAdminEntryV14{right:0;width:28px!important;height:28px!important}#fvmAdminEntryV14::before{font-size:14px}}
    .fvmAdminEntryShade{position:fixed;inset:0;background:#03264ad9;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
    .fvmAdminEntryBox{width:min(430px,94vw);background:white;border-radius:15px;padding:22px;box-shadow:0 30px 90px #0007;color:#10233f}
    .fvmAdminEntryBox h2{margin:0 0 4px;color:#06345f;font-size:22px}.fvmAdminEntryBox p{margin:0 0 16px;color:#64748b;font-size:12px}
    .fvmAdminEntryBox label{display:block;font-size:11px;font-weight:900;margin:10px 0 5px}.fvmAdminEntryBox input{width:100%;height:43px;border:1px solid #d8e0e9;border-radius:8px;padding:0 12px;outline:none}.fvmAdminEntryBox input:focus{border-color:#f28a00;box-shadow:0 0 0 3px #f28a0020}
    .fvmAdminEntryBtns{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}.fvmAdminEntryBtns button{border:0;border-radius:8px;padding:10px 14px;font-weight:900;cursor:pointer}.fvmAdminCancel{background:#eef4f8;color:#06345f}.fvmAdminGo{background:#06345f;color:white}.fvmAdminMsg{font-size:11px;color:#a32929;min-height:16px;margin-top:8px}
  `;document.head.appendChild(s)}
  function findFooter(){return document.querySelector('#site-storefront .site-footer-inner')||document.querySelector('.site-footer .footerin')||document.querySelector('.v5footer .footerin')||document.querySelector('footer .footerin')||document.querySelector('footer')||document.body}
  function mountLink(){
    document.querySelectorAll('#adminTop,button.adminTop,a.adminTop,a.adminLink,a[href="/admin"]').forEach(x=>{x.style.setProperty('display','none','important');x.setAttribute('aria-hidden','true')});
    if(document.getElementById('fvmAdminEntryV14'))return;
    const a=document.createElement('a');a.id='fvmAdminEntryV14';a.href='#';a.textContent='Administración FVMarket';a.setAttribute('aria-label','Acceso de administración FVMarket');a.title='Acceso de administración FVMarket';a.onclick=e=>{e.preventDefault();openLogin()};
    const footer=findFooter();footer.appendChild(a);
  }
  function openLogin(message=''){
    document.querySelector('.fvmAdminEntryShade')?.remove();
    const m=document.createElement('div');m.className='fvmAdminEntryShade';m.innerHTML=`<div class="fvmAdminEntryBox"><h2>Administración FVMarket</h2><p>Acceso exclusivo al panel de administración.</p><label>Usuario</label><input id="fvmAdminEntryUser" value="admin" autocomplete="username"><label>PIN</label><input id="fvmAdminEntryPin" type="password" inputmode="numeric" autocomplete="current-password" autofocus><div class="fvmAdminMsg" id="fvmAdminEntryMsg">${esc(message)}</div><div class="fvmAdminEntryBtns"><button class="fvmAdminCancel" id="fvmAdminEntryCancel">Cancelar</button><button class="fvmAdminGo" id="fvmAdminEntryGo">Entrar</button></div></div>`;
    document.body.appendChild(m);document.getElementById('fvmAdminEntryCancel').onclick=()=>m.remove();document.getElementById('fvmAdminEntryGo').onclick=login;document.getElementById('fvmAdminEntryPin').onkeydown=e=>{if(e.key==='Enter')login()};setTimeout(()=>document.getElementById('fvmAdminEntryPin')?.focus(),30)
  }
  async function login(){
    const user=document.getElementById('fvmAdminEntryUser')?.value.trim()||'',pin=document.getElementById('fvmAdminEntryPin')?.value.trim()||'',msg=document.getElementById('fvmAdminEntryMsg'),btn=document.getElementById('fvmAdminEntryGo');
    if(!user||!pin){msg.textContent='Introduce usuario y PIN.';return}btn.disabled=true;btn.textContent='Entrando…';
    try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,pin})});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||'Acceso denegado');if(!['admin','catalog_manager','orders_manager','operator'].includes(d?.user?.role))throw Error('La cuenta no tiene permisos para el panel');localStorage.setItem('fv_session',JSON.stringify(d));sessionStorage.setItem('fvm_admin_authorized_tab','1');location.href='/admin'}catch(e){msg.textContent=e.message||'No se pudo acceder';btn.disabled=false;btn.textContent='Entrar'}
  }
  window.openFvmAdminLogin=openLogin;
  css();if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountLink);else mountLink();
  if(new URLSearchParams(location.search).get('admin')==='login'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>openLogin());else openLogin()}
})();
