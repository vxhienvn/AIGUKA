// ===== AIGUKA PRODUCT DRIVE ENGINE V2 / v3.9.8 =====
// Đọc ảnh từ Google Drive theo đường dẫn con người nhập trong Google Sheet.
// Sheet dùng path dễ hiểu: fan/10 cánh/Gold hoặc Products/Fan/10 cánh/Gold.
// Server tự resolve folder -> file qua Google Drive API nếu có cấu hình.


const crypto = require('crypto');

const GOOGLE_DRIVE_ACCESS_TOKEN = process.env.GOOGLE_DRIVE_ACCESS_TOKEN || process.env.GDRIVE_ACCESS_TOKEN || "";
const GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
const GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || "";
const GOOGLE_DRIVE_PRIVATE_KEY = (process.env.GOOGLE_DRIVE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
let cachedWriteToken = { token: "", expiresAt: 0 };

const GOOGLE_DRIVE_PRODUCTS_ROOT_ID = process.env.GOOGLE_DRIVE_PRODUCTS_ROOT_ID || process.env.PRODUCTS_DRIVE_ROOT_ID || "";
const GOOGLE_DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY || process.env.GOOGLE_API_KEY || "";
const DRIVE_CACHE_TTL_MS = Number(process.env.GOOGLE_DRIVE_CACHE_TTL_MS || 10 * 60 * 1000);

const folderIdCache = new Map();
const fileListCache = new Map();

function stripVietnamese(str = "") {
    return String(str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D");
}

function normalizePathSegment(str = "") {
    return stripVietnamese(str).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeDrivePath(input = "") {
    return String(input || "")
        .replace(/\\/g, "/")
        .split("/")
        .map(x => x.trim())
        .filter(Boolean)
        .filter(x => normalizePathSegment(x) !== "products");
}

function driveReady() {
    return Boolean(GOOGLE_DRIVE_PRODUCTS_ROOT_ID && GOOGLE_DRIVE_API_KEY);
}

function escapeDriveQueryValue(value = "") {
    return String(value || "").replace(/'/g, "\\'");
}


function clearDriveCaches() {
    folderIdCache.clear();
    fileListCache.clear();
}

function driveWriteConfigured() {
    return Boolean(GOOGLE_DRIVE_ACCESS_TOKEN || GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || (GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL && GOOGLE_DRIVE_PRIVATE_KEY));
}

function base64Url(input) {
    return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function parseServiceAccount() {
    if (GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON) {
        try {
            const raw = GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON.trim().startsWith('{')
                ? GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
                : Buffer.from(GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON, 'base64').toString('utf8');
            const json = JSON.parse(raw);
            return { client_email: json.client_email, private_key: String(json.private_key || '').replace(/\\n/g, '\n') };
        } catch (error) {
            throw new Error('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON không hợp lệ: ' + error.message);
        }
    }
    return { client_email: GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL, private_key: GOOGLE_DRIVE_PRIVATE_KEY };
}

async function getDriveWriteAccessToken() {
    if (GOOGLE_DRIVE_ACCESS_TOKEN) return GOOGLE_DRIVE_ACCESS_TOKEN;
    const now = Date.now();
    if (cachedWriteToken.token && cachedWriteToken.expiresAt > now + 60000) return cachedWriteToken.token;
    const sa = parseServiceAccount();
    if (!sa.client_email || !sa.private_key) {
        throw new Error('Thiếu quyền ghi Google Drive. Cần GOOGLE_DRIVE_ACCESS_TOKEN hoặc GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON/EMAIL/PRIVATE_KEY.');
    }
    const iat = Math.floor(now / 1000);
    const payload = {
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: iat + 3600,
        iat
    };
    const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(JSON.stringify(payload))}`;
    const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const assertion = `${unsigned}.${signature}`;
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString()
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Google OAuth ${response.status}: ${JSON.stringify(data).slice(0, 300)}`);
    cachedWriteToken = { token: data.access_token, expiresAt: now + Number(data.expires_in || 3300) * 1000 };
    return cachedWriteToken.token;
}

async function driveApiRequest(url, options = {}) {
    const token = await getDriveWriteAccessToken();
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
    const response = await fetch(url, { ...options, headers });
    const text = await response.text().catch(() => '');
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!response.ok) {
        const msg = typeof data === 'string' ? data : JSON.stringify(data || {});
        throw new Error(`Google Drive write API ${response.status}: ${msg.slice(0, 500)}`);
    }
    return data;
}

async function resolveParentFolderId(parentPath = '') {
    const parentId = await resolveFolderIdByPath(parentPath || '', { force: true });
    if (!parentId) throw new Error('Không tìm thấy thư mục cha trên Google Drive: ' + (parentPath || 'Products root'));
    return parentId;
}

async function createDriveFolder(parentPath = '', name = '') {
    if (!driveWriteConfigured()) throw new Error('Chưa cấu hình quyền ghi Google Drive trên server');
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Thiếu tên thư mục cần tạo');
    const parentId = await resolveParentFolderId(parentPath);
    const data = await driveApiRequest('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    });
    clearDriveCaches();
    return data;
}

async function renameDriveFile(fileId = '', name = '') {
    if (!driveWriteConfigured()) throw new Error('Chưa cấu hình quyền ghi Google Drive trên server');
    const cleanId = String(fileId || '').trim();
    const cleanName = String(name || '').trim();
    if (!cleanId || !cleanName) throw new Error('Thiếu fileId hoặc tên mới');
    const data = await driveApiRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cleanId)}?supportsAllDrives=true&fields=id,name,mimeType,webViewLink`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName })
    });
    clearDriveCaches();
    return data;
}

async function deleteDriveFile(fileId = '') {
    if (!driveWriteConfigured()) throw new Error('Chưa cấu hình quyền ghi Google Drive trên server');
    const cleanId = String(fileId || '').trim();
    if (!cleanId) throw new Error('Thiếu fileId cần xóa');
    await driveApiRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cleanId)}?supportsAllDrives=true`, { method: 'DELETE' });
    clearDriveCaches();
    return { id: cleanId, deleted: true };
}

