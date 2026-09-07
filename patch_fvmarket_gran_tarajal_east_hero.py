from pathlib import Path
import re

p = Path('appsrc/public/index.html')
s = p.read_text(encoding='utf-8')
marker = '/* FVM_GRAN_TARAJAL_EAST_HERO_V1 */'
if marker in s:
    raise SystemExit('already patched')

# Use the alternate Gran Tarajal panorama and bias the crop to show the town from the eastern side.
url = "https://commons.wikimedia.org/wiki/Special:Redirect/file/Gran%20Tarajal.jpg?width=2560"
css = f'''\n<style id="fvm-gran-tarajal-east-hero">\n{marker}\n.v5hero{{background-image:linear-gradient(90deg,rgba(3,42,75,.94) 0%,rgba(4,54,90,.70) 39%,rgba(0,30,62,.08) 73%),url('{url}')!important;background-position:center 54%!important;background-size:cover!important}}\n@media(max-width:700px){{.v5hero{{background-position:62% 52%!important}}}}\n</style>\n'''

s = s.replace('</head>', css + '</head>', 1)
p.write_text(s, encoding='utf-8')
