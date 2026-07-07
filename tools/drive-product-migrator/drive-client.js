'use strict';

const fs = require('fs');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function parseServiceAccount() {
  const jsonRaw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  if (jsonRaw) {
    const raw = jsonRaw.trim().startsWith('{') ? jsonRaw : Buffer.from(jsonRaw, 'base64').toString('utf8');
    const json = JSON.parse(raw);
    return { client_email: json.client_email, private_key: String(json.private_key || '').replace(/\\n/g, '\n') };
  }
  return {
    client_email: process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || '',
    private_key: String(process.env.GOOGLE_DRIVE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  };
}

let cachedToken = { value: '', expiresAt: 0 };

async function getAccessToken() {
  const direct = process.env.GOOGLE_DRIVE_ACCESS_TOKEN || process.env.GDRIVE_ACCESS_TOKEN || '';
  if (direct) return direct;
  const now = Date.now();
  if (cachedToken.value && cachedToken.expiresAt > now + 60000) return cachedToken.value;
  const { client_email, private_key } = parseServiceAccount();
  if (!client_email || !private_key) {
    throw new Error('Thiếu quyền ghi Drive. Cấu hình GOOGLE_DRIVE_ACCESS_TOKEN hoặc GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON/EMAIL/PRIVATE_KEY.');
  }
  const iat = Math.floor(now / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iss: client_email, scope: DRIVE_SCOPE, aud: 'https://oauth2.googleapis.com/token', exp: iat + 3600, iat };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const crypto = require('crypto');
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const assertion = `${unsigned}.${sig}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  cachedToken = { value: data.access_token, expiresAt: now + Number(data.expires_in || 3300) * 1000 };
  return cachedToken.value;
}

async function driveRequest(path, options = {}) {
  const token = await getAccessToken();
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
  const text = await res.text().catch(() => '');
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data).slice(0, 800)}`);
  return data;
}

function esc(value = '') {
  return String(value || '').replace(/'/g, "\\'");
}

async function listChildren(parentId, { folderOnly = false, pageSize = 1000 } = {}) {
  const q = [`'${esc(parentId)}' in parents`, 'trashed=false'];
  if (folderOnly) q.push("mimeType='application/vnd.google-apps.folder'");
  const files = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: q.join(' and '),
      pageSize: String(pageSize),
      fields: 'nextPageToken,files(id,name,mimeType,parents,webViewLink,shortcutDetails,modifiedTime,createdTime)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await driveRequest(`/files?${params.toString()}`);
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return files;
}

async function findChildFolder(parentId, name) {
  const q = [`'${esc(parentId)}' in parents`, 'trashed=false', "mimeType='application/vnd.google-apps.folder'", `name='${esc(name)}'`].join(' and ');
  const params = new URLSearchParams({ q, pageSize: '10', fields: 'files(id,name,mimeType,parents,webViewLink)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
  const data = await driveRequest(`/files?${params.toString()}`);
  return (data.files || [])[0] || null;
}

async function createFolder(parentId, name) {
  return driveRequest('/files?supportsAllDrives=true&fields=id,name,mimeType,parents,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
}

async function ensureFolder(parentId, name, log = []) {
  const found = await findChildFolder(parentId, name);
  if (found) {
    log.push({ action: 'ensureFolder', status: 'exists', parentId, name, id: found.id });
    return found;
  }
  const created = await createFolder(parentId, name);
  log.push({ action: 'ensureFolder', status: 'created', parentId, name, id: created.id });
  return created;
}

async function createShortcut(parentId, targetId, name) {
  return driveRequest('/files?supportsAllDrives=true&fields=id,name,mimeType,parents,shortcutDetails,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.shortcut', parents: [parentId], shortcutDetails: { targetId } })
  });
}

async function findShortcut(parentId, targetId, name) {
  const children = await listChildren(parentId);
  return children.find(x => x.mimeType === 'application/vnd.google-apps.shortcut' && x.name === name && x.shortcutDetails && x.shortcutDetails.targetId === targetId) || null;
}

async function ensureShortcut(parentId, targetId, name, log = []) {
  const found = await findShortcut(parentId, targetId, name);
  if (found) {
    log.push({ action: 'ensureShortcut', status: 'exists', parentId, targetId, name, id: found.id });
    return found;
  }
  const created = await createShortcut(parentId, targetId, name);
  log.push({ action: 'ensureShortcut', status: 'created', parentId, targetId, name, id: created.id });
  return created;
}

async function moveFile(fileId, fromParentId, toParentId, newName) {
  const params = new URLSearchParams({ supportsAllDrives: 'true', fields: 'id,name,mimeType,parents,webViewLink' });
  if (toParentId) params.set('addParents', toParentId);
  if (fromParentId) params.set('removeParents', fromParentId);
  const body = newName ? JSON.stringify({ name: newName }) : '{}';
  return driveRequest(`/files/${encodeURIComponent(fileId)}?${params.toString()}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body
  });
}

async function renameFile(fileId, newName) {
  return driveRequest(`/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,parents,webViewLink`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName })
  });
}

function writeJson(file, data) {
  fs.mkdirSync(require('path').dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = { listChildren, ensureFolder, ensureShortcut, moveFile, renameFile, findChildFolder, createFolder, writeJson };
