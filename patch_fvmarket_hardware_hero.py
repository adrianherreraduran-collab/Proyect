from pathlib import Path
import re
p=Path('appsrc/public/index.html')
s=p.read_text(encoding='utf-8')
marker='<!-- FVM_HARDWARE_HERO_V1 -->'
if marker in s:
    raise SystemExit('already patched')
# Insert marker after body tag
s=s.replace('<body>','<body>\n'+marker,1)
# Replace hero background with a cleaner blue field plus visual product collage on right
s=re.sub(r"\.v5hero\{[^}]*background:[^}]*\}", ".v5hero{min-height:420px;background:linear-gradient(90deg,rgba(3,42,75,.98) 0%,rgba(4,54,90,.88) 46%,rgba(4,54,90,.20) 73%),url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=2400&q=92') center 46%/cover no-repeat;position:relative;overflow:hidden}", s, count=1)
# Add collage to hero inner if not present
needle='<div class="v5heroText">'
collage='''<div class="heroTradeCollage" aria-hidden="true"><span class="hc hc1"></span><span class="hc hc2"></span><span class="hc hc3"></span><div class="heroTradeLabel">Construcción · Ferretería · Bricolaje</div></div>'''
idx=s.find(needle)
if idx!=-1:
    # place collage after hero text closing div before hero trust/right elements by targeting v5island if present or heroInner close
    island='<div class="v5island"'
    j=s.find(island, idx)
    if j!=-1:
        s=s[:j]+collage+s[j:]
    else:
        hero_end=s.find('</section>', idx)
        s=s[:hero_end]+collage+s[hero_end:]
# Hide any lingering island slogan in hero
s += '''\n<style id="fvm-hardware-hero-v1">
.v5island{display:none!important}
.heroTradeCollage{position:absolute;right:40px;bottom:20px;width:min(47vw,650px);height:330px;pointer-events:none}
.heroTradeCollage .hc{position:absolute;display:block;background-size:cover;background-position:center;border-radius:18px;box-shadow:0 18px 45px rgba(0,20,45,.30);border:4px solid rgba(255,255,255,.88)}
.heroTradeCollage .hc1{width:48%;height:73%;right:0;bottom:15px;background-image:url('https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=92');transform:rotate(2deg)}
.heroTradeCollage .hc2{width:41%;height:58%;right:38%;bottom:8px;background-image:url('https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=900&q=92');transform:rotate(-3deg)}
.heroTradeCollage .hc3{width:38%;height:48%;right:19%;top:0;background-image:url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=92');transform:rotate(1deg)}
.heroTradeLabel{position:absolute;right:2%;bottom:0;background:rgba(4,50,83,.93);color:white;border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:10px 18px;font-size:12px;font-weight:900;letter-spacing:.2px;box-shadow:0 8px 20px rgba(0,20,45,.25)}
.v5heroText{position:relative;z-index:3}.heroTrust{position:relative;z-index:3}
@media(max-width:1000px){.heroTradeCollage{opacity:.52;right:-70px;width:55vw}.v5heroText{max-width:620px}}
@media(max-width:700px){.heroTradeCollage{width:88vw;right:-44vw;bottom:12px;opacity:.34}.heroTradeLabel{display:none}.v5hero{background-position:center}}
</style>\n'''
p.write_text(s,encoding='utf-8')
