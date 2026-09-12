from pathlib import Path

p = Path('appsrc/server.js')
s = p.read_text(encoding='utf-8')
catchall = "app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));"

# El catch-all debe ir después de todas las rutas /api; de lo contrario
# intercepta búsquedas de direcciones, presupuestos y otras rutas GET.
s = s.replace(catchall, '')
listen = "app.listen(PORT,'0.0.0.0',()=>console.log(`FVMarket listening on ${PORT}`));"
if listen not in s:
    raise SystemExit('app.listen marker not found')
s = s.replace(listen, catchall + "\n\n" + listen, 1)
p.write_text(s, encoding='utf-8')
