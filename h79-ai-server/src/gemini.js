'use strict';

const GEMINI_TIMEOUT_MS = 60000;

function taskInstruction(task, clock, extra) {
  const clockLines = [
    `Ngày Việt Nam: ${clock.dateVn}.`,
    `Thứ: ${clock.weekdayVn} (${clock.weekdayEn}).`,
    `Giờ Việt Nam: ${clock.timeVn}.`,
    `Giờ miền Đông Mỹ: ${clock.timeEn}. EST = giờ Việt Nam trừ 12 giờ.`,
    `Năm đúng: ${clock.year}. time_en bắt buộc: ${clock.timeEn}.`,
    clock.weekdayEn === 'Monday' ? 'Hôm nay là Thứ Hai.' : `Hôm nay không phải Thứ Hai. Không gọi hôm nay là tuần mới.`,
  ];
  if (task === 'macro') {
    return [
      'Nhiệm vụ: macro = Phần B tin vĩ mô.',
      ...clockLines,
      'Chỉ dùng các bài báo bên dưới. Mỗi tin phải có số liệu đúng nguyên văn từ các câu trích.',
      extra.fedwatch && extra.fedwatch.stated
        ? 'FedWatch: chỉ được dùng các câu đã đánh dấu, kèm nguồn và thời điểm của câu đó.'
        : 'FedWatch: không có câu nào nêu xác suất. Phải ghi rõ chưa có số FedWatch trong nguồn, không điền phần trăm.',
      'Trả về một khối ```json với khóa items (title, title_en, summary, summary_en, reason, reason_en, category, impact, source_url), fedwatch_note, share_fb, share_zalo.',
      'category: Vàng, Lợi suất, Dầu mỏ, Fed, Tương quan hoặc Ngân hàng TW. impact: tăng, giảm hoặc trung lập.',
    ].join('\n');
  }
  if (task === 'weekly') {
    const week = extra.week || {};
    return [
      'Nhiệm vụ: weekly = bản tin tổng hợp tin vàng từ thứ Hai đến thứ Sáu.',
      `Khoảng ngày: ${week.start || ''} đến ${week.end || ''}.`,
      ...clockLines,
      'Viết bản tin tiếng Việt, tiếng Anh, một dòng Facebook và một dòng Zalo.',
      'Không viết vùng vào lệnh và không viết kế hoạch mua hoặc bán.',
      'Chỉ dùng bài báo trong danh sách. Giữ nguyên số liệu.',
      'Trả về một khối ```json với khóa title, title_en, sections[{h,p}], sections_en[{h,p}], share_fb, share_zalo.',
    ].join('\n');
  }
  return [
    'Nhiệm vụ: domestic = Phần C vàng trong nước.',
    ...clockLines,
    'Giá mua và giá bán bên dưới là số đã đọc từ nguồn. Chỉ viết lời quanh đúng các số đó.',
    'Không đổi, không làm tròn khác, không thêm giá SJC hoặc PNJ khác.',
    'Trả về một khối ```json với khóa analysis, analysis_en, advice, advice_en, quick_advice, quick_advice_en, refs, world_news, share_fb, share_zalo.',
  ].join('\n');
}

function buildUserText({ task, clock, sources, prices, fedwatch, week }) {
  const lines = [
    taskInstruction(task, clock, { fedwatch, week }),
    'Chỉ dùng các dữ kiện và URL đã thu thập bên dưới.',
    'Không bịa số liệu hoặc nguồn.',
    '',
  ];
  if (task === 'domestic') {
    lines.push('Giá đã phân tích (đồng/lượng):');
    for (const row of prices || []) {
      lines.push(`- ${row.brand} ${row.type}: mua ${row.buy}, bán ${row.sell}. Viết đúng dạng ${formatDots(row.buy)} và ${formatDots(row.sell)}. Nguồn: ${row.sourceName} ${row.sourceUrl}`);
    }
    lines.push('');
  }
  if (fedwatch && fedwatch.stated) {
    lines.push('Câu FedWatch trong bài báo:');
    for (const item of fedwatch.items) lines.push(`- ${item.published || ''} ${item.url}: ${item.sentence}`);
    lines.push('');
  }
  lines.push('Dữ kiện và URL đã thu thập:');
  if (!sources.length) lines.push('(Không thu thập được nguồn nào. Không bịa số liệu hoặc nguồn.)');
  sources.forEach((src, index) => {
    lines.push(`${index + 1}. name: ${src.name}`);
    lines.push(`url: ${src.url}`);
    if (src.published) lines.push(`published: ${src.published}`);
    lines.push(`excerpt: ${src.excerpt}`);
  });
  return lines.join('\n');
}

function formatDots(amount) {
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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

async function generateBoard({ fetchImpl, apiKey, model, systemPrompt, task, clock, sources, prices, fedwatch, week }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: buildUserText({ task, clock, sources, prices, fedwatch, week }) }] }],
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
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
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

module.exports = { GEMINI_TIMEOUT_MS, buildUserText, extractText, generateBoard };
