from pathlib import Path
import re

p=Path('appsrc/public/index.html')
s=p.read_text(encoding='utf-8')
marker='<!-- FVM_STOREFRONT_POLISH_V6 -->'
if marker in s:
    raise SystemExit('already patched')

# Marker
s=s.replace('<!-- FVM_TEMPLATE_V5_20260907 -->','<!-- FVM_TEMPLATE_V5_20260907 -->\n'+marker,1)

# Remove Fuerteventura nos mueve texts in hero/footer.
s=re.sub(r'<div class="v5island">.*?</div>','',s,count=1,flags=re.S)
s=re.sub(r'<div class="islandFooter">.*?</div>','',s,count=1,flags=re.S)

# Upgrade hero to a real high-resolution Fuerteventura landscape from Wikimedia Commons.
hero_img="https://commons.wikimedia.org/wiki/Special:Redirect/file/Montana%20Colorada%20-%20Landscape%20-%20Fuerteventura%20-%2001.jpg?width=2560"
s=re.sub(r"\.v5hero\{min-height:420px;background:[^}]+\}",
         ".v5hero{min-height:420px;background:linear-gradient(90deg,rgba(3,42,75,.94) 0%,rgba(4,54,90,.72) 42%,rgba(0,30,62,.10) 76%),url('"+hero_img+"') center 52%/cover no-repeat}",
         s,count=1)

# Make the Ofertas category tile richer: photographic hardware background + sale label.
s=s.replace('<div class="catPic p5"><span>%</span></div><b>Ofertas</b>',
            '<div class="catPic p5"><span class="saleTag">OFERTAS</span><span class="salePct">%</span></div><b>Ofertas</b>',1)
s=re.sub(r"\.catPic\.p5\{[^}]+\}",
         ".catPic.p5{background:linear-gradient(135deg,rgba(4,50,88,.18),rgba(66,166,42,.34)),url('https://images.unsplash.com/photo-1581783898377-1c85bf937427?auto=format&fit=crop&w=1000&q=90') center/cover;display:flex;align-items:flex-end;justify-content:space-between;padding:12px}",
         s,count=1)
s=re.sub(r"\.catPic\.p5 span\{[^}]+\}",
         ".catPic.p5 .salePct{font-size:52px;color:#fff;font-weight:950;text-shadow:0 3px 14px #0008}.catPic.p5 .saleTag{font-size:12px;color:#fff;background:#e53935;border-radius:999px;padding:6px 10px;font-weight:950;letter-spacing:.6px;box-shadow:0 4px 12px #0003}",
         s,count=1)

# Product sections full-width with carousel controls.
s=s.replace('<section class="v5section" id="ofertas"><div class="secHead"><h2><span class="greenDash">—</span> Ofertas destacadas</h2><button class="linkbtn" onclick="filterOffers()">Ver todas las ofertas&nbsp; →</button></div><div class="products v5products" id="offerGrid"></div></section>',
'''<section class="v5section fullRail" id="ofertas"><div class="secHead"><h2><span class="greenDash">—</span> Ofertas destacadas</h2><div class="railActions"><button class="railBtn" onclick="slideRail('offerGrid',-1)">‹</button><button class="railBtn" onclick="slideRail('offerGrid',1)">›</button><button class="linkbtn" onclick="filterOffers()">Ver todas las ofertas&nbsp; →</button></div></div><div class="products v5products rail" id="offerGrid"></div></section>''',1)

# Ensure recommended products section occupies full width and remove any leftover shipping aside if present.
s=re.sub(r'<section class="v5lower">\s*<div class="v5recommend">', '<section class="v5section fullRail"><div class="v5recommend">', s, count=1)
s=s.replace('<div class="secHead"><h2><span class="greenDash">—</span> Productos recomendados</h2><button class="linkbtn" onclick="loadProducts()">Ver todos&nbsp; →</button></div><div class="products v5products" id="productGrid"></div>',
'''<div class="secHead"><h2><span class="greenDash">—</span> Productos recomendados</h2><div class="railActions"><button class="railBtn" onclick="slideRail('productGrid',-1)">‹</button><button class="railBtn" onclick="slideRail('productGrid',1)">›</button><button class="linkbtn" onclick="loadProducts()">Ver todos&nbsp; →</button></div></div><div class="products v5products rail" id="productGrid"></div>''',1)
# If an old inline shipping calculator remains in this section, remove it and close section correctly.
s=re.sub(r'</div><aside class="shipCalc" id="envio">.*?</aside></section>', '</div></section>', s, count=1, flags=re.S)

# Append carousel CSS before closing head.
css='''\n<style id="fvm-polish-v6-css">
.fullRail{max-width:1480px!important}.railActions{display:flex;align-items:center;gap:7px}.railBtn{width:32px;height:32px;border:1px solid #dbe5ed;background:#fff;color:#083b68;border-radius:50%;font-size:22px;line-height:1;cursor:pointer;font-weight:900}.railBtn:hover{background:#083b68;color:#fff}.rail{display:flex!important;gap:14px!important;overflow-x:auto!important;scroll-behavior:smooth;scroll-snap-type:x mandatory;padding:3px 2px 10px;scrollbar-width:none}.rail::-webkit-scrollbar{display:none}.rail .product{flex:0 0 calc((100% - 70px)/6);min-width:190px;scroll-snap-align:start}.v5recommend{width:100%}.v5section.fullRail{padding-left:28px;padding-right:28px}.v5hero{background-attachment:scroll}
@media(max-width:1050px){.rail .product{flex-basis:calc((100% - 28px)/3)}}
@media(max-width:700px){.rail .product{flex-basis:72vw;min-width:220px}.railActions .linkbtn{display:none}.v5section.fullRail{padding-left:14px;padding-right:14px}}
</style>\n'''
s=s.replace('</head>',css+'</head>',1)

# Add JS helpers + automatic rotation for long rails.
js='''\n<script id="fvm-polish-v6-js">
function slideRail(id,dir){const el=document.getElementById(id);if(!el)return;const card=el.querySelector('.product');const step=(card?.getBoundingClientRect().width||220)+14;el.scrollBy({left:dir*step*2,behavior:'smooth'})}
function autoRail(id){const el=document.getElementById(id);if(!el)return;setInterval(()=>{const max=el.scrollWidth-el.clientWidth;if(max<80)return;if(el.scrollLeft>=max-20)el.scrollTo({left:0,behavior:'smooth'});else slideRail(id,1)},5500)}
window.addEventListener('load',()=>{setTimeout(()=>{autoRail('offerGrid');autoRail('productGrid')},1200)})
</script>\n'''
s=s.replace('</body>',js+'</body>',1)

p.write_text(s,encoding='utf-8')
print('patched storefront polish v6')
