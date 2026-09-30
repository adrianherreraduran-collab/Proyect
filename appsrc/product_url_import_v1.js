'use strict';
const axios = require('axios');
const dns = require('node:dns');
const net = require('node:net');
const cheerio = require('cheerio');
function publicAddress(address) {
  const ip = String(address).toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  // Only global unicast IPv6; reject local, mapped IPv4 and documentation blocks.
  return net.isIP(ip) === 6 && /^[23]/.test(ip) && !ip.startsWith('2001:db8:');
}
function permittedUrl(raw) {
  let url; try { url = new URL(raw); } catch { throw Error('URL no válida'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port)) || !host.includes('.') && !net.isIP(host) || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) || net.isIP(host) && !publicAddress(host)) throw Error('URL no permitida');
  return url;
}
function safeLookup(host, options, callback) {
  dns.lookup(host, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(row => !publicAddress(row.address))) return callback(Error('El dominio resuelve a una dirección no permitida'));
    const selected = options?.family ? addresses.filter(row => row.family === options.family) : addresses;
    if (!selected.length) return callback(Error('Dirección del dominio no disponible'));
    return options?.all ? callback(null, selected) : callback(null, selected[0].address, selected[0].family);
  });
}
async function readProductUrl(raw, request = axios.get) {
  let url = permittedUrl(raw); const deadline = Date.now() + 20000;
  for (let hop = 0; hop <= 5; hop++) {
    const response = await request(url.href, { timeout: Math.max(1, deadline - Date.now()), maxRedirects: 0, maxContentLength: 3 * 1024 * 1024, proxy: false, lookup: safeLookup, responseType: 'text', validateStatus: code => code >= 200 && code < 400, headers: { 'User-Agent': 'Mozilla/5.0 FVMarket Product Import', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'es-ES,es;q=0.9' } });
    if (response.status >= 300) {
      if (!response.headers.location || hop === 5 || Date.now() >= deadline) throw Error('Demasiadas redirecciones');
      url = permittedUrl(new URL(response.headers.location, url).href); continue;
    }
    if (!/html/i.test(response.headers['content-type'] || '')) throw Error('La URL debe ser una ficha HTML de producto');
    return { html: response.data, url: url.href };
  }
  throw Error('No se pudo leer la ficha');
}
function augmentProduct(product, html) {
  const $ = cheerio.load(html), text = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  product.title = $('<div>').html(product.title).text();
  const gallery = [];
  $('.product-images img, .product-cover img').each((_, node) => {
    if ($(node).closest('.product-miniature, .product-accessories, .products').length) return;
    const raw = $(node).attr('data-image-large-src') || $(node).attr('data-src') || $(node).attr('content') || $(node).attr('src');
    try { const url = new URL(raw, product.sourceUrl); if (['https:', 'http:'].includes(url.protocol) && !gallery.some(image => image.url === url.href)) gallery.push({ url: url.href, source: product.sourceProvider, origin: 'source-url' }); } catch {}
  });
  if (gallery.length) { product.sourceImages = product.images = gallery.slice(0, 12); product.image = gallery[0].url; }
  const description = $('.product-description, #description .product-description, [itemprop=description], #product-description').first();
  if (description.length && text(description.text())) product.description = text(description.text()).slice(0, 12000);
  const ref = $('.product-reference [itemprop=sku], .product-reference span, [itemprop=sku]').first();
  product.sourceRef = (text(ref.attr('content') || ref.text()) || product.sourceRef).replace(/^(REF\.?|Referencia|SKU)\s*:\s*/i, '').trim();
  const ean = $('[itemprop=gtin13], [itemprop=gtin], .product-ean13 span').first();
  product.sourceEan = text(ean.attr('content') || ean.text()) || product.sourceEan;
  if (!product.sourceEan) product.sourceEan = (product.sourceUrl.match(/(?:-|\/)(\d{13})(?:\.html|[/?#]|$)/) || [])[1] || '';
  let weight = 0;
  const kg = (value, unit = '') => { const m = text(value).match(/^(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilogramos?|g|gr|gramos?)?$/i); if (!m) return 0; const amount = Number(m[1].replace(',', '.')), label = (m[2] || unit).toLowerCase(); return ['kg', 'kgs', 'kilogramo', 'kilogramos', 'kgm'].includes(label) ? amount : ['g', 'gr', 'gramo', 'gramos', 'grm'].includes(label) ? amount / 1000 : 0; };
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if ([].concat(value['@type'] || []).includes('Product')) {
      if (value.weight) weight = kg(value.weight.value ?? value.weight, value.weight.unitCode || value.weight.unitText || '') || weight;
      for (const field of [].concat(value.additionalProperty || [])) if (/^(peso|peso neto|peso del producto|weight|net weight)$/i.test(text(field.name))) weight = kg(field.value, field.unitText || field.unitCode || '') || weight;
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') for (const item of [].concat(child)) walk(item);
  };
  $('script[type="application/ld+json"]').each((_, node) => { try { walk(JSON.parse($(node).text())); } catch {} });
  $('.product-features dt, .data-sheet dt').each((_, node) => { if (/^(peso|peso neto|peso del producto|weight)$/i.test(text($(node).text()))) weight = kg($(node).next('dd').text()) || weight; });
  product.weightKg = Math.round(weight * 1000) / 1000;
  const priceNode = $('.current-price [itemprop=price], .current-price-value, [itemprop=price]').first();
  const rawPrice = priceNode.attr('content') || priceNode.attr('data-price');
  if (rawPrice && Number.isFinite(Number(rawPrice)) && Number(rawPrice) > 0) product.sourcePrice = product.price = Math.round(Number(rawPrice) * 100) / 100;
  product.sourceTaxNote = text($('.tax-shipping-delivery-label, .product-prices .tax-shipping-delivery-label').first().text()).slice(0, 160);
  product.importWarnings = [];
  if (!product.sourcePrice) product.importWarnings.push('No se ha detectado un precio fiable. Indica el precio del proveedor.');
  if (!product.weightKg) product.importWarnings.push('Indica el peso real del artículo. La capacidad de carga no es el peso.');
  if (!product.sourceRef) product.importWarnings.push('Revisa la referencia del proveedor.');
  product.published = false; product.reviewStatus = 'borrador'; product.sourceCheckedAt = new Date().toISOString();
  return product;
}
module.exports = { publicAddress, permittedUrl, safeLookup, readProductUrl, augmentProduct };
