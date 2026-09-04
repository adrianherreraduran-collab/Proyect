from pathlib import Path

p=Path('appsrc/public/admin.html')
a=p.read_text(encoding='utf-8')
old="const fvmObserver=new MutationObserver(()=>{fvmRefreshCategorySelects();fvmEnhanceProductForm()});fvmObserver.observe(document.body,{childList:true,subtree:true});\nsetTimeout(()=>{fvmLoadTax();fvmEnhanceProductForm()},500);"
new="// Evita un bucle de MutationObserver que podía bloquear el hilo principal y dejar /admin en blanco.\nsetTimeout(()=>{fvmLoadTax();fvmEnhanceProductForm()},250);\n// Refresca únicamente cuando se abre/edita un producto o cambia la taxonomía, no ante cada mutación del DOM."
if old not in a:
    raise SystemExit('No se encontró el observer problemático')
a=a.replace(old,new)
if 'FVM_ADMIN_FREEZE_FIX_V1' not in a:
    a=a.replace('<!-- FVM_ADMIN_TAXONOMY_V2 -->','<!-- FVM_ADMIN_TAXONOMY_V2 -->\n<!-- FVM_ADMIN_FREEZE_FIX_V1 -->',1)
p.write_text(a,encoding='utf-8')
print('Admin freeze fix applied')
