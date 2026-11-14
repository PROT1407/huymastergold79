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
      'Chỉ dùng các số liệu đã tách bên dưới. Chép đúng từng số, kèm URL của câu đó. Không thêm số khác.',
      'Tiêu đề chép đúng phần trăm đã có trong bài. Không làm tròn, ví dụ không viết 80% khi bài nói 82,2%.',
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
      'Viết như một trader đang làm việc viết tổng kết tuần: câu ngắn, tiếng thường. Không dùng câu sáo.',
      'Cấm các cụm: "giao dịch đầy sóng gió", "tâm điểm chi phối tâm lý nhà đầu tư", "kim loại quý không sinh lời này", "bệ đỡ vững chắc", "vẫn duy trì cao hơn đáng kể so với giai đoạn trước", "tâm lý nhà đầu tư", "động lực tăng giá ban đầu".',
      'Không lặp một từ hai lần trong sáu từ. Tiêu đề nêu mốc hoặc sự kiện, ví dụ "Mốc 4.000".',
      'Nợ công Mỹ là một câu sự kiện riêng: "Nợ công Mỹ đã trên 40 nghìn tỷ USD." Không gắn câu nợ công vào câu về đáy giá vàng.',
      'Chỉ viết Ngân hàng Thế giới khi câu có số dự báo. Không thêm câu kết chung chung.',
      'Trong tiếng Việt viết "Ngân hàng Thế giới" thay cho World Bank, và "Triển vọng Thị trường Hàng hóa" thay cho Commodity Markets Outlook.',
      'Tiêu đề hoặc câu mở phải ghi khoảng tuần, ví dụ tuần 2/11–6/11.',
      'Không thêm nhận định địa chính trị. Không viết đàm phán với Iran là lực hỗ trợ giá, trừ khi một câu dữ kiện nói đúng điều đó.',
      'Không viết vùng vào lệnh và không viết kế hoạch mua hoặc bán.',
      'Phải đưa đủ diễn biến giá và mọi số liệu đã tách (lương, phần trăm, lộ trình các năm). Chép đúng câu nguồn. Không biến một mốc tương lai thành mức giá đang giữ.',
      'Trả về một khối ```json với khóa title, title_en, sections[{h,p}], sections_en[{h,p}], share_fb, share_zalo.',
    ].join('\n');
  }
  return [
    'Nhiệm vụ: domestic = Phần C vàng trong nước.',
    ...clockLines,
    'Không viết chữ số. Bảng giá được gắn bằng mã nguồn từ số đã đọc. Chỉ viết lời bình không có số.',
    'Trả về một khối ```json với khóa analysis, analysis_en, advice, advice_en, quick_advice, quick_advice_en, refs, world_news, share_fb, share_zalo.',
  ].join('\n');
}

function feedbackText(debug) {
  if (!debug) return '';
  const lines = ['Lần viết trước bị từ chối.'];
  if (debug.detail) lines.push(debug.detail);
  if (debug.failedNumbers && debug.failedNumbers.length) lines.push(`Số không có trong nguồn: ${debug.failedNumbers.join(', ')}.`);
  if (debug.missingFacts && debug.missingFacts.length) lines.push(`Số liệu nguồn chưa có trong bản tin: ${debug.missingFacts.join(', ')}.`);
  lines.push('Viết lại và chỉ dùng danh sách số liệu đã thu thập.');
  return lines.join('\n');
}

