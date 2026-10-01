(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normal = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  let mounted = false, products = [];
  function role(){try{return session?.user?.role;}catch{return window.session?.user?.role;}}
  function selected(){return products.find(product=>String(product.id)===$('fvmRecommendationProduct')?.value);}
  function selectProduct(){const product=selected();$('fvmRecommendationText').value=product?.recommendation?.text||'';$('fvmRecommendationStatus').textContent=product?.recommendation?.text?'Recomendación publicada. Puedes editarla o retirarla.':'';}
  function filterProducts(){
    const select=$('fvmRecommendationProduct'),previous=select.value,query=normal($('fvmRecommendationSearch').value);
    select.innerHTML=products.filter(p=>normal(p.ref+' '+p.title).includes(query)).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.ref+' · '+p.title)+'</option>').join('');
    if([...select.options].some(option=>option.value===previous))select.value=previous;
    selectProduct();
  }
  async function load(){try{products=await api('/api/admin/products');filterProducts();}catch(error){$('fvmRecommendationStatus').textContent=error.message;}}
  async function save(clear=false){
    const product=selected(),message=$('fvmRecommendationStatus');if(!product){message.textContent='Selecciona un artículo.';return;}
    const controls=[...$('fvmRecommendationEditor').querySelectorAll('button,input,select,textarea')];controls.forEach(x=>x.disabled=true);
    try{
      const result=await api('/api/admin/products/'+encodeURIComponent(product.id)+'/recommendation',{method:'PUT',body:JSON.stringify({text:clear?'':$('fvmRecommendationText').value.trim()})});
      product.recommendation=result.recommendation;selectProduct();message.textContent=clear?'Recomendación retirada.':(product.published?'Recomendación publicada en la ficha del artículo.':'Recomendación guardada. Se verá cuando publiques el artículo.');
    }catch(error){message.textContent=error.message;}finally{controls.forEach(x=>x.disabled=false);}
  }
  function mount(){
    const view=$('view-reviews');if(mounted||role()!=='admin'||!view)return;
    mounted=true;const section=document.createElement('section');section.id='fvmRecommendationEditor';section.className='card';section.style.marginTop='18px';
    section.innerHTML='<h2>Recomendaciones de FVMarket</h2><p class="sub">Contenido promocional identificado como «Recomendación de FVMarket», separado de las opiniones y las estrellas de los clientes.</p><div class="field"><label for="fvmRecommendationSearch">Buscar artículo por nombre o referencia</label><input type="search" id="fvmRecommendationSearch" autocomplete="off"></div><div class="field"><label for="fvmRecommendationProduct">Artículo</label><select id="fvmRecommendationProduct" style="width:100%"></select></div><div class="field"><label for="fvmRecommendationText">Recomendación de FVMarket</label><textarea id="fvmRecommendationText" rows="5" maxlength="2000" style="width:100%;box-sizing:border-box"></textarea></div><button class="btn lime" type="button" id="fvmRecommendationSave">Publicar recomendación</button> <button class="btn ghost" type="button" id="fvmRecommendationRemove">Retirar recomendación</button> <button class="btn ghost" type="button" id="fvmRecommendationReload">Actualizar artículos</button><p id="fvmRecommendationStatus" role="status"></p>';
    view.appendChild(section);$('fvmRecommendationSearch').oninput=filterProducts;$('fvmRecommendationProduct').onchange=selectProduct;$('fvmRecommendationSave').onclick=()=>save();$('fvmRecommendationRemove').onclick=()=>save(true);$('fvmRecommendationReload').onclick=load;load();
  }
  const timer=setInterval(()=>{mount();if(mounted)clearInterval(timer);},500);mount();
})();
