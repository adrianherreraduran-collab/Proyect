from pathlib import Path
import base64
import io
import re
import tarfile


ROOT = Path("appsrc")
index = ROOT / "public" / "index.html"
tests = ROOT / "test" / "core.test.js"


def replace_once(path, pattern, replacement, label):
    source = path.read_text(encoding="utf-8")
    result, count = re.subn(pattern, replacement, source, count=1, flags=re.DOTALL)
    if count != 1:
        raise SystemExit(f"No se encontró el bloque esperado: {label}")
    path.write_text(result, encoding="utf-8")


# Retira únicamente la cabecera duplicada del catálogo y su buscador secundario.
# El catálogo, los filtros y el buscador principal siguen disponibles.
replace_once(
    index,
    r'(<section class="site-section site-catalog-section" id="catalogo"><span id="productos"></span><span id="ofertas"></span>).*?(<div class="site-product-grid site-container" id="productGrid">)',
    r'\1\2',
    "cabecera y buscador secundario del catálogo",
)
replace_once(
    index,
    r"function clearCatalogSearch\(\)\{const input=document\.getElementById\('siteCatalogSearch'\);if\(input\)input\.value='';const clear=document\.getElementById\('siteCatalogClear'\);if\(clear\)clear\.style\.display='none';loadProducts\(\);document\.getElementById\('siteCatalogStatus'\)\.textContent='Disponibilidad a consultar'\}",
    "function clearCatalogSearch(){const input=document.getElementById('siteCatalogSearch');if(input)input.value='';const clear=document.getElementById('siteCatalogClear');if(clear)clear.style.display='none';loadProducts();const status=document.getElementById('siteCatalogStatus');if(status)status.textContent='Disponibilidad a consultar'}",
    "limpieza de filtros sin buscador secundario",
)
replace_once(
    tests,
    r"  assert\.match\(index, /Klarna y otros métodos disponibles para tu compra/\);",
    "  assert.match(index, /Klarna y otros métodos disponibles para tu compra/);\n  assert.doesNotMatch(index, /Productos destacados/);\n  assert.doesNotMatch(index, /Buscar por producto o referencia/);\n  assert.match(index, /Buscar productos, marcas o referencias/);",
    "prueba de cabecera del catálogo retirada",
)

archive = io.BytesIO()
with tarfile.open(fileobj=archive, mode="w:gz") as tar:
    for file in sorted(ROOT.rglob("*")):
        if file.is_file():
            tar.add(file, arcname=str(file.relative_to(ROOT)))
Path("fvmarket-app.tgz.b64").write_text(base64.b64encode(archive.getvalue()).decode("ascii"), encoding="ascii")
print("FVMarket: cabecera duplicada del catálogo retirada")
