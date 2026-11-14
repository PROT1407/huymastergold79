'use strict';

const UA = 'Mozilla/5.0 (compatible; H79BoardBot/1.0; +https://h79gold.com/)';
const MAX_BYTES = 400000;
const TIMEOUT_MS = 8000;
const MAX_ARTICLES = 8;

const ARTICLE_HOSTS = new Set([
  'cnbc.com', 'www.cnbc.com',
  'reuters.com', 'www.reuters.com',
  'kitco.com', 'www.kitco.com',
  'investing.com', 'www.investing.com',
  'federalreserve.gov', 'www.federalreserve.gov',
  'fxstreet.com', 'www.fxstreet.com',
]);

const NEWS_INDEXES = [
  { name: 'Kitco News', url: 'https://www.kitco.com/news' },
  { name: 'Kitco RSS', url: 'https://www.kitco.com/news/rss' },
  { name: 'CNBC Gold', url: 'https://www.cnbc.com/gold/' },
  { name: 'CNBC Markets', url: 'https://www.cnbc.com/markets/' },
  { name: 'CNBC RSS', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664' },
  { name: 'Reuters commodities', url: 'https://www.reuters.com/markets/commodities/' },
  { name: 'FXStreet', url: 'https://www.fxstreet.com/news/latest' },
  { name: 'FXStreet RSS', url: 'https://www.fxstreet.com/rss/news' },
  { name: 'Fed press', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
];

const WORLD_SPOT = { name: 'Gold API', url: 'https://api.gold-api.com/price/XAU' };
const USDVND = { name: 'USDVND', url: 'https://open.er-api.com/v6/latest/USD' };
const LUONG_FACTOR = 1.20565;

const DOMESTIC_SOURCES = [
  { name: 'PNJ', url: 'https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00', kind: 'pnj' },
  { name: 'SJC (webgia)', url: 'https://webgia.com/gia-vang/sjc/', kind: 'html', scale: 10 },
  { name: 'SJC (giavang.org)', url: 'https://giavang.org/trong-nuoc/sjc/', kind: 'html', scale: 1000 },
  { name: 'Phú Quý', url: 'https://phuquygroup.vn/', kind: 'html', scale: 10 },
];

const HTML_LABELS = [
  { re: /vàng sjc 1l[^0-9]{0,80}/i, brand: 'SJC', type: 'Vàng miếng SJC' },
  { re: /vàng miếng sjc[^0-9]{0,80}/i, brand: 'SJC', type: 'Vàng miếng SJC' },
  { re: /nhẫn(?:\s+tròn)?\s+sjc[^0-9]{0,80}/i, brand: 'SJC', type: 'Nhẫn SJC' },
  { re: /vàng nhẫn sjc[^0-9]{0,80}/i, brand: 'SJC', type: 'Nhẫn SJC' },
];

function sourcesFor(task) {
  if (task === 'macro' || task === 'weekly') return NEWS_INDEXES;
  if (task === 'domestic') return DOMESTIC_SOURCES;
  return [];
}

function allowedHosts(url) {
  const host = new URL(url).hostname.toLowerCase();
  const hosts = new Set([host]);
  if (host.startsWith('www.')) hosts.add(host.slice(4));
  else hosts.add(`www.${host}`);
  return hosts;
}

function hostAllowed(urlStr, hosts) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.username || parsed.password || parsed.protocol !== 'https:') return false;
    return hosts.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isHomepageUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    if (path === '/') return true;
    const sections = new Set([
      '/gold', '/markets', '/news', '/news/commodities-news', '/news/latest', '/news/rss',
      '/rss/news', '/markets/commodities', '/monetarypolicy/openmarket.htm',
      '/feeds/press_all.xml', '/feeds/press_monetary.xml',
    ]);
    return sections.has(path.toLowerCase());
  } catch {
    return true;
  }
}

