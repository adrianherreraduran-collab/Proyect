from pathlib import Path

server=Path('appsrc/server.js')
admin=Path('appsrc/public/admin.html')

s=server.read_text(encoding='utf-8')
s=s.replace("const {registerProviderSourceRoutes} = require('./provider_sources_v11');","const {registerProviderSourceRoutes} = require('./provider_sources_v12');")
server.write_text(s,encoding='utf-8')

h=admin.read_text(encoding='utf-8')
h=h.replace('<script src="/fvmarket-admin-v11.js?v=11"></script>','<script src="/fvmarket-admin-v12.js?v=12"></script>')
h=h.replace('<script src="/fvmarket-admin-v11.js?v=12"></script>','<script src="/fvmarket-admin-v12.js?v=12"></script>')
admin.write_text(h,encoding='utf-8')
print('FVMarket v12 provider patch applied')
