#!/usr/bin/env node
'use strict';

const path = require('path');
const { listChildren, writeJson } = require('./drive-client');
const config = require('./product-config.json');
const mapping = require('./folder-mapping.json');

const ROOT_ID = process.env.GOOGLE_DRIVE_PRODUCTS_ROOT_ID || process.env.PRODUCTS_DRIVE_ROOT_ID || mapping.productionRootId;

function expectedProductFolders() {
  const rows = [];
  for (const cat of config.categories) {
    for (const p of cat.products) rows.push({ category: cat.displayName, productId: p.productId, folderName: `${p.index}. ${p.displayName}`, sources: mapping.productSources[p.productId] || [] });
  }
  return rows;
}

async function main() {
  const rootChildren = await listChildren(ROOT_ID);
  const target = rootChildren.find(x => x.name === config.targetRootName && x.mimeType === 'application/vnd.google-apps.folder');
  const result = { rootId: ROOT_ID, productCenterExists: Boolean(target), targetRoot: target || null, checks: [], warnings: [], generatedAt: new Date().toISOString() };

  if (!target) {
    result.warnings.push(`Chưa có folder ${config.targetRootName}. Chạy: node migrate-drive.js --apply`);
  } else {
    const cats = await listChildren(target.id, { folderOnly: true });
    for (const cat of config.categories) {
      const catFolder = cats.find(x => x.name === cat.displayName);
      result.checks.push({ type: 'category', name: cat.displayName, ok: Boolean(catFolder), id: catFolder && catFolder.id });
      if (!catFolder) continue;
      const products = await listChildren(catFolder.id, { folderOnly: true });
      for (const p of cat.products) {
        const name = `${p.index}. ${p.displayName}`;
        const pf = products.find(x => x.name === name);
        result.checks.push({ type: 'product', productId: p.productId, name, ok: Boolean(pf), id: pf && pf.id });
        if (pf) {
          const children = await listChildren(pf.id);
          const shortcuts = children.filter(x => x.mimeType === 'application/vnd.google-apps.shortcut');
          const sources = mapping.productSources[p.productId] || [];
          result.checks.push({ type: 'source-shortcuts', productId: p.productId, expectedSourceCount: sources.length, actualShortcutCount: shortcuts.length, ok: sources.length === 0 || shortcuts.length >= sources.length });
        }
      }
    }
  }

  for (const row of expectedProductFolders()) {
    if (!row.sources.length) result.warnings.push(`${row.productId} chưa có source folder rõ ràng, cần upload/điền thêm dữ liệu.`);
  }

  const out = path.join(__dirname, 'logs', `validate-drive-${Date.now()}.json`);
  writeJson(out, result);
  const failed = result.checks.filter(x => x.ok === false);
  console.log(`Product Center: ${result.productCenterExists ? 'OK' : 'MISSING'}`);
  console.log(`Checks: ${result.checks.length}, Failed: ${failed.length}, Warnings: ${result.warnings.length}`);
  console.log(`Log: ${out}`);
  if (failed.length) process.exitCode = 2;
}

main().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
