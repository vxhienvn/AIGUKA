// AIGUKA V7.0.1 - Context Builder V2
// Mục tiêu: chuẩn hóa ngữ cảnh trước khi gọi AI để giảm lỗi nhận diện sản phẩm/QC/intent.
// Module này chỉ đưa ra gợi ý có điểm tin cậy, không gửi tin, không gọi Messenger, không quyết định thay Sale.

const { loadProductRows, findBestProductRow, buildRangeText } = require('../services/productSheetService');
const { resolveRecognitionGroup } = require('./recognitionGroupService');

function stripVietnamese(str = '') {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeText(str = '') {
  return stripVietnamese(str).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function lastCustomerMessage(history = '') {
  const lines = String(history || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const m = line.match(/^(khách|khach|customer|user)\s*[:：]\s*(.+)$/i);
    if (m) return m[2].trim();
  }
  // fallback: lấy dòng cuối không phải Bot/Admin/Page
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!/^(bot|admin|sale|page|shop)\s*[:：]/i.test(lines[i])) return lines[i];
  }
  return '';
}

function detectIntent(text = '') {
  const msg = normalizeText(text);
  if (!msg) return 'unknown';
  if (/(gia|bao gia|bao nhieu|bao tien|bn|xin gia|cho gia)/.test(msg)) return 'price';
  if (/(cho xem|xem mau|xin mau|gui mau|gui anh|xin anh|xem anh|catalog|catalogue|hinh anh|video)/.test(msg)) return 'media';
  if (/(dia chi|o dau|showroom|cua hang|duong den|map|vi tri)/.test(msg)) return 'location';
  if (/(bao hanh|bh|doi tra|loi|hong)/.test(msg)) return 'warranty';
  if (/(tu van|can tu van|chon|nen mua|loai nao|mau nao)/.test(msg)) return 'consult';
  if (/(sdt|so dien thoai|zalo|goi|phone)/.test(msg)) return 'contact';
  return 'general';
}

const PRODUCT_TERMS = {
  fan: ['quat', 'quat tran', 'quat den', 'guka', '10 canh', '8 canh', '6 canh', '5 canh', 'gold', 'vang', 'ma vang'],
  faucet: ['sen cay', 'bo sen', 'sen tam', 'sen voi', 'voi tam', 'voi lavabo', 'lavabo', 'chau lavabo', 'sen nhat', 'toto okayamachi'],
  toilet: ['bon cau', 'bet', 'toilet', 'wc', 'bon cau thong minh', 'cau thong minh', 'nap rua'],
  vanity: ['tu guong', 'tu chau', 'tu lavabo', 'tu chau guong', 'guong lavabo', 'tu nha tam'],
  bathtub: ['bon tam', 'bathtub', 'massage'],
  combo: ['combo', 'thiet bi ve sinh', 'phong tam', 'nha tam', 'nha ve sinh', 'tbvs'],
  kitchen: ['bep', 'bep tu', 'hut mui', 'chau rua bat', 'voi bep', 'thiet bi bep'],
  tile: ['gach', 'gach men', 'gach op', 'gach lat', 'da op', 'op lat'],
  lighting: ['den', 'den chum', 'den trang tri']
};

function scoreProducts(currentText = '', history = '') {
  const now = normalizeText(currentText);
  const recent = normalizeText(String(history || '').split(/\n+/).slice(-16).join(' '));
  const result = {};
  for (const [product, terms] of Object.entries(PRODUCT_TERMS)) {
    let score = 0;
    for (const term of terms) {
      const t = normalizeText(term);
      if (!t) continue;
      if (now.includes(t)) score += 45;
      if (recent.includes(t)) score += 15;
    }
    if (score > 0) result[product] = score;
  }
  return Object.entries(result)
    .map(([product, score]) => ({ product, score }))
    .sort((a, b) => b.score - a.score);
}

function detectContactStatus(history = '') {
  const src = String(history || '');
  const norm = normalizeText(src);
  const phone = src.match(/(?:\+?84|0)(?:[\s.\-]?\d){8,10}/);
  const hasZalo = /\bzalo\b/i.test(src) || norm.includes('ket ban zalo') || norm.includes('nhan zalo') || norm.includes('gui zalo');
  return { hasPhone: Boolean(phone), phone: phone ? phone[0] : '', hasZalo };
}

function detectHumanHandled(history = '') {
  const norm = normalizeText(history);
  const saleSignals = [
    'em vua goi', 'em goi cho anh', 'em goi cho chi', 'anh nghe may', 'chi nghe may',
    'em ket ban zalo', 'em nhan zalo', 'em gui zalo', 'sale goi', 'tu van vien goi',
    'em da goi', 'da goi cho anh', 'da goi cho chi'
  ];
  return saleSignals.some(s => norm.includes(s));
}

function detectAdHint(history = '') {
  const raw = String(history || '');
  const adLine = raw.split(/\n+/).reverse().find(line => /(ad|quảng cáo|quang cao|campaign|creative|post)/i.test(line));
  if (!adLine) return null;
  const candidates = scoreProducts(adLine, '');
  return { raw: adLine.slice(0, 220), product: candidates[0]?.product || '', confidence: Math.min(95, candidates[0]?.score || 0) };
}

