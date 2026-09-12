from pathlib import Path

p = Path('appsrc/public/admin.html')
s = p.read_text(encoding='utf-8')
MARK = 'FVM_CATALOG_REFERENCE_TOKEN_FIX_V5'
if MARK in s:
    print('v5 already applied')
    raise SystemExit(0)

start = s.find('  function pageText4(tc,viewport,pdfjs){')
end = s.find('  function dedupe4(a,key){', start)
if start < 0 or end < 0:
    raise SystemExit('No se encontro pageText4 para parchear')

replacement = r'''  /* FVM_CATALOG_REFERENCE_TOKEN_FIX_V5 */
  function refValue5(raw=''){
    const z=String(raw).toUpperCase().replace(/[^A-Z0-9]/g,'');
    for(const pre of PREFIXES){
      if(z.startsWith(pre)){
        const digits=z.slice(pre.length);
        if(digits.length>=2&&digits.length<=8&&digits.split('').every(ch=>ch>='0'&&ch<='9'))return pre+digits;
      }
    }
    return '';
  }
  function pageText4(tc,viewport,pdfjs){
    const records=[],pieces=[];
    for(const it of tc.items||[]){
      const r=recFromItem(it,viewport,pdfjs);
      if(r){records.push(r);pieces.push(...piecesFromRec(r))}
    }

    const refs=[];
    const addRef=(arr,ref)=>{
      if(!ref||!arr.length)return;
      const x0=Math.min(...arr.map(x=>x.x0)),x1=Math.max(...arr.map(x=>x.x1));
      const y0=Math.min(...arr.map(x=>x.y0)),y1=Math.max(...arr.map(x=>x.y1));
      refs.push({...arr[0],text:arr.map(x=>x.text).join(' '),ref,x0,x1,y0,y1,cx:(x0+x1)/2,cy:(y0+y1)/2,w:x1-x0,h:y1-y0});
    };

    // 1) Referencia contenida en un item completo del PDF.
    for(const r of records){
      const ref=refValue5(r.text);
      if(ref)addRef([r],ref);
    }
    // 2) Referencia contenida en una pieza individual.
    for(const p of pieces){
      const ref=refValue5(p.text);
      if(ref)addRef([p],ref);
    }
    // 3) PDF que separa FT + 1533, F + T + 1533 o incluso los digitos.
    const rowList=[];
    for(const p of [...pieces].sort((a,b)=>a.cy-b.cy||a.x0-b.x0)){
      let row=rowList.find(r=>Math.abs(r.cy-p.cy)<7);
      if(!row){row={cy:p.cy,items:[]};rowList.push(row)}
      row.items.push(p);
    }
    for(const row of rowList){
      row.items.sort((a,b)=>a.x0-b.x0);
      const a=row.items;
      for(let i=0;i<a.length;i++){
        let joined='';
        const group=[];
        for(let j=i;j<Math.min(a.length,i+7);j++){
          if(group.length){
            const gap=a[j].x0-group[group.length-1].x1;
            if(gap>35)break;
          }
          group.push(a[j]);
          joined+=String(a[j].text).replace(/[^A-Za-z0-9]/g,'');
          const ref=refValue5(joined);
          if(ref){addRef(group,ref);break}
          if(joined.length>12)break;
        }
      }
    }

    const prices=[];
    for(const p of pieces){
      if(/€/.test(p.text)){
        const v=money4(p.text);
        if(v)prices.push({...p,price:v});
      }
    }
    const euros=pieces.filter(p=>String(p.text).trim()==='€');
    const nums=pieces.filter(p=>/^\d{1,4}(?:[.,]\d{1,3})?$/.test(String(p.text).trim()));
    for(const e of euros){
      const c=nums.filter(n=>Math.abs(n.cy-e.cy)<12&&n.cx<e.cx&&e.x0-n.x1<95);
      if(c.length){
        const n=c.sort((a,b)=>b.cx-a.cx)[0],v=money4(n.text+'€');
        if(v)prices.push({...n,x1:e.x1,cx:(n.x0+e.x1)/2,price:v});
      }
    }
    return {
      records,pieces,
      refs:dedupe4(refs,x=>x.ref+'|'+Math.round(x.cx/3)+'|'+Math.round(x.cy/3)),
      prices:dedupe4(prices,x=>x.price+'|'+Math.round(x.cx)+'|'+Math.round(x.cy))
    };
  }
'''

s = s[:start] + replacement + s[end:]
s = s.replace('BT, FT, LH, DG, AM, AC, TK, PM, SW, VL y PACK', 'BT, FT, LH, DG, AM, AC, TK, PM, SW y VL')
s = s.replace('BT, FT, LH, DG, AM, AC, TK, PM, SW, VL, PACK', 'BT, FT, LH, DG, AM, AC, TK, PM, SW, VL')
p.write_text(s, encoding='utf-8')
print('v5 reference tokenization applied')
