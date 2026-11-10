'use strict';

const { once } = require('node:events');
const http = require('node:http');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { collect, findQuotedPrices } = require('../src/collect');
const { GEMINI_TIMEOUT_MS, extractText } = require('../src/gemini');
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

const ARTICLE = 'https://www.cnbc.com/2026/11/09/gold-holds-near-4087.html';

function indexPage(links) {
  const anchors = links.map((href) => `<a href="${href}">story</a>`).join('');
  return new Response(`<html><title>Index</title>${anchors}</html>`, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function articlePage() {
  return new Response(`<html><head><title>Gold holds near 4087</title><meta property="article:published_time" content="2026-11-09T18:05:00-05:00"></head><body><p>Spot gold steadied near $4,087 after the dollar eased. CME FedWatch showed a 60.3% chance of a December hike.</p></body></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function macroDraft() {
  return `\`\`\`json\n${JSON.stringify({
    items: [{
      title: 'Vàng giữ 4.087 USD',
      title_en: 'Gold holds near $4,087',
      summary: 'Spot gold steadied near $4,087. FedWatch 60,3%.',
      summary_en: 'Spot gold steadied near $4,087. FedWatch 60.3%.',
      reason: 'Lợi suất dịu giúp vàng giữ 4.087 USD.',
      reason_en: 'Softer yields left gold near $4,087.',
      category: 'Vàng',
      impact: 'tăng',
      time_en: 'Monday, November 9, 2025, 18:37 EST',
      source_url: ARTICLE,
    }],
    fedwatch_note: 'CME FedWatch 60,3% cửa tăng tháng 12.',
    share_fb: 'Vàng 4.087 USD.',
    share_zalo: 'Vàng giữ 4.087 USD.',
  })}\n\`\`\``;
}

test('macro happy path returns an article source and fixes the ET year', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const target = String(url);
    calls.push({ url: target, init });
    if (target.includes('generativelanguage.googleapis.com')) return geminiResponse(macroDraft());
    if (target === ARTICLE) return articlePage();
    if (target.includes('cnbc.com') || target.includes('investing.com')) return indexPage([ARTICLE, 'https://www.cnbc.com/gold/']);
    return new Response('down', { status: 503, headers: { 'content-type': 'text/html' } });
  };
  await withServer({ env: env(), fetchImpl }, async (port) => {
    const res = await request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: authHeaders(),
      body: JSON.stringify({ task: 'macro', datetime_vn: '2026-11-10 06:37' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.task, 'macro');
    assert.equal(res.json.text.includes('hidden-thought'), false);
    assert.deepEqual(res.json.sources.map((src) => src.url), [ARTICLE]);
    assert.equal(res.json.clock.weekdayEn, 'Tuesday');
    assert.equal(res.json.clock.timeEn, 'Monday, November 9, 2026, 18:37 EST');
    assert.equal(res.json.board.items[0].time_en, 'Monday, November 9, 2026, 18:37 EST');
    assert.equal(res.json.board.items[0].time_en.includes('2025'), false);
    assert.equal(res.json.fedwatch.stated, true);
    const gemini = calls.find((call) => call.url.includes('generativelanguage.googleapis.com'));
    assert.ok(gemini);
    assert.equal(gemini.url.includes(KEY), false);
    assert.equal(gemini.url.includes('key='), false);
    assert.equal(gemini.init.headers['x-goog-api-key'], KEY);
    assert.equal(gemini.init.signal.aborted, false);
    const payload = JSON.parse(gemini.init.body);
    assert.equal(payload.systemInstruction.parts[0].text, PROMPT);
    assert.equal(payload.generationConfig.temperature, 0.3);
    assert.equal(payload.generationConfig.maxOutputTokens, 8192);
    assert.equal(Object.hasOwn(payload, 'tools'), false);
    assert.equal(JSON.stringify(payload).includes('google_search'), false);
    const user = payload.contents[0].parts[0].text;
    assert.match(user, /Phần B tin vĩ mô/);
    assert.match(user, /Thứ Ba \(Tuesday\)/);
    assert.match(user, /Monday, November 9, 2026, 18:37 EST/);
    assert.match(user, /Không gọi hôm nay là tuần mới/);
    assert.match(user, new RegExp(ARTICLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(user.includes('https://www.cnbc.com/gold/'), false);
  });
});

test('homepage-only indexes are rejected before Gemini', async () => {
  let gemini = false;
  const fetchImpl = async (url) => {
    if (String(url).includes('generativelanguage')) { gemini = true; throw new Error('should not call'); }
    return indexPage(['https://www.cnbc.com/gold/', 'https://www.cnbc.com/markets/']);
  };
  await withServer({ env: env(), fetchImpl }, async (port) => {
    const res = await request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: authHeaders(),
      body: JSON.stringify({ task: 'macro', datetime_vn: '2026-11-10 06:37' }),
    });
    assert.equal(res.status, 422);
    assert.match(res.json.error, /bài báo|trang chủ/);
    assert.equal(gemini, false);
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
    if (target.includes('generativelanguage.googleapis.com')) {
      return geminiResponse(`\`\`\`json\n${JSON.stringify({
        analysis: ['PNJ vàng miếng SJC mua 145.200.000, bán 147.800.000 đồng/lượng.'],
        analysis_en: ['PNJ SJC bars bid 145.200.000, ask 147.800.000 VND per tael.'],
        advice: 'Giá bán 147.800.000 đã có nguồn PNJ.',
        quick_advice: 'SJC bán 147.800.000.',
        share_fb: 'SJC 145.200.000 / 147.800.000',
        share_zalo: 'SJC bán 147.800.000',
      })}\n\`\`\``);
    }
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
    assert.equal(res.json.board.analysis[0].includes('145.200.000'), true);
    assert.deepEqual(res.json.sources, [{ name: 'PNJ', url: 'https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price?zone=00' }]);
    const gemini = calls.find((call) => call.url.includes('generativelanguage.googleapis.com'));
    const payload = JSON.parse(gemini.init?.body || '{}');
    const user = payload.contents[0].parts[0].text;
    assert.match(user, /Phần C vàng trong nước/);
    assert.match(user, /145\.200\.000/);
    assert.match(user, /147\.800\.000/);
  });
});

test('Gemini HTTP errors return 502 and logs keep only the status', async () => {
  const lines = [];
  const original = console.error;
  console.error = (line) => { lines.push(String(line)); };
  try {
    const fetchImpl = async (url) => {
      const target = String(url);
      if (target.includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({ error: `${KEY} ${PROMPT} ${TOKEN}` }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (target === ARTICLE) return articlePage();
      if (target.includes('cnbc.com') || target.includes('investing.com')) return indexPage([ARTICLE]);
      return new Response('down', { status: 404, headers: { 'content-type': 'text/html' } });
    };
    await withServer({ env: env(), fetchImpl }, async (port) => {
      const res = await request(port, {
        method: 'POST',
        path: '/api/boards',
        headers: authHeaders(),
        body: JSON.stringify({ task: 'macro', datetime_vn: '2026-11-10 06:37' }),
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

test('Gemini timeout stays long enough for a full board', () => {
  assert.ok(GEMINI_TIMEOUT_MS >= 45000);
});

test('generic macro draft is rejected', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('generativelanguage')) return geminiResponse('Vàng giằng co, chưa rõ hướng.');
    if (String(url) === ARTICLE) return articlePage();
    if (String(url).includes('cnbc.com') || String(url).includes('investing.com')) return indexPage([ARTICLE]);
    return new Response('down', { status: 404 });
  };
  await withServer({ env: env(), fetchImpl }, async (port) => {
    const res = await request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: authHeaders(),
      body: JSON.stringify({ task: 'macro', datetime_vn: '2026-11-10 06:37' }),
    });
    assert.equal(res.status, 422);
    assert.match(res.json.error, /số liệu/);
  });
});

test('domestic price lines replace numbers the model typed', async () => {
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes('generativelanguage')) {
      return geminiResponse('```json\n{"analysis":["Nhẫn SJC bán 140.000.000 đồng/lượng."],"advice":"Nhẫn 140.000.000.","quick_advice":"Nhẫn 140.000.000."}\n```');
    }
    if (target.includes('edge-api.pnj.io')) {
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
      body: JSON.stringify({ task: 'domestic', datetime_vn: '2026-11-10 08:43' }),
    });
    assert.equal(res.status, 200);
    assert.match(res.json.text, /145\.200\.000/);
    assert.match(res.json.text, /147\.800\.000/);
    assert.equal(res.json.text.includes('140.000.000'), false);
    assert.equal(res.json.text.includes('```'), false);
    assert.equal(res.json.board.price_lines.some((line) => line.includes('145.200.000')), true);
  });
});

test('weekly digest uses Monday-Friday articles and no trade plan', async () => {
  const weekArticle = 'https://www.cnbc.com/2026/11/13/gold-week-finishes-near-4080.html';
  const fetchImpl = async (url, init) => {
    const target = String(url);
    if (target.includes('generativelanguage')) {
      const body = JSON.parse(init.body);
      const user = body.contents[0].parts[0].text;
      assert.match(user, /Không viết vùng vào lệnh/);
      assert.match(user, /2026-11-09/);
      assert.match(user, /2026-11-13/);
      return geminiResponse(`\`\`\`json\n${JSON.stringify({
        title: 'Tuần vàng',
        title_en: 'Gold week',
        sections: [{ h: 'Diễn biến', p: 'Gold finished the week near $4,000.' }],
        sections_en: [{ h: 'The week', p: 'Gold finished the week near $4,000.' }],
        share_fb: 'Vàng tuần qua gần 4.080 USD.',
        share_zalo: 'Tuần vàng gần 4.080 USD.',
      })}\n\`\`\``);
    }
    if (target === weekArticle) {
      return new Response('<html><title>Gold week</title><meta property="article:published_time" content="2026-11-13T16:00:00-05:00"><p>Gold election bounce ran from about $3,900 to a high near $4,145. October payrolls rose by 165,000. The World Bank gold path is $4,600 in 2026, then $4,250 in 2027, and $4,000 in 2028.</p></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    if (target.includes('cnbc.com') || target.includes('investing.com')) return indexPage([weekArticle, 'https://www.cnbc.com/2026/11/02/too-old.html']);
    return new Response('down', { status: 404 });
  };
  await withServer({ env: env(), fetchImpl }, async (port) => {
    const res = await request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: authHeaders(),
      body: JSON.stringify({ task: 'weekly', datetime_vn: '2026-11-15 09:00' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.task, 'weekly');
    assert.deepEqual(res.json.sources.map((src) => src.url), [weekArticle]);
    assert.equal(res.json.clock.weekdayEn, 'Sunday');
    assert.equal(res.json.text.includes('```'), false);
    assert.match(res.json.text, /4,?145|4145/);
    assert.match(res.json.text, /165[,.]?000|165000/);
    assert.match(res.json.text, /4,?600|4600/);
    assert.match(res.json.text, /4,?250|4250/);
    assert.match(res.json.text, /3,?900|3900/);
    assert.match(res.json.text, /Diễn biến giá trong các bài/);
  });
});

test('macro retries once and 422 debug lists numbers that were not sourced', async () => {
  let calls = 0;
  const fetchImpl = async (url, init) => {
    const target = String(url);
    if (target.includes('generativelanguage')) {
      calls += 1;
      const user = JSON.parse(init.body).contents[0].parts[0].text;
      if (calls === 1) {
        return geminiResponse(`\`\`\`json\n${JSON.stringify({
          items: [{ title: 'SECRETPHRASE vàng 9.999', summary: 'Giá 9.999 USD.', reason: 'Không rõ.', title_en: 'SECRETPHRASE', summary_en: 'Price 9,999.', reason_en: 'Unclear.', category: 'Vàng', impact: 'trung lập', source_url: ARTICLE }],
          fedwatch_note: 'Chưa có xác suất FedWatch trong nguồn.',
        })}\n\`\`\``);
      }
      assert.match(user, /9999|9\.999/);
      return geminiResponse(`\`\`\`json\n${JSON.stringify({
        items: [{ title: 'Vàng giữ 4.087', summary: 'Spot gold steadied near $4,087. FedWatch 60.3%.', reason: 'Lợi suất dịu, vàng 4.087.', title_en: 'Gold holds', summary_en: 'Spot gold steadied near $4,087. FedWatch 60.3%.', reason_en: 'Yields eased near $4,087.', category: 'Vàng', impact: 'tăng', source_url: ARTICLE }],
        fedwatch_note: 'FedWatch 60.3%.',
      })}\n\`\`\``);
    }
    if (target === ARTICLE) return articlePage();
    if (target.includes('cnbc.com') || target.includes('investing.com')) return indexPage([ARTICLE]);
    return new Response('down', { status: 404, headers: { 'content-type': 'text/html' } });
  };
  await withServer({ env: env(), fetchImpl }, async (port) => {
    const res = await request(port, {
      method: 'POST',
      path: '/api/boards',
      headers: authHeaders(),
      body: JSON.stringify({ task: 'macro', datetime_vn: '2026-11-10 06:37' }),
    });
    assert.equal(calls, 2);
    assert.equal(res.status, 200);
    assert.equal(res.json.text.includes('SECRETPHRASE'), false);
    assert.equal(res.json.text.includes('```'), false);
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
