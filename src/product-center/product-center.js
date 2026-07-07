'use strict';

/**
 * AIGUKA 7.3 Product Center Loader
 * Safe loader: reads local generated index only. It does not call Google Drive.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_INDEX_PATH = path.resolve(__dirname, '..', '..', 'tools', 'drive-product-indexer', 'output', 'product-center-index.json');

let cached = null;

function loadProductCenter(indexPath = process.env.AIGUKA_PRODUCT_CENTER_INDEX || DEFAULT_INDEX_PATH) {
  if (cached && cached.__path === indexPath) return cached;
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Product Center index not found: ${indexPath}. Run: npm run drive:index`);
  }
  const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  cached = Object.assign({ __path: indexPath }, data);
  return cached;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectProductByAlias(message, productCenter = loadProductCenter()) {
  const text = normalizeText(message);
  if (!text) return null;
  let best = null;
  for (const [alias, productId] of Object.entries(productCenter.aliases || {})) {
    const a = normalizeText(alias);
    if (!a) continue;
    const exact = text === a;
    const contains = text.includes(a);
    if (!exact && !contains) continue;
    const score = (exact ? 1000 : 100) + a.length;
    if (!best || score > best.score) {
      best = { productId, alias, score, product: productCenter.products[productId] || null };
    }
  }
  return best;
}

function getProduct(productId, productCenter = loadProductCenter()) {
  return (productCenter.products || {})[productId] || null;
}

module.exports = {
  loadProductCenter,
  detectProductByAlias,
  getProduct,
  normalizeText
};
