from pathlib import Path
import re

p=Path('appsrc/public/index.html')
s=p.read_text(encoding='utf-8')

# Eliminar la barra superior duplicada de botones de categorías.
s, n = re.subn(r'<nav class="nav">.*?</nav>\s*', '', s, count=1, flags=re.S)
if n != 1:
    raise SystemExit('No se encontró la navegación superior duplicada')

# Mover las pestañas/categorías visuales existentes justo debajo de la cabecera y antes del hero.
m = re.search(r'(<div class="catsWrap"><div class="cats" id="cats">.*?</div></div>)\s*(<section class="section")', s, flags=re.S)
if not m:
    raise SystemExit('No se encontró el bloque de pestañas de categorías')
cats = m.group(1)
s = s[:m.start()] + m.group(2) + s[m.end():]
hero_pos = s.find('<section class="hero"')
if hero_pos < 0:
    hero_pos = s.find('<div class="hero"')
if hero_pos < 0:
    raise SystemExit('No se encontró el hero')
s = s[:hero_pos] + cats + '\n' + s[hero_pos:]

# Ajustar visualmente las pestañas al nuevo emplazamiento superior.
s = s.replace('.catsWrap{max-width:1480px;margin:-17px auto 0;position:relative;z-index:2;padding:0 28px}',
              '.catsWrap{max-width:1480px;margin:0 auto;position:relative;z-index:6;padding:10px 28px;background:#fff}')
s = s.replace('.cats{display:grid;grid-template-columns:repeat(7,1fr);gap:12px}',
              '.cats{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}')
s = s.replace('.cat{background:white;border:1px solid var(--line);box-shadow:var(--shadow);border-radius:10px;min-height:80px;padding:14px 16px;display:flex;gap:12px;align-items:center;cursor:pointer}',
              '.cat{background:white;border:1px solid var(--line);box-shadow:0 3px 10px rgba(0,34,73,.06);border-radius:9px;min-height:58px;padding:10px 14px;display:flex;gap:10px;align-items:center;cursor:pointer}')
s = s.replace('.catIcon{font-size:30px;color:var(--navy)}', '.catIcon{font-size:23px;color:var(--navy)}')
s = s.replace('.cat b{font-size:13px;display:block}', '.cat b{font-size:12px;display:block}')
s = s.replace('.cat small{font-size:11px;color:#294361}', '.cat small{font-size:10px;color:#294361}')

# Móvil: conservar las mismas pestañas sin la antigua barra azul.
s = s.replace('.navin{padding:0 14px;height:45px}.navbtn:not(:first-child){display:none}.mobileMenu{display:inline}', '')
s = s.replace('.catsWrap{padding:0 14px;margin-top:-20px}', '.catsWrap{padding:8px 14px;margin-top:0}')

if 'FVM_NAV_TABS_V1' not in s:
    s=s.replace('<!-- FVM_STOREFRONT_TAXONOMY_V2 -->','<!-- FVM_STOREFRONT_TAXONOMY_V2 -->\n<!-- FVM_NAV_TABS_V1 -->',1)

p.write_text(s,encoding='utf-8')
print('FVMarket navigation tabs updated')