function buildUserText({ task, clock, sources, prices, fedwatch, week, facts, pricePath, priceLines, feedback }) {
  const lines = [
    taskInstruction(task, clock, { fedwatch, week }),
    'Chỉ dùng các dữ kiện và URL đã thu thập bên dưới.',
    'Không bịa số liệu hoặc nguồn.',
    '',
  ];
  const note = feedbackText(feedback);
  if (note) {
    lines.push(note, '');
  }
  if (task === 'domestic') {
    lines.push('Bảng giá cố định (không chép các số này vào lời bình):');
    for (const line of priceLines && priceLines.length ? priceLines : []) lines.push(`- ${line}`);
    if (!priceLines || !priceLines.length) {
      for (const row of prices || []) lines.push(`- ${row.brand} ${row.type}: mua ${formatDots(row.buy)}, bán ${formatDots(row.sell)}. Nguồn: ${row.sourceUrl}`);
    }
    lines.push('');
  }
  if (facts && facts.length) {
    lines.push('Số liệu đã tách từ bài báo:');
    facts.forEach((fact, index) => lines.push(`${index + 1}. ${fact.url} :: ${fact.sentence}`));
    lines.push('');
  }
  if (pricePath) lines.push(pricePath, '');
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

const GEMINI_BACKOFF_MS = [0, 400, 1200];

function retryableGeminiStatus(status) {
  return status === 429 || (typeof status === 'number' && status >= 500);
}

async function callGemini({ fetchImpl, apiKey, model, body, sleep }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastStatus;
  for (let attempt = 0; attempt < GEMINI_BACKOFF_MS.length; attempt += 1) {
    if (GEMINI_BACKOFF_MS[attempt]) await wait(GEMINI_BACKOFF_MS[attempt]);
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });
    } catch {
      lastStatus = undefined;
      if (attempt === GEMINI_BACKOFF_MS.length - 1) throw fail(undefined);
      continue;
    }
    if (!res || !res.ok) {
      try { await res?.body?.cancel?.(); } catch { /* ignore */ }
      lastStatus = res && typeof res.status === 'number' ? res.status : undefined;
      if (!retryableGeminiStatus(lastStatus) || attempt === GEMINI_BACKOFF_MS.length - 1) throw fail(lastStatus);
      continue;
    }
    let data;
    try { data = await res.json(); } catch { throw fail(res.status); }
    const text = extractText(data);
    if (!text) throw fail(res.status);
    return text;
  }
  throw fail(lastStatus);
}

function fail(status) {
  const payload = { msg: 'gemini_http_error' };
  if (typeof status === 'number') payload.status = status;
  console.error(JSON.stringify(payload));
  const error = new Error('gemini_failed');
  error.geminiStatus = status;
  return error;
}

async function generateBoard({ fetchImpl, apiKey, model, systemPrompt, task, clock, sources, prices, fedwatch, week, facts, pricePath, priceLines, feedback, sleep }) {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: buildUserText({ task, clock, sources, prices, fedwatch, week, facts, pricePath, priceLines, feedback }) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
  };
  return callGemini({ fetchImpl, apiKey, model, body, sleep });
}

async function proofreadBoard({ fetchImpl, apiKey, model, text, sleep }) {
  const instruction = 'Sửa lỗi chính tả, chữ dính, từ tiếng Việt sai, và từ bị rơi. Được phép chèn từ còn thiếu. Không đổi bất kỳ chữ số nào, không đổi tên riêng, URL hoặc ý. Trả về đúng JSON như đầu vào.';
  const body = {
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [{ role: 'user', parts: [{ text: String(text || '') }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
  };
  return callGemini({ fetchImpl, apiKey, model, body, sleep });
}

function digitSignature(value) {
  return (JSON.stringify(value).match(/\d+/g) || []).join('');
}

async function rewriteSentences({ fetchImpl, apiKey, model, sentences, sleep }) {
  const instruction = 'Viết lại chỉ các câu sau. Câu ngắn, tiếng Việt thường, như trader viết tổng kết tuần. Không dùng câu sáo, không lặp từ. Không đổi số, tên riêng hay URL. Nếu câu không có số hoặc từ khóa từ dữ kiện, bỏ câu đó. Không viết đàm phán Iran là lực hỗ trợ giá. Nợ công Mỹ viết thành câu riêng "Nợ công Mỹ đã trên 40 nghìn tỷ USD." Trả về JSON {"sentences":[...]} cùng số câu, cùng thứ tự.';
  const body = {
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify({ sentences }) }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 2048 },
  };
  return callGemini({ fetchImpl, apiKey, model, body, sleep });
}

module.exports = { GEMINI_BACKOFF_MS, GEMINI_TIMEOUT_MS, buildUserText, digitSignature, extractText, generateBoard, proofreadBoard, rewriteSentences };