async function setDriveFilePublic(fileId = '') {
    if (!driveWriteConfigured()) throw new Error('Chưa cấu hình quyền ghi Google Drive trên server');
    const cleanId = String(fileId || '').trim();
    if (!cleanId) throw new Error('Thiếu fileId cần cấp quyền công khai');
    await driveApiRequest(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cleanId)}/permissions?supportsAllDrives=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });
    clearDriveCaches();
    return { id: cleanId, public: true };
}

function extMime(filename = '') {
    const n = String(filename || '').toLowerCase();
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.webp')) return 'image/webp';
    if (n.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
}

async function uploadDriveImage(parentPath = '', file = {}) {
    if (!driveWriteConfigured()) throw new Error('Chưa cấu hình quyền ghi Google Drive trên server');
    const parentId = await resolveParentFolderId(parentPath);
    const name = String(file.name || '').trim();
    const base64 = String(file.base64 || '').replace(/^data:[^;]+;base64,/, '');
    const mimeType = String(file.mimeType || file.type || extMime(name));
    if (!name || !base64) throw new Error('Thiếu tên file hoặc dữ liệu base64');
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mimeType)) throw new Error('Chỉ cho upload JPG/PNG/WebP để đảm bảo Meta/Pancake hiển thị ổn định');
    const media = Buffer.from(base64, 'base64');
    if (media.length > 12 * 1024 * 1024) throw new Error('Ảnh quá nặng trên 12MB. Hãy nén trước khi upload.');
    const boundary = 'aiguka_' + Date.now().toString(36);
    const metadata = { name, parents: [parentId], mimeType };
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
        media,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const data = await driveApiRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,webContentLink,size,imageMediaMetadata', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
    });
    if (file.makePublic !== false) {
        try { await setDriveFilePublic(data.id); } catch (error) { data.publicWarning = error.message; }
    }
    clearDriveCaches();
    return { ...data, image_url: driveImageUrl(data.id) };
}

