#!/usr/bin/env node
'use strict';

/**
 * AIGUKA 7.3 Drive Product Indexer
 *
 * Safe mode: this script DOES NOT call Google Drive API and DOES NOT rename/move/create
 * anything. It only reads the local Product Center config and folder snapshot, then
 * generates product-center-index.json for AIGUKA 7.3 mapping.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MIGRATOR_DIR = path.join(ROOT, 'tools', 'drive-product-migrator');
const OUT_DIR = path.join(__dirname, 'output');

const config = require(path.join(MIGRATOR_DIR, 'product-config.json'));
const mapping = require(path.join(MIGRATOR_DIR, 'folder-mapping.json'));

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function driveUrl(id) {
  return id ? `https://drive.google.com/drive/folders/${id}` : '';
}

function productFolderName(product) {
  return `${product.index}. ${product.displayName}`;
}

function buildIndex() {
  const products = {};
  const aliases = {};
  const categories = {};
  const warnings = [];

  for (const category of config.categories || []) {
    categories[category.categoryId] = {
      categoryId: category.categoryId,
      displayName: category.displayName,
      products: []
    };

    for (const product of category.products || []) {
      const sources = (mapping.productSources && mapping.productSources[product.productId]) || [];
      const sourceFolders = sources.map((sourceKey) => {
        const src = mapping.sourceFolders && mapping.sourceFolders[sourceKey];
        if (!src || !src.id) {
          warnings.push({ level: 'warn', code: 'MISSING_SOURCE_FOLDER', productId: product.productId, sourceKey });
          return { sourceKey, missing: true };
        }
        return {
          sourceKey,
          name: src.name,
          id: src.id,
          url: driveUrl(src.id)
        };
      });

      if (!sourceFolders.length) {
        warnings.push({ level: 'info', code: 'NO_SOURCE_FOLDER_YET', productId: product.productId, displayName: product.displayName });
      }

      const record = {
        productId: product.productId,
        categoryId: category.categoryId,
        categoryName: category.displayName,
        index: product.index,
        displayName: product.displayName,
        canonicalFolderName: productFolderName(product),
        aliases: product.aliases || [],
        sourceFolders,
        primaryFolderId: sourceFolders.find(x => !x.missing)?.id || null,
        primaryFolderUrl: sourceFolders.find(x => !x.missing)?.url || null
      };

      products[product.productId] = record;
      categories[category.categoryId].products.push(product.productId);

      for (const alias of record.aliases) {
        const key = String(alias || '').trim().toLowerCase();
        if (!key) continue;
        if (aliases[key] && aliases[key] !== product.productId) {
          warnings.push({ level: 'warn', code: 'DUPLICATE_ALIAS', alias: key, productIds: [aliases[key], product.productId] });
        } else {
          aliases[key] = product.productId;
        }
      }
    }
  }

  return {
    version: config.version || '7.3.0',
    generatedAt: new Date().toISOString(),
    mode: 'SAFE_INDEX_ONLY_NO_DRIVE_WRITE',
    productionRootId: mapping.productionRootId,
    productionRootUrl: driveUrl(mapping.productionRootId),
    targetRootName: config.targetRootName,
    categories,
    products,
    aliases,
    unmappedButKeep: (mapping.unmappedButKeep || []).map((sourceKey) => {
      const src = mapping.sourceFolders[sourceKey] || {};
      return { sourceKey, name: src.name || '', id: src.id || '', url: driveUrl(src.id) };
    }),
    warnings
  };
}

function writeOutputs(index) {
  ensureDir(OUT_DIR);
  const jsonFile = path.join(OUT_DIR, 'product-center-index.json');
  const aliasFile = path.join(OUT_DIR, 'product-alias-map.json');
  const folderFile = path.join(OUT_DIR, 'product-folder-map.json');

  const folderMap = {};
  for (const [productId, p] of Object.entries(index.products)) {
    folderMap[productId] = {
      displayName: p.displayName,
      primaryFolderId: p.primaryFolderId,
      primaryFolderUrl: p.primaryFolderUrl,
      sourceFolders: p.sourceFolders
    };
  }

  fs.writeFileSync(jsonFile, JSON.stringify(index, null, 2), 'utf8');
  fs.writeFileSync(aliasFile, JSON.stringify(index.aliases, null, 2), 'utf8');
  fs.writeFileSync(folderFile, JSON.stringify(folderMap, null, 2), 'utf8');

  console.log('OK: Đã tạo Product Center index an toàn, không sửa Google Drive.');
  console.log(`- ${path.relative(ROOT, jsonFile)}`);
  console.log(`- ${path.relative(ROOT, aliasFile)}`);
  console.log(`- ${path.relative(ROOT, folderFile)}`);
  if (index.warnings.length) console.log(`Cảnh báo: ${index.warnings.length}. Chạy npm run drive:validate để xem chi tiết.`);
}

try {
  const index = buildIndex();
  writeOutputs(index);
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
}
