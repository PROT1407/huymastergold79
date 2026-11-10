'use strict';

const { isArticleUrl, isHomepageUrl } = require('./collect');

function parseBoard(text) {
  const raw = String(text || '');
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  try {
    const data = JSON.parse(body.trim());
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* try a slice below */ }
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(body.slice(start, end + 1));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function normPercent(value) {
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? String(number) : '';
}

function grouped(raw) {
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  let intPart = raw;
  let exact = raw.replace(/\D/g, '');
  if (lastDot >= 0 && lastComma >= 0) {
    const decAt = Math.max(lastDot, lastComma);
    intPart = raw.slice(0, decAt).replace(/[.,]/g, '');
  } else if (/\.\d{3}\b/.test(raw) && !/\.\d{1,2}$/.test(raw)) {
    intPart = raw.replace(/\./g, '');
    exact = intPart;
  } else if (/,\d{3}\b/.test(raw) && !/,\d{1,2}$/.test(raw)) {
    intPart = raw.replace(/,/g, '');
    exact = intPart;
  } else if (/[.,]\d{1,2}$/.test(raw)) {
    intPart = raw.slice(0, Math.max(lastDot, lastComma)).replace(/[.,]/g, '');
  } else {
    intPart = raw.replace(/[.,]/g, '');
    exact = intPart;
  }
  if (!/^\d{3,12}$/.test(intPart)) return null;
  return { int: String(Number(intPart)), exact: exact.replace(/^0+(?=\d)/, '') };
}

function extractNumbers(text) {
  const percents = new Set();
  const ints = new Set();
  const exact = new Set();
  let src = String(text || '');
  src = src.replace(/(\d{1,3}(?:[.,]\d+)?)\s*%/g, (_, value) => {
    const percent = normPercent(value);
    if (percent) percents.add(percent);
    return ' ';
  });
  src = src.replace(/(\d{2,3})(?:[.,](\d))?\s*triệu/gi, (_, whole, frac) => {
    const amount = String(Number(whole) * 1000000 + (frac ? Number(frac) * 100000 : 0));
    ints.add(amount);
    exact.add(amount);
    return ' ';
  });
  const re = /\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d{3,9}(?:[.,]\d+)?/g;
  for (const match of src.matchAll(re)) {
    const token = grouped(match[0]);
    if (!token) continue;
    ints.add(token.int);
    exact.add(token.exact);
  }
  return { percents, ints, exact };
}

function addNumbers(target, extra) {
  for (const value of extra.percents) target.percents.add(value);
  for (const value of extra.ints) target.ints.add(value);
  for (const value of extra.exact) target.exact.add(value);
}

function contradictsClock(text, clock) {
  const blob = String(text || '');
  const vn = blob.match(/hôm nay[^.]{0,50}?(chủ nhật|thứ hai|thứ ba|thứ tư|thứ năm|thứ sáu|thứ bảy)/i);
  if (vn && vn[1].toLowerCase() !== clock.weekdayVn.toLowerCase()) return true;
  const en = blob.match(/\btoday\b[^.]{0,50}?\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (en && en[1].toLowerCase() !== clock.weekdayEn.toLowerCase()) return true;
  if (clock.weekdayEn !== 'Monday' && /tuần mới/i.test(blob)) return true;
  return false;
}

function concrete(tokens, year) {
  if (tokens.percents.size) return true;
  for (const value of tokens.ints) {
    if (value !== String(year)) return true;
  }
  return false;
}

function numbersFit(draft, allowed) {
  for (const value of draft.percents) {
    if (!allowed.percents.has(value)) return false;
  }
  for (const value of draft.exact) {
    if (!allowed.exact.has(value) && !allowed.ints.has(value)) return false;
  }
  return true;
}

function fedwatchPercents(text) {
  const found = [];
  const re = /fed\s*watch[\s\S]{0,80}?(\d{1,3}(?:[.,]\d+)?)\s*%|(\d{1,3}(?:[.,]\d+)?)\s*%[\s\S]{0,40}?fed\s*watch/gi;
  for (const match of String(text || '').matchAll(re)) {
    const value = normPercent(match[1] || match[2]);
    if (value) found.push(value);
  }
  return found;
}

function articleSources(sources) {
  return (sources || []).filter((src) => src && src.url && isArticleUrl(src.url) && !isHomepageUrl(src.url));
}

function fixClockText(text, clock) {
  const wrongYear = String(clock.year - 1);
  return String(text || '')
    .replaceAll(`${wrongYear}-${clock.dateVn.slice(5)}`, clock.dateVn)
    .replaceAll(`${wrongYear}-${clock.dateEt.slice(5)}`, clock.dateEt)
    .replaceAll(clock.timeEn.replace(String(clock.year), wrongYear), clock.timeEn);
}

function stampItems(items, clock) {
  const timeVn = `${clock.weekdayVn} ${clock.dateVn.split('-').reverse().join('/')} ${clock.timeVn} giờ VN`;
  for (const item of items) {
    item.date = clock.dateVn;
    item.time_vn = timeVn;
    item.time_en = clock.timeEn;
  }
}

function gate(input) {
  const clock = input.clock;
  const text = fixClockText(input.text, clock);
  const board = parseBoard(text);
  if (!board) return { ok: false, status: 422, error: 'Bản tin không có số liệu cụ thể để đăng.' };
  const allowed = extractNumbers((input.sources || []).map((src) => src.excerpt || '').join('\n'));
  allowed.ints.add(String(clock.year));
  allowed.exact.add(String(clock.year));
  for (const row of input.prices || []) {
    for (const amount of [row.buy, row.sell]) {
      if (!amount) continue;
      allowed.ints.add(String(amount));
      allowed.exact.add(String(amount));
    }
  }
  if (input.task === 'macro' || input.task === 'weekly') {
    const articles = articleSources(input.sources);
    if (!articles.length) return { ok: false, status: 422, error: 'Chỉ có trang chủ, chưa có bài báo cùng ngày hoặc gần đây.' };
    if (input.task === 'macro') {
      if (!Array.isArray(board.items) || !board.items.length) {
        return { ok: false, status: 422, error: 'Bản tin không có số liệu cụ thể để đăng.' };
      }
      stampItems(board.items, clock);
      const blob = board.items.map((item) => [item.title, item.title_en, item.summary, item.summary_en, item.reason, item.reason_en, item.time_vn, item.time_en].join('\n')).join('\n');
      if (contradictsClock(blob, clock)) return { ok: false, status: 422, error: 'Bản tin sai thứ hoặc gọi nhầm tuần mới.' };
      const tokens = extractNumbers(blob);
      if (!concrete(tokens, clock.year) || !numbersFit(tokens, allowed)) {
        return { ok: false, status: 422, error: 'Bản tin thiếu số liệu lấy từ bài báo, hoặc có số không có trong nguồn.' };
      }
      const fedText = `${board.fedwatch_note || ''}\n${blob}`;
      const fedClaims = fedwatchPercents(fedText);
      if (fedClaims.length) {
        const fedAllowed = extractNumbers((input.fedwatch && input.fedwatch.items || []).map((item) => item.sentence).join(' '));
        if (!input.fedwatch || !input.fedwatch.stated || fedClaims.some((value) => !fedAllowed.percents.has(value))) {
          return { ok: false, status: 422, error: 'Xác suất FedWatch không có trong bài báo đã thu thập.' };
        }
      } else if (!board.fedwatch_note) {
        board.fedwatch_note = 'Chưa có xác suất FedWatch trong nguồn.';
      }
    } else {
      const sections = Array.isArray(board.sections) ? board.sections : [];
      const sectionsEn = Array.isArray(board.sections_en) ? board.sections_en : [];
      if (!board.title || !sections.length || !sectionsEn.length) {
        return { ok: false, status: 422, error: 'Bản tin tuần thiếu phần tiếng Việt hoặc tiếng Anh.' };
      }
      const blob = JSON.stringify({ title: board.title, sections, sections_en: sectionsEn });
      if (contradictsClock(blob, clock)) return { ok: false, status: 422, error: 'Bản tin sai thứ hoặc gọi nhầm tuần mới.' };
      if (/vùng (mua|bán)|kế hoạch (mua|bán)|\b(buy|sell) zone\b/i.test(blob)) {
        return { ok: false, status: 422, error: 'Bản tin tuần không được viết vùng vào lệnh.' };
      }
      const tokens = extractNumbers(blob);
      if (!concrete(tokens, clock.year) || !numbersFit(tokens, allowed)) {
        return { ok: false, status: 422, error: 'Bản tin tuần thiếu số liệu lấy từ bài báo, hoặc có số không có trong nguồn.' };
      }
    }
    return { ok: true, board, text, sources: articles.map(publicSource) };
  }
  const prices = input.prices || [];
  if (!prices.length) return { ok: false, status: 422, error: 'Không lấy được giá vàng trong nước thật từ nguồn công khai. Cần giá thật; không được tự điền số SJC hoặc PNJ.' };
  const prose = [
    ...(board.analysis || []),
    ...(board.analysis_en || []),
    board.advice,
    board.advice_en,
    board.quick_advice,
    board.quick_advice_en,
  ].filter(Boolean).join('\n');
  if (contradictsClock(prose, clock)) return { ok: false, status: 422, error: 'Bản tin sai thứ hoặc gọi nhầm tuần mới.' };
  const tokens = extractNumbers(prose);
  const priceInts = new Set(prices.flatMap((row) => [String(row.buy), String(row.sell)]));
  let used = false;
  for (const value of tokens.exact) {
    if (Number(value) >= 50000000) {
      if (!priceInts.has(value)) return { ok: false, status: 422, error: 'Giá trong nước trong bản tin không khớp số đã đọc từ nguồn.' };
      used = true;
    }
  }
  if (!used || !numbersFit(tokens, allowed)) return { ok: false, status: 422, error: 'Giá trong nước trong bản tin không khớp số đã đọc từ nguồn.' };
  return {
    ok: true,
    board,
    text,
    sources: (input.sources || []).filter((src) => src && src.url).map(publicSource),
  };
}

function publicSource(src) {
  const out = { name: src.name, url: src.url };
  if (src.published) out.published = src.published;
  return out;
}

module.exports = {
  concrete,
  contradictsClock,
  extractNumbers,
  gate,
  parseBoard,
};
