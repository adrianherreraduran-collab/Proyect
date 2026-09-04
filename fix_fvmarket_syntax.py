from pathlib import Path

p=Path("appsrc/server.js")
s=p.read_text(encoding="utf-8")
bad="async function parseCatalogBuffer(buffer){const data=await pdfParse(buffer);return {pages:data.numpages||0,candidates:catalogCandidatesFromText(data.text)}}}"
good="async function parseCatalogBuffer(buffer){const data=await pdfParse(buffer);return {pages:data.numpages||0,candidates:catalogCandidatesFromText(data.text)}}"
if bad not in s:
    raise SystemExit("Expected catalog syntax issue not found")
p.write_text(s.replace(bad,good,1),encoding="utf-8")
print("catalog syntax fixed")
