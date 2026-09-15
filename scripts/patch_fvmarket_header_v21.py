from pathlib import Path
import re

INDEX = Path('appsrc/public/index.html')
MARKER = 'FVM_HEADER_ADMIN_V21'

html = INDEX.read_text(encoding='utf-8')

icon = '''<span class="fvmAdminIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z"/><path d="M19.1 13.5c.1-.5.1-1 0-1.5l2-1.6-2-3.5-2.5 1a8 8 0 0 0-1.3-.8L15 4.4h-4l-.4 2.7c-.5.2-.9.5-1.3.8l-2.5-1-2 3.5 2 1.6a8 8 0 0 0 0 1.5l-2 1.6 2 3.5 2.5-1c.4.3.8.6 1.3.8l.4 2.7h4l.4-2.7c.5-.2.9-.5 1.3-.8l2.5 1 2-3.5-2.1-1.6Z"/></svg></span><span class="sr-only">Administración</span>'''

pattern = re.compile(r'(<(?:a|button)\b[^>]*\bid="adminTop"[^>]*>)(.*?)(</(?:a|button)>)', re.I | re.S)
html, count = pattern.subn(lambda m: m.group(1) + icon + m.group(3), html)
if count == 0:
    raise SystemExit('No se encontró el acceso #adminTop en index.html')

css = f'''\n<style id="fvm-header-admin-v21">\n/* {MARKER} */\n.adminTop{{\n  width:40px!important;height:40px!important;min-width:40px!important;\n  padding:0!important;border-radius:999px!important;\n  align-items:center!important;justify-content:center!important;gap:0!important;\n  background:#f5f8fb!important;color:#06345f!important;\n  border:1px solid #dce4ec!important;box-shadow:none!important;\n  font-size:0!important;line-height:1!important;text-decoration:none!important;\n  transition:background .18s ease,border-color .18s ease,transform .18s ease!important;\n}}\n.adminTop.show{{display:inline-flex!important}}\n.adminTop:hover{{background:#edf4f8!important;border-color:#c8d7e3!important;transform:translateY(-1px)}}\n.adminTop .fvmAdminIcon{{display:grid!important;place-items:center!important;width:20px!important;height:20px!important}}\n.adminTop .fvmAdminIcon svg{{width:20px!important;height:20px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.75!important;stroke-linecap:round!important;stroke-linejoin:round!important}}\n.site-header-actions .adminTop,.v5actions .adminTop{{flex:0 0 40px!important}}\n@media(max-width:700px){{.adminTop{{width:36px!important;height:36px!important;min-width:36px!important}}.adminTop .fvmAdminIcon svg{{width:18px!important;height:18px!important}}}}\n</style>\n'''

if MARKER not in html:
    if '</head>' not in html:
        raise SystemExit('index.html no contiene </head>')
    html = html.replace('</head>', css + '</head>', 1)

INDEX.write_text(html, encoding='utf-8')
print(f'FVMarket header v21 aplicado; accesos admin actualizados: {count}')