async function listDriveFolderContent(folderPath = '', { force = false } = {}) {
    if (!driveReady()) return { ready: false, error: 'Thiếu GOOGLE_DRIVE_PRODUCTS_ROOT_ID hoặc GOOGLE_DRIVE_API_KEY', folders: [], files: [] };
    const folderId = await resolveFolderIdByPath(folderPath, { force });
    if (!folderId) return { ready: true, folderId: null, folders: [], files: [], error: 'Không tìm thấy thư mục Drive' };
    const children = await driveListChildren(folderId, { folderOnly: false });
    const folders = children.filter(x => x.mimeType === 'application/vnd.google-apps.folder').sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'vi',{numeric:true}));
    const files = children.filter(x => x.mimeType !== 'application/vnd.google-apps.folder').sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'vi',{numeric:true})).map(x => ({
        id: x.id, name: x.name, mimeType: x.mimeType, size: x.size, webViewLink: x.webViewLink, image_url: isImageFile(x) ? driveImageUrl(x.id) : '', imageMediaMetadata: x.imageMediaMetadata || {}
    }));
    return { ready: true, folderPath, folderId, folders, files, writeEnabled: driveWriteConfigured(), generatedAt: new Date().toISOString() };
}

async function driveListChildren(parentId, { folderOnly = false } = {}) {
    if (!driveReady()) return [];
    const qParts = [`'${escapeDriveQueryValue(parentId)}' in parents`, "trashed = false"];
    if (folderOnly) qParts.push("mimeType = 'application/vnd.google-apps.folder'");
    const params = new URLSearchParams({
        key: GOOGLE_DRIVE_API_KEY,
        q: qParts.join(" and "),
        fields: "files(id,name,mimeType,webContentLink,webViewLink,thumbnailLink,size,imageMediaMetadata,md5Checksum)",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true"
    });
    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Google Drive API ${response.status}: ${text.slice(0, 200)}`);
    }
    const data = await response.json();
    return Array.isArray(data.files) ? data.files : [];
}

async function resolveFolderIdByPath(folderPath = "", { force = false } = {}) {
    if (!driveReady()) return null;
    const segments = normalizeDrivePath(folderPath);
    if (!segments.length) return GOOGLE_DRIVE_PRODUCTS_ROOT_ID;

    const cacheKey = segments.map(normalizePathSegment).join("/");
    const cached = folderIdCache.get(cacheKey);
    const now = Date.now();
    if (!force && cached && now - cached.time < DRIVE_CACHE_TTL_MS) return cached.id;

    let parentId = GOOGLE_DRIVE_PRODUCTS_ROOT_ID;
    const resolved = [];
    for (const segment of segments) {
        const children = await driveListChildren(parentId, { folderOnly: true });
        const wanted = normalizePathSegment(segment);
        const found = children.find(f => normalizePathSegment(f.name) === wanted);
        if (!found) return null;
        parentId = found.id;
        resolved.push(found.name);
    }

    folderIdCache.set(cacheKey, { id: parentId, time: now, resolvedPath: resolved.join("/") });
    return parentId;
}

function isImageFile(file) {
    const mime = String(file?.mimeType || "").toLowerCase();
    const name = String(file?.name || "").toLowerCase();
    return mime.startsWith("image/") || /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
}

function driveImageUrl(fileId) {
    // URL trực tiếp đủ ổn cho Messenger nếu folder/file đã share công khai.
    // Nếu file chưa public hoặc Google trả HTML/redirect khó đọc, checker sẽ đánh lỗi và bot không nên dùng ảnh đó.
    return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
}

function imageStandardAdvice(check = {}) {
    const issues = [];
    const warnings = [];
    const mime = String(check.mimeType || '').toLowerCase();
    const size = Number(check.sizeBytes || 0);
    const width = Number(check.width || 0);
    const height = Number(check.height || 0);
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mime)) issues.push('Định dạng nên là JPG/PNG/WebP');
    if (size && size > 8 * 1024 * 1024) issues.push('Ảnh quá nặng trên 8MB, Meta/Pancake dễ không preview');
    else if (size && size > 5 * 1024 * 1024) warnings.push('Ảnh hơi nặng trên 5MB, nên nén lại');
    if (width && height) {
        if (width < 500 || height < 500) issues.push('Kích thước ảnh quá nhỏ, nên tối thiểu 500x500');
        const ratio = width / height;
        if (ratio > 2.2 || ratio < 0.45) warnings.push('Tỷ lệ ảnh quá lệch, carousel có thể crop xấu');
    } else {
        warnings.push('Không đọc được kích thước ảnh từ Drive metadata');
    }
    return { issues, warnings };
}

async function probePublicImageUrl(url) {
    const result = { ok: false, httpStatus: null, contentType: '', contentLength: 0, finalUrl: url, error: '' };
    if (!url) return { ...result, error: 'Thiếu URL ảnh' };
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 9000);
        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: ctrl.signal,
            headers: { 'User-Agent': 'facebookexternalhit/1.1 AIGUKA-Slide-Checker' }
        }).finally(() => clearTimeout(timer));
        result.httpStatus = response.status;
        result.contentType = response.headers.get('content-type') || '';
        result.contentLength = Number(response.headers.get('content-length') || 0);
        result.finalUrl = response.url || url;
        result.ok = response.ok && /^image\//i.test(result.contentType);
        if (!response.ok) result.error = `HTTP ${response.status}`;
        else if (!/^image\//i.test(result.contentType)) result.error = `URL không trả về ảnh trực tiếp (content-type=${result.contentType || 'trống'})`;
    } catch (error) {
        result.error = error && error.name === 'AbortError' ? 'Timeout khi tải thử ảnh' : String(error.message || error);
    }
    return result;
}

async function checkProductImagesByPath(folderPath = '', { force = false } = {}) {
    const ready = driveReady();
    if (!ready) return { ready: false, folderPath, count: 0, okCount: 0, failCount: 0, warningCount: 0, images: [], error: 'Thiếu GOOGLE_DRIVE_PRODUCTS_ROOT_ID hoặc GOOGLE_DRIVE_API_KEY' };
    const folderId = await resolveFolderIdByPath(folderPath, { force });
    if (!folderId) return { ready: true, folderPath, folderId: null, count: 0, okCount: 0, failCount: 0, warningCount: 0, images: [], error: 'Không tìm thấy thư mục Drive theo đường dẫn đã chọn' };
    const files = await driveListChildren(folderId, { folderOnly: false });
    const images = files.filter(isImageFile).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi', { numeric: true }));
    const checked = [];
    for (const file of images) {
        const url = driveImageUrl(file.id);
        const meta = file.imageMediaMetadata || {};
        const base = {
            id: file.id,
            name: file.name || '',
            mimeType: file.mimeType || '',
            sizeBytes: Number(file.size || 0),
            width: Number(meta.width || 0),
            height: Number(meta.height || 0),
            image_url: url,
            webViewLink: file.webViewLink || ''
        };
        const advice = imageStandardAdvice(base);
        const probe = await probePublicImageUrl(url);
        const issues = [...advice.issues];
        const warnings = [...advice.warnings];
        if (!probe.ok) issues.push(probe.error || 'Meta/Pancake có thể không tải được URL ảnh công khai');
        const status = issues.length ? 'fail' : (warnings.length ? 'warning' : 'ok');
        const score = Math.max(0, 100 - issues.length * 35 - warnings.length * 10);
        checked.push({ ...base, status, score, issues, warnings, publicProbe: probe });
    }
    return {
        ready: true,
        folderPath,
        folderId,
        count: checked.length,
        okCount: checked.filter(x => x.status === 'ok').length,
        failCount: checked.filter(x => x.status === 'fail').length,
        warningCount: checked.filter(x => x.status === 'warning').length,
        images: checked,
        generatedAt: new Date().toISOString()
    };
}

async function listProductImagesByPath(folderPath = "", { force = false } = {}) {
    if (!driveReady() || !folderPath) return [];
    const normalized = normalizeDrivePath(folderPath).map(normalizePathSegment).join("/");
    const cached = fileListCache.get(normalized);
    const now = Date.now();
    if (!force && cached && now - cached.time < DRIVE_CACHE_TTL_MS) return cached.items;

    const folderId = await resolveFolderIdByPath(folderPath, { force });
    if (!folderId) return [];

    const files = await driveListChildren(folderId, { folderOnly: false });

    // Dedupe để tránh trường hợp Drive trả trùng file hoặc người dùng upload trùng tên cùng ảnh.
    // Ưu tiên giữ bản đầu tiên theo thứ tự sort tự nhiên.
    const seen = new Set();
    const items = files
        .filter(isImageFile)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi", { numeric: true }))
        .filter(file => {
            const key = `${String(file.name || "").toLowerCase()}::${String(file.id || "")}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map((file, index) => ({
            id: file.id,
            title: String(file.name || `Ảnh ${index + 1}`).replace(/\.[^.]+$/, ""),
            image_url: driveImageUrl(file.id),
            webViewLink: file.webViewLink || "",
            name: file.name || ""
        }));

    fileListCache.set(normalized, { time: now, items, folderId });
    return items;
}

