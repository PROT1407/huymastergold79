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

const SLOGAN = 'Làm theo kế hoạch, đừng chạy theo nến tin.';
const NAV_RE = /presidents,?\s*since\s*1971|About Kitco|Cryptos\s+Base Metals|tính từ mốc năm 1971|Số liệu trong nguồn/i;

function asLines(value) {
  if (Array.isArray(value)) return value.filter((line) => typeof line === 'string' && line.trim().length > 1);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function scrubDigits(text) {
  return String(text || '')
    .replace(/24\s*K/gi, 'NHAN24K')
    .replace(/\d+(?:[.,]\d+)*/g, ' ')
    .replace(/NHAN24K/g, '24K')
    .replace(/nhẫn\s+trơn\s*K\b/gi, 'nhẫn trơn 24K')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function wholeCommentary(value) {
  return asLines(value).map(scrubDigits).filter((line) => line.length >= 40 && !NAV_RE.test(line) && !looksEnglish(line));
}

function looksEnglish(text) {
  if (/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹ]/i.test(text || '')) return false;
  return ((text || '').match(/\b(the|and|from|with|near|week|gold|report|since|about)\b/gi) || []).length >= 3;
}

function formatVndLocal(amount) {
  return String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function changeSentence(current, previous, label) {
  if (!current || !previous || previous.sell == null || current.sell == null) return '';
  const delta = current.sell - previous.sell;
  if (delta === 0) return `${label} giữ nguyên bán ${formatVndLocal(current.sell)} đồng/lượng so với mốc trước ${formatVndLocal(previous.buy)} / ${formatVndLocal(previous.sell)}.`;
  const verb = delta < 0 ? 'giảm' : 'tăng';
  const toward = delta < 0 ? 'xuống còn' : 'lên mức';
  return `${label} ${verb} ${formatVndLocal(delta)} đồng/lượng, từ mua ${formatVndLocal(previous.buy)} / bán ${formatVndLocal(previous.sell)} ${toward} mua ${formatVndLocal(current.buy)} / bán ${formatVndLocal(current.sell)}.`;
}

function lockDomesticBoard(board, lines, context) {
  const prices = context.prices || [];
  const previous = context.previous || {};
  const bar = prices.find((row) => /miếng/i.test(row.type)) || prices[0];
  const ring = prices.find((row) => /nhẫn|24K/i.test(row.type));
  const when = context.sourceTime || context.clock.datetimeVn;
  const moves = [changeSentence(bar, previous.bar, 'Vàng miếng SJC'), changeSentence(ring, previous.ring, 'Nhẫn trơn 24K')].filter(Boolean);
  const moved = moves.some((line) => /tăng|giảm/.test(line));
  const story = [
    `Giá nguồn lúc ${when}: ${bar ? `${bar.brand} ${bar.type} mua ${formatVndLocal(bar.buy)} / bán ${formatVndLocal(bar.sell)} đồng/lượng.` : ''}`,
    ...moves,
    ring ? `Nhẫn trơn 24K mua ${formatVndLocal(ring.buy)} / bán ${formatVndLocal(ring.sell)} đồng/lượng.` : '',
  ].filter(Boolean);
  const commentary = wholeCommentary(board.analysis).concat(wholeCommentary(board.advice)).filter((line) => !(moved && /đi ngang|ổn định/i.test(line)));
  board.price_lines = (lines || []).slice();
  board.as_of = when;
  board.analysis = [...story, ...commentary];
  board.analysis_en = wholeCommentary(board.analysis_en);
  board.advice = commentary.join(' ') || story.join(' ');
  board.advice_en = wholeCommentary(board.advice_en).join(' ');
  board.quick_advice = story.join(' ');
  board.quick_advice_en = story.join(' ');
  board.moved = moved;
  return board;
}

function factTokens(text) {
  const tokens = extractNumbers(text);
  const out = [];
  for (const value of tokens.percents) out.push(`${value}%`);
  for (const value of tokens.ints) {
    const year = Number(value);
    if (year >= 1900 && year <= 2100) continue;
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

function cleanVietnameseFacts(facts, pricePath) {
  const lines = [];
  if (pricePath) lines.push(pricePath);
  for (const fact of facts || []) {
    if (fact && fact.vn) lines.push(fact.vn);
  }
  return lines;
}

function appendWeeklyFacts(board, facts, pricePath) {
  const lines = cleanVietnameseFacts(facts, pricePath).filter((line) => !looksEnglish(line) && !NAV_RE.test(line));
  if (!lines.length) return;
  board.sections = [...(board.sections || []).filter((item) => item && item.h !== 'Số liệu trong nguồn' && !looksEnglish(item.p)), { h: 'Diễn biến và số liệu', p: lines.join(' ') }];
}

function weeklyBlob(board) {
  return [board.title, board.title_en, ...(board.sections || []).map((item) => `${item.h} ${item.p}`), ...(board.sections_en || []).map((item) => `${item.h} ${item.p}`)].join('\n');
}

function reject(error, debug, retryable) {
  return { ok: false, status: 422, error, debug, retryable: Boolean(retryable) };
}

function minutesApart(left, right) {
  const parse = (value) => {
    const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  };
  const a = parse(left);
  const b = parse(right);
  if (a == null || b == null) return 0;
  return Math.abs(a - b) / 60000;
}

function applyFedwatch(board, fedwatch) {
  const items = (fedwatch && fedwatch.items) || [];
  if (!items.length) {
    if (!board.fedwatch_note) board.fedwatch_note = 'Chưa có xác suất FedWatch trong nguồn.';
    return false;
  }
  const item = [...items].sort((a, b) => String(b.published || '').localeCompare(String(a.published || '')))[0];
  const percent = ((item.sentence || '').match(/(\d{1,3}(?:[.,]\d+)?)\s*%/) || [])[1] || '';
  const line = `${item.name} (${item.published || 'không rõ giờ bài'}): xác suất CME FedWatch cho lần tăng tháng 12 là ${percent}%. Nguồn: ${item.url}`;
  board.fedwatch_note = line;
  if (Array.isArray(board.items)) {
    for (const entry of board.items) {
      entry.summary = String(entry.summary || '').replace(/chưa có số fedwatch[^.]*\.?/gi, '').trim();
      entry.summary_en = String(entry.summary_en || '').replace(/no fedwatch figure[^.]*\.?/gi, '').trim();
    }
    if (board.items[0] && percent && !`${board.items[0].summary} ${board.items[0].title}`.includes(percent)) {
      board.items[0].summary = `${board.items[0].summary} ${line}`.trim();
    }
  }
  return true;
}

function postUrl(task, clock) {
  if (task === 'domestic') return 'https://h79gold.com/gia-vang.html';
  if (task === 'weekly') return `https://h79gold.com/bai/${clock.dateVn}-tong-hop-tin-vang-tuan-qua.html`;
  return `https://h79gold.com/bai/${clock.dateVn}-tin-vi-mo-anh-huong-gia-vang.html`;
}

function applyShares(task, board, clock) {
  const url = postUrl(task, clock);
  const lead = task === 'domestic'
    ? (board.quick_advice || '')
    : task === 'weekly'
      ? ((board.sections || []).map((item) => item.p).join(' ') || board.title || '')
      : ((board.items && board.items[0] && board.items[0].title) || board.fedwatch_note || '');
  const text = `${lead}\n${url}\n${SLOGAN}`.replace(/Trade the plan, not the noise\.?/gi, '').trim();
  board.share_fb = text;
  board.share_zalo = text;
}

function lintBoard(task, board, ctx) {
  const problems = [];
  for (const key of ['analysis', 'analysis_en', 'advice', 'advice_en', 'quick_advice', 'quick_advice_en']) {
    const raw = board[key];
    if (Array.isArray(raw) && raw.length >= 4 && raw.every((piece) => typeof piece === 'string' && piece.length === 1)) problems.push(`${key} split into characters`);
    for (const piece of asLines(raw)) {
      if (piece.length === 1) problems.push(`${key} single character`);
      if (piece.length < 40) problems.push(`${key} shorter than 40`);
    }
  }
  const blob = JSON.stringify(board);
  if (NAV_RE.test(blob)) problems.push('navigation or raw fact dump');
  const vn = [board.analysis, board.advice, board.quick_advice, board.share_fb, ...(board.sections || []).map((item) => `${item.h} ${item.p}`)].flat().filter(Boolean).join('\n');
  if (looksEnglish(vn)) problems.push('raw English in a Vietnamese field');
  if (ctx.moved && /đi ngang|ổn định/i.test(vn)) problems.push('says prices are flat while they moved');
  if (ctx.payrollMonth === 10 && /việc làm tháng 11/.test(vn)) problems.push('payroll data month mixed up with the release month');
  if (ctx.fedwatchRequired && /chưa có (số|xác suất) fedwatch/i.test(blob)) problems.push('FedWatch figure was extracted but the board says there is none');
  if (!(board.share_fb || '').includes(SLOGAN)) problems.push('share text missing the Vietnamese line');
  if ((board.share_fb || '').includes('/tin-tuc.html')) problems.push('share text uses the generic news URL');
  return problems;
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
  for (const row of [...(input.prices || []), input.previous && input.previous.bar, input.previous && input.previous.ring]) {
    if (!row) continue;
    for (const amount of [row.buy, row.sell, row.prevBuy, row.prevSell]) {
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
      const fedwatchRequired = Boolean(input.fedwatch && input.fedwatch.stated && (input.fedwatch.items || []).length);
      applyFedwatch(board, input.fedwatch);
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
      applyShares('macro', board, clock);
      const problems = lintBoard('macro', board, { fedwatchRequired });
      if (problems.length) return reject('Bản tin chưa đạt kiểm tra nội dung.', { failedNumbers: [], missingFacts: [], detail: problems.join('; ') }, !input.final);
    } else {
      board.sections = (Array.isArray(board.sections) ? board.sections : []).filter((item) => item && item.h !== 'Số liệu trong nguồn' && !looksEnglish(item.p) && !NAV_RE.test(item.p || ''));
      const sections = board.sections.length ? board.sections : [{ h: 'Tuần qua', p: 'Bản tin tuần ghép từ các mốc giá và số liệu đã đọc trong nguồn.' }];
      board.sections = sections;
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
      if (input.pricePath && !blob.includes('Trong tuần, giá vàng giao dịch')) {
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
      if (missing.length || (input.pricePath && !blob.includes('Trong tuần, giá vàng giao dịch'))) {
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
      if (input.pricePath && !weeklyBlob(board).includes('Trong tuần, giá vàng giao dịch')) appendWeeklyFacts(board, [], input.pricePath);
      const payroll = (input.facts || []).find((fact) => fact.kind === 'payroll');
      applyShares('weekly', board, clock);
      const problems = lintBoard('weekly', board, { payrollMonth: payroll && payroll.month });
      if (problems.length) return reject('Bản tin chưa đạt kiểm tra nội dung.', { failedNumbers: [], missingFacts: [], detail: problems.join('; ') }, !input.final);
    }
    return { ok: true, board, text, sources: articles.map(publicSource) };
  }
  const prices = input.prices || [];
  if (!prices.length) return reject('Không lấy được giá vàng trong nước thật từ nguồn công khai. Cần giá thật; không được tự điền số SJC hoặc PNJ.', { failedNumbers: [], missingFacts: [], detail: 'no parsed prices' }, false);
  const bar = prices.find((row) => /miếng/i.test(row.type)) || prices[0];
  const ring = prices.find((row) => /nhẫn|24K/i.test(row.type));
  for (const [current, stored] of [[bar, input.previous && input.previous.bar], [ring, input.previous && input.previous.ring]]) {
    if (!current || !stored) continue;
    for (const key of ['buy', 'sell']) {
      if (stored[key] == null || current[key] == null) continue;
      const delta = String(Math.abs(current[key] - stored[key]));
      allowed.ints.add(delta);
      allowed.exact.add(delta);
    }
  }
  if (input.sourceTime && minutesApart(input.sourceTime, clock.datetimeVn) > 360) {
    return reject('Giờ cập nhật của nguồn lệch quá xa mốc yêu cầu.', { failedNumbers: [], missingFacts: [], detail: `source time ${input.sourceTime}` }, false);
  }
  lockDomesticBoard(board, input.priceLines && input.priceLines.length ? input.priceLines : [], { prices, previous: input.previous, sourceTime: input.sourceTime, clock });
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
  applyShares('domestic', board, clock);
  const problems = lintBoard('domestic', board, { moved: board.moved });
  if (problems.length) {
    return reject('Bản tin chưa đạt kiểm tra nội dung.', { failedNumbers: [], missingFacts: [], detail: problems.join('; ') }, !input.final);
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
  const share = board && board.share_fb ? `\n\n${board.share_fb}` : '';
  if (task === 'weekly' && board) {
    return [board.title, ...(board.sections || []).map((item) => `${item.h}: ${item.p}`), board.title_en, ...(board.sections_en || []).map((item) => `${item.h}: ${item.p}`)].filter(Boolean).join('\n\n') + share;
  }
  if (task === 'domestic' && board) {
    const lines = board.price_lines || [];
    const rest = (board.analysis || []).filter((line) => !lines.includes(line));
    return [...lines, ...rest, board.advice].filter(Boolean).join('\n') + share;
  }
  if (task === 'macro' && board) {
    const items = (board.items || []).map((item) => [item.title, item.summary, item.reason].filter(Boolean).join('\n')).join('\n\n');
    return [items, board.fedwatch_note].filter(Boolean).join('\n\n') + share;
  }
  return stripFences(raw) + share;
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
