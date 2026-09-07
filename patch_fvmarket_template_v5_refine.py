from pathlib import Path

p=Path('appsrc/public/index.html')
s=p.read_text(encoding='utf-8')
marker='<!-- FVM_TEMPLATE_V5_REFINE_20260907 -->'
if marker in s:
    raise SystemExit('already patched')
if '<!-- FVM_TEMPLATE_V5_20260907 -->' not in s:
    raise SystemExit('template v5 not found')

# 1) Quitar navegación duplicada superior.
start=s.find('<nav class="v5nav">')
if start!=-1:
    end=s.find('</nav>', start)
    if end!=-1:
        s=s[:start]+s[end+6:]

# 2) Logo azul + verde.
s=s.replace('.v5logo span{color:#1c5b8b}', '.v5logo span{color:#42a62a}')

# 3) Hero más propio de Fuerteventura, sin molino.
old="url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=2000&q=88')"
new="url('https://rutafv-frontend.onrender.com/rutafv-hero-clean.jpg')"
s=s.replace(old,new)

# 4) Ofertas con fotografía, no bloque plano de porcentaje.
s=s.replace(".catPic.p5{background:linear-gradient(135deg,#9be35d,#35ac38);display:grid;place-items:center}", ".catPic.p5{background:linear-gradient(135deg,rgba(38,154,51,.35),rgba(4,56,92,.10)),url('https://images.unsplash.com/photo-1607083206968-13611e3d76db?auto=format&fit=crop&w=700&q=82') center/cover;display:grid;place-items:center}")
s=s.replace('.catPic.p5 span{font-size:62px;color:#fff;font-weight:950}', '.catPic.p5 span{font-size:48px;color:#fff;font-weight:950;text-shadow:0 3px 15px rgba(0,0,0,.35);background:#e53935d9;border-radius:16px;padding:2px 14px}')

# 5) Tarjeta RutaFV como acceso al calculador modal.
old_card='''<article class="rutafv"><div><h3>Entrega con <strong>RutaFV</strong></h3><p>Rápida · Segura · En toda la isla</p><button onclick="document.getElementById('envio').scrollIntoView({behavior:'smooth'})">Calcula tu envío&nbsp; →</button></div><div class="routeSketch">▣<span>Fuerteventura</span></div></article>'''
new_card='''<article class="rutafv transportEntry" onclick="openTransportCalc()" role="button" tabindex="0"><div><h3>Tú compras,<br><strong>nosotros te lo llevamos</strong></h3><p>Entrega profesional con RutaFV · Rápida · Segura · En toda la isla</p><button onclick="event.stopPropagation();openTransportCalc()">Calcular transporte&nbsp; →</button></div><div class="routeSketch">🚚<span>RutaFV</span></div></article>'''
s=s.replace(old_card,new_card)

# 6) Quitar calculador inferior repetido y dar ancho completo a recomendados.
old_lower='''<section class="v5lower"><div class="v5recommend"><div class="secHead"><h2><span class="greenDash">—</span> Productos recomendados</h2><button class="linkbtn" onclick="loadProducts()">Ver todos&nbsp; →</button></div><div class="products v5products" id="productGrid"></div></div><aside class="shipCalc" id="envio"><div class="shipCalcTitle"><span class="shipCalcIcon">🚚</span><div><h3>Calcula tu envío con <span>RutaFV</span></h3><p>Introduce tu dirección y te mostramos el coste exacto.</p></div></div><div class="field"><input id="quickShipAddress" placeholder="Escribe tu dirección (ej. Calle la Palma 16, Gran Tarajal)"></div><div class="shipCalc2"><div class="field"><label>Municipio</label><input id="quickShipCity" placeholder="Gran Tarajal"></div><div class="field"><label>Código postal</label><input id="quickShipPostal" inputmode="numeric" placeholder="35620"></div></div><button class="shipCalcBtn" onclick="quickRutaFVQuote()">Calcular envío&nbsp; →</button><div id="quickShipMsg" class="shipCalcMsg">Añade productos al carrito e inicia sesión para calcular el transporte.</div><div class="shipCalcFoot"><span>▣ Transporte seguro</span><span>↗ Seguimiento en tiempo real</span></div></aside></section>'''
new_lower='''<section class="v5lower v5lowerFull"><div class="v5recommend"><div class="secHead"><h2><span class="greenDash">—</span> Productos recomendados</h2><button class="linkbtn" onclick="loadProducts()">Ver todos&nbsp; →</button></div><div class="products v5products" id="productGrid"></div></div></section>'''
s=s.replace(old_lower,new_lower)

