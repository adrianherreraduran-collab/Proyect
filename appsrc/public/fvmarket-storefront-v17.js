// FVM_STOREFRONT_V19 · texto nítido en HTML + banners a resolución nativa + categorías duplicadas eliminadas
(()=>{
  const slides=[
    {src:'/assets/fvmarket/hero-1.webp?v=19',cat:'Jardín',title:'Jardín y exterior',accent:'para cuidar mejor',desc:'Mangueras, riego, macetas, herramientas, accesorios y todo lo que necesitas para mantener tus espacios verdes y exteriores siempre en su mejor versión.',cta:'Descubrir jardín'},
    {src:'/assets/fvmarket/hero-2.webp?v=19',cat:'Herramientas',title:'Herramientas',accent:'para cada proyecto',desc:'Herramientas manuales y eléctricas para trabajar con precisión, comodidad y resultados profesionales.',cta:'Ver herramientas'},
    {src:'/assets/fvmarket/hero-3.webp?v=19',cat:'',title:'Ventanas y accesorios',accent:'para renovar tu hogar',desc:'Soluciones prácticas para mejorar cerramientos, aislamiento, ventilación y acabado en cada estancia.',cta:'Ver soluciones'},
    {src:'/assets/fvmarket/hero-4.webp?v=19',cat:'Baño y cocina',title:'Baño y cocina',accent:'con estilo y funcionalidad',desc:'Sanitarios, grifería, fontanería, muebles y accesorios pensados para renovar tus espacios.',cta:'Descubrir baño y cocina'},
    {src:'/assets/fvmarket/hero-5.webp?v=19',cat:'Electricidad',title:'Electricidad e iluminación',accent:'segura y eficiente',desc:'Material eléctrico, iluminación y accesorios para instalaciones fiables, modernas y bien terminadas.',cta:'Ver electricidad'},
    {src:'/assets/fvmarket/hero-6.webp?v=19',cat:'',title:'Todo para tu proyecto',accent:'en un solo lugar',desc:'Materiales, herramientas y soluciones para construir, renovar, reparar y mejorar tu hogar o tu obra.',cta:'Ver productos'}
  ];

  const css=document.createElement('style');
  css.id='fvmStoreV19Style';
  css.textContent=`
    .v5hero,.v5cats,.catsWrap{display:none!important}
    .v17Hero{position:relative;width:100%;background:#052e59;overflow:hidden}
    .v17Track{position:relative;width:min(100%,1400px);margin:0 auto;aspect-ratio:2/1;overflow:hidden;background:#052e59}
    .v17Slide{position:absolute;inset:0;opacity:0;transition:opacity .55s ease;pointer-events:none;background:#052e59;overflow:hidden}
    .v17Slide.active{opacity:1;pointer-events:auto}
    .v17Slide img{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover;object-position:center;image-rendering:auto;filter:contrast(1.035) saturate(1.025)}
    .v19Shade{position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(3,27,55,.985) 0%,rgba(3,34,68,.97) 34%,rgba(3,39,77,.88) 48%,rgba(3,39,77,.52) 61%,rgba(3,39,77,.10) 76%,rgba(3,39,77,0) 100%)}
    .v19Copy{position:absolute;z-index:2;left:clamp(44px,6vw,92px);top:50%;transform:translateY(-50%);width:min(620px,52%);color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.08)}
    .v19Copy h1{margin:0 0 16px;font-size:clamp(42px,4.1vw,66px);line-height:.98;letter-spacing:-1.8px;font-weight:950}.v19Copy h1 span{display:block;color:#f28a00}
    .v19Copy p{margin:0 0 21px;max-width:590px;font-size:clamp(15px,1.22vw,20px);line-height:1.42;font-weight:560;color:#eef5fb}
    .v19Cta{display:inline-flex;align-items:center;gap:14px;border:0;border-radius:8px;background:#f28a00;color:#fff;font-size:clamp(14px,1.08vw,18px);font-weight:900;padding:14px 24px;cursor:pointer;box-shadow:0 7px 22px rgba(0,0,0,.18)}.v19Cta:hover{background:#ff970f}.v19Cta i{font-style:normal;font-size:1.35em;line-height:1}
    .v19Trust{display:flex;align-items:center;gap:22px;margin-top:26px;flex-wrap:wrap}.v19Trust span{display:inline-flex;align-items:center;gap:8px;font-size:clamp(10px,.82vw,13px);font-weight:800;color:#f5f8fb;white-space:nowrap}.v19Trust b{display:grid;place-items:center;width:24px;height:24px;border:1px solid rgba(255,255,255,.35);border-radius:7px;background:rgba(255,255,255,.09);font-size:13px}
    .v17HeroBtn{position:absolute;top:50%;transform:translateY(-50%);z-index:5;width:42px;height:42px;border:0;border-radius:50%;background:#052e59d9;color:#fff;font-size:25px;cursor:pointer;box-shadow:0 5px 20px #0004}.v17HeroBtn:hover{background:#f28a00}.v17Prev{left:max(18px,calc((100vw - 1400px)/2 + 18px))}.v17Next{right:max(18px,calc((100vw - 1400px)/2 + 18px))}
    .v17Dots{position:absolute;z-index:6;left:50%;bottom:13px;transform:translateX(-50%);display:flex;gap:7px;background:#052e598c;padding:6px 9px;border-radius:999px}.v17Dot{width:8px;height:8px;border-radius:50%;border:0;background:#fff8;cursor:pointer;padding:0}.v17Dot.active{background:#f28a00;transform:scale(1.25)}
    .v13DeliveryStrip{background:#052e59!important}.v13RouteBanner{margin-top:14px!important;grid-template-columns:250px repeat(3,1fr)!important}.v13RouteTitle b span{color:inherit!important}.v13Van{display:none!important}
    @media(max-width:900px){.v17Track{width:100%;aspect-ratio:2/1;min-height:300px}.v19Copy{left:34px;width:58%}.v19Copy h1{font-size:clamp(34px,5.2vw,48px)}.v19Copy p{font-size:14px;margin-bottom:16px}.v19Trust{gap:12px;margin-top:18px}.v19Trust span{font-size:10px}.v17Prev{left:8px}.v17Next{right:8px}}
    @media(max-width:700px){.v17Track{aspect-ratio:auto;height:440px;min-height:440px}.v17Slide img{object-position:62% center}.v19Shade{background:linear-gradient(90deg,rgba(3,27,55,.98) 0%,rgba(3,34,68,.94) 58%,rgba(3,39,77,.50) 82%,rgba(3,39,77,.12) 100%)}.v19Copy{left:20px;right:20px;top:46%;width:auto;transform:translateY(-50%)}.v19Copy h1{font-size:36px;letter-spacing:-1px;margin-bottom:12px}.v19Copy p{font-size:13px;line-height:1.4;max-width:88%}.v19Cta{font-size:13px;padding:12px 18px}.v19Trust{display:none}.v17HeroBtn{width:34px;height:34px;font-size:19px}.v17Dots{bottom:10px}}
    @media(max-width:520px){.v17Track{height:390px;min-height:390px}.v19Copy h1{font-size:32px}.v19Copy p{font-size:12.5px;max-width:92%}.v17HeroBtn{display:none}.v17Dots{gap:5px}.v17Dot{width:7px;height:7px}}
  `;
  document.head.appendChild(css);

  let idx=0,timer=null,touchX=null;
  const trust=`<div class="v19Trust"><span><b>🚚</b>Envío en toda Fuerteventura</span><span><b>✓</b>Inspección de calidad</span><span><b>▣</b>Compra online segura</span></div>`;

  function copyFor(s){return `<div class="v19Shade"></div><div class="v19Copy"><h1>${s.title}<span>${s.accent}</span></h1><p>${s.desc}</p><button class="v19Cta" type="button">${s.cta}<i>›</i></button>${trust}</div>`}
  function go(n){const all=[...document.querySelectorAll('.v17Slide')],dots=[...document.querySelectorAll('.v17Dot')];if(!all.length)return;idx=(n+all.length)%all.length;all.forEach((x,i)=>x.classList.toggle('active',i===idx));dots.forEach((x,i)=>x.classList.toggle('active',i===idx));restart()}
  function restart(){clearInterval(timer);timer=setInterval(()=>go(idx+1),6500)}
  function filterCat(cat){if(!cat){document.querySelector('#productos,#productGrid,.v5lowerFull,.section')?.scrollIntoView({behavior:'smooth',block:'start'});return}try{if(typeof window.filterCategory==='function')window.filterCategory(cat);else if(typeof window.setCategory==='function')window.setCategory(cat)}catch{}document.querySelector('#productos,#productGrid,.v5lowerFull,.section')?.scrollIntoView({behavior:'smooth',block:'start'})}
  function removeDuplicateCategories(){document.querySelectorAll('.v5cats,.catsWrap').forEach(el=>el.remove())}

  function mount(){
    removeDuplicateCategories();
    if(document.getElementById('v17Hero'))return;
    const nav=document.querySelector('.v13Nav')||document.querySelector('.v5nav')||document.querySelector('.nav')||document.querySelector('nav');if(!nav)return;
    const hero=document.createElement('section');hero.id='v17Hero';hero.className='v17Hero';hero.setAttribute('aria-label','Destacados FVMarket');
    hero.innerHTML=`<div class="v17Track">${slides.map((s,i)=>`<div class="v17Slide ${i===0?'active':''}" data-i="${i}"><img src="${s.src}" alt="FVMarket · ${s.title}" ${i===0?'fetchpriority="high" decoding="sync"':'loading="lazy" decoding="async"'}>${copyFor(s)}</div>`).join('')}</div><button class="v17HeroBtn v17Prev" aria-label="Anterior">‹</button><button class="v17HeroBtn v17Next" aria-label="Siguiente">›</button><div class="v17Dots">${slides.map((_,i)=>`<button class="v17Dot ${i===0?'active':''}" data-i="${i}" aria-label="Ir a imagen ${i+1}"></button>`).join('')}</div>`;
    nav.insertAdjacentElement('afterend',hero);
    hero.querySelector('.v17Prev').onclick=()=>go(idx-1);hero.querySelector('.v17Next').onclick=()=>go(idx+1);hero.querySelectorAll('.v17Dot').forEach(b=>b.onclick=()=>go(Number(b.dataset.i)));
    hero.querySelectorAll('.v19Cta').forEach((b,i)=>b.onclick=e=>{e.stopPropagation();filterCat(slides[i]?.cat)});
    hero.querySelectorAll('.v17Slide').forEach(el=>el.onclick=()=>filterCat(slides[Number(el.dataset.i)]?.cat));
    hero.addEventListener('mouseenter',()=>clearInterval(timer));hero.addEventListener('mouseleave',restart);hero.addEventListener('touchstart',e=>touchX=e.touches?.[0]?.clientX??null,{passive:true});hero.addEventListener('touchend',e=>{if(touchX==null)return;const x=e.changedTouches?.[0]?.clientX??touchX;if(Math.abs(x-touchX)>45)go(idx+(x<touchX?1:-1));touchX=null},{passive:true});restart();
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

  let scheduled=false;const obs=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;removeDuplicateCategories();cleanText();mount()})});obs.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{removeDuplicateCategories();mount();cleanText()});else{removeDuplicateCategories();mount();cleanText()}
})();
