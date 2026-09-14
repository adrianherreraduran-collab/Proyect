// FVM_STOREFRONT_V17 · supplied carousel + neutral delivery branding
(()=>{
  const slides=[
    {src:'/assets/fvmarket/hero-1.webp',cat:'Jardín',alt:'FVMarket · Jardín y exterior'},
    {src:'/assets/fvmarket/hero-2.webp',cat:'Herramientas',alt:'FVMarket · Bricolaje y herramientas'},
    {src:'/assets/fvmarket/hero-3.webp',cat:'',alt:'FVMarket · Ventanas y accesorios'},
    {src:'/assets/fvmarket/hero-4.webp',cat:'Baño y cocina',alt:'FVMarket · Baño, sanitarios y fontanería'},
    {src:'/assets/fvmarket/hero-5.webp',cat:'Electricidad',alt:'FVMarket · Electricidad e iluminación'},
    {src:'/assets/fvmarket/hero-6.webp',cat:'',alt:'FVMarket · Todo para tu proyecto'}
  ];
  const css=document.createElement('style');css.id='fvmStoreV17Style';css.textContent=`
    .v5hero,.v5cats{display:none!important}
    .v17Hero{position:relative;width:100%;background:#052e59;overflow:hidden}.v17Track{position:relative;width:100%;aspect-ratio:2/1;max-height:590px;min-height:260px}.v17Slide{position:absolute;inset:0;opacity:0;transition:opacity .65s ease;pointer-events:none;background:#052e59}.v17Slide.active{opacity:1;pointer-events:auto}.v17Slide img{width:100%;height:100%;display:block;object-fit:cover;object-position:center}.v17HeroBtn{position:absolute;top:50%;transform:translateY(-50%);z-index:4;width:42px;height:42px;border:0;border-radius:50%;background:#052e59d9;color:#fff;font-size:25px;cursor:pointer;box-shadow:0 5px 20px #0004}.v17HeroBtn:hover{background:#f28a00}.v17Prev{left:18px}.v17Next{right:18px}.v17Dots{position:absolute;z-index:5;left:50%;bottom:13px;transform:translateX(-50%);display:flex;gap:7px;background:#052e598c;padding:6px 9px;border-radius:999px}.v17Dot{width:8px;height:8px;border-radius:50%;border:0;background:#fff8;cursor:pointer;padding:0}.v17Dot.active{background:#f28a00;transform:scale(1.25)}
    .v13DeliveryStrip{background:#052e59!important}.v13RouteBanner{margin-top:14px!important;grid-template-columns:250px repeat(3,1fr)!important}.v13RouteTitle b span{color:inherit!important}.v13Van{display:none!important}
    @media(max-width:800px){.v17Track{min-height:210px;aspect-ratio:2/1}.v17HeroBtn{width:34px;height:34px;font-size:19px}.v17Prev{left:8px}.v17Next{right:8px}.v17Dots{bottom:7px}}
    @media(max-width:520px){.v17Track{min-height:180px}.v17Slide img{object-fit:cover}.v17HeroBtn{display:none}.v17Dots{gap:5px}.v17Dot{width:7px;height:7px}}
  `;document.head.appendChild(css);

  let idx=0,timer=null,touchX=null;
  function go(n){const all=[...document.querySelectorAll('.v17Slide')],dots=[...document.querySelectorAll('.v17Dot')];if(!all.length)return;idx=(n+all.length)%all.length;all.forEach((x,i)=>x.classList.toggle('active',i===idx));dots.forEach((x,i)=>x.classList.toggle('active',i===idx));restart()}
  function restart(){clearInterval(timer);timer=setInterval(()=>go(idx+1),6500)}
  function filterCat(cat){if(!cat)return;try{if(typeof window.filterCategory==='function')window.filterCategory(cat);else if(typeof window.setCategory==='function')window.setCategory(cat)}catch{}document.querySelector('#productos,#productGrid,.v5lowerFull')?.scrollIntoView({behavior:'smooth',block:'start'})}
  function mount(){
    if(document.getElementById('v17Hero'))return;
    const nav=document.querySelector('.v13Nav')||document.querySelector('.v5nav')||document.querySelector('nav');if(!nav)return;
    const hero=document.createElement('section');hero.id='v17Hero';hero.className='v17Hero';hero.setAttribute('aria-label','Destacados FVMarket');hero.innerHTML=`<div class="v17Track">${slides.map((s,i)=>`<div class="v17Slide ${i===0?'active':''}" data-i="${i}"><img src="${s.src}" alt="${s.alt}" ${i===0?'fetchpriority="high"':'loading="lazy"'}></div>`).join('')}</div><button class="v17HeroBtn v17Prev" aria-label="Anterior">‹</button><button class="v17HeroBtn v17Next" aria-label="Siguiente">›</button><div class="v17Dots">${slides.map((_,i)=>`<button class="v17Dot ${i===0?'active':''}" data-i="${i}" aria-label="Ir a imagen ${i+1}"></button>`).join('')}</div>`;
    nav.insertAdjacentElement('afterend',hero);
    hero.querySelector('.v17Prev').onclick=()=>go(idx-1);hero.querySelector('.v17Next').onclick=()=>go(idx+1);hero.querySelectorAll('.v17Dot').forEach(b=>b.onclick=()=>go(Number(b.dataset.i)));hero.querySelectorAll('.v17Slide').forEach(el=>el.onclick=()=>filterCat(slides[Number(el.dataset.i)]?.cat));hero.addEventListener('mouseenter',()=>clearInterval(timer));hero.addEventListener('mouseleave',restart);hero.addEventListener('touchstart',e=>touchX=e.touches?.[0]?.clientX??null,{passive:true});hero.addEventListener('touchend',e=>{if(touchX==null)return;const x=e.changedTouches?.[0]?.clientX??touchX;if(Math.abs(x-touchX)>45)go(idx+(x<touchX?1:-1));touchX=null},{passive:true});restart();
  }

  const replacements=[
    [/Entrega profesional en toda Fuerteventura con\s*RutaFV/gi,'Lo enviamos a tu obra en toda Fuerteventura'],
    [/Entrega con\s*RutaFV/gi,'Lo enviamos a tu obra'],
    [/Reparto con\s*RutaFV/gi,'Lo enviamos a tu obra'],
    [/Transporte\s*RutaFV/gi,'Envío a tu obra'],
    [/RutaFV\s*·\s*Transporte/gi,'Envío a tu obra'],
    [/Calculando transporte con\s*RutaFV/gi,'Calculando envío a tu obra'],
    [/Calcula primero el transporte\s*RutaFV/gi,'Calcula primero el envío a tu obra'],
    [/RutaFV no respondió a tiempo[^.]*\.?/gi,'No se pudo calcular el envío en este momento.'],
    [/mediante\s*RutaFV/gi,'con envío a tu obra'],
    [/con\s*RutaFV/gi,'a tu obra'],
    [/RutaFV/gi,'servicio de entrega']
  ];
  function cleanText(root=document.body){
    if(!root)return;const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(w.nextNode())nodes.push(w.currentNode);for(const n of nodes){let s=n.nodeValue;if(!s||!/RutaFV/i.test(s))continue;for(const [rx,to] of replacements)s=s.replace(rx,to);n.nodeValue=s}
    const strip=document.querySelector('.v13DeliveryStrip');if(strip)strip.innerHTML='<span>🚚</span><span><b>Lo enviamos a tu obra</b> en toda Fuerteventura</span><span class="sep">|</span><span>Compra fácil y segura</span>';
    const title=document.querySelector('.v13RouteTitle');if(title)title.innerHTML='<span class="v13Truck">🚚</span><div><b>Lo enviamos a tu obra</b><small>En toda Fuerteventura</small></div>';
  }
  let scheduled=false;const obs=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;cleanText();mount()})});obs.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mount();cleanText()});else{mount();cleanText()}
})();
