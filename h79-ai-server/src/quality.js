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

function normalizeArticleText(text) {
  return String(text || '')
    .replace(/[\u00a0\u202f\u2007\u2009\ufeff]/g, ' ')
    .replace(/％/g, '%')
    .replace(/(\d)\s+%/g, '$1%')
    .replace(/(\d),(\d{1,2})(?=\s*%)/g, '$1.$2')
    .replace(/basis-point/gi, 'basis point')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractNumbers(text) {
  const percents = new Set();
  const ints = new Set();
  const exact = new Set();
  let src = normalizeArticleText(text);
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

const PROMPT_LEAK = /Giữ khung, chỉ đổi số|Chỉ dùng các dữ kiện|Không bịa số|Không viết chữ số|Lần viết trước bị từ chối|H79_SYSTEM_PROMPT/i;

function scrubDigits(text) {
  return String(text || '')
    .replace(/24\s*K/gi, 'NHAN24K')
    .replace(/(?<!\p{L})\d+(?:[.,]\d+)*(?!\p{L})/gu, ' ')
    .replace(/NHAN24K/g, '24K')
    .replace(/tránhua/gi, 'tránh mua')
    .replace(/nhẫn\s+tròn\s*trơn/gi, 'nhẫn trơn')
    .replace(/nhẫn\s+trơn\s*K\b/gi, 'nhẫn trơn 24K')
    .replace(PROMPT_LEAK, ' ')
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

function sideMove(delta, side) {
  if (!delta) return `không đổi chiều ${side}`;
  return `${delta < 0 ? 'giảm' : 'tăng'} ${formatVndLocal(delta)} đồng chiều ${side}`;
}

function changeSentence(current, previous, label) {
  if (!current || !previous || previous.buy == null || previous.sell == null || current.buy == null || current.sell == null) return '';
  const buyDelta = current.buy - previous.buy;
  const sellDelta = current.sell - previous.sell;
  if (buyDelta === 0 && sellDelta === 0) return '';
  if (buyDelta === sellDelta) {
    const verb = buyDelta < 0 ? 'giảm' : 'tăng';
    return `${label} ${verb} ${formatVndLocal(buyDelta)} đồng/lượng mỗi chiều, từ mua ${formatVndLocal(previous.buy)} / bán ${formatVndLocal(previous.sell)} còn mua ${formatVndLocal(current.buy)} / bán ${formatVndLocal(current.sell)}.`;
  }
  return `${label} ${sideMove(buyDelta, 'mua')}, ${sideMove(sellDelta, 'bán')}, từ mua ${formatVndLocal(previous.buy)} / bán ${formatVndLocal(previous.sell)} còn mua ${formatVndLocal(current.buy)} / bán ${formatVndLocal(current.sell)}.`;
}

function lockDomesticBoard(board, lines, context) {
  const prices = context.prices || [];
  const previous = context.previous || {};
  const bar = prices.find((row) => /miếng/i.test(row.type)) || prices[0];
  const ring = prices.find((row) => /nhẫn|24K/i.test(row.type));
  const when = context.sourceTime || context.clock.datetimeVn;
  const hour = ((when || '').match(/(\d{2}:\d{2})/) || [])[1] || context.clock.timeVn;
  const barMove = changeSentence(bar, previous.bar, 'SJC miếng');
  const ringMove = changeSentence(ring, previous.ring, 'Nhẫn trơn');
  const moves = [barMove, ringMove].filter(Boolean);
  const moved = moves.some((line) => /tăng|giảm/.test(line));
  const quote = [
    bar ? `SJC miếng mua ${formatVndLocal(bar.buy)} / bán ${formatVndLocal(bar.sell)}` : '',
    ring ? `nhẫn trơn 24K mua ${formatVndLocal(ring.buy)} / bán ${formatVndLocal(ring.sell)}` : '',
  ].filter(Boolean).join(', ');
  const story = [`Cập nhật ${hour}. ${quote}. ${moves.join(' ')}`.replace(/\s+/g, ' ').trim()];
  const storyEn = [[
    bar ? `As of ${hour}, SJC bars are bid ${formatVndLocal(bar.buy)} and offered ${formatVndLocal(bar.sell)} VND per tael.` : '',
    ring ? `Plain 24K rings are bid ${formatVndLocal(ring.buy)} and offered ${formatVndLocal(ring.sell)} VND per tael.` : '',
    moves.length ? 'The change is measured against the previous published quote, with buy and sell stated separately when they differ.' : '',
  ].filter(Boolean).join(' ')];
  const commentary = wholeCommentary(board.analysis).concat(wholeCommentary(board.advice)).filter((line) => !(moved && /đi ngang|ổn định/i.test(line)));
  board.price_lines = (lines || []).slice();
  board.as_of = when;
  board.analysis = [...story, ...commentary];
  board.analysis_en = storyEn;
  board.advice = commentary.join(' ') || story.join(' ');
  board.advice_en = storyEn.join(' ');
  board.quick_advice = story.join(' ');
  board.quick_advice_en = storyEn.join(' ');
  const brief = (move) => (move ? move.replace(/, từ mua[\s\S]*$/, '') : '');
  board.share_lead = [
    bar ? `SJC miếng ${formatVndLocal(bar.buy)}/${formatVndLocal(bar.sell)}${barMove ? `, ${brief(barMove).replace(/^SJC miếng\s*/, '')}` : ''}` : '',
    ring ? `Nhẫn trơn 24K ${formatVndLocal(ring.buy)}/${formatVndLocal(ring.sell)}${ringMove ? `, ${brief(ringMove).replace(/^Nhẫn trơn\s*/, '')}` : ''}` : '',
  ].filter(Boolean).join('\n');
  board.moved = moved;
  return board;
}

function isYearToken(value) {
  const number = Number(String(value).replace('%', ''));
  return number >= 1900 && number <= 2100 && String(Math.trunc(number)).length === 4;
}

function factTokens(text) {
  const tokens = extractNumbers(text);
  const out = [];
  for (const value of tokens.percents) out.push(`${value}%`);
  for (const value of tokens.ints) {
    if (isYearToken(value)) continue;
    if (value.length >= 4 || (value.length >= 3 && value !== '100')) out.push(value);
  }
  return out;
}

function coreTokens(facts, pricePath) {
  const need = factTokens(pricePath || '');
  for (const fact of facts || []) {
    if (fact.kind === 'payroll' && fact.value) need.push(String(fact.value));
    if (fact.kind === 'forecast' || /world bank|dự báo/i.test(`${fact.sentence || ''} ${fact.vn || ''}`)) {
      const spots = String(fact.vn || '').match(/\d{3,5}/g) || [];
      for (const spot of spots) {
        const value = Number(spot);
        if (value >= 1500 && value <= 8000 && !isYearToken(value)) need.push(String(value));
      }
    }
  }
  if (!need.includes('4000') && (facts || []).some((fact) => /4[,.]?000|4000/.test(`${fact.vn || ''} ${fact.sentence || ''}`))) need.push('4000');
  return [...new Set(need)];
}

function missingCore(blob, facts, pricePath) {
  const have = new Set([...factTokens(blob), ...[...extractNumbers(blob).percents].map((value) => `${value}%`)]);
  return coreTokens(facts, pricePath).filter((token) => !have.has(token));
}

function failedNumbers(draft, allowed) {
  const failed = [];
  for (const value of draft.percents) {
    if (!allowed.percents.has(value)) failed.push(`${value}%`);
  }
  for (const value of draft.exact) {
    if (isYearToken(value)) continue;
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

const BANNED_PHRASES = [
  'giao dịch đầy sóng gió',
  'tâm điểm chi phối tâm lý nhà đầu tư',
  'kim loại quý không sinh lời này',
  'bệ đỡ vững chắc',
  'vẫn duy trì cao hơn đáng kể so với giai đoạn trước',
  'tâm lý nhà đầu tư',
  'động lực tăng giá ban đầu',
];
const REPEAT_SKIP = new Set(['vàng', 'giá', 'tuần', 'mức', 'mốc', 'tháng', 'năm', 'theo', 'trong', 'không', 'được', 'nhưng', 'hoặc', 'cũng', 'nhiều', 'sau', 'trước', 'khoảng', 'đỉnh', 'đáy', 'này', 'đây', 'đang', 'vẫn', 'một', 'các', 'cho', 'với', 'khi', 'như', 'đến', 'tới', 'hơn', 'hàng', 'công', 'nợ', 'ngân', 'quốc', 'hội', 'đảng', 'chính', 'tiền', 'bản', 'thị', 'trường', 'việc']);
const PAREN_ALLOW = /^(?:Fed|CPI|NFP|DXY|WGC|CME|USD)$/i;

function learnNumberRoles(text) {
  const decimals = new Set();
  const integers = new Set();
  const aliases = new Set();
  const re = /\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,3})/g;
  for (const match of String(text || '').matchAll(re)) {
    const raw = match[1];
    if (raw.includes(',')) {
      const [head, frac] = raw.split('.');
      integers.add(String(Number(head.replace(/,/g, ''))));
      if (frac) decimals.add(`${Number(head.replace(/,/g, ''))}.${frac.replace(/0+$/, '') || '0'}`);
    } else {
      const [head, frac] = raw.split('.');
      const trimmed = frac.replace(/0+$/, '');
      decimals.add(`${Number(head)}.${trimmed || '0'}`);
      if (frac.length === 3 && frac.endsWith('0') && frac !== '000') aliases.add(`${Number(head)}${trimmed}`);
    }
  }
  return { decimals, integers, aliases };
}

function decideGrouped(token, roles) {
  const [head, frac] = token.split('.');
  const thou = String(Number(head + frac));
  const trimmed = frac.replace(/0+$/, '');
  const decKey = `${Number(head)}.${trimmed || '0'}`;
  const asDecimal = roles.decimals.has(decKey);
  const asInteger = roles.integers.has(thou);
  if (asDecimal && !asInteger && trimmed) return `${Number(head)},${trimmed}`;
  if (asInteger && !asDecimal) return token;
  if (asDecimal && trimmed) return `${Number(head)},${trimmed}`;
  const asGoldThousands = Number(thou) >= 1000 && Number(thou) <= 20000;
  if (frac === '000' || asGoldThousands || !frac.endsWith('0')) return token;
  if (trimmed) return `${Number(head)},${trimmed}`;
  return token;
}

function unstutterGold(text) {
  return String(text || '')
    .replace(/(?:giá\s+)?spot\s+gold\s+giao dịch\s+quanh mức/gi, 'Giá vàng giao ngay quanh mức')
    .replace(/(?:giá\s+)?gold\s+spot\s+giao dịch\s+quanh mức/gi, 'Giá vàng giao ngay quanh mức')
    .replace(/(?:giá\s+)?spot\s+gold\s+giao dịch/gi, 'Giá vàng giao ngay')
    .replace(/(?:giá\s+)?gold\s+spot\s+giao dịch/gi, 'Giá vàng giao ngay')
    .replace(/spot\s+gold/gi, 'vàng giao ngay')
    .replace(/gold\s+spot/gi, 'vàng giao ngay')
    .replace(/giao ngay\s+spot(?:\s+gold)?\s+vàng\s+giao dịch/gi, 'giao ngay')
    .replace(/giao ngay\s+spot(?:\s+gold)?(?:\s+vàng)?/gi, 'giao ngay')
    .replace(/gold\s+spot\s+vàng/gi, 'vàng')
    .replace(/spot\s+vàng\s+giao dịch/gi, 'vàng giao ngay')
    .replace(/vàng(?:\s+vàng)+/gi, 'vàng')
    .replace(/giao ngay(?:\s+giao ngay)+/gi, 'giao ngay');
}

function contentWords(sentence) {
  const folded = String(sentence || '').toLowerCase()
    .replace(/đã\s+vượt/g, 'đã trên')
    .replace(/\b(exceeded|surpassed|above|over)\b/g, 'trên')
    .replace(/\b(debt)\b/g, 'nợ')
    .replace(/\b(public)\b/g, 'công')
    .replace(/\b(trillion)\b/g, 'nghìn');
  return folded
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !/^(đã|là|các|một|cho|với|khi|và|của|the|and|for|has|was|is|usd|oz)$/.test(word));
}

function numberKey(sentence) {
  return (String(sentence || '').match(/\d+(?:[.,]\d+)*/g) || [])
    .map((token) => token.replace(/[.,]/g, ''))
    .filter((token) => token.length >= 2)
    .sort()
    .join(',');
}

function nearDuplicate(left, right) {
  const a = contentWords(left);
  const b = contentWords(right);
  if (a.length < 3 || b.length < 3) return false;
  const keyA = numberKey(left);
  const keyB = numberKey(right);
  if (!keyA || keyA !== keyB) return false;
  const setB = new Set(b);
  const shared = a.filter((word) => setB.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 && shared / union >= 0.6;
}

function preferSentence(current, next) {
  if (/đã trên|is above|above\s+\$/i.test(next) && !/đã trên|is above|above\s+\$/i.test(current)) return next;
  return current;
}

function eachLine(text, fn) {
  return String(text ?? '').split('\n').map((line) => fn(line)).join('\n');
}

function dedupeSentences(text) {
  return eachLine(text, (line) => {
    const kept = [];
    for (const sentence of sentencesOf(line)) {
      const index = kept.findIndex((item) => nearDuplicate(item, sentence));
      if (index === -1) kept.push(sentence);
      else kept[index] = preferSentence(kept[index], sentence);
    }
    return kept.join(' ');
  });
}

function unsourcedGoldHedge(sentence, corpus) {
  const hedge = /phòng thủ dài hạn|vai trò phòng thủ|long-term hedge|acts as a hedge/i.test(sentence || '');
  const gold = /kim loại quý|\bvàng\b|\bgold\b|\bbullion\b/i.test(sentence || '');
  const geo = /hormuz|eo biển|đàm phán|diplomatic/i.test(sentence || '');
  if (!(hedge && gold && geo)) return false;
  const hay = String(corpus || '');
  const sourced = /hormuz|eo biển/i.test(hay) && /(gold|bullion|vàng).{0,140}(hedge|safe[- ]haven|phòng thủ)|(hedge|safe[- ]haven|phòng thủ).{0,140}(gold|bullion|vàng)/i.test(hay);
  return !sourced;
}

function stripUnsourcedHedge(text, corpus) {
  return eachLine(text, (line) => sentencesOf(line).filter((sentence) => !unsourcedGoldHedge(sentence, corpus)).join(' '));
}

function polishVn(text, roles) {
  const known = roles || { decimals: new Set(), integers: new Set(), aliases: new Set() };
  const urls = [];
  let out = unstutterGold(String(text || ''))
    .replace(/25\s*điểm\s*chuẩn/gi, '25 điểm cơ bản')
    .replace(/Commodity Markets Outlook/gi, 'Triển vọng Thị trường Hàng hóa')
    .replace(/\bWorld Bank\b/gi, 'Ngân hàng Thế giới')
    .replace(/https?:\/\/\S+/g, (url) => {
      urls.push(url);
      return `«${urls.length - 1}»`;
    });
  out = out
    .replace(/\$?\s*(\d{1,3}),(\d{3})\.(\d{1,2})\b/g, (_, whole, thou, frac) => `${whole}.${thou},${frac.length === 1 ? `${frac}0` : frac}`)
    .replace(/(?<![\d.])(\d{1,3}),(\d{3})(?![\d.])/g, (full, head, frac) => {
      const trimmed = frac.replace(/0+$/, '');
      const decKey = `${Number(head)}.${trimmed || '0'}`;
      const thou = String(Number(head + frac));
      if (known.decimals.has(decKey) && !known.integers.has(thou) && trimmed && frac !== '000') return `${Number(head)},${trimmed}`;
      if (known.integers.has(thou) && !known.decimals.has(decKey)) return `${head}.${frac}`;
      return full;
    })
    .replace(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+\.\d{1,3}/g, (token) => {
      if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(token) || /^\d{1,3}(?:\.\d{3}){2,}$/.test(token)) return token;
      if (/^\d+\.\d{1,2}$/.test(token)) return token.replace('.', ',');
      if (/^\d{1,3}\.\d{3}$/.test(token)) return decideGrouped(token, known);
      return token;
    });
  out = out.replace(/(\p{L})(\d)/gu, (full, letter, digit, offset, src) => {
    if (/[A-Z]/.test(letter) && /(?:^|[^A-Za-z])[A-Z]$/.test(src.slice(Math.max(0, offset - 2), offset + 1))) return full;
    if (/(?:^|[^A-Za-z])(?:FY|No)$/i.test(src.slice(Math.max(0, offset - 2), offset + 1))) return full;
    return `${letter} ${digit}`;
  });
  out = out.replace(/kỳ hạn\s+(2|10)(?!\s*năm)\b/gi, 'kỳ hạn $1 năm');
  out = out.replace(/\(([^)]{1,80})\)/g, (full, inner) => {
    const trimmed = inner.trim();
    if (PAREN_ALLOW.test(trimmed)) return `(${trimmed})`;
    if (/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹ]/i.test(trimmed)) return full;
    if (/spot gold/i.test(trimmed)) return 'spot vàng';
    if (/non-?farm payrolls/i.test(trimmed)) return 'NFP';
    if (/^[A-Za-z0-9 ,.'’+\-/]+$/.test(trimmed) && /\b[A-Za-z]{3,}\b/.test(trimmed)) return '';
    return full;
  });
  out = out.replace(/«(\d+)»/g, (_, index) => urls[Number(index)] || '');
  return dedupeSentences(unstutterGold(out).replace(/[ \t]{2,}/g, ' ').trim());
}

function styleVnFields(board, corpus) {
  const roles = learnNumberRoles(corpus || '');
  const touch = (value) => (typeof value === 'string' ? stripUnsourcedHedge(polishVn(value, roles), corpus) : value);
  const touchEn = (value) => (typeof value === 'string' ? stripUnsourcedHedge(dedupeSentences(value), corpus) : value);
  if (typeof board.title === 'string') board.title = touch(board.title);
  if (typeof board.fedwatch_note === 'string') board.fedwatch_note = touch(board.fedwatch_note);
  for (const key of ['analysis', 'advice', 'quick_advice', 'share_fb', 'share_zalo', 'share_lead']) {
    if (Array.isArray(board[key])) board[key] = board[key].map(touch);
    else board[key] = touch(board[key]);
  }
  for (const item of board.items || []) {
    item.title = touch(item.title);
    item.summary = touch(item.summary);
    item.reason = touch(item.reason);
    item.summary_en = touchEn(item.summary_en);
    item.reason_en = touchEn(item.reason_en);
  }
  for (const section of board.sections || []) section.p = touch(section.p);
  for (const section of board.sections_en || []) section.p = touchEn(section.p);
}

function splitDebt(text) {
  return sentencesOf(text).map((sentence) => {
    if (!/nợ công/i.test(sentence) || !/40/.test(sentence)) return sentence;
    const debt = 'Nợ công Mỹ đã trên 40 nghìn tỷ USD.';
    if (!/bệ đỡ|vượt qua mốc/i.test(sentence)) return debt;
    const gold = sentence
      .replace(/,?\s*tạo bệ đỡ vững chắc[\s\S]*$/i, '')
      .replace(/,?\s*vượt qua mốc nợ công[\s\S]*$/i, '')
      .replace(/[.!?]\s*$/, '')
      .trim();
    if (gold && /\d/.test(gold) && !/nợ công/i.test(gold)) return `${gold}. ${debt}`;
    return debt;
  }).join(' ');
}

function dropGenericWorldBank(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).filter((sentence) => {
    if (!/world bank|ngân hàng thế giới/i.test(sentence)) return true;
    return /\d/.test(sentence);
  }).join(' ');
}

function formatWeekLabel(week) {
  if (!week || !week.start || !week.end) return '';
  const bit = (iso) => {
    const parts = String(iso).split('-');
    if (parts.length < 3) return '';
    return `${Number(parts[2])}/${Number(parts[1])}`;
  };
  const start = bit(week.start);
  const end = bit(week.end);
  if (!start || !end) return '';
  return `tuần ${start}–${end}`;
}

function ensureWeekLabel(board, week) {
  const label = formatWeekLabel(week);
  if (!label) return;
  const blob = `${board.title || ''}\n${(board.sections || []).map((section) => section.p || '').join('\n')}`;
  const [start, end] = label.replace(/^tuần\s+/, '').split('–');
  if (start && end && blob.includes(start) && blob.includes(end)) return;
  board.title = board.title ? `${board.title} (${label})` : label;
}

function iranClaimSupported(corpus) {
  return /iran/i.test(corpus || '') && /(support|premium|safe[- ]haven|hỗ trợ|đàm phán)/i.test(corpus || '');
}

function stripIranClaim(text, corpus) {
  if (iranClaimSupported(corpus)) return text;
  const cleaned = String(text || '').replace(/,?\s*[^,.!?]{0,220}iran[^,.!?]{0,220}/gi, '');
  return sentencesOf(cleaned).filter((sentence) => /\p{L}/u.test(sentence)).join(' ');
}

function tidyWeeklyCopy(board, week, corpus) {
  const fix = (value) => stripIranClaim(dropGenericWorldBank(splitDebt(value)), corpus);
  if (typeof board.title === 'string') board.title = fix(board.title);
  for (const section of board.sections || []) section.p = fix(section.p || '');
  board.sections = (board.sections || []).filter((section) => section && section.p && section.p.trim());
  ensureWeekLabel(board, week);
}

function sentencesOf(text) {
  const out = [];
  for (const line of String(text || '').split(/\n+/)) {
    out.push(...line.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean));
  }
  return out;
}

