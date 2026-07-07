#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'output');
const indexPath = path.join(OUT_DIR, 'product-center-index.json');

function loadIndex() {
  if (!fs.existsSync(indexPath)) {
    console.log('Chưa có index. Đang tạo mới...');
    require('./index-drive');
  }
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

function main() {
  const index = loadIndex();
  const errors = [];
  const warnings = [...(index.warnings || [])];
  const seenIds = new Map();

  for (const [productId, product] of Object.entries(index.products || {})) {
    if (!product.displayName) errors.push({ code: 'MISSING_DISPLAY_NAME', productId });
    if (!Array.isArray(product.aliases) || !product.aliases.length) warnings.push({ code: 'NO_ALIAS', productId });
    for (const src of product.sourceFolders || []) {
      if (src.missing) continue;
      if (!src.id) errors.push({ code: 'SOURCE_WITHOUT_ID', productId, sourceKey: src.sourceKey });
      const prior = seenIds.get(src.id);
      if (prior && prior !== productId) {
        warnings.push({ code: 'SOURCE_REUSED_BY_MULTIPLE_PRODUCTS', folderId: src.id, products: [prior, productId], note: 'Có thể đúng với folder combo/chậu-vòi dùng chung, nhưng cần biết để tránh nhầm slide.' });
      }
      if (!prior) seenIds.set(src.id, productId);
    }
  }

  console.log('AIGUKA 7.3 Product Center Validate');
  console.log(`Products: ${Object.keys(index.products || {}).length}`);
  console.log(`Aliases: ${Object.keys(index.aliases || {}).length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}`);

  if (errors.length) {
    console.log('\nERRORS');
    for (const e of errors) console.log('-', JSON.stringify(e));
  }
  if (warnings.length) {
    console.log('\nWARNINGS');
    for (const w of warnings) console.log('-', JSON.stringify(w));
  }

  const reportFile = path.join(OUT_DIR, 'validate-report.json');
  fs.writeFileSync(reportFile, JSON.stringify({ checkedAt: new Date().toISOString(), errors, warnings }, null, 2), 'utf8');
  console.log(`\nReport: ${path.relative(ROOT, reportFile)}`);

  if (errors.length) process.exit(1);
}

try { main(); } catch (err) { console.error('FAILED:', err.message); process.exit(1); }
