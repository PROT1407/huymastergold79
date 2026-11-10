'use strict';

const http = require('node:http');
const { readBearer, tokensMatch } = require('./auth');
const { collect } = require('./collect');
const { generateBoard } = require('./gemini');
const { gate } = require('./quality');
const { resolveClock } = require('./time');

const BODY_LIMIT = 256 * 1024;
const DEFAULT_RATE = { windowMs: 10 * 60 * 1000, max: 20 };

function portFrom(value) {
  if (value === undefined || value === null || String(value).trim() === '') return 10000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return 10000;
  return port;
}

function pathnameOf(url) {
  try {
    return new URL(url || '/', 'http://127.0.0.1').pathname;
  } catch {
    return '/';
  }
}

function clientIp(req) {
  const raw = req.headers['x-forwarded-for'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (typeof header === 'string') {
    const first = header.split(',')[0].trim();
    if (first && first.length <= 80 && /^[A-Za-z0-9:.\-]+$/.test(first)) return first;
  }
  return req.socket.remoteAddress || 'unknown';
}

function cleanKey(value) {
  if (typeof value !== 'string') return '';
  const key = value.trim();
  if (!key || /[\r\n\0]/.test(key)) return '';
  return key;
}

function systemPrompt(value) {
  if (typeof value !== 'string' || value.trim() === '') return '';
  return value;
}

function modelName(value) {
  const model = typeof value === 'string' && value.trim() ? value.trim() : 'gemini-3.5-flash-lite';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(model)) return '';
  return model;
}

function cleanDatetime(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

function drain(req) {
  req.resume();
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        fail(Object.assign(new Error('too_large'), { code: 'TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (error) => fail(error));
  });
}

function createRateLimiter(rate) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    let bucket = hits.get(ip);
    if (!bucket || now - bucket.start >= rate.windowMs) {
      bucket = { start: now, count: 0 };
      hits.set(ip, bucket);
    }
    bucket.count += 1;
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return bucket.count > rate.max;
  };
}

function createServer(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || (() => new Date());
  const limited = createRateLimiter(options.rateLimit || DEFAULT_RATE);

  async function handle(req, res) {
    const pathname = pathnameOf(req.url);
    if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/health') {
      if (req.method === 'HEAD') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end();
        return;
      }
      send(res, 200, { ok: true });
      return;
    }
    if (pathname !== '/api/boards') {
      send(res, 404, { ok: false, error: 'Not found' });
      return;
    }
    if (req.method !== 'POST') {
      send(res, 405, { ok: false, error: 'Method not allowed.' });
      return;
    }
    if (limited(clientIp(req))) {
      drain(req);
      send(res, 429, { ok: false, error: 'Quá nhiều yêu cầu. Thử lại sau.' });
      return;
    }
    const expected = typeof env.H79_RUN_TOKEN === 'string' ? env.H79_RUN_TOKEN.trim() : '';
    if (!tokensMatch(readBearer(req.headers.authorization), expected)) {
      drain(req);
      send(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }
    const apiKey = cleanKey(env.GEMINI_API_KEY);
    const prompt = systemPrompt(env.H79_SYSTEM_PROMPT);
    const model = modelName(env.GEMINI_MODEL);
    if (!apiKey || !prompt || !model) {
      drain(req);
      send(res, 503, { ok: false, error: 'Dịch vụ tạm thời chưa sẵn sàng.' });
      return;
    }
    const declared = Number(req.headers['content-length'] || 0);
    if (Number.isFinite(declared) && declared > BODY_LIMIT) {
      drain(req);
      send(res, 413, { ok: false, error: 'Nội dung quá lớn.' });
      return;
    }
    let raw = '';
    try {
      raw = await readBody(req, BODY_LIMIT);
    } catch (error) {
      if (error && error.code === 'TOO_LARGE') {
        send(res, 413, { ok: false, error: 'Nội dung quá lớn.' });
        return;
      }
      send(res, 400, { ok: false, error: 'Yêu cầu không hợp lệ.' });
      return;
    }
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      send(res, 400, { ok: false, error: 'Yêu cầu không hợp lệ.' });
      return;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      send(res, 400, { ok: false, error: 'Yêu cầu không hợp lệ.' });
      return;
    }
    if (body.task !== 'macro' && body.task !== 'domestic' && body.task !== 'weekly') {
      send(res, 400, { ok: false, error: 'task phải là macro, domestic hoặc weekly.' });
      return;
    }
    const datetimeInput = cleanDatetime(body.datetime_vn);
    const clock = resolveClock(datetimeInput, now());
    if (!clock || (datetimeInput && clock.datetimeVn !== datetimeInput.slice(0, 16))) {
      send(res, 400, { ok: false, error: 'datetime_vn phải là YYYY-MM-DD HH:MM.' });
      return;
    }
    const collected = await collect(body.task, fetchImpl, clock);
    if ((body.task === 'macro' || body.task === 'weekly') && !collected.sources.length) {
      send(res, 422, { ok: false, error: 'Không có bài báo cùng ngày hoặc gần đây. Không dùng trang chủ làm nguồn.' });
      return;
    }
    if (body.task === 'domestic' && !collected.hasPrices) {
      send(res, 422, {
        ok: false,
        error: 'Không lấy được giá vàng trong nước thật từ nguồn công khai. Cần giá thật; không được tự điền số SJC hoặc PNJ.',
      });
      return;
    }
    let text;
    try {
      text = await generateBoard({
        fetchImpl,
        apiKey,
        model,
        systemPrompt: prompt,
        task: body.task,
        clock,
        sources: collected.sources,
        prices: collected.prices,
        fedwatch: collected.fedwatch,
        week: collected.week,
      });
    } catch {
      send(res, 502, { ok: false, error: 'Không tạo được bản tin lúc này. Vui lòng thử lại sau.' });
      return;
    }
    const checked = gate({
      task: body.task,
      text,
      sources: collected.sources,
      clock,
      prices: collected.prices,
      fedwatch: collected.fedwatch,
    });
    if (!checked.ok) {
      send(res, checked.status || 422, { ok: false, error: checked.error });
      return;
    }
    send(res, 200, {
      ok: true,
      task: body.task,
      text: checked.text,
      sources: checked.sources,
      board: checked.board,
      clock: {
        dateVn: clock.dateVn,
        timeVn: clock.timeVn,
        weekdayVn: clock.weekdayVn,
        weekdayEn: clock.weekdayEn,
        dateEt: clock.dateEt,
        timeEt: clock.timeEt,
        timeEn: clock.timeEn,
        year: clock.year,
      },
      fedwatch: {
        stated: Boolean(collected.fedwatch && collected.fedwatch.stated),
        note: checked.board.fedwatch_note || (collected.fedwatch && collected.fedwatch.note) || '',
        items: (collected.fedwatch && collected.fedwatch.items) || [],
      },
    });
  }

  return http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { ok: false, error: 'Lỗi máy chủ.' });
    });
  });
}

function start(options = {}) {
  const env = options.env || process.env;
  const server = createServer(options);
  server.listen(portFrom(env.PORT), '0.0.0.0');
  return server;
}

module.exports = { createServer, start, portFrom, BODY_LIMIT };