const WATCH_CLAIMS = [
  { vn: /iran/i, fact: /iran/i },
  { vn: /đàm phán/i, fact: /negotiat|talks|\biran\b/i },
  { vn: /chiến tranh/i, fact: /\bwar\b|conflict/i },
  { vn: /trung đông/i, fact: /middle east|hormuz/i },
  { vn: /hormuz/i, fact: /hormuz/i },
  { vn: /hỗ trợ/i, fact: /\bsupport\b|premium|safe[- ]haven|hỗ trợ/i },
  { vn: /đầu cơ/i, fact: /speculat/i },
];

function unsupportedClaim(sentence, corpus) {
  if (/\d/.test(sentence || '')) return false;
  const hay = String(corpus || '');
  return WATCH_CLAIMS.some((item) => item.vn.test(sentence) && !item.fact.test(hay));
}

function percentsIn(text) {
  const found = [];
  for (const match of String(text || '').matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)) found.push(normPercent(match[1]));
  return found;
}

function alignTitlePercents(board) {
  for (const item of board.items || []) {
    const body = [item.summary, item.reason, board.fedwatch_note].filter(Boolean).join(' ');
    const precise = [...new Set(percentsIn(body).filter((value) => value.includes('.')))];
    if (precise.length !== 1) continue;
    const exact = precise[0];
    item.title = String(item.title || '').replace(/(\d{1,3}(?:[.,]\d+)?)\s*%/g, (full, raw) => {
      const value = normPercent(raw);
      if (value === exact) return `${exact.replace('.', ',')}%`;
      if (!value.includes('.') && Math.abs(Number(value) - Number(exact)) <= 5) return `${exact.replace('.', ',')}%`;
      return full;
    });
  }
  const noted = ((String(board.fedwatch_note || '').match(/(\d{1,3},\d+)\s*%/) || [])[1] || '');
  if (!noted) return;
  for (const item of board.items || []) {
    const own = `${item.title || ''} ${String(item.summary || '').split(String(board.fedwatch_note || '___none___')).join(' ')}`;
    if (!/fed\s*watch|fedwatch/i.test(own)) continue;
    if (percentsIn(item.title).includes(noted.replace(',', '.'))) continue;
    item.title = `${String(item.title || '').trim()} ${noted}%`.replace(/\s{2,}/g, ' ').trim();
  }
}