async function debugDrivePath(folderPath = "", { force = false } = {}) {
    const ready = driveReady();
    if (!ready) {
        return {
            ready: false,
            error: "Thiếu GOOGLE_DRIVE_PRODUCTS_ROOT_ID hoặc GOOGLE_DRIVE_API_KEY",
            folderPath,
            count: 0,
            images: []
        };
    }
    const folderId = await resolveFolderIdByPath(folderPath, { force });
    const images = folderId ? await listProductImagesByPath(folderPath, { force }) : [];
    return {
        ready,
        folderPath,
        folderId,
        count: images.length,
        images: images.slice(0, 20)
    };
}

async function listProductFolderTree({ force = false, depth = 2 } = {}) {
    if (!driveReady()) {
        return { ready: false, rootId: "", folders: [], error: "Thiếu GOOGLE_DRIVE_PRODUCTS_ROOT_ID hoặc GOOGLE_DRIVE_API_KEY" };
    }
    const maxDepth = Math.max(1, Math.min(6, Number(depth || 3)));
    const now = Date.now();
    const cacheKey = `folder-tree:${maxDepth}`;
    const cached = fileListCache.get(cacheKey);
    if (!force && cached && now - cached.time < DRIVE_CACHE_TTL_MS) return cached.items;

    async function walk(parentId, parentPath = "", level = 1) {
        const children = await driveListChildren(parentId, { folderOnly: true });
        const result = [];
        for (const child of children.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi", { numeric: true }))) {
            const name = String(child.name || "").trim();
            const path = parentPath ? `${parentPath}/${name}` : name;
            const node = { id: child.id, name, path, level, children: [] };
            if (level < maxDepth) node.children = await walk(child.id, path, level + 1);
            result.push(node);
        }
        return result;
    }

    const folders = await walk(GOOGLE_DRIVE_PRODUCTS_ROOT_ID, "", 1);
    const payload = { ready: true, rootId: GOOGLE_DRIVE_PRODUCTS_ROOT_ID, folders, generatedAt: new Date().toISOString() };
    fileListCache.set(cacheKey, { time: now, items: payload });
    return payload;
}

module.exports = {
    listProductImagesByPath,
    listProductFolderTree,
    debugDrivePath,
    checkProductImagesByPath,
    listDriveFolderContent,
    createDriveFolder,
    renameDriveFile,
    deleteDriveFile,
    uploadDriveImage,
    setDriveFilePublic,
    driveReady,
    driveWriteConfigured,
    normalizeDrivePath
};