function isArticleUrl(urlStr) {
  let parsed;
  try { parsed = new URL(urlStr); } catch { return false; }
  if (!hostAllowed(urlStr, ARTICLE_HOSTS) || isHomepageUrl(urlStr)) return false;
  const path = parsed.pathname;
  if (/\/(quotes|video|pro|login|account|newsletters|search|tag|author|live-tv)\b/i.test(path)) return false;
  if (/\/20\d{2}\/\d{2}\/\d{2}\//.test(path)) return true;
  if (/20\d{2}-\d{2}-\d{2}/.test(path)) return true;
  const host = parsed.hostname.toLowerCase();
  if (host.endsWith('investing.com') && /\/news\/[^/]+\/[^/]+/i.test(path)) return true;
  if (host.endsWith('kitco.com') && /\/news\/article\//i.test(path)) return true;
  if (host.endsWith('reuters.com') && path.split('/').filter(Boolean).length >= 3) return true;
  if (host.endsWith('federalreserve.gov') && /\/newsevents\/pressreleases\//i.test(path)) return true;
  if (host.endsWith('fxstreet.com') && /\/news\/[^/]+/i.test(path) && !/\/news\/latest\/?$/i.test(path)) return true;
  return false;
}

function articleDate(urlStr) {
  const slash = String(urlStr).match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//);
  if (slash) return `${slash[1]}-${slash[2]}-${slash[3]}`;
  const dash = String(urlStr).match(/(20\d{2})-(\d{2})-(\d{2})/);
  return dash ? `${dash[1]}-${dash[2]}-${dash[3]}` : '';
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function dateWindow(task, clock) {
  if (task === 'weekly') {
    let monday;
    if (clock.weekdayIndex === 0) monday = addDays(clock.dateVn, -6);
    else if (clock.weekdayIndex === 6) monday = addDays(clock.dateVn, -5);
    else monday = addDays(clock.dateVn, -(clock.weekdayIndex - 1));
    return { start: monday, end: addDays(monday, 4) };
  }
  return { start: addDays(clock.dateEt, -1), end: clock.dateVn };
}

function inWindow(day, window) {
  return Boolean(day) && day >= window.start && day <= window.end;
}

function findQuotedPrices(text) {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };
  const dotted = /(?<!\d)(\d{1,3}(?:\.\d{3}){2,3})(?!\d)/g;
  for (const match of String(text || '').matchAll(dotted)) {
    const amount = Number(match[1].replace(/\./g, ''));
    if (amount >= 5000000 && amount <= 500000000) add(match[1]);
  }
  const fields = /"(?:giamua|giaban|buyingPrice|sellingPrice)"\s*:\s*(\d+(?:\.\d+)?)/gi;
  for (const match of String(text || '').matchAll(fields)) {
    const amount = Number(match[1]);
    if ((amount >= 5000 && amount <= 50000) || (amount >= 5000000 && amount <= 500000000)) add(match[1]);
  }
  return out;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d{1,6});/g, (_, code) => {
      const value = Number(code);
      return value > 0 && value < 0x110000 ? String.fromCodePoint(value) : ' ';
    })
    .replace(/\s+/g, ' ')
    .replace(/\b(?:presidents,?\s*since\s*1971|Cryptos|Base Metals|About Kitco|Kitco Forum|Mining News)\b/gi, ' ')
    .replace(/\(tính từ mốc năm 1971\)/gi, ' ')
    .replace(/[\u00a0\u202f\u2007\u2009\ufeff]/g, ' ')
    .replace(/％/g, '%')
    .replace(/(\d)\s+%/g, '$1%')
    .replace(/(\d),(\d{1,2})(?=\s*%)/g, '$1.$2')
    .replace(/basis-point/gi, 'basis point')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinks(html, baseUrl) {
  const found = new Set();
  const add = (value) => {
    try { found.add(new URL(String(value).trim(), baseUrl).href.split('#')[0]); } catch { /* skip bad href */ }
  };
  const raw = String(html || '');
  for (const match of raw.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) add(match[1]);
  for (const match of raw.matchAll(/<link>(?:<!\[CDATA\[)?([^\]<]+)/gi)) add(match[1]);
  for (const match of raw.matchAll(/<guid(?:\s[^>]*)?>(?:<!\[CDATA\[)?(https?:[^\]<]+)/gi)) add(match[1]);
  return [...found];
}

function extractFacts(text, url, name) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part.length > 20 && part.length < 420 && /\d/.test(part));
  const interesting = sentences.filter((part) => /%|\$|USD|gold|vàng|payroll|Fed|Brent|WTI|ounce|\boz\b|World Bank|yield|lợi suất/i.test(part));
  return (interesting.length ? interesting : sentences).slice(0, 16).map((sentence) => ({ sentence, url, name }));
}

function spotValues(sentence) {
  if (!/gold|vàng|spot|ounce|\boz\b|bullion|XAU/i.test(sentence)) return [];
  const out = [];
  const re = /\$\s*(\d{1,2}[.,]\d{3}(?:[.,]\d+)?)|(?<!\d)(\d{1,2}[.,]\d{3})(?!\d)/g;
  for (const match of String(sentence).matchAll(re)) {
    const raw = match[1] || match[2];
    let value = null;
    if (/^\d{1,2}[.,]\d{3}$/.test(raw)) value = Number(raw.replace(/[.,]/g, ''));
    else if (raw.includes(',') && raw.includes('.')) value = Number(raw.replace(/,/g, '').split('.')[0]);
    else if (/[.,]\d{3}/.test(raw)) value = Number(raw.replace(/[.,](?=\d{3}\b)/g, '').split(/[.,]/)[0]);
    if (value >= 1500 && value <= 8000 && !(value >= 1900 && value <= 2100 && !match[0].includes('$')) && !out.includes(value)) out.push(value);
  }
  return out;
}

function isForecast(sentence) {
  return /world bank|forecast|dự báo|target price|in 202[7-9]|by 202[7-9]|april/i.test(sentence || '');
}

function formatGoldVn(amount) {
  const rounded = Math.round(Number(amount) * 100) / 100;
  const [whole, frac] = rounded.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac === '00' ? grouped : `${grouped},${frac}`;
}

function tradedSpots(sentence) {
  if (!sentence || isForecast(sentence)) return [];
  if (/\b(could|would|may|might|if)\b/i.test(sentence)) return [];
  const technical = /\b(support|resistance|target)\b|hỗ trợ|kháng cự|mục tiêu/i.test(sentence);
  const actual = /\b(from|bounce|bounced|rose|fell|rallied|high|low|traded|settled|closed|broke|break|tested|test)\b/i.test(sentence);
  if (technical && !actual) return [];
  if (!actual) return [];
  return spotValues(sentence);
}

function pricePathFromFacts(facts) {
  const spots = [];
  for (const fact of facts || []) {
    if (fact.kind === 'forecast' || fact.kind === 'payroll') continue;
    for (const value of tradedSpots(fact.sentence)) {
      if (!spots.includes(value)) spots.push(value);
    }
  }
  if (spots.length < 2) return '';
  const low = Math.min(...spots);
  const high = Math.max(...spots);
  const extras = spots.filter((value) => value !== low && value !== high).slice(0, 2);
  const extra = extras.length ? ` Nhịp giao dịch khác trong tuần: ${extras.map(formatGoldVn).join(', ')}.` : '';
  return `Trong tuần, giá vàng đi từ khoảng ${formatGoldVn(low)} lên đỉnh ${formatGoldVn(high)}.${extra}`;
}

const DATA_MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function payrollFact(sentence) {
  if (!/payroll|nonfarm|việc làm/i.test(sentence || '')) return null;
  const monthWord = String(sentence).match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  const amount = String(sentence).match(/(\d{2,3}(?:[.,]\d{3})+)/);
  if (!monthWord || !amount) return null;
  const month = DATA_MONTHS[monthWord[1].toLowerCase()];
  const value = Number(amount[1].replace(/[.,]/g, ''));
  if (!month || !value) return null;
  return {
    kind: 'payroll',
    month,
    value,
    vn: `Báo cáo việc làm tháng ${month} tăng ${formatVnd(value)} người. Đây là tháng của số liệu, không phải tháng công bố.`,
  };
}

function forecastFact(sentence) {
  if (!isForecast(sentence)) return null;
  const spots = spotValues(sentence.includes('gold') || /world bank/i.test(sentence) ? sentence.replace(/world bank/i, 'gold') : `gold ${sentence}`);
  if (spots.length < 2) return null;
  return {
    kind: 'forecast',
    vn: `Dự báo Ngân hàng Thế giới: ${spots.map(formatGoldVn).join(', ')} USD/oz, không phải giá đã giao dịch trong tuần.`,
  };
}

function topicOf(sentence) {
  if (/brent/i.test(sentence)) return 'brent';
  if (/\bwti\b/i.test(sentence)) return 'wti';
  if (/fed\s*watch|\bcme\b/i.test(sentence) && /%/.test(sentence) && /hike|cut|december|tháng\s*12|probability|xác suất/i.test(sentence)) return 'fedwatch';
  return '';
}

function preferNewest(facts) {
  const best = new Map();
  const rest = [];
  for (const fact of facts || []) {
    const key = topicOf(fact.sentence);
    if (!key) {
      rest.push(fact);
      continue;
    }
    const prev = best.get(key);
    if (!prev || String(fact.published || '') >= String(prev.published || '')) best.set(key, fact);
  }
  return [...best.values(), ...rest];
}

function extractSourceTime(text) {
  const match = String(text || '').match(/(?:cập nhật lúc|cập nhật)\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!match) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${match[5]}-${pad(match[4])}-${pad(match[3])} ${pad(match[1])}:${match[2]}`;
}

function extractTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 140) : '';
}

function extractPublished(html) {
  const raw = String(html || '');
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:article:published_time|pubdate|date)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|pubdate|date)["']/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return match[1];
  }
  return '';
}

function isoDay(value) {
  const match = String(value || '').match(/(20\d{2})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function keySentences(text) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => part.length > 40 && part.length < 420);
  const withNumbers = sentences.filter((part) => /\d/.test(part));
  return (withNumbers.length ? withNumbers : sentences).slice(0, 6).join(' ').slice(0, 800);
}

function fedwatchSentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((part) => {
    if (!/\d+(?:[.,]\d+)?\s*%/.test(part)) return false;
    const cue = /fed\s*watch|\bcme\b|probability|xác suất/i.test(part);
    const move = /hike|cut|december|tháng\s*12|25\s*bp|basis point|tăng lãi|giảm lãi/i.test(part);
    return cue && move;
  }).slice(0, 4).map((part) => part.slice(0, 400));
}

function formatVnd(amount) {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

async function readLimited(res, maxBytes) {
  const body = res.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = typeof res.text === 'function' ? await res.text() : '';
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  const reader = body.getReader();
  const chunks = [];
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    const room = maxBytes - received;
    if (buf.length > room) {
      chunks.push(buf.subarray(0, room));
      received += room;
      break;
    }
    chunks.push(buf);
    received += buf.length;
  }
  try { await reader.cancel(); } catch { /* already finished */ }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchDocument(src, fetchImpl, hosts) {
  if (!hostAllowed(src.url, hosts)) return null;
  let res;
  try {
    res = await fetchImpl(src.url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept: 'text/html,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.1',
        'accept-language': 'vi,en;q=0.8',
        'user-agent': UA,
      },
    });
  } catch {
    console.error(JSON.stringify({ msg: 'source_skip', name: src.name }));
    return null;
  }
  if (!res || !res.ok) {
    try { await res?.body?.cancel?.(); } catch { /* ignore */ }
    console.error(JSON.stringify({ msg: 'source_skip', name: src.name, status: res && res.status }));
    return null;
  }
  const finalUrl = typeof res.url === 'string' && res.url ? res.url : src.url;
  const contentType = String(res.headers?.get?.('content-type') || '');
  if (!hostAllowed(finalUrl, hosts) || (contentType && !/text\/html|text\/plain|application\/json|application\/xml|text\/xml|rss|atom/i.test(contentType))) {
    try { await res.body?.cancel?.(); } catch { /* ignore */ }
    console.error(JSON.stringify({ msg: 'source_skip', name: src.name, status: res.status }));
    return null;
  }
  try {
    const raw = await readLimited(res, MAX_BYTES);
    return { name: src.name, url: finalUrl, raw, contentType };
  } catch {
    console.error(JSON.stringify({ msg: 'source_skip', name: src.name }));
    return null;
  }
}

function scaleAmount(digits, scale) {
  const amount = Number(String(digits).replace(/\./g, ''));
  if (!Number.isFinite(amount)) return null;
  const scaled = amount >= 50000000 && amount <= 500000000 ? amount : amount * scale;
  if (scaled > 50000000 && scaled < 500000000) return scaled;
  return null;
}

function pairAfter(text, index) {
  const slice = text.slice(index, index + 180);
  const found = [...slice.matchAll(/\d{1,3}(?:\.\d{3}){1,3}/g)].slice(0, 2);
  return found.map((match) => match[0]);
}

function parseHtmlPrices(text, src) {
  const rows = [];
  const seen = new Set();
  for (const label of HTML_LABELS) {
    const match = label.re.exec(text);
    if (!match) continue;
    const pair = pairAfter(text, match.index + match[0].length);
    if (pair.length < 2) continue;
    const buy = scaleAmount(pair[0], src.scale || 10);
    const sell = scaleAmount(pair[1], src.scale || 10);
    if (!buy || !sell || buy > sell) continue;
    const key = `${label.brand}:${label.type}:${buy}:${sell}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const chg = parseChange(text.slice(match.index, match.index + 220));
    rows.push({
      brand: label.brand, type: label.type, buy, sell, unit: 'đồng/lượng', sourceName: src.name, sourceUrl: src.url,
      chgBuy: chg, chgSell: chg,
    });
  }
  return rows;
}

function parsePnj(raw, src) {
  let data;
  try { data = JSON.parse(raw); } catch { return []; }
  const rows = Array.isArray(data && data.data) ? data.data : [];
  const names = { SJC: 'Vàng miếng SJC', N24K: 'Nhẫn trơn 24K' };
  const out = [];
  for (const row of rows) {
    const type = names[row && row.masp];
    const buyRaw = Number(row && row.giamua);
    const sellRaw = Number(row && row.giaban);
    if (!type || !(buyRaw >= 5000 && sellRaw >= buyRaw && sellRaw <= 50000)) continue;
    out.push({
      brand: 'PNJ',
      type,
      buy: buyRaw * 10000,
      sell: sellRaw * 10000,
      unit: 'đồng/lượng',
      sourceName: src.name,
      sourceUrl: src.url,
    });
  }
  return out;
}

function signedVnd(amount) {
  if (amount == null) return '';
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${formatVnd(Math.abs(amount))}`;
}

function renderPriceLines(prices, market) {
  const lines = [];
  for (const row of prices || []) {
    let line = `${row.brand} ${row.type}: mua ${formatVnd(row.buy)}, bán ${formatVnd(row.sell)} đồng/lượng.`;
    if (row.chgBuy != null || row.chgSell != null) line += ` Thay đổi mua ${signedVnd(row.chgBuy)}, bán ${signedVnd(row.chgSell)}.`;
    line += ` Nguồn: ${row.sourceUrl}`;
    lines.push(line);
  }
  if (market && market.xau) lines.push(`Vàng thế giới: ${formatUsd(market.xau)} USD/oz. Nguồn: ${market.spotUrl}`);
  if (market && market.gap != null) lines.push(`Chênh SJC bán so với giá quy đổi: ${formatVnd(market.gap)} đồng/lượng. Nguồn quy đổi: ${market.spotUrl} và ${market.fxUrl}.`);
  return lines;
}

function formatUsd(amount) {
  const rounded = Math.round(Number(amount) * 100) / 100;
  const [whole, frac] = rounded.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac === '00' ? grouped : `${grouped},${frac}`;
}

function convertedLuong(xau, usdvnd) {
  return Math.round(xau * usdvnd * LUONG_FACTOR / 1e5) * 1e5;
}

function parseChange(slice) {
  const match = String(slice || '').match(/(tăng|giảm|\+|−|-)\s*(\d{1,3}(?:\.\d{3}){1,3}|\d{1,3}(?:[.,]\d)?)\s*(triệu)?/i);
  if (!match) return null;
  const negative = /giảm|−|-/i.test(match[1]) && match[1] !== '+';
  let amount;
  if (match[3]) amount = Number(match[2].replace(',', '.')) * 1000000;
  else amount = Number(match[2].replace(/\./g, ''));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 50000000) return null;
  return negative ? -amount : amount;
}

function parseSpot(raw) {
  try {
    const price = Number(JSON.parse(raw).price);
    if (price >= 500 && price <= 20000) return price;
  } catch { /* not a spot quote */ }
  return null;
}

function parseUsdvnd(raw) {
  try {
    const rate = Number(JSON.parse(raw).rates.VND);
    if (rate >= 10000 && rate <= 100000) return rate;
  } catch { /* not an FX quote */ }
  return null;
}

async function collectDomestic(fetchImpl) {
  const pages = await Promise.all(DOMESTIC_SOURCES.map((src) => fetchDocument(src, fetchImpl, allowedHosts(src.url)).then((page) => ({ src, page }))));
  const prices = [];
  const sources = [];
  let sourceTime = '';
  for (const { src, page } of pages) {
    if (!page) continue;
    const plain = htmlToText(page.raw);
    const foundTime = extractSourceTime(plain);
    if (foundTime > sourceTime) sourceTime = foundTime;
    const rows = src.kind === 'pnj' ? parsePnj(page.raw, src) : parseHtmlPrices(plain, src);
    if (!rows.length) continue;
    prices.push(...rows);
    sources.push({ name: src.name, url: src.url, published: '', excerpt: renderPriceLines(rows).join(' ') });
  }
  const market = { xau: null, usdvnd: null, gap: null, spotUrl: WORLD_SPOT.url, fxUrl: USDVND.url };
  if (prices.length) {
    const spotPage = await fetchDocument(WORLD_SPOT, fetchImpl, allowedHosts(WORLD_SPOT.url));
    const fxPage = await fetchDocument(USDVND, fetchImpl, allowedHosts(USDVND.url));
    if (spotPage) market.xau = parseSpot(spotPage.raw);
    if (fxPage) market.usdvnd = parseUsdvnd(fxPage.raw);
    const sjc = prices.find((row) => /miếng|SJC/i.test(row.type) && row.sell) || prices.find((row) => row.sell);
    if (market.xau && market.usdvnd && sjc) market.gap = sjc.sell - convertedLuong(market.xau, market.usdvnd);
    if (market.xau) sources.push({ name: WORLD_SPOT.name, url: WORLD_SPOT.url, published: '', excerpt: `Vàng thế giới ${market.xau} USD/oz.` });
  }
  const priceLines = renderPriceLines(prices, market.xau ? market : null);
  return { sources, prices, priceLines, market, sourceTime, hasPrices: prices.length > 0, facts: [], pricePath: '', week: null, fedwatch: { stated: false, items: [], note: '' } };
}

async function collectNews(task, fetchImpl, clock) {
  const window = dateWindow(task, clock);
  const indexes = (await Promise.all(NEWS_INDEXES.map((src) => fetchDocument(src, fetchImpl, allowedHosts(src.url))))).filter(Boolean);
  const seen = new Set();
  const candidates = [];
  for (const page of indexes) {
    for (const href of extractLinks(page.raw, page.url)) {
      if (!isArticleUrl(href) || seen.has(href)) continue;
      const dated = articleDate(href);
      if (dated && !inWindow(dated, window)) continue;
      seen.add(href);
      candidates.push({ url: href, dated });
    }
  }
  candidates.sort((a, b) => (b.dated || '').localeCompare(a.dated || ''));
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.length >= MAX_ARTICLES) break;
    if (!candidate.dated && chosen.filter((item) => !item.dated).length >= 4) continue;
    chosen.push(candidate);
  }
  const pages = (await Promise.all(chosen.map((item) => fetchDocument({ name: 'article', url: item.url }, fetchImpl, ARTICLE_HOSTS)))).filter(Boolean);
  const sources = [];
  const fedItems = [];
  for (const page of pages) {
    if (!isArticleUrl(page.url)) continue;
    const published = extractPublished(page.raw) || articleDate(page.url);
    const day = isoDay(published) || articleDate(page.url);
    if (!inWindow(day, window)) continue;
    const plain = htmlToText(page.raw.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, ' '));
    const name = extractTitle(page.raw) || new URL(page.url).hostname;
    const facts = preferNewest(extractFacts(plain, page.url, name).map((fact) => {
      const spots = spotValues(fact.sentence);
      const extra = payrollFact(fact.sentence) || forecastFact(fact.sentence) || { kind: 'market' };
      return { ...fact, published, ...extra };
    }));
    const excerpt = (plain || keySentences(plain)).slice(0, 20000);
    if (!excerpt || !/\d/.test(excerpt)) continue;
    const hits = fedwatchSentences(plain);
    for (const sentence of hits) fedItems.push({ sentence, name, url: page.url, published });
    sources.push({ name, url: page.url, published, excerpt, normalized: plain.slice(0, 20000), facts, fedwatch: hits });
  }
  const facts = preferNewest(sources.flatMap((src) => src.facts || []));
  return {
    sources,
    prices: [],
    priceLines: [],
    hasPrices: false,
    facts,
    pricePath: pricePathFromFacts(facts),
    week: window,
    fedwatch: {
      stated: fedItems.length > 0,
      items: fedItems.slice(0, 6),
      note: fedItems.length ? '' : 'Không có bài nào nêu xác suất FedWatch. Phải nói rõ chưa có số, không được điền phần trăm.',
    },
  };
}

async function collect(task, fetchImpl, clock) {
  if (task === 'domestic') return collectDomestic(fetchImpl);
  if (task === 'macro' || task === 'weekly') return collectNews(task, fetchImpl, clock);
  return { sources: [], prices: [], hasPrices: false, week: null, fedwatch: { stated: false, items: [], note: '' } };
}

module.exports = {
  collect,
  dateWindow,
  extractFacts,
  htmlToText,
  extractSourceTime,
  fedwatchSentences,
  findQuotedPrices,
  formatVnd,
  isArticleUrl,
  isForecast,
  isHomepageUrl,
  payrollFact,
  preferNewest,
  pricePathFromFacts,
  tradedSpots,
  renderPriceLines,
  sourcesFor,
};