# 7) Modal único para cálculo de transporte, abierto desde la tarjeta RutaFV.
transport_modal='''\n<div class="modal transportModal" id="transportModal"><div class="shade" onclick="closeTransportCalc()"></div><div class="transportBox"><button class="close" onclick="closeTransportCalc()">×</button><div class="shipCalcTitle"><span class="shipCalcIcon">🚚</span><div><h3>Calcula tu transporte con <span>RutaFV</span></h3><p>Introduce la dirección de entrega y calculamos el servicio antes de hacer el pedido.</p></div></div><div class="field"><label>Dirección de entrega</label><input id="quickShipAddress" autocomplete="off" placeholder="Ej. Calle la Palma 16, Gran Tarajal"></div><div class="shipCalc2"><div class="field"><label>Municipio / localidad</label><input id="quickShipCity" placeholder="Gran Tarajal"></div><div class="field"><label>Código postal</label><input id="quickShipPostal" inputmode="numeric" placeholder="35620"></div></div><button class="shipCalcBtn" onclick="quickRutaFVQuote()">Calcular transporte&nbsp; →</button><div id="quickShipMsg" class="shipCalcMsg">Añade productos al carrito e inicia sesión para calcular el transporte.</div><div class="shipCalcFoot"><span>▣ Transporte seguro</span><span>↗ Seguimiento en tiempo real</span></div></div></div>\n'''
insert_at=s.find('<div class="drawer" id="cartDrawer">')
if insert_at!=-1:
    s=s[:insert_at]+transport_modal+s[insert_at:]

# 8) Pagos visibles: tarjeta y transferencia.
s=s.replace('Tarjeta, Bizum o transferencia','Tarjeta o transferencia')
s=s.replace('<span class="pay">Bizum</span>','')

# 9) CSS/JS complementarios.
extra='''\n<style id="fvm-template-v5-refine-css">
.transportEntry{cursor:pointer;transition:.18s}.transportEntry:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(4,43,77,.18)}
.v5lowerFull{display:block!important}.v5lowerFull .v5recommend{width:100%}.v5lowerFull .v5products{grid-template-columns:repeat(6,1fr)}
.transportBox{position:relative;background:#fff;width:min(620px,94vw);margin:8vh auto;border-radius:18px;padding:24px;box-shadow:0 28px 90px rgba(0,25,55,.38)}
.transportBox .shipCalcTitle{margin-bottom:14px}.transportBox .shipCalcBtn{width:100%}.transportBox .close{position:absolute;right:14px;top:14px;z-index:2}
@media(max-width:1000px){.v5lowerFull .v5products{grid-template-columns:repeat(3,1fr)}}
@media(max-width:700px){.v5lowerFull .v5products{display:flex;overflow:auto}.transportBox{margin:3vh auto;padding:18px}.topline{display:none}.v5hero{background-position:center}}
</style>
<script id="fvm-template-v5-refine-js">
function openTransportCalc(){const m=document.getElementById('transportModal');if(m)m.classList.add('show')}
function closeTransportCalc(){const m=document.getElementById('transportModal');if(m)m.classList.remove('show')}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTransportCalc()});
</script>\n'''
s=s.replace('</body>',marker+extra+'</body>')

p.write_text(s,encoding='utf-8')
print('FVMarket template v5 refined')
