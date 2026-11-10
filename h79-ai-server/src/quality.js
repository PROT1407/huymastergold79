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

function scrubDigits(text) {
  return String(text || '').replace(/\d+(?:[.,]\d+)*/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function lockDomesticBoard(board, lines) {
  const commentary = [...(board.analysis || []), board.advice, board.quick_advice].map(scrubDigits).filter((line) => line && /[A-Za-zÀ-ỹ]/.test(line));
  const commentaryEn = [...(board.analysis_en || []), board.advice_en, board.quick_advice_en].map(scrubDigits).filter((line) => line && /[A-Za-z]/.test(line));
  board.price_lines = lines.slice();
  board.analysis = [...lines, ...commentary];
  board.analysis_en = commentaryEn;
  board.advice = commentary.join(' ');
  board.quick_advice = lines[0] || '';
  board.advice_en = commentaryEn.join(' ');
  board.quick_advice_en = commentaryEn[0] || '';
  return board;
}

function factTokens(text) {
  const tokens = extractNumbers(text);
  const out = [];
  for (const value of tokens.percents) out.push(`${value}%`);
  for (const value of tokens.ints) {
    if (value.length >= 4 || (value.length >= 3 && value !== '100')) out.push(value);
  }
  return out;
}

function missingFactTokens(blob, facts) {
  const have = new Set(factTokens(blob));
  const missing = [];
  for (const fact of facts || []) {
    for (const token of factTokens(fact.sentence || '')) {
      if (!have.has(token)) missing.push(token);
    }
  }
  return [...new Set(missing)].slice(0, 30);
}

function failedNumbers(draft, allowed) {
  const failed = [];
  for (const value of draft.percents) {
    if (!allowed.percents.has(value)) failed.push(`${value}%`);
  }
  for (const value of draft.exact) {
    if (!allowed.exact.has(value) && !allowed.ints.has(value)) failed.push(value);
  }
  return [...new Set(failed)].slice(0, 30);
}

function appendWeeklyFacts(board, facts, pricePath) {
  const extra = [pricePath, ...(facts || []).map((fact) => fact.sentence)].filter(Boolean).join('\n');
  if (!extra) return;
  board.sections = [...(board.sections || []), { h: 'Số liệu trong nguồn', p: extra }];
  board.sections_en = [...(board.sections_en || []), { h: 'Figures in the sources', p: extra }];
}

function weeklyBlob(board) {
  return [board.title, board.title_en, ...(board.sections || []).map((item) => `${item.h} ${item.p}`), ...(board.sections_en || []).map((item) => `${item.h} ${item.p}`)].join('\n');
}

function reject(error, debug, retryable) {
  return { ok: false, status: 422, error, debug, retryable: Boolean(retryable) };
}

function gate(input) {
  const clock = input.clock;
  const text = fixClockText(input.text, clock);
  const board = parseBoard(text);
  if (!board) return reject('Bản tin không có số liệu cụ thể để đăng.', { failedNumbers: [], missingFacts: [], detail: 'no structured draft' }, true);
  const allowed = extractNumbers([
    ...(input.sources || []).map((src) => src.excerpt || ''),
    ...(input.priceLines || []),
    ...((input.facts || []).map((fact) => fact.sentence)),
  ].join('\n'));
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
    if (!articles.length) return reject('Chỉ có trang chủ, chưa có bài báo cùng ngày hoặc gần đây.', { failedNumbers: [], missingFacts: [], detail: 'no article urls' }, false);
    if (input.task === 'macro') {
      if (!Array.isArray(board.items) || !board.items.length) {
        return reject('Bản tin không có số liệu cụ thể để đăng.', { failedNumbers: [], missingFacts: [], detail: 'no items' }, true);
      }
      stampItems(board.items, clock);
      const blob = board.items.map((item) => [item.title, item.title_en, item.summary, item.summary_en, item.reason, item.reason_en, item.time_vn, item.time_en].join('\n')).join('\n');
      if (contradictsClock(blob, clock)) return reject('Bản tin sai thứ hoặc gọi nhầm tuần mới.', { failedNumbers: [], missingFacts: [], detail: 'wrong weekday' }, !input.final);
      const tokens = extractNumbers(blob);
      const bad = failedNumbers(tokens, allowed);
      if (!concrete(tokens, clock.year) || bad.length) {
        return reject('Bản tin thiếu số liệu lấy từ bài báo, hoặc có số không có trong nguồn.', {
          failedNumbers: bad,
          missingFacts: [],
          detail: bad.length ? 'number not in sources' : 'sourced figure missing from draft',
        }, !input.final);
      }
      const fedText = `${board.fedwatch_note || ''}\n${blob}`;
      const fedClaims = fedwatchPercents(fedText);
      if (fedClaims.length) {
        const fedAllowed = extractNumbers((input.fedwatch && input.fedwatch.items || []).map((item) => item.sentence).join(' '));
        if (!input.fedwatch || !input.fedwatch.stated || fedClaims.some((value) => !fedAllowed.percents.has(value))) {
          return reject('Xác suất FedWatch không có trong bài báo đã thu thập.', {
            failedNumbers: fedClaims.filter((value) => !fedAllowed.percents.has(value)).map((value) => `${value}%`),
            missingFacts: [],
            detail: 'fedwatch percent not in article',
          }, !input.final);
        }
      } else if (!board.fedwatch_note) {
        board.fedwatch_note = 'Chưa có xác suất FedWatch trong nguồn.';
      }
    } else {
      const sections = Array.isArray(board.sections) ? board.sections : [];
      const sectionsEn = Array.isArray(board.sections_en) ? board.sections_en : [];
      if (!board.title || !sections.length || !sectionsEn.length) {
        return reject('Bản tin tuần thiếu phần tiếng Việt hoặc tiếng Anh.', { failedNumbers: [], missingFacts: [], detail: 'missing weekly sections' }, true);
      }
      let blob = weeklyBlob(board);
      if (contradictsClock(blob, clock)) return reject('Bản tin sai thứ hoặc gọi nhầm tuần mới.', { failedNumbers: [], missingFacts: [], detail: 'wrong weekday' }, !input.final);
      if (/vùng (mua|bán)|kế hoạch (mua|bán)|\b(buy|sell) zone\b/i.test(blob)) {
        return reject('Bản tin tuần không được viết vùng vào lệnh.', { failedNumbers: [], missingFacts: [], detail: 'trade plan' }, false);
      }
      let tokens = extractNumbers(blob);
      let bad = failedNumbers(tokens, allowed);
      let missing = missingFactTokens(blob, input.facts);
      if (input.pricePath && !blob.includes('Diễn biến giá trong các bài')) {
        const have = new Set(factTokens(blob));
        missing = [...new Set([...missing, ...factTokens(input.pricePath).filter((token) => !have.has(token))])];
      }
      if ((bad.length || missing.length || !concrete(tokens, clock.year)) && !input.final) {
        return reject('Bản tin tuần thiếu số liệu lấy từ bài báo, hoặc có số không có trong nguồn.', {
          failedNumbers: bad,
          missingFacts: missing,
          detail: 'weekly figures incomplete',
        }, true);
      }
      if (missing.length || (input.pricePath && !blob.includes('Diễn biến giá trong các bài'))) {
        appendWeeklyFacts(board, input.facts, input.pricePath);
        blob = weeklyBlob(board);
        tokens = extractNumbers(blob);
        bad = failedNumbers(tokens, allowed);
        missing = missingFactTokens(blob, input.facts);
      }
      if (!concrete(tokens, clock.year) || bad.length || missing.length) {
        return reject('Bản tin tuần thiếu số liệu lấy từ bài báo, hoặc có số không có trong nguồn.', {
          failedNumbers: bad,
          missingFacts: missing,
          detail: 'weekly figures incomplete',
        }, false);
      }
      if (input.pricePath && !weeklyBlob(board).includes('Diễn biến giá trong các bài')) appendWeeklyFacts(board, [], input.pricePath);
    }
    return { ok: true, board, text, sources: articles.map(publicSource) };
  }
  const prices = input.prices || [];
  if (!prices.length) return reject('Không lấy được giá vàng trong nước thật từ nguồn công khai. Cần giá thật; không được tự điền số SJC hoặc PNJ.', { failedNumbers: [], missingFacts: [], detail: 'no parsed prices' }, false);
  lockDomesticBoard(board, input.priceLines && input.priceLines.length ? input.priceLines : []);
  const prose = [...(board.price_lines || []), ...(board.analysis || []), board.advice].filter(Boolean).join('\n');
  if (contradictsClock(prose, clock)) return reject('Bản tin sai thứ hoặc gọi nhầm tuần mới.', { failedNumbers: [], missingFacts: [], detail: 'wrong weekday' }, false);
  const tokens = extractNumbers(prose);
  const priceInts = new Set(prices.flatMap((row) => [String(row.buy), String(row.sell)]));
  const bad = [];
  let used = false;
  for (const value of tokens.exact) {
    if (Number(value) >= 50000000) {
      if (!priceInts.has(value) && !allowed.ints.has(value)) bad.push(value);
      else used = true;
    }
  }
  if (!used || bad.length || !numbersFit(tokens, allowed)) {
    return reject('Giá trong nước trong bản tin không khớp số đã đọc từ nguồn.', {
      failedNumbers: bad.length ? bad : failedNumbers(tokens, allowed),
      missingFacts: [],
      detail: 'domestic price mismatch',
    }, false);
  }
  return {
    ok: true,
    board,
    text,
    sources: (input.sources || []).filter((src) => src && src.url).map(publicSource),
  };
}

function stripFences(text) {
  return String(text || '').replace(/```(?:json)?/gi, '').trim();
}

function renderText(task, board, raw) {
  if (task === 'weekly' && board) {
    return [board.title, ...(board.sections || []).map((item) => `${item.h}: ${item.p}`), board.title_en, ...(board.sections_en || []).map((item) => `${item.h}: ${item.p}`)].filter(Boolean).join('\n\n');
  }
  if (task === 'domestic' && board) {
    const lines = board.price_lines || [];
    const rest = (board.analysis || []).filter((line) => !lines.includes(line));
    return [...lines, ...rest, board.advice].filter(Boolean).join('\n');
  }
  return stripFences(raw);
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
  lockDomesticBoard,
  parseBoard,
  renderText,
  stripFences,
};
