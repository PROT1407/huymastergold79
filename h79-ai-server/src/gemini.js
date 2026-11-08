'use strict';

const TASK_LABEL = {
  macro: 'macro = Phần B tin vĩ mô',
  domestic: 'domestic = Phần C vàng trong nước',
};

function buildUserText({ task, datetimeVn, sources }) {
  const lines = [
    `Thời gian Việt Nam: ${datetimeVn}.`,
    `Nhiệm vụ cần chạy: ${TASK_LABEL[task]}.`,
    'Chỉ dùng các dữ kiện và URL đã thu thập bên dưới.',
    'Không bịa số liệu hoặc nguồn.',
    '',
    'Dữ kiện và URL đã thu thập:',
  ];
  if (!sources.length) {
    lines.push('(Không thu thập được nguồn nào. Không bịa số liệu hoặc nguồn.)');
  } else {
    sources.forEach((src, index) => {
      lines.push(`${index + 1}. name: ${src.name}`);
      lines.push(`url: ${src.url}`);
      lines.push(`excerpt: ${src.excerpt}`);
    });
  }
  return lines.join('\n');
}

function extractText(data) {
  const candidates = Array.isArray(data && data.candidates) ? data.candidates : [];
  const chunks = [];
  for (const candidate of candidates) {
    const parts = candidate && candidate.content && candidate.content.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue;
      if (part.thought === true) continue;
      if (typeof part.text === 'string' && part.text.length) chunks.push(part.text);
    }
  }
  return chunks.join('').trim();
}

function fail(status) {
  const payload = { msg: 'gemini_http_error' };
  if (typeof status === 'number') payload.status = status;
  console.error(JSON.stringify(payload));
  const error = new Error('gemini_failed');
  error.geminiStatus = status;
  return error;
}

async function generateBoard({ fetchImpl, apiKey, model, systemPrompt, task, datetimeVn, sources }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: buildUserText({ task, datetimeVn, sources }) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
  };
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw fail(undefined);
  }
  if (!res || !res.ok) {
    try { await res?.body?.cancel?.(); } catch { /* ignore */ }
    throw fail(res && typeof res.status === 'number' ? res.status : undefined);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw fail(res.status);
  }
  const text = extractText(data);
  if (!text) throw fail(res.status);
  return text;
}

module.exports = { generateBoard, buildUserText, extractText };
