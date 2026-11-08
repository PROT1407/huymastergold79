'use strict';

const UA = 'Mozilla/5.0 (compatible; H79BoardBot/1.0; +https://h79gold.com/)';
const MAX_BYTES = 400000;
const TIMEOUT_MS = 6000;

const MACRO_SOURCES = [
  { name: 'CNBC Gold', url: 'https://www.cnbc.com/gold/' },
  { name: 'CNBC Markets', url: 'https://www.cnbc.com/markets/' },
  { name: 'Kitco', url: 'https://www.kitco.com/' },
  { name: 'Federal Reserve open market', url: 'https://www.federalreserve.gov/monetarypolicy/openmarket.htm' },
];

const DOMESTIC_SOURCES = [
  { name: 'PNJ', url: 'https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00' },
  { name: 'SJC (webgia)', url: 'https://webgia.com/gia-vang/sjc/' },
  { name: 'SJC (giavang.org)', url: 'https://giavang.org/trong-nuoc/sjc/' },
  { name: 'Phú Quý', url: 'https://phuquygroup.vn/' },
];

function sourcesFor(task) {
  if (task === 'macro') return MACRO_SOURCES;
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

function httpsHostOk(urlStr, hosts) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.username || parsed.password) return false;
    return parsed.protocol === 'https:' && hosts.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
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
  for (const match of text.matchAll(dotted)) {
    const amount = Number(match[1].replace(/\./g, ''));
    if (amount >= 5000000 && amount <= 500000000) add(match[1]);
  }
  const fields = /"(?:giamua|giaban|buyingPrice|sellingPrice)"\s*:\s*(\d+(?:\.\d+)?)/gi;
  for (const match of text.matchAll(fields)) {
    const amount = Number(match[1]);
    if ((amount >= 5000 && amount <= 50000) || (amount >= 5000000 && amount <= 500000000)) add(match[1]);
  }
  return out;
}

function htmlToText(html) {
  return html
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

function parseDocument(raw, contentType) {
  const isJson = /json/i.test(contentType) || /^\s*[{[]/.test(raw);
  const text = isJson ? raw.replace(/\s+/g, ' ').trim() : htmlToText(raw);
  return { text, prices: findQuotedPrices(text) };
}

function makeExcerpt(text, prices) {
  const clean = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (prices.length) {
    const at = clean.indexOf(prices[0]);
    if (at >= 0) {
      const start = Math.max(0, at - 180);
      const end = Math.min(clean.length, at + prices[0].length + 220);
      return clean.slice(start, end).trim().slice(0, 500);
    }
  }
  return clean.slice(0, 500);
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

async function fetchSource(src, fetchImpl) {
  const hosts = allowedHosts(src.url);
  if (!httpsHostOk(src.url, hosts)) return null;
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
    const status = res && typeof res.status === 'number' ? res.status : undefined;
    try { await res?.body?.cancel?.(); } catch { /* ignore */ }
    console.error(JSON.stringify({ msg: 'source_skip', name: src.name, status }));
    return null;
  }
  const finalUrl = typeof res.url === 'string' && res.url ? res.url : src.url;
  const contentType = String(res.headers?.get?.('content-type') || '');
  if (!httpsHostOk(finalUrl, hosts) || (contentType && !/text\/html|text\/plain|application\/json|application\/xml|text\/xml/i.test(contentType))) {
    try { await res.body?.cancel?.(); } catch { /* ignore */ }
    console.error(JSON.stringify({ msg: 'source_skip', name: src.name, status: res.status }));
    return null;
  }
  let raw = '';
  try {
    raw = await readLimited(res, MAX_BYTES);
  } catch {
    console.error(JSON.stringify({ msg: 'source_skip', name: src.name }));
    return null;
  }
  const parsed = parseDocument(raw, contentType);
  const excerpt = makeExcerpt(parsed.text, parsed.prices);
  if (!excerpt) return null;
  return { name: src.name, url: finalUrl, excerpt, prices: parsed.prices };
}

async function collect(task, fetchImpl) {
  const rows = await Promise.all(sourcesFor(task).map((src) => fetchSource(src, fetchImpl)));
  const sources = rows.filter(Boolean);
  return { sources, hasPrices: sources.some((src) => src.prices.length > 0) };
}

module.exports = { collect, findQuotedPrices, sourcesFor };
