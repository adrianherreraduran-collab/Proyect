const sharp = require('sharp');

function decodeDataImage(dataUrl=''){
  const m=String(dataUrl).match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if(!m) throw new Error('Formato de imagen no válido');
  return Buffer.from(m[1],'base64');
}

function isLightNeutral(data,p){
  const r=data[p],g=data[p+1],b=data[p+2],a=data[p+3];
  if(a<10)return true;
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
  return lo>=236 && (hi-lo)<=22;
}

async function removeEdgeBackground(buffer){
  const base=sharp(buffer,{failOn:'none'}).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).ensureAlpha();
  const {data,info}=await base.raw().toBuffer({resolveWithObject:true});
  const w=info.width,h=info.height,n=w*h;
  if(!w||!h||n>1600000)return base.png().toBuffer();
  const seen=new Uint8Array(n);
  const queue=new Uint32Array(n);
  let head=0,tail=0;
  const add=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const i=y*w+x;if(seen[i])return;const p=i*4;if(!isLightNeutral(data,p))return;seen[i]=1;queue[tail++]=i};
  for(let x=0;x<w;x++){add(x,0);add(x,h-1)}
  for(let y=1;y<h-1;y++){add(0,y);add(w-1,y)}
  while(head<tail){const i=queue[head++],x=i%w,y=(i/w)|0;add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1)}
  for(let i=0;i<n;i++){
    if(!seen[i])continue;
    const p=i*4,r=data[p],g=data[p+1],b=data[p+2];
    const lo=Math.min(r,g,b);
    const feather=Math.max(0,Math.min(1,(lo-232)/23));
    data[p+3]=Math.round(data[p+3]*(1-feather));
  }
  return sharp(data,{raw:{width:w,height:h,channels:4}}).png().toBuffer();
}

async function prepareOne(dataUrl,index=0){
  const backgrounds=['#ffffff','#f5f7f9','#eef4f8'];
  const scales=[0.82,0.86,0.78];
  const cleaned=await removeEdgeBackground(decodeDataImage(dataUrl));
  let image=sharp(cleaned,{failOn:'none'}).rotate();
  try{image=image.trim({threshold:10})}catch{}
  const side=Math.round(1024*scales[index%scales.length]);
  const product=await image
    .modulate({brightness:index===1?1.045:1.025,saturation:index===2?1.04:1.02})
    .sharpen({sigma:0.7,m1:0.5,m2:1.5})
    .resize({width:side,height:side,fit:'inside',withoutEnlargement:false})
    .png()
    .toBuffer();
  const bg=backgrounds[index%backgrounds.length];
  const output=await sharp({create:{width:1024,height:1024,channels:3,background:bg}})
    .composite([{input:product,gravity:'centre'}])
    .jpeg({quality:90,mozjpeg:true})
    .toBuffer();
  return {url:'data:image/jpeg;base64,'+output.toString('base64'),source:'Render inteligente FVMarket · local',license:'',author:'',origin:'local-smart-render'};
}

async function prepareImages(dataUrls=[],count=3){
  const src=dataUrls.filter(Boolean).slice(0,3);
  if(!src.length) throw new Error('No hay imágenes para renderizar');
  const total=Math.max(1,Math.min(3,Number(count)||3));
  const out=[];
  for(let i=0;i<total;i++) out.push(await prepareOne(src[i%src.length],i));
  return out;
}

module.exports={prepareImages};
