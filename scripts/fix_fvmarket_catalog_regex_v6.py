from pathlib import Path

p = Path('appsrc/public/admin.html')
s = p.read_text(encoding='utf-8')
marker = 'FVM_CATALOG_REGEX_FIX_V6'
if marker in s:
    print('v6 already applied')
    raise SystemExit(0)

start = s.find('/* FVM_CATALOG_REFERENCE_PARSER_V4 */')
if start < 0:
    raise SystemExit('V4 parser block not found')
end = s.find('</script>', start)
if end < 0:
    raise SystemExit('V4 parser end not found')
block = s[start:end]

# Fix regex literals that were emitted with a doubled backslash by the Python raw-string patch.
# Keep RegExp constructor strings intact; only literal regex /.../ expressions are corrected.
replacements = {
    r"/[€\\s]/g": r"/[€\s]/g",
    r"/^\\d{1,3}(?:\\.\\d{3})+(?:,\\d{2})?$/'": r"/^\d{1,3}(?:\.\d{3})+(?:,\d{2})?$/",
    r"/^\\d+\\.\\d{3}$/": r"/^\d+\.\d{3}$/",
    r"/\\S+/g": r"/\S+/g",
    r"/\\s/g": r"/\s/g",
    r"/^\\d{1,4}(?:[.,]\\d{1,3})?$/": r"/^\d{1,4}(?:[.,]\d{1,3})?$/",
    r"/\\s+/g": r"/\s+/g",
    r"/^(?:medidas?|alto|altura|ancho|largo|peso|potencia|capacidad|color(?:es)?|diámetro|serie|ref\\.?|precio|ø|max|min|rango)\\b/i": r"/^(?:medidas?|alto|altura|ancho|largo|peso|potencia|capacidad|color(?:es)?|diámetro|serie|ref\.?|precio|ø|max|min|rango)\b/i",
    r"/^[\\d(].*(?:cm|mm|kg|w|v|hp|litros?|piezas?|toneladas?|€)/i": r"/^[\d(].*(?:cm|mm|kg|w|v|hp|litros?|piezas?|toneladas?|€)/i",
    r"/^\\d+(?:[.,]\\d+)?$/": r"/^\d+(?:[.,]\d+)?$/",
    r"/(Baños(?:\\s*·\\s*Ocio y deporte)?|Electrodoméstico industrial|Pequeño electrodoméstico|Jardín(?:\\s*·\\s*Ordenación)?|Camping|Agricultura|Herramienta eléctrica(?:\\s*·\\s*Maquinaria)?|Bricolaje(?:\\s*·\\s*Soldadura)?|Automoción|Ventilación)/i": r"/(Baños(?:\s*·\s*Ocio y deporte)?|Electrodoméstico industrial|Pequeño electrodoméstico|Jardín(?:\s*·\s*Ordenación)?|Camping|Agricultura|Herramienta eléctrica(?:\s*·\s*Maquinaria)?|Bricolaje(?:\s*·\s*Soldadura)?|Automoción|Ventilación)/i",
}

for old, new in replacements.items():
    block = block.replace(old, new)

# Explicitly fix the most important tokenization expression and add a visible version marker.
block = block.replace("function piecesFromRec(r){", "/* FVM_CATALOG_REGEX_FIX_V6 */\n  function piecesFromRec(r){", 1)
block = block.replace("const rx=/\\\\S+/g;", "const rx=/\\S+/g;")

# Repair common doubled escapes in regex literals only, without touching string-based RegExp patterns.
block = block.replace("String(s).replace(/[€\\\\s]/g,'')", "String(s).replace(/[€\\s]/g,'')")
block = block.replace(".replace(/\\\\s/g,'')", ".replace(/\\s/g,'')")
block = block.replace(".replace(/\\\\s+/g,' ')", ".replace(/\\s+/g,' ')")

s = s[:start] + block + s[end:]
p.write_text(s, encoding='utf-8')
print('Applied FVMarket catalog regex fix v6')
