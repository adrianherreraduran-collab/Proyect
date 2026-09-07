from pathlib import Path
p=Path('appsrc/public/index.html')
s=p.read_text(encoding='utf-8')
marker='<!-- FVM_REFERENCE_TEMPLATE_20260907 -->'
if marker in s:
    raise SystemExit('already patched')
css=r'''
<style id="fvm-reference-template-20260907">
/* FVM_REFERENCE_TEMPLATE_20260907 */
.topline{display:none!important}
.v5head{
  min-height:104px!important;
  padding:14px 34px!important;
  grid-template-columns:360px minmax(440px,1fr) 430px!important;
  gap:28px!important;
  background:#fff!important;
}
.v5brand .cartLogo{font-size:54px!important}
.v5logo{font-size:54px!important;letter-spacing:-2.8px!important}
.v5brand small{font-size:10px!important;letter-spacing:.6px!important}
.v5search{height:54px!important}
.v5actions{gap:28px!important}
.v5actions .ha .icon{font-size:31px!important}
.v5actions .ha b{font-size:13px!important}
.v5nav{display:none!important}

.v5hero{
  min-height:345px!important;
  background-image:
    linear-gradient(90deg,rgba(2,43,77,.98) 0%,rgba(4,64,105,.88) 34%,rgba(4,64,105,.35) 58%,rgba(4,64,105,.05) 76%),
    url('https://commons.wikimedia.org/wiki/Special:Redirect/file/Gran%20Tarajal.jpg?width=2560')!important;
  background-position:center 53%!important;
  background-size:cover!important;
  overflow:hidden!important;
}
.v5hero .heroInner{
  min-height:345px!important;
  padding:34px 44px!important;
  align-items:center!important;
}
.v5heroText{max-width:620px!important;z-index:5!important}
.v5hero h1{font-size:48px!important;line-height:1.02!important;margin-bottom:12px!important}
.v5hero p{font-size:18px!important;line-height:1.35!important;margin-bottom:16px!important}
.v5hero .cta{padding:13px 23px!important;border-radius:8px!important}
.heroTrust{margin-top:25px!important;gap:30px!important}
.heroTrust>span{font-size:24px!important}
.heroTrust b{font-size:11px!important}
.heroTrust small{font-size:9px!important}
.heroTradeLabel,.v5island{display:none!important}

.heroTradeCollage{
  display:block!important;
  position:absolute!important;
  right:-14px!important;
  top:0!important;
  bottom:auto!important;
  width:min(54vw,810px)!important;
  height:345px!important;
  opacity:1!important;
  pointer-events:none!important;
  z-index:2!important;
}
.heroTradeCollage:before{
  content:'';position:absolute;inset:0;
  background:linear-gradient(90deg,rgba(3,50,86,.0) 0%,rgba(3,50,86,.02) 22%,rgba(255,255,255,.03) 100%);
}
.heroTradeCollage .hc{
  border:0!important;
  border-radius:0!important;
  box-shadow:none!important;
  transform:none!important;
}
.heroTradeCollage .hc1{
  width:42%!important;height:100%!important;right:0!important;bottom:0!important;
  background-image:url('https://images.unsplash.com/photo-1607586408909-151ba11a12e2?auto=format&fit=crop&w=1300&q=88')!important;
  background-size:cover!important;background-position:center!important;
  clip-path:polygon(18% 0,100% 0,100% 100%,0 100%);
}
.heroTradeCollage .hc2{
  width:42%!important;height:70%!important;right:32%!important;bottom:0!important;
  background-image:url('https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=1200&q=90')!important;
  background-size:cover!important;background-position:center!important;
  border-radius:14px 0 0 0!important;
}
.heroTradeCollage .hc3{
  width:36%!important;height:43%!important;right:39%!important;top:0!important;
  background-image:url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=90')!important;
  background-size:cover!important;background-position:center!important;
  border-radius:0 0 12px 12px!important;
}

.v5cats{
  padding:16px 28px 18px!important;
  gap:12px!important;
}
.v5cats article{
  border-radius:10px!important;
  box-shadow:0 3px 11px rgba(4,43,77,.08)!important;
}
.catPic{height:108px!important}
.v5cats b{font-size:13px!important;padding:10px 12px 2px!important}
.v5cats small{font-size:9.5px!important;line-height:1.35!important;padding-bottom:11px!important}

@media(max-width:1100px){
  .v5head{grid-template-columns:270px 1fr auto!important;padding:13px 20px!important}
  .v5logo{font-size:42px!important}.v5brand .cartLogo{font-size:42px!important}
  .heroTradeCollage{width:58vw!important;right:-80px!important;opacity:.72!important}
}
@media(max-width:700px){
  .v5head{grid-template-columns:1fr auto!important;padding:12px 14px!important}
  .v5logo{font-size:31px!important}.v5brand .cartLogo{font-size:31px!important}
  .v5hero{min-height:470px!important;background-position:58% 52%!important}
  .v5hero .heroInner{min-height:470px!important;padding:38px 20px!important;align-items:flex-start!important}
  .v5hero h1{font-size:39px!important}
  .heroTradeCollage{width:100vw!important;height:220px!important;right:-18vw!important;top:auto!important;bottom:0!important;opacity:.58!important}
  .heroTradeCollage .hc1{width:44%!important}
  .heroTradeCollage .hc2{width:46%!important;right:34%!important}
  .heroTradeCollage .hc3{display:none!important}
}
</style>
'''
s=s.replace('</head>', css+'\n</head>',1)
s=s.replace('<body>','<body>\n'+marker,1)
p.write_text(s,encoding='utf-8')
