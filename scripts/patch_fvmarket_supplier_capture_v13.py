from pathlib import Path

server=Path('appsrc/server.js')
admin=Path('appsrc/public/admin.html')
index=Path('appsrc/public/index.html')

s=server.read_text(encoding='utf-8')
s=s.replace("const {registerProviderSourceRoutes} = require('./provider_sources_v12');","const {registerProviderSourceRoutes} = require('./supplier_capture_v13');")
s=s.replace("app.use(express.json({limit:'12mb'}));","app.use(express.json({limit:'30mb'}));")
old="const {sourceUrl,sourcePrice,sourceRef,sourceEan,sourceProvider,sourceBrand,sourceAvailability,sourceTaxNote,sourceCheckedAt,sourceSync,margin,addedValue,imageSource,imageLicense,imageAuthor,sourceImages,sourceStore,sourceSeller,providerKey,...safe}=p;"
new="const {sourceUrl,sourcePrice,sourceRef,sourceEan,sourceProvider,sourceBrand,sourceAvailability,sourceTaxNote,sourceCheckedAt,sourceSync,margin,addedValue,imageSource,imageLicense,imageAuthor,sourceImages,sourceStore,sourceSeller,providerKey,supplierId,...safe}=p;"
if old in s:
    s=s.replace(old,new,1)
server.write_text(s,encoding='utf-8')

h=admin.read_text(encoding='utf-8')
for oldtag in [
    '<script src="/fvmarket-admin-v12.js?v=12"></script>',
    '<script src="/fvmarket-admin-v11.js?v=11"></script>'
]:
    h=h.replace(oldtag,'<script src="/fvmarket-admin-v13.js?v=13"></script>')
if '/fvmarket-admin-v13.js?v=13' not in h:
    h=h.replace('</body>','<script src="/fvmarket-admin-v13.js?v=13"></script>\n</body>',1)
admin.write_text(h,encoding='utf-8')

x=index.read_text(encoding='utf-8')
if '/fvmarket-home-v13.js?v=13' not in x:
    x=x.replace('</body>','<script src="/fvmarket-home-v13.js?v=13"></script>\n</body>',1)
index.write_text(x,encoding='utf-8')

print('FVMarket supplier capture v13 patch applied')
