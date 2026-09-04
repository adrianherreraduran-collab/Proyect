from pathlib import Path

server=Path('appsrc/server.js')
index=Path('appsrc/public/index.html')
s=server.read_text(encoding='utf-8')
i=index.read_text(encoding='utf-8')

if 'FVM_TRANSPORT_CHECKOUT_V2' not in s:
    old="app.post('/api/checkout/stripe',auth,async(req,res)=>{if(!stripe)return res.status(503).json({error:'Pago con tarjeta pendiente de activación'});const {items}=req.body||{};const d=read();const line_items=[];for(const item of items||[]){const p=d.products.find(x=>x.id===item.id&&x.published);if(!p)continue;line_items.push({quantity:Math.max(1,Number(item.qty)||1),price_data:{currency:'eur',unit_amount:Math.round(offerPrice(p)*100),product_data:{name:p.title,metadata:{ref:p.ref}}}})}if(!line_items.length)return res.status(400).json({error:'Carrito vacío'});const base=process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`;const session=await stripe.checkout.sessions.create({mode:'payment',line_items,success_url:`${base}/?payment=success`,cancel_url:`${base}/?payment=cancel`,customer_email:req.user.email});res.json({url:session.url})});"
    new="""app.post('/api/checkout/stripe',auth,async(req,res)=>{\n  // FVM_TRANSPORT_CHECKOUT_V2\n  if(!stripe)return res.status(503).json({error:'Pago con tarjeta pendiente de activación'});\n  const body=req.body||{};\n  const items=Array.isArray(body.items)?body.items:[];\n  const useRutaFV=!!body.useRutaFV;\n  const quote=body.rutaFVQuote||{};\n  const d=read();\n  const line_items=[];\n  for(const item of items){\n    const p=d.products.find(x=>x.id===item.id&&x.published);\n    if(!p)continue;\n    line_items.push({quantity:Math.max(1,Number(item.qty)||1),price_data:{currency:'eur',unit_amount:Math.round(offerPrice(p)*100),product_data:{name:p.title,metadata:{ref:p.ref}}}});\n  }\n  if(!line_items.length)return res.status(400).json({error:'Carrito vacío'});\n  const transportAmount=useRutaFV?Math.max(0,Number(quote.amount||quote.total||0)):0;\n  if(transportAmount>0){\n    line_items.push({quantity:1,price_data:{currency:'eur',unit_amount:Math.round(transportAmount*100),product_data:{name:'Transporte RutaFV',description:'Servicio de entrega asociado a la compra FVMarket'}}});\n  }\n  const base=process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`;\n  const session=await stripe.checkout.sessions.create({\n    mode:'payment',\n    line_items,\n    success_url:`${base}/?payment=success`,\n    cancel_url:`${base}/?payment=cancel`,\n    customer_email:req.user.email,\n    metadata:{source:'FVMarket',rutafv:String(useRutaFV),transport_amount:String(transportAmount),rutafv_quote_id:String(quote.id||quote.quoteId||''),delivery_address:String(body.address||'').slice(0,450),delivery_phone:String(body.phone||'').slice(0,100)}\n  });\n  res.json({url:session.url,transportAmount,totalIncludesTransport:transportAmount>0});\n});"""
    if old not in s:
        raise SystemExit('checkout route not found')
    s=s.replace(old,new,1)

if 'FVM_TRANSPORT_CHECKOUT_UI_V2' not in i:
    oldtail="document.getElementById('cartTotal').textContent=eur(total);updateCart()}"
    newtail="const routeEl=document.getElementById('useRutaFV');const transport=(routeEl&&routeEl.checked&&rutaFVQuote)?Number(rutaFVQuote.amount||rutaFVQuote.total||0):0;document.getElementById('cartTotal').innerHTML=(transport?`<small style=\"display:block;font-size:11px;font-weight:700;color:var(--muted)\">Productos ${eur(total)} + RutaFV ${eur(transport)}</small>`:'')+eur(total+transport);updateCart()}// FVM_TRANSPORT_CHECKOUT_UI_V2"
    if oldtail not in i:
        raise SystemExit('cart total code not found')
    i=i.replace(oldtail,newtail,1)
    oldcheckout="async function checkoutStripe(){if(!await requireLogin())return;try{const r=await api('/api/checkout/stripe',{method:'POST',body:JSON.stringify({items:cart})});location.href=r.url}catch(e){cartMsg.textContent=e.message}}"
    newcheckout="async function checkoutStripe(){if(!await requireLogin())return;try{const routeEl=document.getElementById('useRutaFV');const use=!!(routeEl&&routeEl.checked);if(use&&!rutaFVQuote){cartMsg.textContent='Calcula primero el transporte RutaFV.';return}const r=await api('/api/checkout/stripe',{method:'POST',body:JSON.stringify({items:cart,useRutaFV:use,rutaFVQuote:rutaFVQuote||null,address:orderAddress.value,phone:orderPhone.value})});location.href=r.url}catch(e){cartMsg.textContent=e.message}}"
    if oldcheckout not in i:
        raise SystemExit('frontend checkout code not found')
    i=i.replace(oldcheckout,newcheckout,1)

server.write_text(s,encoding='utf-8')
index.write_text(i,encoding='utf-8')
print('transport checkout v2 applied')
