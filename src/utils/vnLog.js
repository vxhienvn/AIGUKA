function vnTimeString(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(date).replace(',', '');
  } catch (_) {
    const d = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' GMT+7';
  }
}

function installVnLogPrefix() {
  if (global.__AIGUKA_VN_LOG_INSTALLED__) return;
  global.__AIGUKA_VN_LOG_INSTALLED__ = true;
  for (const method of ['log', 'warn', 'error']) {
    const original = console[method].bind(console);
    console[method] = (...args) => original(`[VN ${vnTimeString()}]`, ...args);
  }
}

module.exports = { vnTimeString, installVnLogPrefix };
