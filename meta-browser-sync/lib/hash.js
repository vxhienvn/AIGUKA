const crypto = require('crypto');
function hash(input) { return crypto.createHash('sha1').update(String(input || '')).digest('hex'); }
module.exports = { hash };
