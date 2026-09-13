const sharp = require('sharp');

function decodeDataImage(dataUrl=''){
  const m=String(dataUrl).match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if(!m) throw new Error('Formato de imagen no válido');
  return Buffer.from(m[1],'base64');
}

async function prepareOne(dataUrl,index=0){
  const backgrounds=['#ffffff','#f6f8fa','#eef3f7'];
  let image=sharp(decodeDataImage(dataUrl),{failOn:'none'}).rotate();
  try{image=image.trim({threshold:12})}catch{}
  const product=await image
    .modulate({brightness:1.035,saturation:1.025})
    .resize({width:880,height:880,fit:'inside',withoutEnlargement:false})
    .png()
    .toBuffer();
  const bg=backgrounds[index%backgrounds.length];
  const output=await sharp({create:{width:1024,height:1024,channels:3,background:bg}})
    .composite([{input:product,gravity:'centre'}])
    .jpeg({quality:88,mozjpeg:true})
    .toBuffer();
  return {url:'data:image/jpeg;base64,'+output.toString('base64'),source:'Preparación FVMarket',license:'',author:'',origin:'free-prep'};
}

async function prepareImages(dataUrls=[],count=3){
  const src=dataUrls.filter(Boolean).slice(0,3);
  if(!src.length) throw new Error('No hay imágenes para preparar');
  const total=Math.max(1,Math.min(3,Number(count)||3));
  const out=[];
  for(let i=0;i<total;i++) out.push(await prepareOne(src[i%src.length],i));
  return out;
}

module.exports={prepareImages};
