from pathlib import Path

p = Path('appsrc/public/admin.html')
s = p.read_text(encoding='utf-8')
MARK = 'FVM_CATALOG_PAIRING_V7'
if MARK in s:
    print('v7 already applied')
    raise SystemExit(0)

old = """    const records=[],pieces=[];
    for(const it of tc.items||[]){
      const r=recFromItem(it,viewport,pdfjs);
      if(r){records.push(r);pieces.push(...piecesFromRec(r))}
    }"""
new = """    const records=[],pieces=[];let seq4=0;
    for(const it of tc.items||[]){
      const r=recFromItem(it,viewport,pdfjs);
      if(r){
        r._seq=seq4*100;
        const ps=piecesFromRec(r);
        ps.forEach((x,k)=>x._seq=seq4*100+k);
        records.push(r);pieces.push(...ps);seq4++;
      }
    }"""
if old not in s:
    raise SystemExit('pageText4 sequence block not found')
s = s.replace(old, new, 1)

old2 = "const c=colInfo4(ref,allRefs,W),allRows=rows4(records);"
new2 = "const c=colInfo4(ref,allRefs,W),cellRecords=records.filter(r=>r.cx>=c.x0-4&&r.cx<=c.x1+4),allRows=rows4(cellRecords);"
if old2 not in s:
    raise SystemExit('textFor4 row block not found')
s = s.replace(old2, new2, 1)

helper = r'''  /* FVM_CATALOG_PAIRING_V7 */
  function pairPrices7(refs,prices){
    const result=new Map(),used=new Set();
    const rlist=[...refs].sort((a,b)=>(a._seq??0)-(b._seq??0));
    const plist=[...prices].sort((a,b)=>(a._seq??0)-(b._seq??0));
    const markers=[...rlist.map(x=>({type:'r',x,seq:x._seq??0})),...plist.map(x=>({type:'p',x,seq:x._seq??0}))].sort((a,b)=>a.seq-b.seq);
    const runs=[];
    for(const m of markers){
      const last=runs[runs.length-1];
      if(last&&last.type===m.type&&m.seq-last.items[last.items.length-1].seq<700)last.items.push(m);
      else runs.push({type:m.type,items:[m]});
    }
    const nearGroup=(a,b)=>{
      const aa=a.map(z=>z.x),bb=b.map(z=>z.x);
      const ax=aa.reduce((q,z)=>q+(z.cx||0),0)/Math.max(1,aa.length),ay=aa.reduce((q,z)=>q+(z.cy||0),0)/Math.max(1,aa.length);
      const bx=bb.reduce((q,z)=>q+(z.cx||0),0)/Math.max(1,bb.length),by=bb.reduce((q,z)=>q+(z.cy||0),0)/Math.max(1,bb.length);
      return Math.abs(ax-bx)<520&&Math.abs(ay-by)<240;
    };
    for(let i=0;i<runs.length-1;i++){
      const a=runs[i],b=runs[i+1];
      if(!nearGroup(a.items,b.items))continue;
      if(a.type==='p'&&b.type==='r'&&a.items.length===b.items.length&&a.items.length>1){
        a.items.forEach((m,k)=>{result.set(b.items[k].x,m.x);used.add(m.x)});
      }else if(a.type==='r'&&b.type==='p'&&a.items.length===b.items.length&&a.items.length>1){
        a.items.forEach((m,k)=>{result.set(m.x,b.items[k].x);used.add(b.items[k].x)});
      }else if(a.type==='r'&&b.type==='p'&&a.items.length>1&&b.items.length===1){
        a.items.forEach(m=>result.set(m.x,b.items[0].x));used.add(b.items[0].x);
      }else if(a.type==='p'&&b.type==='r'&&a.items.length===1&&b.items.length>1){
        b.items.forEach(m=>result.set(m.x,a.items[0].x));used.add(a.items[0].x);
      }
    }
    for(let i=0;i<rlist.length;i++){
      const r=rlist[i];if(result.has(r))continue;
      const prevSeq=i?(rlist[i-1]._seq??-Infinity):-Infinity;
      const cand=plist.filter(p=>!used.has(p)&&(p._seq??0)<(r._seq??0)&&(p._seq??0)>prevSeq);
      if(cand.length){
        const p=[...cand].sort((a,b)=>(b._seq??0)-(a._seq??0))[0];
        const dx=Math.abs((p.cx||0)-(r.cx||0)),dy=Math.abs((p.cy||0)-(r.cy||0));
        if(dx<190&&dy<125){result.set(r,p);used.add(p);continue}
      }
    }
    const edges=[];
    for(const r of rlist){
      if(result.has(r))continue;
      for(const p of plist){
        if(used.has(p))continue;
        const dx=Math.abs((p.cx||0)-(r.cx||0)),dy=Math.abs((p.cy||0)-(r.cy||0));
        if(dx<190&&dy<150)edges.push([dx*1.35+dy,r,p]);
      }
    }
    edges.sort((a,b)=>a[0]-b[0]);
    for(const [,r,p] of edges){if(result.has(r)||used.has(p))continue;result.set(r,p);used.add(p)}
    return result;
  }
'''
insert_before = "  async function parse4(file){"
if insert_before not in s:
    raise SystemExit('parse4 insertion point not found')
s = s.replace(insert_before, helper + insert_before, 1)

old3 = """const page=await pdfDoc4.getPage(n),viewport=page.getViewport({scale:1.25}),tc=await page.getTextContent({normalizeWhitespace:true}),t=pageText4(tc,viewport,pdfjs),boxes=await imageBoxes4(page,viewport,pdfjs),sec=section4(t.records,n);
      for(const ref of t.refs){if(seen.has(ref.ref))continue;const pr=priceFor4(ref,t.prices,t.refs,viewport.width);if(!pr)continue;"""
new3 = """const page=await pdfDoc4.getPage(n),viewport=page.getViewport({scale:1.25}),tc=await page.getTextContent({normalizeWhitespace:true}),t=pageText4(tc,viewport,pdfjs),boxes=await imageBoxes4(page,viewport,pdfjs),sec=section4(t.records,n),priceMap7=pairPrices7(t.refs,t.prices);
      for(const ref of t.refs){if(seen.has(ref.ref))continue;const pr=priceMap7.get(ref)||priceFor4(ref,t.prices,t.refs,viewport.width);if(!pr)continue;"""
if old3 not in s:
    raise SystemExit('parse4 price line not found')
s = s.replace(old3, new3, 1)

p.write_text(s, encoding='utf-8')
print('v7 applied')
