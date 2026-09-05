from pathlib import Path
import re

path = Path('appsrc/public/admin.html')
text = path.read_text(encoding='utf-8')
pattern = re.compile(r'<div class="card wide"><h2>Importar productos desde un catálogo PDF</h2>.*?(?=<div class="card"><h2>Importar desde URL de producto</h2>)', re.S)
new_text, count = pattern.subn('', text, count=1)
if count != 1:
    raise SystemExit(f'No se encontró exactamente una sección PDF para eliminar (encontradas: {count})')
path.write_text(new_text, encoding='utf-8')
print('Sección de importación PDF eliminada correctamente')
