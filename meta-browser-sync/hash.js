import crypto from 'node:crypto';
export function hashMessage(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
