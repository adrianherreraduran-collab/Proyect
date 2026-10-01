(() => {
  'use strict';
  if(document.getElementById('fvmAssistant'))return;
  const $=id=>document.getElementById(id);
  const state={open:false,configured:false,busy:false,productId:'',request:0,controller:null,identity:''};
  const currentSession=()=>{try{return session || null;}catch{return window.session || null;}};
  const identity=()=>currentSession()?.token || '';
  const money=value=>Number(value || 0).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
  const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
  const launcher=make('button','fvmAssistantLauncher');launcher.id='fvmAssistantLauncher';launcher.type='button';launcher.setAttribute('aria-label','Abrir asistente de FVMarket');launcher.setAttribute('aria-controls','fvmAssistant');launcher.setAttribute('aria-expanded','false');
  launcher.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 3v-11a8 8 0 1 1 18 0Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 11h.01M12 11h.01M17 11h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><span>Ayuda</span>';
  const panel=make('section','fvmAssistant');panel.id='fvmAssistant';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','fvmAssistantTitle');
  // This is a non-modal panel: other page content remains available.
  panel.innerHTML='<header><div><h2 id="fvmAssistantTitle">Asistente FVMarket</h2><p id="fvmAssistantMode">Ayuda sobre productos y compras</p></div><button type="button" id="fvmAssistantClose" aria-label="Cerrar conversación">×</button></header><div class="fvmAssistantMessages" id="fvmAssistantMessages" role="log" aria-live="polite" aria-label="Conversación"></div><form id="fvmAssistantForm"><label class="fvmAssistantVisuallyHidden" for="fvmAssistantQuestion">Tu pregunta</label><div class="fvmAssistantFormRow"><textarea id="fvmAssistantQuestion" rows="1" maxlength="500" placeholder="¿En qué podemos ayudarte?" required></textarea><button id="fvmAssistantSend" type="submit">Enviar</button></div><p class="fvmAssistantNotice" id="fvmAssistantNotice">Evita compartir datos personales. <a href="/legal/privacidad" target="_blank" rel="noopener">Privacidad</a></p></form>';
  document.body.append(launcher,panel);
  const messages=$('fvmAssistantMessages'),input=$('fvmAssistantQuestion'),send=$('fvmAssistantSend');
  function message(text,role='assistant') {const node=make('div','fvmAssistantMessage'+(role==='user'?' user':''),text);messages.appendChild(node);messages.scrollTop=messages.scrollHeight;return node;}
  function welcome() {
    messages.replaceChildren();message('Hola, puedo ayudarte a encontrar artículos y resolver dudas sobre tus compras. Escribe el nombre o la referencia de un producto.');
    const suggestions=make('div','fvmAssistantSuggestions');
    for(const text of ['Cómo comprar','Transporte y plazos','Devoluciones','Mis pedidos']){const button=make('button','',text);button.type='button';button.addEventListener('click',()=>ask(text));suggestions.appendChild(button);}
    messages.appendChild(suggestions);input.value='';state.productId='';
  }
  function close() {state.open=false;state.request++;state.controller?.abort();state.controller=null;state.busy=false;send.disabled=false;input.disabled=false;panel.hidden=true;launcher.hidden=false;launcher.setAttribute('aria-expanded','false');welcome();launcher.focus();}
  async function open() {
    state.open=true;state.identity=identity();panel.hidden=false;launcher.hidden=true;launcher.setAttribute('aria-expanded','true');welcome();input.focus();
    try {const response=await fetch('/api/assistant/status');if(!response.ok)return;const status=await response.json();state.configured=!!status.aiConfigured;$('fvmAssistantMode').textContent=state.configured?'Asistente con IA · Catálogo y compras':'Ayuda sobre productos y compras';const notice=$('fvmAssistantNotice');notice.replaceChildren(document.createTextNode(state.configured?'Las respuestas con IA pueden contener errores. Evita compartir datos personales. ':'Evita compartir datos personales. '));const link=make('a','','Privacidad');link.href='/legal/privacidad';link.target='_blank';link.rel='noopener';notice.appendChild(link);}catch{}
  }
  async function showProduct(id,ref) {
    try {
      const opts={headers:identity()?{Authorization:'Bearer '+identity()}:{}},response=await fetch('/api/products?q='+encodeURIComponent(ref),opts);if(!response.ok)throw Error();const list=await response.json(),product=list.find(item=>item.id===id);if(!product)throw Error();
      try {if(!products.some(item=>item.id===id))products.push(product);else products[products.findIndex(item=>item.id===id)]=product;if(typeof catalogProducts!=='undefined')catalogProducts.set(id,product);}catch{window.products=list;}
      close();window.openProductDetail?.(id);
    }catch{message('Este artículo ya no está disponible. Actualiza el catálogo para comprobarlo.');}
  }
  function render(result) {
    const node=message(result.answer || 'No he podido encontrar esa información.');
    if(result.mode==='ai')node.appendChild(make('div','fvmAssistantSource','Respuesta generada con IA · Consulta la ficha para confirmar.'));
    const rows=Array.isArray(result.products)?result.products:[];state.productId=rows.length===1?String(rows[0].id):'';
    for(const product of rows){const button=make('button','fvmAssistantProduct');button.type='button';button.appendChild(make('strong','',product.title));button.appendChild(make('small','','Ref. '+product.ref));const price=make('div');if(product.originalPrice>product.price){price.appendChild(make('s','',money(product.originalPrice)));price.appendChild(make('b','',money(product.price)));button.appendChild(price);button.appendChild(make('small','','Descuento aplicado: '+Number(product.discountPct).toLocaleString('es-ES')+' %'));}else{price.appendChild(make('b','',money(product.price)));button.appendChild(price);}button.appendChild(make('small','','Plazo estimado: '+product.deliveryEstimate));button.appendChild(make('small','','Ver artículo →'));button.addEventListener('click',()=>showProduct(product.id,product.ref));node.appendChild(button);}
    const links=make('div','fvmAssistantLinks');
    for(const item of result.links || []){if(typeof item.path!=='string'||!(/^\/legal\/[a-z]+$/.test(item.path)||/^mailto:[^\s<>]+@[^\s<>]+$/.test(item.path)))continue;const link=make('a','',item.label);link.href=item.path;if(item.path.startsWith('/')){link.target='_blank';link.rel='noopener';}links.appendChild(link);}
    for(const action of result.actions || [])if(action.type==='account'){const button=make('button','',action.label);button.type='button';button.addEventListener('click',()=>{close();window.openAccount?.();});links.appendChild(button);}
    if(links.children.length)node.appendChild(links);messages.scrollTop=messages.scrollHeight;
  }
  async function ask(text) {
    const value=String(text || input.value || '').trim();if(!value || state.busy)return;if(value.length>500){input.reportValidity();return;}
    if(identity()!==state.identity){state.identity=identity();welcome();}
    message(value,'user');input.value='';state.busy=true;send.disabled=true;input.disabled=true;
    const busy=make('div','fvmAssistantBusy','Consultando…');messages.appendChild(busy);messages.scrollTop=messages.scrollHeight;
    const request=++state.request,token=identity(),controller=new AbortController();state.controller=controller;const timeout=setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch('/api/assistant/message',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({message:value,...(state.productId?{productId:state.productId}:{})}),signal:controller.signal});
      const result=await response.json();if(!state.open || request!==state.request)return;if(token!==identity()){welcome();message('La sesión ha cambiado. Vuelve a realizar tu consulta.');return;}if(!response.ok)throw Error(result.error || 'No se pudo consultar la información.');render(result);
    }catch(error){if(state.open && request===state.request)message(error.name==='AbortError'?'La consulta está tardando demasiado. Inténtalo de nuevo.':error.message || 'No se pudo consultar la información.');}
    finally{clearTimeout(timeout);busy.remove();if(request===state.request){state.controller=null;state.busy=false;send.disabled=false;input.disabled=false;if(state.open)input.focus();}}
  }
  launcher.addEventListener('click',open);$('fvmAssistantClose').addEventListener('click',close);$('fvmAssistantForm').addEventListener('submit',event=>{event.preventDefault();ask();});
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();ask();}});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
  setInterval(()=>{if(state.open && identity()!==state.identity){state.identity=identity();state.request++;state.controller?.abort();state.busy=false;send.disabled=false;input.disabled=false;welcome();}},1000);
})();
