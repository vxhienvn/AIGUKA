#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { ensureFolder, ensureShortcut, moveFile, writeJson } = require('./drive-client');

const config = require('./product-config.json');
const mapping = require('./folder-mapping.json');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const MOVE_SOURCE = args.has('--move-source');
const ROOT_ID = process.env.GOOGLE_DRIVE_PRODUCTS_ROOT_ID || process.env.PRODUCTS_DRIVE_ROOT_ID || mapping.productionRootId;
const LOG_DIR = path.join(__dirname, 'logs');

function productFolderName(p) {
  return `${p.index}. ${p.displayName}`;
}

function getSource(key) {
  return mapping.sourceFolders[key] || null;
}

async function main() {
  if (!ROOT_ID) throw new Error('Thiếu GOOGLE_DRIVE_PRODUCTS_ROOT_ID hoặc productionRootId trong folder-mapping.json');
  const startedAt = new Date().toISOString();
  const log = [{ action: 'start', startedAt, apply: APPLY, moveSource: MOVE_SOURCE, productionRootId: ROOT_ID }];

  if (!APPLY) {
    console.log('DRY RUN: chưa thay đổi Google Drive. Thêm --apply để tạo Product Center 7.3.');
  }

  let targetRoot = { id: 'DRY_RUN_TARGET_ROOT', name: config.targetRootName };
  if (APPLY) {
    targetRoot = await ensureFolder(ROOT_ID, config.targetRootName, log);
  } else {
    log.push({ action: 'ensureFolder', status: 'dry-run', parentId: ROOT_ID, name: config.targetRootName });
  }

  const createdProducts = {};

  for (const category of config.categories) {
    let catFolder = { id: `DRY_RUN_${category.categoryId}`, name: category.displayName };
    if (APPLY) catFolder = await ensureFolder(targetRoot.id, category.displayName, log);
    else log.push({ action: 'ensureFolder', status: 'dry-run', parentId: targetRoot.id, name: category.displayName });

    for (const product of category.products) {
      const folderName = productFolderName(product);
      let productFolder = { id: `DRY_RUN_${product.productId}`, name: folderName };
      if (APPLY) productFolder = await ensureFolder(catFolder.id, folderName, log);
      else log.push({ action: 'ensureFolder', status: 'dry-run', parentId: catFolder.id, name: folderName });
      createdProducts[product.productId] = { id: productFolder.id, name: folderName, categoryId: category.categoryId };

      const sources = mapping.productSources[product.productId] || [];
      if (!sources.length) {
        log.push({ action: 'sourceMap', status: 'empty-placeholder', productId: product.productId, folderName });
      }

      for (const sourceKey of sources) {
        const src = getSource(sourceKey);
        if (!src || !src.id) {
          log.push({ action: 'sourceMap', status: 'missing-source', productId: product.productId, sourceKey });
          continue;
        }
        const linkName = `${src.name} - SOURCE`;
        if (!APPLY) {
          log.push({ action: MOVE_SOURCE ? 'moveFile' : 'ensureShortcut', status: 'dry-run', productId: product.productId, sourceKey, sourceId: src.id, targetProductFolder: productFolder.id, name: linkName });
          continue;
        }
        if (MOVE_SOURCE) {
          await moveFile(src.id, null, productFolder.id, src.name);
          log.push({ action: 'moveFile', status: 'moved-add-parent-only', productId: product.productId, sourceKey, sourceId: src.id, toParentId: productFolder.id, note: 'Không remove parent cũ nếu không biết parent hiện tại; tránh mất mapping production.' });
        } else {
          await ensureShortcut(productFolder.id, src.id, linkName, log);
          log.push({ action: 'sourceMap', status: 'shortcut-linked', productId: product.productId, sourceKey, sourceId: src.id, sourceName: src.name });
        }
      }
    }
  }

  for (const sourceKey of mapping.unmappedButKeep || []) {
    const src = getSource(sourceKey);
    if (src) log.push({ action: 'unmappedButKeep', status: 'kept-outside-product-center', sourceKey, sourceId: src.id, sourceName: src.name });
  }

  const report = { version: config.version, targetRoot, createdProducts, log, finishedAt: new Date().toISOString() };
  const out = path.join(LOG_DIR, `migrate-drive-${Date.now()}.json`);
  writeJson(out, report);
  console.log(`OK. Log: ${out}`);
  console.log(APPLY ? 'Đã tạo/cập nhật Product Center 7.3.' : 'Dry-run hoàn tất, Drive chưa bị thay đổi.');
  if (APPLY && !MOVE_SOURCE) console.log('Đã tạo shortcut tới folder nguồn; chưa di chuyển dữ liệu production.');
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
