from pathlib import Path
import base64
import io
import tarfile

ROOT = Path("appsrc")


def replace_once(path, old, new, label):
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"No se encontró el bloque esperado: {label}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


server = ROOT / "server.js"
emails = ROOT / "transactional_emails.js"
index = ROOT / "public" / "index.html"
tests = ROOT / "test" / "core.test.js"

# Stripe Checkout: no limitar el pago a tarjeta. Stripe elige en tiempo real
# los métodos habilitados y elegibles (Klarna incluido cuando corresponda).
replace_once(server, "'Tarjeta (Stripe)'", "'Pago seguro (Stripe)'", "etiqueta de pago público")
replace_once(server, "<b>Pago con tarjeta mediante Stripe</b>", "<b>Pago seguro procesado mediante Stripe</b>", "factura Stripe")
replace_once(
    server,
    "async function createStripePaymentLink(req,d,o,accessToken=''){",
    "function stripeIntegrationIdentifier(){const alphabet='abcdefghijklmnopqrstuvwxyz';return `fvmarket_${[...crypto.randomBytes(8)].map(byte=>alphabet[byte%alphabet.length]).join('')}`}\n\nasync function createStripePaymentLink(req,d,o,accessToken=''){",
    "identificador de integración Stripe",
)
replace_once(server, "mode:'payment',payment_method_types:['card'],line_items", "mode:'payment',line_items", "métodos de pago dinámicos")
replace_once(
    server,
    "locale:'es',metadata:{source:'FVMarket'",
    "locale:'es',integration_identifier:stripeIntegrationIdentifier(),metadata:{source:'FVMarket'",
    "metadatos de Checkout",
)
replace_once(
    server,
    "El único método de pago online es la tarjeta mediante Stripe. FVMarket no almacena los datos completos de la tarjeta.",
    "El pago online se procesa mediante Stripe. Stripe mostrará tarjeta y, cuando el importe, el país y el cliente cumplan los requisitos, métodos de pago a plazo u otros métodos compatibles, como Klarna. FVMarket no almacena los datos completos del medio de pago.",
    "condiciones de pago",
)
replace_once(server, "method:'Tarjeta (Stripe)'", "method:'Pago seguro (Stripe)'", "historial de pagos")
replace_once(server, "pago seguro con tarjeta en Stripe", "pago seguro procesado por Stripe", "mensaje de pedidos")
replace_once(server, "El pago con tarjeta no está configurado todavía", "El pago mediante Stripe no está configurado todavía", "error de configuración")
replace_once(server, "No se pudo iniciar el pago con tarjeta", "No se pudo iniciar el pago mediante Stripe", "error de checkout")

# Textos de correo y de checkout.
replace_once(emails, "El pago con tarjeta está pendiente de confirmación por Stripe.", "El pago mediante Stripe está pendiente de confirmación.", "correo de pedido")
replace_once(emails, "pago seguro con tarjeta.", "pago seguro mediante Stripe.", "correo de enlace")
replace_once(emails, "label: 'Pagar con tarjeta'", "label: 'Ir al pago seguro'", "botón de correo")

replace_once(index, 'id="search" type="search" placeholder="Buscar productos, marcas o referencias..."', 'id="search" type="search" autocomplete="off" placeholder="Buscar productos, marcas o referencias..."', "autocompletar búsqueda principal")
replace_once(index, 'id="siteCatalogSearch" type="search" placeholder="Buscar por producto o referencia"', 'id="siteCatalogSearch" type="search" autocomplete="off" placeholder="Buscar por producto o referencia"', "autocompletar búsqueda de catálogo")
replace_once(index, "Pagar con tarjeta mediante Stripe", "Ir al pago seguro", "botón de checkout")
replace_once(index, "Pago cifrado y procesado por Stripe. FVMarket no guarda los datos de tu tarjeta.", "Pago cifrado y procesado por Stripe. Stripe mostrará tarjeta, Klarna y otros métodos disponibles para tu compra. FVMarket no guarda los datos de pago.", "aviso de checkout")
replace_once(
    index,
    "let products=[],mode='login';let cart=JSON.parse(localStorage.getItem('fv_cart')||'[]');let session=JSON.parse(localStorage.getItem('fv_session')||'null');let catalogProducts=new Map();",
    "let products=[],mode='login';let cart=JSON.parse(localStorage.getItem('fv_cart')||'[]');let session=null;function resetStorefrontStartState(){session=null;try{localStorage.removeItem('fv_session');document.querySelectorAll('input[type=\"search\"]').forEach(input=>{input.value=''});const clear=document.getElementById('siteCatalogClear');if(clear)clear.style.display='none'}catch{}}resetStorefrontStartState();window.addEventListener('pageshow',event=>{if(event.persisted){resetStorefrontStartState();loadProducts();refreshAccount()}});let catalogProducts=new Map();",
    "inicio sin sesión ni búsqueda",
)

# Pruebas que evitan una regresión a "solo tarjeta" o sesión persistente.
replace_once(tests, "correos y páginas legales reflejan Stripe y la validación de disponibilidad", "correos y páginas legales reflejan Stripe, Klarna elegible y la validación de disponibilidad", "nombre de prueba legal")
replace_once(tests, "/único método de pago online es la tarjeta mediante Stripe/i", "/métodos de pago a plazo.*Klarna/i", "prueba legal")
replace_once(tests, "la tienda conserva la sesión y ofrece solo Stripe con consentimiento", "la tienda inicia sin sesión ni búsqueda y ofrece Stripe con métodos dinámicos", "nombre de prueba de checkout")
replace_once(tests, "  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');", "  const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');\n  const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');", "fuente de prueba Stripe")
replace_once(
    tests,
    "  assert.match(index, /Pagar con tarjeta mediante Stripe/);",
    "  assert.match(index, /resetStorefrontStartState/);\n  assert.match(index, /localStorage\\.removeItem\\('fv_session'\\)/);\n  assert.match(index, /Klarna y otros métodos disponibles para tu compra/);\n  assert.doesNotMatch(source, /payment_method_types\\s*:/);\n  assert.match(source, /integration_identifier:stripeIntegrationIdentifier\\(\\)/);\n  assert.match(source, /checkout\\.session\\.async_payment_succeeded/);",
    "aserciones de checkout dinámico",
)

archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode="w:gz") as tar:
    for file in sorted(ROOT.rglob("*")):
        if file.is_file():
            tar.add(file, arcname=str(file.relative_to(ROOT)))
Path("fvmarket-app.tgz.b64").write_text(base64.b64encode(archive.getvalue()).decode("ascii"), encoding="ascii")
print("FVMarket: Stripe dinámico y arranque público aplicados")