function titlePercentMismatch(board) {
  const problems = [];
  for (const item of board.items || []) {
    const body = new Set(percentsIn([item.summary, item.reason, board.fedwatch_note].filter(Boolean).join(' ')));
    for (const value of percentsIn(item.title)) {
      if (!body.has(value)) problems.push(`title percent ${value}% is not in the body`);
    }
  }
  return problems;
}

function repeatedWord(sentence) {
  const words = String(sentence || '').toLowerCase().match(/\p{L}+/gu) || [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word.length < 4 || REPEAT_SKIP.has(word)) continue;
    for (let j = i + 1; j <= i + 4 && j < words.length; j += 1) {
      if (words[j] === word) return word;
    }
  }
  return '';
}

function bannedHit(sentence) {
  const hay = String(sentence || '').toLowerCase();
  return BANNED_PHRASES.find((phrase) => hay.includes(phrase)) || '';
}

function englishParen(text) {
  return [...String(text || '').matchAll(/\(([^)]{1,80})\)/g)].some((match) => {
    const inner = match[1].trim();
    if (PAREN_ALLOW.test(inner)) return false;
    if (/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹ]/i.test(inner)) return false;
    return /^[A-Za-z0-9 ,.'’+\-/]+$/.test(inner) && /\b[A-Za-z]{3,}\b/.test(inner);
  });
}