async function buildConversationContextV2({ history = '' } = {}) {
  const currentText = lastCustomerMessage(history);
  const intent = detectIntent(currentText);
  const productScores = scoreProducts(currentText, history);
  const adHint = detectAdHint(history);
  let recognition = null;
  try {
    recognition = await resolveRecognitionGroup([currentText, String(history || '').split(/\n+/).slice(-8).join(' ')].join(' '));
  } catch (_) {}

  // Nếu lời khách hiện tại có sản phẩm rõ, ưu tiên lời khách. Nếu không, dùng tín hiệu quảng cáo/lịch sử.
  let selected = productScores[0] || null;
  if ((!selected || selected.score < 45) && adHint?.product) selected = { product: adHint.product, score: adHint.confidence || 55, source: 'ad_hint' };

  // V7.2.7: nếu nhận dạng nhóm GENERAL (Tổng hợp/Bathroom tổng hợp) mà lời khách chưa nói rõ sản phẩm,
  // không được lấy product đầu tiên trong mapping và không được tự chốt bồn cầu thông minh.
  const recognitionMode = recognition?.group?.mode || '';
  const recognitionName = recognition?.group?.name || '';
  const exactProductEvidence = Boolean(selected && selected.score >= 45 && !selected.source);
  if (recognitionMode === 'GENERAL' && !exactProductEvidence) selected = null;

  const product = selected?.product || '';
  const confidence = selected ? Math.max(0, Math.min(99, selected.score)) : 0;
  let bestRow = null;
  let priceRange = '';
  try {
    if (product) {
      bestRow = await findBestProductRow(product, currentText, history);
      priceRange = buildRangeText(bestRow);
    } else {
      // warm cache nhẹ; không ảnh hưởng nếu lỗi
      loadProductRows().catch(() => {});
    }
  } catch (_) {}

  const contact = detectContactStatus(history);
  const humanHandled = detectHumanHandled(history);
  const needs = {
    price: intent === 'price',
    media: intent === 'media',
    contact: intent === 'contact',
    location: intent === 'location',
    consult: intent === 'consult'
  };

  const recommendedActions = [];
  if (humanHandled || contact.hasPhone || contact.hasZalo) recommendedActions.push('do_not_ask_contact_again');
  if (product && confidence >= 45) recommendedActions.push('do_not_ask_product_again');
  if (needs.price && product && priceRange) recommendedActions.push('answer_price_range_first');
  if (needs.media && product) recommendedActions.push('send_or_prepare_correct_slide_media');
  if (recognitionMode === 'GENERAL' && !product) recommendedActions.push('general_group_do_not_select_product');
  if (!product && ['price', 'media', 'consult'].includes(intent)) recommendedActions.push('ask_one_short_clarifying_product_question');

  return {
    version: 'context-builder-v2.0',
    currentText,
    intent,
    selectedProduct: product,
    productConfidence: confidence,
    productCandidates: productScores.slice(0, 5),
    adHint,
    recognition: recognition ? { group: recognitionName, mode: recognitionMode, confidence: recognition.confidence || 0, alias: recognition.alias || '', products: recognition.group?.products || [] } : null,
    productKnowledge: bestRow ? {
      group: bestRow.group || '',
      category: bestRow.category || '',
      path: bestRow.path || '',
      priceMin: bestRow.price_min || '',
      priceMax: bestRow.price_max || '',
      priceRange
    } : null,
    contact,
    humanHandled,
    needs,
    recommendedActions
  };
}

function formatContextForPrompt(ctx = {}) {
  const lines = [];
  lines.push('CONTEXT BUILDER V2 - DỮ LIỆU ƯU TIÊN TRƯỚC KHI AI TRẢ LỜI');
  lines.push(`Tin khách mới nhất: ${ctx.currentText || '(không rõ)'}`);
  lines.push(`Intent: ${ctx.intent || 'unknown'}`);
  lines.push(`Sản phẩm gợi ý: ${ctx.selectedProduct || '(chưa rõ)'} | Confidence: ${ctx.productConfidence || 0}`);
  if (ctx.adHint?.raw) lines.push(`Tín hiệu quảng cáo/lịch sử: ${ctx.adHint.raw}`);
  if (ctx.recognition?.group) lines.push(`Nhóm nhận dạng: ${ctx.recognition.group} | Mode: ${ctx.recognition.mode || ''} | Confidence: ${ctx.recognition.confidence || 0}`);
  if (ctx.recognition?.mode === 'GENERAL') lines.push('RULE V7.2.7: Đây là nhóm tổng hợp. Không được tự chọn một sản phẩm cụ thể nếu khách chưa nói rõ sản phẩm. Hãy hỏi nhu cầu theo nhóm hoặc xin SĐT/Zalo.');
  if (ctx.productKnowledge) {
    lines.push(`Knowledge sản phẩm: ${ctx.productKnowledge.group || ''} | Giá: ${ctx.productKnowledge.priceRange || 'chưa có'} | Slide/Path: ${ctx.productKnowledge.path || 'chưa có'}`);
  } else {
    lines.push('Knowledge sản phẩm: chưa tìm thấy dòng phù hợp trong Product Sheet.');
  }
  lines.push(`Contact: phone=${ctx.contact?.hasPhone ? 'yes' : 'no'}, zalo=${ctx.contact?.hasZalo ? 'yes' : 'no'}, saleHandled=${ctx.humanHandled ? 'yes' : 'no'}`);
  lines.push(`Recommended actions: ${(ctx.recommendedActions || []).join(', ') || '(không có)'}`);
  lines.push('Cách dùng: Nếu sản phẩm/intent đã rõ thì KHÔNG hỏi lại. Nếu khách hỏi giá và có giá thì báo khoảng giá trước. Nếu khách xin mẫu/cho xem và có sản phẩm thì phải hỗ trợ gửi đúng media/slide. Nếu đã có SĐT/Zalo hoặc sale đã gọi thì không xin lại, không follow-up máy móc.');
  return lines.join('\n');
}

module.exports = {
  buildConversationContextV2,
  formatContextForPrompt,
  normalizeText,
  detectIntent,
  scoreProducts,
  lastCustomerMessage
};
