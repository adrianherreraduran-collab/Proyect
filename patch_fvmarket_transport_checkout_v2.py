from pathlib import Path

server=Path('appsrc/server.js')
index=Path('appsrc/public/index.html')
s=server.read_text(encoding='utf-8')
i=index.read_text(encoding='utf-8')

if 'FVM_TRANSPORT_CHECKOUT_V2' not in s:
    s=s.replace("app.post('/api/checkout/stripe',auth,async(req,res)=>{if(!stripe)return res.status(503).json({error:'Pago con tarjeta pendiente de activación'});const {items}=req.body||{};", "app.post('/api/checkout/stripe',auth,async(req,res)=>{if(!stripe)return res.status(503).json({error:'Pago con tarjeta pendiente de activación'});const {items,useRutaFV=false,rutaFVQuote=null,address='',phone=''}=req.body||{};// FVM_TRANSPORT_CHECKOUT_V2")
    s=s.replace("if(!line_items.length)return res.status(400).json({error:'Carrito vacío'});const base=process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`;const session=await stripe.checkout.sessions.create({mode:'payment',line_items,success_url:`${base}/?payment=success`,cancel_url:`${base}/?payment=cancel`,customer_email:req.user.email});res.json({url:session.url})});", "if(!line_items.length)return res.status(400).json({error:'Carrito vacío'});const transportAmount=useRutaFV?Math.max(0,Number(rutaFVQuote?.amount??rutaFVQuote?.total??0)):0;if(transportAmount>0)line_items.push({quantity:1,price_data:{currency:'eur',unit_amount:Math.round(transportAmount*100),product_data:{name:'Transporte RutaFV',description:'Servicio de entrega asociado a la compra FVMarket'}}});const base=process.env.PUBLIC_URL||`${req.protocol}://${req.get('host')}`;const session=await stripe.checkout.sessions.create({mode:'payment',line_items,success_url:`${base}/?payment=success`,cancel_url:`${base}/?payment=cancel`,customer_email:req.user.email,metadata:{source:'FVMarket',rutafv:String(!!useRutaFV),transport_amount:String(transportAmount),rutafv_quote_id:String(rutaFVQuote?.id||rutaFVQuote?.quoteId||''),delivery_address:String(address||'').slice(0,450),delivery_phone:String(phone||'').slice(0,100)}});res.json({url:session.url,transportAmount,totalIncludesTransport:transportAmount>0})});")

if 'FVM_TRANSPORT_CHECKOUT_UI_V2' not in i:
    i=i.replace("function renderCart(){let total=0;document.getElementById('cartItems').innerHTML=cart.map(i=>{", "function renderCart(){let total=0;document.getElementById('cartItems').innerHTML=cart.map(i=>{")
    i=i.replace("document.getElementById('cartTotal').textContent=eur(total);updateCart()}", "const transport=(document.getElementById('useRutaFV')?.checked&&rutaFVQuote)?Number(rutaFVQuote.amount??rutaFVQuote.total??0):0;document.getElementById('cartTotal').innerHTML=(transport?`<small style=\"display:block;font-size:11px;font-weight:700;color:var(--muted)\">Productos ${eur(total)} + RutaFV ${eur(transport)}</small>`:'')+eur(total+transport);updateCart()}// FVM_TRANSPORT_CHECKOUT_UI_V2")
    i=i.replace("async function checkoutStripe(){if(!await requireLogin())return;try{const r=await api('/api/checkout/stripe',{method:'POST',body:JSON.stringify({items:cart})});location.href=r.url}catch(e){cartMsg.textContent=e.message}}", "async function checkoutStripe(){if(!await requireLogin())return;try{if(document.getElementById('useRutaFV')?.checked&&!rutaFVQuote){cartMsg.textContent='Calcula primero el transporte RutaFV.';return}const r=await api('/api/checkout/stripe',{method:'POST',body:JSON.stringify({items:cart,useRutaFV:!!document.getElementById('useRutaFV')?.checked,rutaFVQuote:rutaFVQuote||null,address:orderAddress.value,phone:orderPhone.value})});location.href=r.url}catch(e){cartMsg.textContent=e.message}}")

server.write_text(s,encoding='utf-8')
index.write_text(i,encoding='utf-8')
print('transport checkout v2 applied')
