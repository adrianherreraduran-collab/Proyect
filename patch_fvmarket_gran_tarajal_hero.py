from pathlib import Path

p = Path('appsrc/public/index.html')
s = p.read_text(encoding='utf-8')
marker = '<!-- FVM_GRAN_TARAJAL_HERO_20260907 -->'
if marker in s:
    raise SystemExit('already patched')

css = r'''
<!-- FVM_GRAN_TARAJAL_HERO_20260907 -->
<style id="fvm-gran-tarajal-hero">
.v5hero{
  background-image:
    linear-gradient(90deg,rgba(3,42,75,.93) 0%,rgba(4,54,90,.70) 40%,rgba(0,30,62,.10) 72%),
    url('https://commons.wikimedia.org/wiki/Special:Redirect/file/Gran%20Tarajal%20(from%20the%20west).jpg?width=2560') !important;
  background-position:center 52% !important;
  background-size:cover !important;
  background-repeat:no-repeat !important;
}
@media(max-width:700px){.v5hero{background-position:58% center !important}}
.heroPhotoCredit{font-size:8px;color:#9fb2c5;opacity:.8;margin-top:8px}
.heroPhotoCredit a{color:inherit}
</style>
'''

s = s.replace('</head>', css + '\n</head>', 1)
# Add unobtrusive CC attribution in footer if possible
needle = '<div class="copyright">'
if needle in s:
    credit = '<div class="heroPhotoCredit">Foto de cabecera: Gran Tarajal (oeste), Addshore · CC BY-SA 4.0</div>'
    s = s.replace(needle, credit + needle, 1)

p.write_text(s, encoding='utf-8')
print('Gran Tarajal hero applied')
