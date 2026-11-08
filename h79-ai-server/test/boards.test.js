'use strict';

const { once } = require('node:events');
const http = require('node:http');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { collect, findQuotedPrices } = require('../src/collect');
const { extractText } = require('../src/gemini');
const { createServer, portFrom, start } = require('../src/server');

const TOKEN = 'test-run-token';
const KEY = 'test-gemini-key';
const PROMPT = 'test-system-prompt';

function env(extra = {}) {
  return {
    H79_RUN_TOKEN: TOKEN,
    GEMINI_API_KEY: KEY,
    H79_SYSTEM_PROMPT: PROMPT,
    GEMINI_MODEL: 'gemini-3.5-flash-lite',
    PORT: '0',
    ...extra,
  };
}

function authHeaders(extra = {}) {
  return {
    authorization: `Bearer ${TOKEN}`,
    'content-type': 'application/json',
    ...extra,
  };
}

async function withServer(options, fn) {
  const server = createServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    return await fn(server.address().port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function request(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { json = null; }
        resolve({ status: res.statusCode, json, raw });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.end(body);
    else req.end();
  });
}

function htmlPage(text) {
  return new Response(`<html><title>Gold</title><p>${text}</p></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function geminiResponse(text) {
  return new Response(JSON.stringify({
    candidates: [{
      content: {
        parts: [
          { thought: true, text: 'hidden-thought' },
          { text },
        ],
      },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('port defaults to 10000', () => {
  assert.equal(portFrom(undefined), 10000);
  assert.equal(portFrom(''), 10000);
  assert.equal(portFrom('nope'), 10000);
  assert.equal(portFrom('10000'), 10000);
});

test('quoted price detector keeps real quotes only', () => {
  assert.deepEqual(findQuotedPrices('SJC 14.520.000 / 14.780.000'), ['14.520.000', '14.780.000']);
  assert.deepEqual(findQuotedPrices('year 2026 and about 4.087'), []);
  assert.deepEqual(findQuotedPrices('{"giamua":14520,"giaban":14780}'), ['14520', '14780']);
  assert.deepEqual(findQuotedPrices('Chưa có bảng giá.'), []);
});

test('reply parser ignores thought parts', () => {
  const text = extractText({
    candidates: [{ content: { parts: [{ thought: true, text: 'hidden-thought' }, { text: 'visible' }] } }],
  });
  assert.equal(text, 'visible');
});

test('collector skips redirects away from the source host', async () => {
  let read = false;
  const result = await collect('domestic', async () => ({
    ok: true,
    status: 200,
    url: 'http://169.254.169.254/latest/meta-data',
    headers: { get: () => 'text/html' },
    body: {
      cancel: async () => {},
      getReader() { read = true; throw new Error('should not read'); },
    },
  }));
  assert.equal(result.hasPrices, false);
  assert.deepEqual(result.sources, []);
  assert.equal(read, false);
});

test('GET /health', async () => {
  await withServer({ env: {}, fetchImpl: async () => { throw new Error('network'); } }, async (port) => {
    const res = await request(port, { path: '/health' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { ok: true });
  });
});

test('POST /api/boards without a token is 401 and does not call upstream', async () => {
  let called = false;
  await withServer({
    env: env({ GEMINI_API_KEY: '' }),
    fetchImpl: async () => { called = true; throw new Error('network'); },
  }, async (port) => {
    const res = await request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'macro' }),
    });
    assert.equal(res.status, 401);
    assert.equal(res.json.ok, false);
    assert.equal(res.raw.includes(TOKEN), false);
    assert.equal(res.raw.includes(PROMPT), false);
    assert.equal(called, false);
  });
});

test('POST /api/boards with the wrong token is 401', async () => {
  await withServer({ env: env(), fetchImpl: async () => { throw new Error('network'); } }, async (port) => {
    const res = await request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: { authorization: 'Bearer wrong-token', 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'macro' }),
    });
    assert.equal(res.status, 401);
    assert.equal(res.raw.includes(TOKEN), false);
    assert.equal(res.raw.includes('wrong-token'), false);
  });
});

test('503 when the Gemini key is missing', async () => {
  let called = false;
  await withServer({
    env: env({ GEMINI_API_KEY: '   ' }),
    fetchImpl: async () => { called = true; throw new Error('network'); },
  }, async (port) => {
    const res = await request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: authHeaders(),
      body: JSON.stringify({ task: 'macro' }),
    });
    assert.equal(res.status, 503);
    assert.equal(res.json.ok, false);
    assert.equal(res.raw.includes(KEY), false);
    assert.equal(res.raw.includes(PROMPT), false);
    assert.equal(called, false);
  });
});

test('503 when the system prompt is blank or missing', async () => {
  for (const H79_SYSTEM_PROMPT of ['  \n', undefined]) {
    const base = env();
    if (H79_SYSTEM_PROMPT === undefined) delete base.H79_SYSTEM_PROMPT;
    else base.H79_SYSTEM_PROMPT = H79_SYSTEM_PROMPT;
    await withServer({ env: base, fetchImpl: async () => { throw new Error('network'); } }, async (port) => {
      const res = await request(port, {
        method: 'POST',
        path: '/api/boards',
        headers: authHeaders(),
        body: JSON.stringify({ task: 'domestic' }),
      });
      assert.equal(res.status, 503);
      assert.equal(res.raw.includes(KEY), false);
      assert.equal(res.raw.includes(TOKEN), false);
    });
  }
});

test('macro happy path returns model text and only successful sources', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const target = String(url);
    calls.push({ url: target, init });
    if (target.includes('generativelanguage.googleapis.com')) return geminiResponse('Bản tin vĩ mô thử.');
    if (target.includes('kitco.com')) return new Response('down', { status: 503, headers: { 'content-type': 'text/html' } });
    return htmlPage('Spot gold steadied near 4087 dollars after the dollar eased.');
  };
  await withServer({ env: env(), fetchImpl }, async (port) => {
    const res = await request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: authHeaders(),
      body: JSON.stringify({ task: 'macro', datetime_vn: '2026-11-09 06:37' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.task, 'macro');
    assert.equal(res.json.text, 'Bản tin vĩ mô thử.');
    assert.equal(res.json.text.includes('hidden-thought'), false);
    assert.equal(res.json.sources.some((src) => src.url.includes('kitco.com')), false);
    assert.equal(res.json.sources.length, 3);
    for (const src of res.json.sources) {
      assert.equal(typeof src.name, 'string');
      assert.equal(src.url.startsWith('https://'), true);
      assert.equal(Object.hasOwn(src, 'excerpt'), false);
    }
    const gemini = calls.find((call) => call.url.includes('generativelanguage.googleapis.com'));
    assert.ok(gemini);
    assert.equal(gemini.url.includes(KEY), false);
    assert.equal(gemini.url.includes('key='), false);
    assert.equal(gemini.init.headers['x-goog-api-key'], KEY);
    const payload = JSON.parse(gemini.init.body);
    assert.equal(payload.systemInstruction.parts[0].text, PROMPT);
    assert.equal(payload.generationConfig.temperature, 0.3);
    assert.equal(payload.generationConfig.maxOutputTokens, 8192);
    assert.equal(Object.hasOwn(payload, 'tools'), false);
    assert.equal(JSON.stringify(payload).includes('google_search'), false);
    const user = payload.contents[0].parts[0].text;
    assert.match(user, /Thời gian Việt Nam: 2026-11-09 06:37/);
    assert.match(user, /Phần B tin vĩ mô/);
    assert.match(user, /Chỉ dùng các dữ kiện và URL đã thu thập bên dưới/);
    assert.match(user, /Không bịa số liệu hoặc nguồn/);
    assert.match(user, /Spot gold steadied near 4087/);
  });
});

test('domestic without real prices is 422 and does not call Gemini', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    assert.equal(target.includes('generativelanguage.googleapis.com'), false);
    return htmlPage('Chưa có bảng giá.');
  };
  await withServer({ env: env(), fetchImpl }, async (port) => {
    const res = await request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: authHeaders(),
      body: JSON.stringify({ task: 'domestic', datetime_vn: '2026-11-09 08:43' }),
    });
    assert.equal(res.status, 422);
    assert.match(res.json.error, /giá thật/);
    assert.equal(res.raw.includes('14.520.000'), false);
    assert.equal(calls.some((url) => url.includes('generativelanguage.googleapis.com')), false);
    assert.ok(calls.length > 0);
  });
});

test('domestic with a collected price returns that source and model text', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const target = String(url);
    calls.push({ url: target, init });
    if (target.includes('generativelanguage.googleapis.com')) return geminiResponse('Bảng giá trong nước.');
    if (target.includes('edge-api.pnj.io')) {
      calls[calls.length - 1].kind = 'pnj';
      return new Response(JSON.stringify({ data: [{ masp: 'SJC', giamua: 14520, giaban: 14780 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('down', { status: 500, headers: { 'content-type': 'text/plain' } });
  };
  await withServer({ env: env(), fetchImpl }, async (port) => {
    const res = await request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: authHeaders(),
      body: JSON.stringify({ task: 'domestic' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.task, 'domestic');
    assert.equal(res.json.text, 'Bảng giá trong nước.');
    assert.deepEqual(res.json.sources, [{ name: 'PNJ', url: 'https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00' }]);
    const gemini = calls.find((call) => call.url.includes('generativelanguage.googleapis.com'));
    const payload = JSON.parse(gemini.init?.body || '{}');
    const user = payload.contents[0].parts[0].text;
    assert.match(user, /Phần C vàng trong nước/);
    assert.match(user, /14520/);
    assert.equal(user.includes('145200000'), false);
  });
});

test('Gemini HTTP errors return 502 and logs keep only the status', async () => {
  const lines = [];
  const original = console.error;
  console.error = (line) => { lines.push(String(line)); };
  try {
    const fetchImpl = async (url) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({ error: `${KEY} ${PROMPT} ${TOKEN}` }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return htmlPage('Spot gold steadied near 4087 dollars.');
    };
    await withServer({ env: env(), fetchImpl }, async (port) => {
      const res = await request(port, {
        method: 'POST',
        path: '/api/boards',
        headers: authHeaders(),
        body: JSON.stringify({ task: 'macro' }),
      });
      assert.equal(res.status, 502);
      assert.match(res.json.error, /Không tạo được bản tin/);
      const blob = `${lines.join('\n')}\n${res.raw}`;
      assert.equal(blob.includes(KEY), false);
      assert.equal(blob.includes(PROMPT), false);
      assert.equal(blob.includes(TOKEN), false);
      assert.match(lines.join('\n'), /"status":500/);
    });
  } finally {
    console.error = original;
  }
});

test('POST rate limit', async () => {
  let calls = 0;
  await withServer({
    env: env(),
    rateLimit: { windowMs: 60000, max: 2 },
    fetchImpl: async () => { calls += 1; throw new Error('network'); },
  }, async (port) => {
    const send = () => request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: 'macro' }),
    });
    assert.equal((await send()).status, 401);
    assert.equal((await send()).status, 401);
    const blocked = await send();
    assert.equal(blocked.status, 429);
    assert.equal(calls, 0);
  });
});

test('start listens on 0.0.0.0', async () => {
  const server = start({
    env: env({ PORT: '0' }),
    fetchImpl: async () => { throw new Error('network'); },
  });
  await once(server, 'listening');
  try {
    assert.equal(server.address().address, '0.0.0.0');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