function foldWeeklySentence(board, sentence) {
  if (!sentence) return;
  board.sections = (board.sections || []).filter((item) => item && item.h !== 'Diễn biến và số liệu' && item.h !== 'Số liệu trong nguồn');
  const blob = (board.sections || []).map((item) => item.p || '').join(' ');
  sentence = String(sentence).replace(/\s*[→➔]\s*/g, ', ').replace(/\s+,/g, ',');
  if (blob.includes(sentence.slice(0, 32))) return;
  if (!board.sections.length) board.sections = [{ h: 'Tuần qua', p: sentence }];
  else board.sections[0].p = `${board.sections[0].p} ${sentence}`.trim();
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

function sourceLabel(url) {
  const host = String(url || '').toLowerCase();
  if (host.includes('kitco')) return 'Kitco';
  if (host.includes('cnbc')) return 'CNBC';
  if (host.includes('reuters')) return 'Reuters';
  if (host.includes('fxstreet')) return 'FXStreet';
  if (host.includes('federalreserve')) return 'Fed';
  return 'nguồn';
}

function estStamp(iso) {
  const instant = Date.parse(iso || '');
  if (Number.isNaN(instant)) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const pick = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  let hour = pick('hour');
  if (hour === '24') hour = '00';
  return `${hour}:${pick('minute')} EST ${Number(pick('day'))}/${pick('month')}`;
}

function cleanVnField(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence && !looksEnglish(sentence))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function applyFedwatch(board, fedwatch) {
  const items = (fedwatch && fedwatch.items) || [];
  if (!items.length) {
    if (!board.fedwatch_note) board.fedwatch_note = 'Chưa có xác suất FedWatch trong nguồn.';
    return false;
  }
  const item = [...items].sort((a, b) => String(b.published || '').localeCompare(String(a.published || '')))[0];
  const percent = ((normalizeArticleText(item.sentence || '').match(/(\d{1,3}(?:[.,]\d+)?)%/) || [])[1] || '').replace(',', '.');
  const basis = /25[-\s]*basis point|25\s*bp|25 điểm/i.test(item.sentence || '') ? '25 điểm cơ bản ' : '';
  const when = estStamp(item.published);
  const line = `Theo ${sourceLabel(item.url)} (${when || 'không rõ giờ'}), xác suất CME FedWatch cho một lần tăng ${basis}tháng 12 là ${percent.replace('.', ',')}%.`;
  board.fedwatch_note = line;
  if (Array.isArray(board.items)) {
    for (const entry of board.items) {
      entry.summary = cleanVnField(entry.summary).replace(/chưa có (số|xác suất) fedwatch[^.]*\.?/gi, '').trim();
      entry.reason = cleanVnField(entry.reason).replace(/chưa có (số|xác suất) fedwatch[^.]*\.?/gi, '').trim();
      if (looksEnglish(entry.title || '')) entry.title = 'FedWatch và vàng';
    }
    if (board.items[0] && percent && !String(board.items[0].summary || '').includes(percent.replace('.', ','))) {
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
    ? (board.share_lead || '')
    : task === 'weekly'
      ? (board.title || '')
      : ((board.items && board.items[0] && board.items[0].title) || '');
  const leadShort = lead;
  const text = `${leadShort}\n${url}\n${SLOGAN}`.replace(/Trade the plan, not the noise\.?/gi, '').replace(/Giá nguồn lúc[^.]*/gi, '').trim();
  board.share_fb = text;
  board.share_zalo = `${text}\n👥 Join nhóm Zalo H79 - Nhận tín hiệu free: https://h79gold.com/zalo`;
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
  if (NAV_RE.test(blob) || PROMPT_LEAK.test(blob) || /tránhua|nhẫn\s+tròn\s*trơn/i.test(blob)) problems.push('navigation, prompt leak, or glued word');
  if ((board.share_zalo || '').includes('h79gold.com/zalo') && (board.share_fb || '').includes('h79gold.com/zalo')) problems.push('Facebook share includes the Zalo line');
  if (!(board.share_zalo || '').includes('https://h79gold.com/zalo')) problems.push('Zalo share missing the group line');
  const vnFields = [
    board.fedwatch_note,
    board.analysis, board.advice, board.quick_advice,
    ...(board.items || []).flatMap((item) => [item.title, item.summary, item.reason]),
    ...(board.sections || []).map((item) => `${item.h} ${item.p}`),
  ].flat().filter(Boolean).join('\n');
  if (looksEnglish(vnFields) || /https?:\/\//.test(vnFields) || /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(vnFields) || englishParen(vnFields)) problems.push('English, URL, or ISO time in a Vietnamese field');
  const vn = vnFields;
  if (/giao ngay\s+spot|spot\s+vàng\s+giao dịch|gold\s+spot\s+vàng/i.test(vn)) problems.push('gold opener stutter');
  const publishedVn = [vn, board.share_lead, board.share_fb, board.share_zalo].filter(Boolean).join('\n');
  if (/spot\s+gold|gold\s+spot/i.test(publishedVn)) problems.push('english spot gold left in Vietnamese');
  if (/phòng thủ dài hạn|vai trò phòng thủ/i.test(vn) && sentencesOf(vn).some((sentence) => unsourcedGoldHedge(sentence, ctx.corpus || ''))) problems.push('unsourced gold hedge');
  if (ctx.moved && /đi ngang|ổn định/i.test(vn)) problems.push('says prices are flat while they moved');
  if (ctx.payrollMonth === 10 && /việc làm tháng 11/.test(vn)) problems.push('payroll data month mixed up with the release month');
  if (ctx.fedwatchRequired && /chưa có (số|xác suất) fedwatch/i.test(blob)) problems.push('FedWatch figure was extracted but the board says there is none');
  if (task === 'macro') problems.push(...titlePercentMismatch(board));
  if (task === 'weekly') {
    if ((vn.match(/giao dịch trong tuần đi từ/gi) || []).length > 1) problems.push('price path sentence repeated');
    if (/→|➔/.test(vn)) problems.push('arrow chain in Vietnamese prose');
    for (const sentence of vn.split(/[.!?]/)) {
      const levels = sentence.match(/\d\.\d{3}/g) || [];
      if (levels.length > 4 && /đi từ|giao dịch|mốc/.test(sentence)) problems.push('path has more than 4 levels');
    }
    const weeklyText = [board.title, vn].filter(Boolean).join('\n');
    for (const sentence of sentencesOf(weeklyText)) {
      const phrase = bannedHit(sentence);
      if (phrase) problems.push(`banned phrase: ${phrase}`);
      const word = repeatedWord(sentence);
      if (word) problems.push(`repeated word: ${word}`);
      if (unsupportedClaim(sentence, ctx.corpus || '')) problems.push('unsupported claim');
    }
  }
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
    ...(input.sources || []).map((src) => src.normalized || src.excerpt || ''),
    ...((input.fedwatch && input.fedwatch.items) || []).map((item) => item.sentence || ''),
    ...(input.priceLines || []),
    ...((input.facts || []).map((fact) => fact.sentence)),
  ].join('\n'));
  allowed.ints.add(String(clock.year));
  allowed.exact.add(String(clock.year));
  const corpus = [
    ...(input.sources || []).map((src) => src.normalized || src.excerpt || ''),
    ...((input.fedwatch && input.fedwatch.items) || []).map((item) => item.sentence || ''),
    ...((input.facts || []).map((fact) => fact.sentence)),
  ].join('\n');
  if (input.task === 'macro' || input.task === 'weekly') {
    for (const alias of learnNumberRoles(corpus).aliases) {
      allowed.exact.add(alias);
      allowed.ints.add(alias);
    }
  }
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
      styleVnFields(board, corpus);
      alignTitlePercents(board);
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
      styleVnFields(board, corpus);
      const problems = lintBoard('macro', board, { fedwatchRequired, corpus });
      if (problems.length) return reject('Bản tin chưa đạt kiểm tra nội dung.', { failedNumbers: [], missingFacts: [], detail: problems.join('; ') }, !input.final);
    } else {
      board.sections = (Array.isArray(board.sections) ? board.sections : []).filter((item) => item && item.h !== 'Số liệu trong nguồn' && item.h !== 'Diễn biến và số liệu' && !looksEnglish(item.p) && !NAV_RE.test(item.p || ''));
      tidyWeeklyCopy(board, input.week, corpus);
      styleVnFields(board, corpus);
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
      let missing = missingCore(blob, input.facts, input.pricePath);
      if ((bad.length || missing.length || !concrete(tokens, clock.year)) && !input.final) {
        return reject('Bản tin tuần thiếu số liệu lấy từ bài báo, hoặc có số không có trong nguồn.', {
          failedNumbers: bad,
          missingFacts: missing,
          detail: 'weekly figures incomplete',
        }, true);
      }
      if (input.final && (missing.length || (input.pricePath && !/đi từ khoảng/.test(weeklyBlob(board))))) {
        foldWeeklySentence(board, input.pricePath);
        const forecast = (input.facts || []).find((fact) => fact.kind === 'forecast' && fact.vn);
        const payroll = (input.facts || []).find((fact) => fact.kind === 'payroll' && fact.vn);
        foldWeeklySentence(board, payroll && payroll.vn);
        foldWeeklySentence(board, forecast && forecast.vn);
        blob = weeklyBlob(board);
        tokens = extractNumbers(blob);
        bad = failedNumbers(tokens, allowed);
        missing = missingCore(blob, input.facts, input.pricePath);
      }
      if (!concrete(tokens, clock.year) || bad.length || missing.length) {
        return reject('Bản tin tuần thiếu số liệu lấy từ bài báo, hoặc có số không có trong nguồn.', {
          failedNumbers: bad,
          missingFacts: missing,
          detail: 'weekly figures incomplete',
        }, false);
      }
      const payroll = (input.facts || []).find((fact) => fact.kind === 'payroll');
      applyShares('weekly', board, clock);
      styleVnFields(board, corpus);
      const problems = lintBoard('weekly', board, { payrollMonth: payroll && payroll.month, corpus });
      if (problems.length) {
        const flagged = sentencesOf([board.title, ...(board.sections || []).map((item) => item.p)].filter(Boolean).join('\n')).filter((sentence) => bannedHit(sentence) || repeatedWord(sentence) || unsupportedClaim(sentence, corpus));
        const phraseOnly = flagged.length > 0 && problems.every((problem) => problem.startsWith('banned phrase') || problem.startsWith('repeated word') || problem.startsWith('unsupported claim'));
        if (phraseOnly) {
          return {
            ok: false,
            status: 422,
            error: 'Bản tin chưa đạt kiểm tra nội dung.',
            debug: { failedNumbers: [], missingFacts: [], detail: problems.join('; '), phraseRewrite: true, flagged },
            board,
            retryable: false,
          };
        }
        return reject('Bản tin chưa đạt kiểm tra nội dung.', { failedNumbers: [], missingFacts: [], detail: problems.join('; ') }, !input.final);
      }
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
  styleVnFields(board, corpus);
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

function parseVnStamp(text) {
  const clock = String(text || '').match(/(\d{1,2}):(\d{2})(?::\d{2})?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (clock) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${clock[5]}-${pad(clock[4])}-${pad(clock[3])} ${pad(clock[1])}:${clock[2]}`;
  }
  const iso = String(text || '').match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!iso) return '';
  return `${iso[1]}-${iso[2]}-${iso[3]} ${iso[4] || '23'}:${iso[5] || '59'}`;
}

function quotesBefore(data, datetimeVn) {
  if (!data || typeof data !== 'object') return null;
  const target = parseVnStamp(datetimeVn);
  if (!target) return null;
  const candidates = [];
  const stamp = parseVnStamp(data.updated_vn || data.price_time || '');
  if (stamp && stamp < target && Array.isArray(data.rows)) {
    const row = (code) => data.rows.find((item) => item && item.code === code && item.buy && item.sell);
    candidates.push({ at: stamp, bar: row('SJL1L10'), ring: row('PQHN24NTT') || row('SJ9999') });
  }
  const history = data.history || {};
  for (const code of ['SJL1L10', 'PQHN24NTT', 'SJ9999']) {
    for (const row of history[code] || []) {
      const at = row && row.date ? `${row.date} 23:59` : '';
      if (!at || at >= target || !row.buy || !row.sell) continue;
      candidates.push({ at, code, buy: row.buy, sell: row.sell });
    }
  }
  if (!candidates.length) return null;
  const latest = candidates.map((item) => item.at).sort().at(-1);
  const current = candidates.find((item) => item.at === latest && item.bar);
  if (current) return { bar: quoteOf(current.bar), ring: quoteOf(current.ring), at: latest };
  const bar = candidates.filter((item) => item.code === 'SJL1L10' && item.at === latest).at(-1);
  const ring = candidates.filter((item) => item.code === 'PQHN24NTT' && item.at === latest).at(-1)
    || candidates.filter((item) => item.code === 'SJ9999' && item.at === latest).at(-1);
  return { bar: quoteOf(bar), ring: quoteOf(ring), at: latest };
}

function quoteOf(row) {
  if (!row || !row.buy || !row.sell) return null;
  return { buy: row.buy, sell: row.sell };
}

function sanitizePrevious(value) {
  if (!value || typeof value !== 'object') return null;
  const one = (row) => {
    if (!row || typeof row !== 'object') return null;
    const buy = Number(row.buy);
    const sell = Number(row.sell);
    if (!(buy >= 50000000 && sell >= buy && sell <= 500000000)) return null;
    return { buy, sell };
  };
  const bar = one(value.bar);
  const ring = one(value.ring);
  if (!bar && !ring) return null;
  return { bar, ring };
}

function replaceFlagged(board, from, to) {
  if (typeof board.title === 'string' && board.title.includes(from)) board.title = board.title.replace(from, to);
  for (const section of board.sections || []) {
    if (section.p && section.p.includes(from)) section.p = section.p.replace(from, to);
  }
  return board;
}

module.exports = {
  concrete,
  contradictsClock,
  extractNumbers,
  failedNumbers,
  gate,
  learnNumberRoles,
  lockDomesticBoard,
  missingCore,
  parseBoard,
  dedupeSentences,
  lintBoard,
  polishVn,
  repeatedWord,
  stripUnsourcedHedge,
  styleVnFields,
  quotesBefore,
  replaceFlagged,
  sanitizePrevious,
  renderText,
  stripFences,
};
