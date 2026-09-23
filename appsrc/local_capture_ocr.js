const sharp = require('sharp');
const {createWorker} = require('tesseract.js');

let workerPromise = null;

function decodeDataImage(dataUrl = '') {
  const match = String(dataUrl).match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if (!match) throw new Error('Formato de imagen no válido');
  return Buffer.from(match[1], 'base64');
}

async function prepareForOcr(dataUrl) {
  return sharp(decodeDataImage(dataUrl), {failOn: 'none'})
    .rotate()
    .resize({width: 2200, height: 2200, fit: 'inside', withoutEnlargement: false})
    .flatten({background: '#ffffff'})
    .grayscale()
    .normalize()
    .sharpen({sigma: 0.8})
    .png()
    .toBuffer();
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('spa', 1, {
      cachePath: process.env.TESSERACT_CACHE_PATH || '/tmp/fvmarket-tesseract',
      logger: () => {}
    });
  }
  try {
    return await workerPromise;
  } catch (error) {
    workerPromise = null;
    throw error;
  }
}

async function recognizeCapture(dataUrl) {
  const image = await prepareForOcr(dataUrl);
  const worker = await getWorker();
  const result = await worker.recognize(image);
  const data = result?.data || {};
  return {
    text: String(data.text || '').replace(/\r/g, ''),
    confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 0
  };
}

module.exports = {recognizeCapture};
