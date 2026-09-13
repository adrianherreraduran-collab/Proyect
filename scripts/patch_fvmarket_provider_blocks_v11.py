from pathlib import Path

server = Path('appsrc/server.js')
admin = Path('appsrc/public/admin.html')
s = server.read_text(encoding='utf-8')

anchor = "const {prepareImages} = require('./free_image_prep');"
extra = "const {registerProviderSourceRoutes} = require('./provider_sources_v11');"
if extra not in s:
    s = s.replace(anchor, anchor + '\n' + extra, 1)

start = s.index("function refPrefix(title='',category=''){")
end = s.index("function offerPrice", start)
new_refs = '''function refPrefix(title=''){
  const stop=new Set(['DE','DEL','LA','LAS','EL','LOS','Y','E','CON','PARA','POR','EN','UN','UNA','UNO','KIT','PACK']);
  const words=String(title||'PRODUCTO').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\\s+/).filter(Boolean).filter(x=>!stop.has(x)&&/[A-Z]/.test(x));
  if(words.length>=2)return (words[0][0]+words[1][0]).slice(0,2);
  if(words.length===1)return (words[0].replace(/[^A-Z]/g,'')+'X').slice(0,2);
  return 'PR';
}
function nextProductRef(d,title,category){
  const prefix=refPrefix(title);let max=0;
  for(const p of d.products||[]){const m=String(p.ref||'').toUpperCase().match(new RegExp('^'+prefix+'(\\\\d{4})$'));if(m)max=Math.max(max,Number(m[1])||0)}
  return `${prefix}${String(max+1).padStart(4,'0')}`;
}
'''
s = s[:start] + new_refs + s[end:]

s = s.replace('sourceImages,...safe}=p;', 'sourceImages,sourceStore,sourceSeller,providerKey,...safe}=p;', 1)
s = s.replace('ref:ownReference(own.title,f.sourcePrice,own.category)', 'ref:nextProductRef(read(),own.title,own.category)', 1)
s = s.replace("p.images.length<3", "p.images.length<1")
s = s.replace("checkImages.length<3", "checkImages.length<1")
s = s.replace("Para publicar un anuncio se requieren al menos 3 imágenes.", "Para publicar un producto se requiere al menos 1 imagen.")

registration = "registerProviderSourceRoutes(app,admin,{read,save,id,nextProductRef,aiAnalyzeItems,guessCategory,cleanProductTitle,normalizeProductImages});"
if registration not in s:
    pos = s.index('app.listen(')
    s = s[:pos] + '\n// FVM_PROVIDER_BLOCKS_V11\n' + registration + '\n' + s[pos:]
server.write_text(s, encoding='utf-8')

h = admin.read_text(encoding='utf-8')
h = h.replace('<script src="/fvmarket-admin-v10.js?v=10"></script>', '<script src="/fvmarket-admin-v11.js?v=11"></script>')
if '/fvmarket-admin-v11.js?v=11' not in h:
    h = h.replace('</body>', '<script src="/fvmarket-admin-v11.js?v=11"></script>\n</body>')
admin.write_text(h, encoding='utf-8')
print('FVMarket v11 aplicado')
