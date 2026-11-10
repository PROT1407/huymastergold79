'use strict';

const UA = 'Mozilla/5.0 (compatible; H79BoardBot/1.0; +https://h79gold.com/)';
const MAX_BYTES = 400000;
const TIMEOUT_MS = 8000;
const MAX_ARTICLES = 6;

const ARTICLE_HOSTS = new Set([
  'cnbc.com', 'www.cnbc.com',
  'reuters.com', 'www.reuters.com',
  'kitco.com', 'www.kitco.com',
  'investing.com', 'www.investing.com',
  'federalreserve.gov', 'www.federalreserve.gov',
]);

const NEWS_INDEXES = [
  { name: 'CNBC Gold', url: 'https://www.cnbc.com/gold/' },
  { name: 'CNBC Markets', url: 'https://www.cnbc.com/markets/' },
  { name: 'Kitco', url: 'https://www.kitco.com/news' },
  { name: 'Investing.com', url: 'https://www.investing.com/news/commodities-news' },
];

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
      '/gold', '/markets', '/news', '/news/commodities-news',
      '/monetarypolicy/openmarket.htm',
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
    .trim();
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi;
  for (const match of String(html || '').matchAll(re)) {
    try { links.push(new URL(match[1], baseUrl).href.split('#')[0]); } catch { /* skip bad href */ }
  }
  return links;
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
  return String(text || '').split(/(?<=[.!?])\s+/).filter((part) => /fed\s*watch|cme fed|fed rate monitor/i.test(part) && /\d+(?:[.,]\d+)?\s*%/.test(part)).slice(0, 3).map((part) => part.trim().slice(0, 400));
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
  if (!hostAllowed(finalUrl, hosts) || (contentType && !/text\/html|text\/plain|application\/json|application\/xml|text\/xml/i.test(contentType))) {
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
    rows.push({ brand: label.brand, type: label.type, buy, sell, unit: 'đồng/lượng', sourceName: src.name, sourceUrl: src.url });
  }
  return rows;
}

function parsePnj(raw, src) {
  let data;
  try { data = JSON.parse(raw); } catch { return []; }
  const rows = Array.isArray(data && data.data) ? data.data : [];
  const names = { SJC: 'Vàng miếng SJC', N24K: 'Nhẫn 24K' };
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

function priceExcerpt(rows) {
  return rows.map((row) => `${row.brand} ${row.type}: mua ${formatVnd(row.buy)}, bán ${formatVnd(row.sell)} đồng/lượng.`).join(' ');
}

async function collectDomestic(fetchImpl) {
  const pages = await Promise.all(DOMESTIC_SOURCES.map((src) => fetchDocument(src, fetchImpl, allowedHosts(src.url)).then((page) => ({ src, page }))));
  const prices = [];
  const sources = [];
  for (const { src, page } of pages) {
    if (!page) continue;
    const rows = src.kind === 'pnj' ? parsePnj(page.raw, src) : parseHtmlPrices(htmlToText(page.raw), src);
    if (!rows.length) continue;
    prices.push(...rows);
    sources.push({ name: src.name, url: src.url, published: '', excerpt: priceExcerpt(rows) });
  }
  return { sources, prices, hasPrices: prices.length > 0, week: null, fedwatch: { stated: false, items: [], note: '' } };
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
    if (!candidate.dated && chosen.filter((item) => !item.dated).length >= 2) continue;
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
    const excerpt = keySentences(htmlToText(page.raw));
    if (!excerpt || !/\d/.test(excerpt)) continue;
    const hits = fedwatchSentences(htmlToText(page.raw));
    const name = extractTitle(page.raw) || new URL(page.url).hostname;
    for (const sentence of hits) fedItems.push({ sentence, name, url: page.url, published });
    sources.push({ name, url: page.url, published, excerpt, fedwatch: hits });
  }
  return {
    sources,
    prices: [],
    hasPrices: false,
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
  findQuotedPrices,
  formatVnd,
  isArticleUrl,
  isHomepageUrl,
  sourcesFor,
};
