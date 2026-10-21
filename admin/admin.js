/* H79 – trang quản trị /admin/ (không có máy chủ: dùng GitHub API từ trình duyệt).
   Token GitHub (fine-grained, Contents: Read and write chỉ cho repo huymastergold79) do chủ site tự tạo,
   chỉ lưu trong localStorage của trình duyệt đang dùng. Không có token nào nằm trong mã nguồn.
   Lưu = commit file data/*.json (và ảnh img/charts/) qua Contents API; GitHub Action build-seo sinh lại trang tĩnh. */
(function (root) {
  'use strict';
  const OWNER = 'PROT1407', REPO = 'huymastergold79', BRANCH = 'main', API = 'https://api.github.com';
  const SITE = 'https://h79gold.com/';
  const TK = 'h79_admin_token', DRAFT = 'h79_admin_draft';

  /* ================= Phần logic thuần (test được bằng node) ================= */
  const SES = {
    'Phiên Á': { slug: 'phien-a', en: 'Asia Session', img: 'asia', post: 'asian-session', plan: 'Kế hoạch phiên Á' },
    'Phiên Âu': { slug: 'phien-au', en: 'London Session', img: 'london', post: 'london-session', plan: 'Kế hoạch phiên Âu' },
    'Phiên Mỹ': { slug: 'phien-my', en: 'New York Session', img: 'ny', post: 'new-york-session', plan: 'Kế hoạch phiên Mỹ' },
    'Xã luận': { slug: 'xa-luan', en: 'Editorial', img: 'xa-luan', post: 'editorial', plan: 'Kế hoạch giao dịch' },
    'Tổng quan': { slug: 'tong-quan', en: 'Gold Outlook', img: 'outlook', post: 'outlook', plan: 'Kế hoạch giao dịch' }
  };
  const TREND_VI = { up: 'Ngắn hạn tăng', down: 'Ngắn hạn giảm', side: 'Đi ngang' };
  const TREND_EN = { up: 'Bullish', down: 'Bearish', side: 'Sideways' };
  const DISC = 'Nhận định kỹ thuật tham khảo, không phải lời khuyên đầu tư.';
  const DISC_EN = 'Technical analysis for educational purposes only – not investment advice.';

  const slug = t => String(t || '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const enNum = t => String(t == null ? '' : t).replace(/(\d),(\d)/g, '$1§$2').replace(/(\d)\.(\d{3})(?!\d)/g, '$1,$2').replace(/§/g, '.');
  const clone = o => JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c]));
  const clean = s => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim();

  /* --- JSON: giữ đúng kiểu định dạng của từng file (indent 1/2/4 hoặc 1 dòng kiểu Python) --- */
  function pyCompact(v) {
    if (Array.isArray(v)) return '[' + v.map(pyCompact).join(', ') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).map(k => JSON.stringify(k) + ': ' + pyCompact(v[k])).join(', ') + '}';
    return JSON.stringify(v);
  }
  const dump = (v, f) => (f.indent ? JSON.stringify(v, null, f.indent) : pyCompact(v)) + f.nl;
  function detectFmt(text) {
    const v = JSON.parse(text);
    for (const indent of [1, 2, 4, 0]) for (const nl of ['\n', '']) { const f = { indent, nl }; if (dump(v, f) === text) return Object.assign(f, { exact: true }); }
    const m = /^[\[{]\r?\n( +)\S/.exec(text);
    return { indent: m ? m[1].length : (/^[\[{]\r?\n/.test(text) ? 1 : 0), nl: /\n$/.test(text) ? '\n' : '', exact: false };
  }
  /* Python ghi số thực kiểu 3.0; JS ghi 3. Giữ nguyên dòng gốc khi chỉ khác ở “.0” để diff gọn. */
  function keepFloats(out, orig) {
    if (!orig || !/\d\.0\b/.test(orig) || out.indexOf('\n') < 0) return out;
    const norm = l => l.replace(/(\d)\.0(?=[,\s\]}]|$)/g, '$1'), map = new Map();
    orig.split('\n').forEach(l => { if (/\d\.0\b/.test(l)) map.set(norm(l), l); });
    return out.split('\n').map(l => map.get(l) || l).join('\n');
  }
  function serialize(data, fmt, orig) {
    const out = keepFloats(dump(data, fmt), orig);
    if (!same(JSON.parse(out), data)) throw new Error('Kiểm tra JSON thất bại (dữ liệu sau khi ghi không khớp) – đã huỷ, không lưu.');
    return out;
  }
  function validateStrategies(d) {
    if (!d || !Array.isArray(d.strategies)) throw new Error('strategies.json thiếu mảng "strategies"');
    const ids = new Set();
    d.strategies.forEach((s, i) => {
      if (!s || typeof s !== 'object') throw new Error('Bài #' + (i + 1) + ' không hợp lệ');
      if (!s.id || !/^\d{4}-\d\d-\d\d$/.test(s.date || '') || !s.title) throw new Error('Bài #' + (i + 1) + ' thiếu id/ngày/tiêu đề');
      if (s.time && !/^\d\d:\d\d$/.test(s.time)) throw new Error('Giờ không hợp lệ ở bài ' + s.id);
      if (ids.has(s.id)) throw new Error('Trùng id bài: ' + s.id); ids.add(s.id);
      ['article', 'article_en'].forEach(k => { if (s[k] && s[k].sections) s[k].sections.forEach(x => { if (typeof x.h !== 'string' || typeof x.p !== 'string') throw new Error('Mục nội dung lỗi ở bài ' + s.id); }); });
    });
    return true;
  }
  const VALIDATE = {
    'data/strategies.json': validateStrategies,
    'data/macro-news.json': d => { if (!Array.isArray(d.items)) throw new Error('macro-news.json thiếu "items"'); d.items.forEach((x, i) => { if (!x.title || !/^\d{4}-\d\d-\d\d$/.test(x.date || '')) throw new Error('Tin #' + (i + 1) + ' thiếu tiêu đề hoặc ngày'); }); },
    'data/vn-prices.json': d => { if (!Array.isArray(d.prices)) throw new Error('vn-prices.json thiếu "prices"'); d.prices.forEach(p => { if (typeof p.buy !== 'number' || typeof p.sell !== 'number') throw new Error('Giá mua/bán phải là số'); }); },
    'data/live-schedule.json': d => { if (!Array.isArray(d.sessions)) throw new Error('Thiếu "sessions"'); d.sessions.forEach(s => { if (!(s.day >= 0 && s.day <= 6) || !/^\d\d:\d\d$/.test(s.time || '')) throw new Error('Buổi live: thứ (0–6) hoặc giờ (HH:MM) sai'); }); }
  };

  /* --- bài nhận định --- */
  const postFile = s => `${s.date}-nhan-dinh-vang-${slug(s.session) || 'phien'}${s.time ? '-' + s.time.replace(':', '') : ''}.html`; // khớp scripts/build-seo.py
  const addMin = (t, n) => { let [h, m] = t.split(':').map(Number); m += n; h += Math.floor(m / 60); m = ((m % 60) + 60) % 60; return h >= 24 ? null : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
  function uniqueSlot(list, date, time, session) {
    const ids = new Set(list.map(s => s.id)), files = new Set(list.filter(s => s.date && s.title).map(postFile));
    for (let i = 0, t = time; i < 60 && t; i++, t = addMin(time, i)) {
      const id = `${date}-${SES[session].slug}-${t.replace(':', '')}`;
      if (!ids.has(id) && !files.has(postFile({ date, time: t, session }))) return { id, time: t };
    }
    throw new Error('Không tìm được giờ trống cho bài – đổi giờ đăng giúp em.');
  }
  const etLabel = (date, time) => {
    const [y, m, d] = date.split('-').map(Number), [hh, mm] = time.split(':').map(Number);
    try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(Date.UTC(y, m - 1, d, hh - 7, mm))) + ' ET'; } catch (e) { return ''; }
  };
  const zoneLine = (o, vi) => o && o.zone ? (vi ? `${o.zone}${o.sl ? ' | SL ' + o.sl : ''}${o.tp ? ' | TP ' + o.tp : ''}` : `${enNum(o.zone)}${o.sl ? ' | Stop ' + enNum(o.sl) : ''}${o.tp ? ' | Targets ' + enNum(o.tp) : ''}`) : '';
  const zoneObj = (o, en) => { if (!o || !o.zone) return null; const z = { zone: o.zone }; if (o.sl) z.sl = o.sl; if (o.tp) z.tp = o.tp; if (en) { z.zone_en = enNum(o.zone); if (o.sl) z.sl_en = enNum(o.sl); if (o.tp) z.tp_en = enNum(o.tp); } return z; };
  const secs = a => (a || []).map(x => ({ h: clean(x.h), p: clean(x.p) })).filter(x => x.h || x.p);

  /* f: dữ liệu form. Trả về entry đúng schema data/strategies.json (thứ tự khoá giống bài hiện có). */
  function buildEntry(f, list) {
    const S = SES[f.type]; if (!S) throw new Error('Chưa chọn loại bài');
    if (!/^\d{4}-\d\d-\d\d$/.test(f.date || '') || !/^\d\d:\d\d$/.test(f.time || '')) throw new Error('Ngày/giờ không hợp lệ');
    const title = clean(f.title); if (!title) throw new Error('Chưa có tiêu đề bài');
    const sell = { zone: clean(f.sell && f.sell.zone), sl: clean(f.sell && f.sell.sl), tp: clean(f.sell && f.sell.tp) };
    const buy = { zone: clean(f.buy && f.buy.zone), sl: clean(f.buy && f.buy.sl), tp: clean(f.buy && f.buy.tp) };
    const inval = clean(f.inval), note = clean(f.note), en = f.en || {}, titleEn = clean(en.title), hasEn = !!titleEn;
    const sections = secs(f.sections), sectionsEn = secs(en.sections);
    const hasPlan = !!(sell.zone || buy.zone);
    if (!sections.length && !hasPlan) throw new Error('Bài chưa có nội dung: thêm ít nhất 1 mục hoặc kế hoạch BÁN/MUA');
    if ((sell.sl || sell.tp) && !sell.zone) throw new Error('Có SL/TP BÁN nhưng thiếu vùng BÁN');
    if ((buy.sl || buy.tp) && !buy.zone) throw new Error('Có SL/TP MUA nhưng thiếu vùng MUA');
    const { id, time } = uniqueSlot(list || [], f.date, f.time, f.type);
    const trendType = TREND_VI[f.trend] ? f.trend : 'side';
    const trendText = clean(f.trendText) || TREND_VI[trendType], trendTextEn = clean(en.trendText);
    let firstP = (sections[0] && sections[0].p || '').replace(/\s+/g, ' ');
    const [y, mo, d] = f.date.split('-');
    const planLines = [];
    if (sell.zone) planLines.push('🔴 BÁN ' + zoneLine(sell, true));
    if (buy.zone) planLines.push('🟢 MUA ' + zoneLine(buy, true));
    if (inval) planLines.push('Vô hiệu: ' + inval);
    if (note) planLines.push('Lưu ý: ' + note);
    const planEn = [];
    if (sell.zone) planEn.push('🔴 SELL ' + zoneLine(sell, false));
    if (buy.zone) planEn.push('🟢 BUY ' + zoneLine(buy, false));
    if (clean(en.inval)) planEn.push('Invalidation: ' + clean(en.inval));
    if (clean(en.note)) planEn.push('Note: ' + clean(en.note));
    const e = {};
    e.id = id; e.date = f.date; e.time = time; e.session = f.type;
    if (hasEn) e.session_en = S.en;
    e.url = 'bai/' + postFile({ date: f.date, time, session: f.type });
    if (hasEn) e.url_en = `en/posts/${f.date}-gold-plan-${S.post}-${time.replace(':', '')}.html`;
    e.headline = title; if (hasEn) e.headline_en = titleEn;
    e.title = title; if (hasEn) e.title_en = titleEn;
    if (f.image) { e.image = f.image; e.image_alt = clean(f.imageAlt) || `Biểu đồ vàng ${d}/${mo} – ${f.type.toLowerCase()}`; }
    e.trend = clean(f.trendText) || (firstP = firstP.replace(/\*\*/g, ''), firstP ? (firstP.length > 220 ? firstP.slice(0, 217).trim() + '…' : firstP) : title);
    if (hasEn && trendTextEn) e.trend_en = trendTextEn;
    e.trendType = trendType;
    e.support = []; e.resistance = [];
    e.entryZones = buy.zone ? ['Mua ' + zoneLine(buy, true)] : [];
    if (hasEn) e.entryZones_en = buy.zone ? ['Buy ' + zoneLine(buy, false)] : [];
    e.sellZones = sell.zone ? ['Bán ' + zoneLine(sell, true)] : [];
    if (hasEn) e.sellZones_en = sell.zone ? ['Sell ' + zoneLine(sell, false)] : [];
    e.scenarios = hasPlan ? ['Kế hoạch: ' + [sell.zone && 'BÁN ' + zoneLine(sell, true), buy.zone && 'MUA ' + zoneLine(buy, true)].filter(Boolean).join(' · ')].concat(inval ? ['Vô hiệu: ' + inval] : []) : [];
    if (hasEn) e.scenarios_en = hasPlan ? ['Plan: ' + [sell.zone && 'SELL ' + zoneLine(sell, false), buy.zone && 'BUY ' + zoneLine(buy, false)].filter(Boolean).join(' · ')].concat(clean(en.inval) ? ['Invalidation: ' + clean(en.inval)] : []) : [];
    e.macro = [];
    e.physicalAdvice = clean(f.advice) || 'Làm theo kế hoạch, đừng chạy theo nến tin.';
    if (hasEn) e.physicalAdvice_en = clean(en.advice) || 'Trade the plan, not the noise.';
    e.dataTime = `Đăng lúc ${time} ngày ${d}/${mo}/${y} giờ VN (${f.type}).`;
    if (hasEn) e.dataTime_en = `Posted ${etLabel(f.date, time)}.`;
    e.disclaimer = DISC; if (hasEn) e.disclaimer_en = DISC_EN;
    e.brief = true;
    const sm = { trend: trendType, trendText };
    if (hasEn && trendTextEn) sm.trendText_en = trendTextEn;
    const bz = zoneObj(buy, hasEn), sz = zoneObj(sell, hasEn);
    if (bz) sm.buy = bz; if (sz) sm.sell = sz;
    const smNote = [note, inval].filter(Boolean).join(' · ');
    if (smNote) sm.note = smNote;
    const smNoteEn = [clean(en.note), clean(en.inval)].filter(Boolean).join(' · ');
    if (hasEn && smNoteEn) sm.note_en = smNoteEn;
    e.summary = sm;
    e.article = { sections: sections.concat(hasPlan ? [{ h: S.plan, p: planLines.join('\n') }] : []) };
    if (hasEn) {
      const pe = sectionsEn.concat(hasPlan ? [{ h: S.en === 'Editorial' || S.en === 'Gold Outlook' ? 'Trading Plan' : S.en + ' Plan', p: planEn.join('\n') }] : []);
      if (pe.length) e.article_en = { sections: pe };
    } else e.vi_only = true;
    return e;
  }
  function insertSorted(list, e) {
    const k = e.date + (e.time || '');
    const i = list.findIndex(s => (s.date + (s.time || '')) < k);
    if (i < 0) list.push(e); else list.splice(i, 0, e);
    return list;
  }

  /* --- áp thay đổi kiểu “3 bên”: chỉ ghi các khoá đã sửa; nếu khoá đó vừa bị người/máy khác đổi thì báo xung đột --- */
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  function setPath(o, p, v) {
    const ks = p.split('.'); let a = o;
    for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null || typeof a[ks[i]] !== 'object') { if (v === undefined) return; a[ks[i]] = {}; } a = a[ks[i]]; }
    if (v === undefined) delete a[ks[ks.length - 1]]; else a[ks[ks.length - 1]] = v;
  }
  function applyChanges(target, before, changes) {
    for (const p of Object.keys(changes)) {
      if (!same(getPath(target, p), getPath(before, p))) throw new Error('Phần “' + p + '” vừa được cập nhật ở nơi khác. Tải lại trang rồi sửa lại giúp em.');
      setPath(target, p, changes[p]);
    }
    return target;
  }

  /* --- xem trước (giống scripts/build-seo.py) --- */
  const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  function articleHTML(a) {
    if (!a || !a.sections || !a.sections.length) return '';
    return '<article class="h79art">' + a.sections.map(x => `<p><b>${esc(x.h || '')}:</b>${(x.p || '').includes('\n') ? '<br>' : ' '}${md(x.p || '')}</p>`).join('') + '</article>';
  }
  function summaryHTML(s, en) {
    const m = s.summary; if (!m) return '';
    const tk = m.trend || s.trendType || 'side', ic = { up: '🔺', down: '🔻', side: '↔️' }[tk] || '↔️';
    const z = (o, c, i, lb) => !o || !o.zone ? '' : `<div class="z ${c}">${i} ${lb} <b>${esc(en ? o.zone_en || enNum(o.zone) : o.zone)}</b>${o.sl ? ` <span class="k">| SL</span> ${esc(en ? o.sl_en || enNum(o.sl) : o.sl)}` : ''}${o.tp ? ` <span class="k">| TP</span> ${esc(en ? o.tp_en || enNum(o.tp) : o.tp)}` : ''}</div>`;
    const note = en ? m.note_en : m.note;
    return `<section class="h79s"><div class="t ${esc(tk)}">${en ? 'Bias' : 'Xu hướng'}: ${ic} ${esc((en ? m.trendText_en : m.trendText) || (en ? TREND_EN : { up: 'Tăng', down: 'Giảm', side: 'Đi ngang' })[tk])}</div>${z(m.sell, 'sell', '🔴', en ? 'SELL zone' : 'BÁN')}${z(m.buy, 'buy', '🟢', en ? 'BUY zone' : 'MUA')}${note ? `<div class="n">⚠️ ${esc(note)}</div>` : ''}</section>`;
  }
  function previewHTML(s, imgSrc) {
    const img = imgSrc || (s.image ? '../' + s.image : '');
    const fig = img ? `<figure class="h79img"><img src="${esc(img)}" alt="" style="width:100%;border-radius:10px"></figure>` : '';
    let h = `<div class="pv"><p class="small muted">🇻🇳 ${esc(s.session)} · ${esc(s.time || '')} ${esc((s.date || '').split('-').reverse().join('/'))} · Ngọc Huy</p><h1>${esc(s.title)}</h1>${articleHTML(s.article)}${fig}${summaryHTML(s, false)}</div>`;
    if (s.title_en) h += `<div class="pv"><p class="small muted">🇬🇧 English</p><h1>${esc(s.title_en)}</h1>${articleHTML(s.article_en)}${fig}${summaryHTML(s, true)}</div>`;
    return h;
  }

  /* --- base64 UTF-8 --- */
  function b64encBytes(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  const b64enc = text => b64encBytes(new TextEncoder().encode(text));
  const b64dec = b64 => { const bin = atob(String(b64).replace(/\s/g, '')); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new TextDecoder('utf-8').decode(u); };

  const PURE = { SES, slug, enNum, pyCompact, dump, detectFmt, serialize, validateStrategies, VALIDATE, postFile, uniqueSlot, buildEntry, insertSorted, applyChanges, getPath, setPath, articleHTML, summaryHTML, previewHTML, b64enc, b64dec, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = PURE;
  if (typeof document === 'undefined') return;

  /* ================= Phần giao diện ================= */
  const $ = id => document.getElementById(id);
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } }, del: k => { try { localStorage.removeItem(k); } catch (e) { } } };
  let TOKEN = ls.get(TK) || '';
  const busy = t => { $('busy-t').textContent = t || 'Đang xử lý…'; $('busy').classList.toggle('hidden', !t); };
  function flash(html, kind) { $('flash').innerHTML = html ? `<div class="msg ${kind || 'info'}">${html}</div>` : ''; if (html) scrollTo({ top: 0, behavior: 'smooth' }); }
  const nowVN = () => { const d = new Date(Date.now() + 7 * 3600e3); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16), iso: d.toISOString().slice(0, 19) + '+07:00' }; };

  /* --- GitHub API --- */
  async function gh(path, opt) {
    opt = opt || {};
    const r = await fetch(API + path, { method: opt.method || 'GET', cache: 'no-store', headers: Object.assign({ Authorization: 'Bearer ' + TOKEN, Accept: opt.accept || 'application/vnd.github+json' }, opt.body ? { 'Content-Type': 'application/json' } : {}), body: opt.body ? JSON.stringify(opt.body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) { }
    if (!r.ok) {
      const m = (j && j.message) || r.statusText, err = new Error(m); err.status = r.status;
      if (r.status === 401) err.vi = 'Mã GitHub sai hoặc đã hết hạn. Bấm “Đăng xuất” rồi dán mã mới.';
      else if (r.status === 403 && /not accessible|permission/i.test(m)) err.vi = 'Mã GitHub chưa có quyền ghi. Tạo lại mã với Contents: Read and write cho repo huymastergold79.';
      else if (r.status === 403 || r.status === 429) err.vi = 'GitHub đang giới hạn tốc độ, đợi 1–2 phút rồi thử lại.';
      else if (r.status === 404 && opt.method !== 'GET' && opt.method) err.vi = 'Không tìm thấy repo – kiểm tra mã đã chọn đúng huymastergold79 chưa.';
      throw err;
    }
    return j;
  }
  const enc = p => p.split('/').map(encodeURIComponent).join('/');
  async function getFile(path) {
    const j = await gh(`/repos/${OWNER}/${REPO}/contents/${enc(path)}?ref=${BRANCH}&t=${Date.now()}`, { accept: 'application/vnd.github.object+json' });
    let b64 = j.content;
    if (!b64 && j.size > 0) b64 = (await gh(`/repos/${OWNER}/${REPO}/git/blobs/${j.sha}`)).content; // file > 1 MB
    return { sha: j.sha, text: b64 ? b64dec(b64) : '' };
  }
  async function exists(path) { try { await gh(`/repos/${OWNER}/${REPO}/contents/${enc(path)}?ref=${BRANCH}&t=${Date.now()}`, { accept: 'application/vnd.github.object+json' }); return true; } catch (e) { if (e.status === 404) return false; throw e; } }
  const putFile = (path, b64, sha, message) => gh(`/repos/${OWNER}/${REPO}/contents/${enc(path)}`, { method: 'PUT', body: Object.assign({ message, content: b64, branch: BRANCH }, sha ? { sha } : {}) });

  /* Đọc bản mới nhất → mutate → kiểm tra → commit (tự thử lại nếu file vừa bị đổi). */
  async function commitJSON(path, mutate, message) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const f = await getFile(path), fmt = detectFmt(f.text), data = JSON.parse(f.text);
      const res = mutate(data);
      if (VALIDATE[path]) VALIDATE[path](data);
      const out = serialize(data, fmt, f.text);
      if (out === f.text) return { unchanged: true, res };
      try { const r = await putFile(path, b64enc(out), f.sha, typeof message === 'function' ? message(res) : message); return { res, commit: r.commit && r.commit.sha }; }
      catch (e) { if ((e.status === 409 || e.status === 422) && attempt < 2) continue; throw e; }
    }
  }
  const errMsg = e => esc(e.vi || e.message || String(e));

  /* --- đăng nhập --- */
  function showApp(on) {
    $('login').classList.toggle('hidden', on); $('tabs').classList.toggle('hidden', !on); $('logout').classList.toggle('hidden', !on);
    document.querySelectorAll('main > section[id^="tab-"]').forEach(s => s.classList.add('hidden'));
    if (on) openTab(ls.get('h79_admin_tab') || 'new');
  }
  $('login-btn').onclick = async () => {
    const t = $('tok').value.trim();
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) { flash('Mã không đúng dạng. Mã đúng bắt đầu bằng <code>github_pat_</code>.', 'err'); return; }
    TOKEN = t; busy('Đang kiểm tra mã…');
    try { await getFile('data/live-schedule.json'); ls.set(TK, t); $('tok').value = ''; flash('✅ Đăng nhập thành công. Mã đã lưu trên trình duyệt này.', 'ok'); showApp(true); }
    catch (e) { TOKEN = ''; flash('Không đăng nhập được: ' + errMsg(e), 'err'); }
    busy();
  };
  $('logout').onclick = () => { if (!confirm('Đăng xuất và xoá mã GitHub khỏi trình duyệt này?')) return; ls.del(TK); TOKEN = ''; flash('Đã đăng xuất, mã đã bị xoá khỏi máy này.', 'ok'); showApp(false); };

  /* --- tabs --- */
  const loaded = {};
  function openTab(t) {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll('main > section[id^="tab-"]').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + t));
    ls.set('h79_admin_tab', t);
    const L = { posts: loadPosts, macro: loadMacro, vngold: loadVnGold, live: loadLive, raw: loadRawList };
    if (L[t] && !loaded[t]) { loaded[t] = 1; L[t]().catch(e => { loaded[t] = 0; flash('Lỗi tải dữ liệu: ' + errMsg(e), 'err'); }); }
  }
  $('tabs').onclick = e => { const b = e.target.closest('button'); if (b) { flash(''); openTab(b.dataset.tab); } };

  /* ================= Viết bài / sửa bài nhận định ================= */
  let EDIT = null; // {id, before(entry), init(form values)}
  let IMG = null;  // {b64, ext, dataUrl}
  const radio = n => (document.querySelector(`input[name="${n}"]:checked`) || {}).value;
  const setRadio = (n, v) => { const x = document.querySelector(`input[name="${n}"][value="${v}"]`); if (x) x.checked = true; };
  function secRow(box, x, en) {
    const d = document.createElement('div'); d.className = 'sec-item';
    d.innerHTML = `<input type="text" class="sh" placeholder="${en ? 'Heading' : 'Tiêu đề mục (VD: Nhìn lại hôm qua)'}"><textarea class="sp" placeholder="${en ? 'Text' : 'Nội dung…'}" style="margin-top:6px"></textarea><div class="tools"><button type="button" class="b gh sm" data-a="up">⬆️</button><button type="button" class="b gh sm" data-a="down">⬇️</button><button type="button" class="b red sm" data-a="del">🗑 Xoá mục</button></div>`;
    d.querySelector('.sh').value = (x && x.h) || ''; d.querySelector('.sp').value = (x && x.p) || '';
    box.appendChild(d); return d;
  }
  function secTools(box) {
    box.addEventListener('click', e => {
      const b = e.target.closest('button[data-a]'); if (!b) return; const it = b.closest('.sec-item');
      if (b.dataset.a === 'del') { if ((it.querySelector('.sh').value + it.querySelector('.sp').value).trim() && !confirm('Xoá mục này?')) return; it.remove(); }
      if (b.dataset.a === 'up' && it.previousElementSibling) box.insertBefore(it, it.previousElementSibling);
      if (b.dataset.a === 'down' && it.nextElementSibling) box.insertBefore(it.nextElementSibling, it);
      saveDraft();
    });
  }
  const readSecs = box => [...box.querySelectorAll('.sec-item')].map(d => ({ h: d.querySelector('.sh').value, p: d.querySelector('.sp').value }));
  secTools($('secs')); secTools($('secs-en'));
  $('add-sec').onclick = () => { secRow($('secs')).querySelector('.sh').focus(); };
  $('add-sec-en').onclick = () => { secRow($('secs-en'), null, true).querySelector('.sh').focus(); };
  const V = id => $(id).value;
  function readForm() {
    return { type: radio('ptype'), date: V('p-date'), time: V('p-time'), title: V('p-title'), trend: radio('ptrend'), trendText: V('p-trendtext'),
      sell: { zone: V('s-zone'), sl: V('s-sl'), tp: V('s-tp') }, buy: { zone: V('b-zone'), sl: V('b-sl'), tp: V('b-tp') },
      inval: V('p-inval'), note: V('p-note'), sections: readSecs($('secs')), imageAlt: V('p-imgalt'), advice: V('p-advice'),
      en: { title: V('e-title'), trendText: V('e-trendtext'), inval: V('e-inval'), note: V('e-note'), sections: readSecs($('secs-en')) } };
  }
  function fillForm(f) {
    setRadio('ptype', f.type || 'Tổng quan'); $('p-date').value = f.date || ''; $('p-time').value = f.time || '';
    $('p-title').value = f.title || ''; setRadio('ptrend', f.trend || 'side'); $('p-trendtext').value = f.trendText || '';
    ['zone', 'sl', 'tp'].forEach(k => { $('s-' + k).value = (f.sell || {})[k] || ''; $('b-' + k).value = (f.buy || {})[k] || ''; });
    $('p-inval').value = f.inval || ''; $('p-note').value = f.note || ''; $('p-imgalt').value = f.imageAlt || '';
    $('p-advice').value = f.advice == null ? 'Làm theo kế hoạch, đừng chạy theo nến tin.' : f.advice;
    const en = f.en || {}; $('e-title').value = en.title || ''; $('e-trendtext').value = en.trendText || ''; $('e-inval').value = en.inval || ''; $('e-note').value = en.note || '';
    $('secs').innerHTML = ''; (f.sections && f.sections.length ? f.sections : [{}]).forEach(x => secRow($('secs'), x));
    $('secs-en').innerHTML = ''; (en.sections || []).forEach(x => secRow($('secs-en'), x, true));
    $('en-box').open = !!(en.title || (en.sections || []).length);
  }
  function saveDraft() { if (!EDIT) ls.set(DRAFT, JSON.stringify(readForm())); }
  $('tab-new').addEventListener('input', saveDraft); $('tab-new').addEventListener('change', e => { if (e.target.id !== 'p-img') saveDraft(); });
  function resetNew(keepDraft) {
    EDIT = null; IMG = null; $('p-img').value = ''; $('img-pv').classList.add('hidden'); $('img-cur').innerHTML = ''; $('preview').innerHTML = '';
    $('post-form-title').textContent = '✍️ Viết bài mới'; $('edit-note').classList.add('hidden'); $('btn-cancel-edit').classList.add('hidden');
    $('type-wrap').classList.remove('hidden'); $('inval-wrap').classList.remove('hidden'); $('e-inval').parentElement && ($('e-inval').style.display = '', $('e-inval').previousElementSibling.style.display = '');
    $('btn-publish').textContent = '🚀 Đăng bài';
    let f = null; if (keepDraft) try { f = JSON.parse(ls.get(DRAFT) || 'null'); } catch (e) { }
    const n = nowVN(); f = f || {}; f.date = n.date; f.time = n.time; // ngày giờ luôn lấy lúc mở trang
    fillForm(f);
  }
  $('btn-clear').onclick = () => { if (!confirm('Xoá toàn bộ nội dung đang viết?')) return; ls.del(DRAFT); resetNew(false); };
  $('btn-cancel-edit').onclick = () => { resetNew(true); openTab('posts'); };

  /* ảnh: thu nhỏ trên máy (tối đa 1600px, JPEG) để tải nhanh bằng 4G */
  $('p-img').onchange = async () => {
    const file = $('p-img').files[0]; IMG = null; $('img-pv').classList.add('hidden'); if (!file) return;
    if (!/^image\//.test(file.type)) { flash('File này không phải ảnh.', 'err'); return; }
    busy('Đang xử lý ảnh…');
    try {
      const url = URL.createObjectURL(file), im = new Image();
      await new Promise((ok, no) => { im.onload = ok; im.onerror = () => no(new Error('Không đọc được ảnh')); im.src = url; });
      let blob = file, ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      if (file.size > 700 * 1024 || im.naturalWidth > 1600 || !/^(png|jpg|webp)$/.test(ext)) {
        const w = Math.min(1600, im.naturalWidth), h = Math.round(im.naturalHeight * w / im.naturalWidth), c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
        blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.86)); ext = 'jpg';
      }
      URL.revokeObjectURL(url);
      if (blob.size > 5 * 1024 * 1024) throw new Error('Ảnh quá lớn (>5MB)');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      IMG = { b64: b64encBytes(bytes), ext, dataUrl: 'data:image/' + (ext === 'jpg' ? 'jpeg' : ext) + ';base64,' + b64encBytes(bytes) };
      $('img-pv').src = IMG.dataUrl; $('img-pv').classList.remove('hidden');
    } catch (e) { flash('Lỗi ảnh: ' + errMsg(e), 'err'); $('p-img').value = ''; }
    busy();
  };
  async function uploadImage(date, type, time) {
    const base = `img/charts/gold-${date}-${SES[type] ? SES[type].img : 'post'}-${time.replace(':', '')}`;
    let p = `${base}.${IMG.ext}`;
    for (let i = 2; await exists(p); i++) { p = `${base}-${i}.${IMG.ext}`; if (i > 9) throw new Error('Không đặt được tên ảnh'); }
    busy('Đang tải ảnh lên…');
    await putFile(p, IMG.b64, null, `Admin: ảnh biểu đồ ${date} ${time} (${type})`);
    return p;
  }

  /* sửa bài cũ: các thay đổi theo đường dẫn khoá (chỉ ghi phần đã sửa) */
  function formOf(s) {
    const m = s.summary || {}, a = (s.article || {}).sections || [], ae = (s.article_en || {}).sections || [];
    return { type: s.session, date: s.date, time: s.time, title: s.title || '', trend: m.trend || s.trendType || 'side', trendText: m.trendText || '',
      sell: { zone: (m.sell || {}).zone || '', sl: (m.sell || {}).sl || '', tp: (m.sell || {}).tp || '' }, buy: { zone: (m.buy || {}).zone || '', sl: (m.buy || {}).sl || '', tp: (m.buy || {}).tp || '' },
      inval: '', note: m.note || '', sections: a.map(x => ({ h: x.h, p: x.p })), imageAlt: s.image_alt || '', advice: s.physicalAdvice || '',
      en: { title: s.title_en || '', trendText: m.trendText_en || '', inval: '', note: m.note_en || '', sections: ae.map(x => ({ h: x.h, p: x.p })) } };
  }
  function editChanges(s, init, f, newImg) {
    const C = {}, ch = (a, b) => clean(a) !== clean(b);
    if (ch(f.title, init.title)) { if (!clean(f.title)) throw new Error('Tiêu đề không được để trống'); C.title = clean(f.title); if (s.headline != null) C.headline = clean(f.title); }
    if (f.trend !== init.trend) { C.trendType = f.trend; if (s.summary) C['summary.trend'] = f.trend; }
    if (ch(f.trendText, init.trendText)) C['summary.trendText'] = clean(f.trendText) || TREND_VI[f.trend] || undefined;
    const hasEn = !!(s.title_en || clean(f.en.title));
    for (const side of ['sell', 'buy']) for (const k of ['zone', 'sl', 'tp']) if (ch(f[side][k], init[side][k])) {
      const v = clean(f[side][k]);
      if (!clean(f[side].zone) && init[side].zone) { C['summary.' + side] = undefined; continue; }
      C[`summary.${side}.${k}`] = v || undefined;
      if (hasEn && (getPath(s, `summary.${side}.${k}_en`) != null || s.title_en)) C[`summary.${side}.${k}_en`] = v ? enNum(v) : undefined;
    }
    if (ch(f.note, init.note)) C['summary.note'] = clean(f.note) || undefined;
    if (!same(secs(f.sections), secs(init.sections))) { const x = secs(f.sections); if (!x.length && !getPath(s, 'summary.sell') && !getPath(s, 'summary.buy')) throw new Error('Bài phải còn ít nhất 1 mục nội dung'); C['article.sections'] = x; }
    if (ch(f.advice, init.advice)) C.physicalAdvice = clean(f.advice) || 'Làm theo kế hoạch, đừng chạy theo nến tin.';
    if (ch(f.imageAlt, init.imageAlt) && (s.image || newImg)) C.image_alt = clean(f.imageAlt) || undefined;
    if (newImg === null) { ['image', 'image_alt', 'image_en', 'image_alt_en'].forEach(k => { if (s[k] != null) C[k] = undefined; }); }
    else if (newImg) { C.image = newImg; if (s.image_en != null) C.image_en = undefined; if (s.image_alt_en != null) C.image_alt_en = undefined; if (!s.image_alt && !C.image_alt) C.image_alt = clean(f.imageAlt) || 'Biểu đồ vàng'; }
    // EN
    const te = clean(f.en.title);
    if (te !== clean(init.en.title)) {
      if (te) {
        C.title_en = te; C.headline_en = te;
        if (!s.url_en && SES[s.session]) { C.url_en = `en/posts/${s.date}-gold-plan-${SES[s.session].post}${s.time ? '-' + s.time.replace(':', '') : ''}.html`; C.session_en = SES[s.session].en; }
        if (s.vi_only) C.vi_only = undefined;
        if (!s.disclaimer_en) C.disclaimer_en = DISC_EN; if (!s.physicalAdvice_en) C.physicalAdvice_en = 'Trade the plan, not the noise.';
      } else { ['title_en', 'headline_en', 'url_en', 'session_en'].forEach(k => { if (s[k] != null) C[k] = undefined; }); C.vi_only = true; }
    }
    if (ch(f.en.trendText, init.en.trendText)) C['summary.trendText_en'] = clean(f.en.trendText) || undefined;
    if (ch(f.en.note, init.en.note)) C['summary.note_en'] = clean(f.en.note) || undefined;
    if (!same(secs(f.en.sections), secs(init.en.sections))) { const x = secs(f.en.sections); C['article_en.sections'] = x.length ? x : undefined; }
    return C;
  }
  function startEdit(s) {
    resetNew(false); EDIT = { id: s.id, before: clone(s), init: formOf(s) };
    fillForm(EDIT.init); setRadio('ptype', s.session);
    $('post-form-title').textContent = '✏️ Sửa bài'; $('btn-publish').textContent = '💾 Lưu thay đổi';
    $('type-wrap').classList.add('hidden'); $('inval-wrap').classList.add('hidden'); $('e-inval').style.display = 'none'; $('e-inval').previousElementSibling.style.display = 'none';
    $('edit-note').innerHTML = `Đang sửa: <b>${esc(s.session)} · ${esc(s.time || '')} ${esc(s.date.split('-').reverse().join('/'))}</b>. Ngày giờ giữ nguyên (đường link bài không đổi). Nếu đổi số BÁN/MUA ở trên, nhớ sửa cả mục “Kế hoạch” trong nội dung.`;
    $('edit-note').classList.remove('hidden'); $('btn-cancel-edit').classList.remove('hidden');
    $('img-cur').innerHTML = s.image ? `Ảnh hiện tại: <a href="../${esc(s.image)}" target="_blank">${esc(s.image.split('/').pop())}</a> <label style="margin-left:8px"><input type="checkbox" id="img-del"> xoá ảnh</label> · chọn ảnh mới để thay` : 'Bài chưa có ảnh.';
    openTab('new'); scrollTo({ top: 0 });
  }

  function currentEntryForPreview() {
    const f = readForm();
    if (!EDIT) { const e = buildEntry(Object.assign({}, f, { image: IMG ? 'img/charts/(ảnh mới)' : '' }), []); return e; }
    const s = clone(EDIT.before), del = $('img-del') && $('img-del').checked;
    applyChanges(s, EDIT.before, editChanges(EDIT.before, EDIT.init, f, IMG ? 'img/charts/(ảnh mới)' : del ? null : undefined));
    return s;
  }
  $('btn-preview').onclick = () => {
    try { const e = currentEntryForPreview(); $('preview').innerHTML = `<div class="ad-card"><h2>👁 Xem trước</h2><p class="small muted">Gần giống trang bài trên web. Chưa đăng.</p>${previewHTML(e, IMG ? IMG.dataUrl : '')}<div class="actions"><button class="b gold" type="button" onclick="document.getElementById('btn-publish').click()">${EDIT ? '💾 Lưu thay đổi' : '🚀 Đăng bài này'}</button></div></div>`; $('preview').scrollIntoView({ behavior: 'smooth' }); flash(''); }
    catch (e) { flash(errMsg(e), 'err'); }
  };
  function pollLive(url, label) {
    let n = 0; const u = new URL('../' + url, location.href).href;
    const t = setInterval(async () => {
      n++; try { const r = await fetch(u + '?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) { clearInterval(t); const el = $('live-ok'); if (el) el.innerHTML = `✅ ${label} đã lên web!`; } } catch (e) { }
      if (n > 30) clearInterval(t);
    }, 15000);
  }
  $('btn-publish').onclick = async () => {
    const f = readForm();
    try {
      if (!EDIT) {
        buildEntry(Object.assign({}, f, { image: IMG ? 'x' : '' }), []); // kiểm tra form trước khi tải ảnh
        if (!confirm('Đăng bài “' + clean(f.title) + '” lên h79gold.com?')) return;
        busy('Đang đăng bài…');
        let img = ''; if (IMG) img = await uploadImage(f.date, f.type, f.time);
        busy('Đang lưu bài…');
        let entry;
        const r = await commitJSON('data/strategies.json', d => {
          const n0 = d.strategies.length; entry = buildEntry(Object.assign({}, f, { image: img }), d.strategies); insertSorted(d.strategies, entry);
          if (d.strategies.length !== n0 + 1) throw new Error('Lỗi chèn bài'); return entry;
        }, e => `Admin: đăng bài ${e.id} – ${e.title.slice(0, 80)}`);
        ls.del(DRAFT); resetNew(false);
        const link = SITE + entry.url;
        flash(`🎉 <b>Đã đăng, khoảng 1–3 phút sau bài lên web.</b><br>Link bài: <a href="${esc(link)}" target="_blank">${esc(link)}</a><br><span class="small">Trang <a href="${SITE}chien-luoc.html" target="_blank">Chiến lược</a> cũng tự cập nhật.</span><br><span id="live-ok" class="small muted">⏳ Đang chờ web cập nhật…</span>${r.commit ? `<br><span class="small muted">Mã lưu: ${esc(r.commit.slice(0, 7))}</span>` : ''}`, 'ok');
        pollLive(entry.url, 'Bài');
        loaded.posts = 0;
      } else {
        const del = $('img-del') && $('img-del').checked;
        const preview = editChanges(EDIT.before, EDIT.init, f, IMG ? 'x' : del ? null : undefined);
        if (!Object.keys(preview).length) { flash('Chưa có gì thay đổi.', 'info'); return; }
        busy('Đang lưu…');
        let img; if (IMG) img = await uploadImage(EDIT.before.date, EDIT.before.session, EDIT.before.time || '00:00');
        const id = EDIT.id, before = EDIT.before, init = EDIT.init;
        const r = await commitJSON('data/strategies.json', d => {
          const s = d.strategies.find(x => x.id === id); if (!s) throw new Error('Bài này không còn (có thể đã bị xoá).');
          applyChanges(s, before, editChanges(before, init, f, IMG ? img : del ? null : undefined)); return s;
        }, `Admin: sửa bài ${id}`);
        const s = r.res; resetNew(true); loaded.posts = 0;
        flash(r.unchanged ? 'Không có gì thay đổi.' : `✅ <b>Đã lưu. Khoảng 1–3 phút sau web cập nhật.</b><br><a href="${esc(SITE + (s.url || 'bai/' + postFile(s)))}" target="_blank">Mở bài ↗</a>`, 'ok');
        openTab('posts');
      }
    } catch (e) { flash('Chưa lưu được: ' + errMsg(e), 'err'); }
    busy();
  };

  /* --- danh sách bài --- */
  let POSTS = [];
  async function loadPosts() {
    $('post-list').innerHTML = '<li class="muted">Đang tải…</li>';
    POSTS = JSON.parse((await getFile('data/strategies.json')).text).strategies || []; drawPosts();
  }
  function drawPosts() {
    const q = slug($('post-q').value);
    const L = POSTS.filter(s => !q || slug(`${s.title} ${s.session} ${s.date} ${(s.date || '').split('-').reverse().join('/')}`).includes(q));
    $('post-list').innerHTML = L.map(s => `<li><div class="t">${esc(s.title)}</div><div class="m">${esc(s.session || '')} · ${esc(s.time || '')} ${esc((s.date || '').split('-').reverse().join('/'))}${s.title_en ? ' · 🇬🇧' : ''}${s.image ? ' · 🖼' : ''}</div><div class="btns"><button class="b gh sm" data-e="${esc(s.id)}">✏️ Sửa</button><a class="b gh sm" target="_blank" href="${esc(SITE + 'bai/' + postFile(s))}">👁 Xem</a><button class="b red sm" data-d="${esc(s.id)}">🗑 Xoá</button></div></li>`).join('') || '<li class="muted">Không có bài.</li>';
  }
  $('post-q').oninput = drawPosts;
  $('post-list').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const s = POSTS.find(x => x.id === (b.dataset.e || b.dataset.d)); if (!s) return;
    if (b.dataset.e) return startEdit(s);
    if (!confirm(`XOÁ bài này?\n\n“${s.title}”\n\nBài sẽ biến mất khỏi web và không lấy lại được từ đây.`)) return;
    busy('Đang xoá…');
    try {
      await commitJSON('data/strategies.json', d => { const n0 = d.strategies.length; d.strategies = d.strategies.filter(x => x.id !== s.id); if (d.strategies.length !== n0 - 1) throw new Error('Không tìm thấy bài để xoá (có thể đã xoá rồi).'); }, `Admin: xoá bài ${s.id}`);
      flash('🗑 Đã xoá. Khoảng 1–3 phút sau bài biến mất khỏi web.', 'ok'); await loadPosts();
    } catch (er) { flash('Chưa xoá được: ' + errMsg(er), 'err'); }
    busy();
  };

  /* ================= Bộ dựng form chung ================= */
  /* fields: [{k:'a.b', l:'Nhãn', t:'text|textarea|date|time|number|select|check|lines', o:[[v,label]], en:true, req:true, ph:''}] */
  function fieldHTML(x, v, pre) {
    const id = pre + x.k.replace(/\W/g, '_'), ph = x.ph ? ` placeholder="${esc(x.ph)}"` : '';
    const lab = `<label class="f" for="${id}">${esc(x.l)}${x.req ? ' *' : ''}${x.hint ? ` <small>${esc(x.hint)}</small>` : ''}</label>`;
    if (x.t === 'textarea') return lab + `<textarea id="${id}" data-k="${x.k}"${ph}>${esc(v == null ? '' : v)}</textarea>`;
    if (x.t === 'lines') return lab + `<textarea id="${id}" data-k="${x.k}" data-t="lines"${ph}>${esc((v || []).join('\n\n'))}</textarea>`;
    if (x.t === 'select') return lab + `<select id="${id}" data-k="${x.k}" data-t="${x.num ? 'number' : ''}">${x.o.map(([ov, ol]) => `<option value="${esc(ov)}"${String(ov) === String(v) ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
    if (x.t === 'check') return `<label class="f"><input type="checkbox" id="${id}" data-k="${x.k}" data-t="check"${v ? ' checked' : ''}> ${esc(x.l)}</label>`;
    return lab + `<input type="${x.t === 'number' ? 'text" inputmode="numeric' : x.t || 'text'}" id="${id}" data-k="${x.k}" data-t="${x.t === 'number' ? 'number' : ''}" value="${esc(v == null ? '' : v)}"${ph}${x.list ? ` list="${x.list}"` : ''}>`;
  }
  function readField(el) {
    const t = el.dataset.t;
    if (t === 'check') return el.checked;
    if (t === 'number') { const s = el.value.trim().replace(/[.\s]/g, '').replace(',', '.'); if (s === '') return undefined; const n = Number(s); if (!isFinite(n)) throw new Error('Ô số không hợp lệ: ' + el.value); return n; }
    if (t === 'lines') { const a = el.value.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean); return a; }
    const v = clean(el.value); return v === '' ? undefined : v;
  }
  function renderFields(box, fields, obj, pre) {
    const vi = fields.filter(x => !x.en), en = fields.filter(x => x.en);
    box.innerHTML = vi.map(x => fieldHTML(x, getPath(obj, x.k), pre)).join('') + (en.length ? `<details class="en"><summary>🇬🇧 Tiếng Anh (không bắt buộc)</summary>${en.map(x => fieldHTML(x, getPath(obj, x.k), pre)).join('')}</details>` : '');
  }
  function collectChanges(box, fields, obj) {
    const C = {};
    box.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k, x = fields.find(f => f.k === k); if (!x) return;
      let v = readField(el), old = getPath(obj, k);
      if (x.req && (v === undefined || v === '')) throw new Error('Thiếu: ' + x.l);
      if (x.t === 'check' && !v && old === undefined) v = undefined;
      if (x.t === 'lines' && (!v.length) && old === undefined) v = undefined;
      const norm = a => { a = typeof a === 'string' ? a.replace(/\r\n?/g, '\n').trim() : a; return a === '' || a === undefined ? null : a; };
      if (!same(norm(v), norm(old))) C[k] = v === undefined && old === '' ? '' : v;
    });
    return C;
  }

  /* ================= Tin vĩ mô ================= */
  const MACRO_F = [
    { k: 'date', l: 'Ngày', t: 'date', req: true }, { k: 'time_vn', l: 'Giờ (VN)', ph: 'VD: 19:30 VN 21/10' },
    { k: 'category', l: 'Nhóm tin', list: 'cat-list', ph: 'Fed, Lạm phát, Chiến tranh…', req: true },
    { k: 'priority', l: 'Mức quan trọng', t: 'select', num: true, o: [[1, '1 – Rất quan trọng'], [2, '2 – Quan trọng'], [3, '3 – Thường']] },
    { k: 'impact', l: 'Tác động tới vàng', t: 'select', o: [['tăng', '🔺 Hỗ trợ vàng tăng'], ['giảm', '🔻 Áp lực vàng giảm'], ['trung lập', '↔️ Trung lập']] },
    { k: 'title', l: 'Tiêu đề tin', req: true }, { k: 'summary', l: 'Tóm tắt', t: 'textarea' }, { k: 'reason', l: 'Vì sao ảnh hưởng tới vàng', t: 'textarea' },
    { k: 'source.name', l: 'Nguồn 1 – tên', ph: 'VD: CNBC – Vàng giảm…' }, { k: 'source.url', l: 'Nguồn 1 – link', t: 'url', ph: 'https://' },
    { k: 'source2.name', l: 'Nguồn 2 – tên' }, { k: 'source2.url', l: 'Nguồn 2 – link', t: 'url' },
    { k: 'title_en', l: 'Title (EN) – cần có để hiện trên trang tiếng Anh', en: true }, { k: 'summary_en', l: 'Summary (EN)', t: 'textarea', en: true },
    { k: 'reason_en', l: 'Gold impact (EN)', t: 'textarea', en: true }, { k: 'time_en', l: 'Time (EN, ET)', ph: 'Oct 21, 8:30 AM ET', en: true }
  ];
  let MACRO = null, MEDIT = null;
  async function loadMacro() { MACRO = JSON.parse((await getFile('data/macro-news.json')).text); drawMacro(); }
  function drawMacro() {
    const cats = [...new Set((MACRO.items || []).map(i => i.category).filter(Boolean))];
    if (!$('cat-list')) { const dl = document.createElement('datalist'); dl.id = 'cat-list'; document.body.appendChild(dl); }
    $('cat-list').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
    const q = slug($('macro-q').value);
    $('macro-list').innerHTML = (MACRO.items || []).map((it, i) => [it, i]).filter(([it]) => !q || slug(it.title + ' ' + it.date).includes(q)).map(([it, i]) => `<li><div class="t">${esc(it.title)}</div><div class="m">${esc((it.date || '').split('-').reverse().join('/'))} · ${esc(it.category || '')} · ${{ 'tăng': '🔺', 'giảm': '🔻' }[it.impact] || '↔️'}${it.title_en ? ' · 🇬🇧' : ''}</div><div class="btns"><button class="b gh sm" data-e="${i}">✏️ Sửa</button><button class="b red sm" data-d="${i}">🗑 Xoá</button></div></li>`).join('') || '<li class="muted">Không có tin.</li>';
  }
  $('macro-q').oninput = () => MACRO && drawMacro();
  function macroForm(it, isNew) {
    MEDIT = { before: clone(it), isNew };
    $('macro-form').innerHTML = `<div class="ad-card" style="border-color:var(--gold)"><h2>${isNew ? '➕ Tin mới' : '✏️ Sửa tin'}</h2><div id="mf"></div><div class="actions"><button class="b gh" type="button" id="mf-cancel">Huỷ</button><button class="b gold" type="button" id="mf-save">💾 Lưu tin</button></div></div>`;
    renderFields($('mf'), MACRO_F, it, 'm_');
    $('mf-cancel').onclick = () => { $('macro-form').innerHTML = ''; MEDIT = null; };
    $('mf-save').onclick = saveMacro; $('macro-form').scrollIntoView({ behavior: 'smooth' });
  }
  $('macro-add').onclick = () => MACRO && macroForm({ date: nowVN().date, priority: 2, impact: 'trung lập' }, true);
  $('macro-list').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const it = MACRO.items[+(b.dataset.e || b.dataset.d)]; if (!it) return;
    if (b.dataset.e) return macroForm(it, false);
    if (!confirm(`Xoá tin này?\n\n“${it.title}”`)) return;
    busy('Đang xoá…');
    try {
      const key = JSON.stringify(it);
      await commitJSON('data/macro-news.json', d => { const i = d.items.findIndex(x => JSON.stringify(x) === key); if (i < 0) throw new Error('Tin vừa bị thay đổi ở nơi khác – tải lại trang.'); d.items.splice(i, 1); }, 'Admin: xoá tin vĩ mô ' + it.date);
      flash('🗑 Đã xoá tin. 1–3 phút sau web cập nhật.', 'ok'); await loadMacro();
    } catch (er) { flash('Chưa xoá được: ' + errMsg(er), 'err'); }
    busy();
  };
  async function saveMacro() {
    try {
      const C = collectChanges($('mf'), MACRO_F, MEDIT.before);
      if (!Object.keys(C).length) { flash('Chưa có gì thay đổi.', 'info'); return; }
      const cand = applyChanges(clone(MEDIT.before), MEDIT.before, C);
      ['source', 'source2'].forEach(k => {
        const o = cand[k];
        if (o && o.url && !/^https?:\/\//.test(o.url)) throw new Error('Link nguồn phải bắt đầu bằng https://');
        if (o && !o.name && !o.url && (k + '.name' in C || k + '.url' in C)) { delete C[k + '.name']; delete C[k + '.url']; if (MEDIT.before[k] !== undefined) C[k] = undefined; }
      });
      busy('Đang lưu tin…');
      const { before, isNew } = MEDIT, key = JSON.stringify(before);
      await commitJSON('data/macro-news.json', d => {
        if (isNew) { const it = applyChanges(clone(before), before, C); const order = ['date', 'category', 'priority', 'impact', 'title', 'summary', 'reason', 'source', 'source2', 'time_vn', 'title_en', 'summary_en', 'reason_en', 'time_en']; const o = {}; order.forEach(k => { if (it[k] !== undefined) o[k] = it[k]; }); Object.keys(it).forEach(k => { if (!(k in o)) o[k] = it[k]; }); const i = d.items.findIndex(x => (x.date || '') <= o.date); if (i < 0) d.items.push(o); else d.items.splice(i, 0, o); }
        else { const i = d.items.findIndex(x => JSON.stringify(x) === key); if (i < 0) throw new Error('Tin vừa bị thay đổi ở nơi khác – tải lại trang.'); applyChanges(d.items[i], before, C); }
      }, isNew ? 'Admin: thêm tin vĩ mô' : 'Admin: sửa tin vĩ mô');
      $('macro-form').innerHTML = ''; MEDIT = null;
      flash(`✅ Đã lưu tin. Khoảng 1–3 phút sau <a href="${SITE}tin-tuc.html" target="_blank">trang Tin tức</a> cập nhật.`, 'ok'); await loadMacro();
    } catch (e) { flash('Chưa lưu được: ' + errMsg(e), 'err'); }
    busy();
  }

  /* ================= Danh sách đối tượng (tin nóng, buổi live, bảng giá) ================= */
  function objList(box, arr, sub, newItem, label) {
    const draw = items => {
      box.innerHTML = items.map((it, i) => `<div class="sec-item" data-i="${i}">${sub.map(x => fieldHTML(x, getPath(it, x.k), `ol${box.id}_${i}_`)).join('')}<div class="tools"><button type="button" class="b red sm" data-x="${i}">🗑 Xoá dòng</button></div></div>`).join('') + `<button type="button" class="b gh sm" data-add="1">➕ Thêm ${esc(label)}</button>`;
    };
    let items = clone(arr || []); draw(items);
    const read = () => [...box.querySelectorAll('.sec-item')].map(d => {
      const o = clone(items[+d.dataset.i] || {});
      d.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k, old = getPath(o, k); let v = readField(el);
        if (typeof v === 'string' && typeof old === 'string' && v === old.replace(/\r\n?/g, '\n').trim()) return; // không đổi: giữ nguyên bản gốc
        if ((v === undefined && (old === '' || old === undefined)) || (v === false && old === undefined)) return;
        setPath(o, k, v);
      });
      return o;
    });
    box.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.add) { items = read(); items.push(clone(newItem)); draw(items); }
      if (b.dataset.x != null) { if (!confirm('Xoá dòng này?')) return; items = read(); items.splice(+b.dataset.x, 1); draw(items); }
    };
    return read;
  }

  /* ================= Giá vàng VN ================= */
  const VG_F = [
    { k: 'quick_advice', l: '👉 Lời khuyên nhanh (dòng vàng dưới “Tin nóng”)', t: 'textarea' },
    { k: 'advice', l: '🥇 Lời khuyên vàng vật chất', t: 'textarea', hint: '(mỗi ý 1 dòng)' },
    { k: 'analysis', l: '🧠 Phân tích', t: 'lines', hint: '(mỗi đoạn cách nhau 1 dòng trống)' },
    { k: 'advice_en', l: 'Advice (EN)', t: 'textarea', en: true }, { k: 'analysis_en', l: 'Analysis (EN) – blank line between paragraphs', t: 'lines', en: true }
  ];
  const WN_F = [{ k: 'text', l: 'Tin (1 dòng)', t: 'textarea' }, { k: 'source.name', l: 'Nguồn – tên' }, { k: 'source.url', l: 'Nguồn – link', t: 'url' }, { k: 'intl', l: 'Nguồn quốc tế', t: 'check' }];
  const VP_F = [{ k: 'brand', l: 'Thương hiệu' }, { k: 'name', l: 'Loại vàng' }, { k: 'buy', l: 'Mua vào (đồng/lượng)', t: 'number' }, { k: 'sell', l: 'Bán ra (đồng/lượng)', t: 'number' }];
  async function loadVnGold() {
    const [g, p] = await Promise.all([getFile('data/vn-gold-daily.json'), getFile('data/vn-prices.json')]);
    const G = JSON.parse(g.text), P = JSON.parse(p.text);
    $('vg-form').innerHTML = '<div id="vgf"></div><h3>🌍 Tin nóng vàng thế giới</h3><div id="wn"></div><div class="actions"><button class="b gold" type="button" id="vg-save">💾 Lưu phần giá vàng VN</button></div>';
    renderFields($('vgf'), VG_F, G, 'vg_');
    const readWN = objList($('wn'), G.world_news, WN_F, { text: '', source: { name: '', url: '' }, intl: false }, 'tin');
    $('vg-save').onclick = async () => {
      try {
        const C = collectChanges($('vgf'), VG_F, G), wn = readWN().filter(x => x.text);
        wn.forEach(x => { if (x.source && x.source.url && !/^https?:\/\//.test(x.source.url)) throw new Error('Link nguồn phải bắt đầu bằng https://'); if (x.source && !x.source.name && !x.source.url) delete x.source; });
        if (!same(wn, G.world_news || [])) C.world_news = wn;
        if (!Object.keys(C).length) { flash('Chưa có gì thay đổi.', 'info'); return; }
        busy('Đang lưu…');
        await commitJSON('data/vn-gold-daily.json', d => applyChanges(d, G, C), 'Admin: sửa lời khuyên/phân tích giá vàng VN');
        flash(`✅ Đã lưu. Khoảng 1–3 phút sau <a href="${SITE}gia-vang.html" target="_blank">trang Giá vàng</a> cập nhật.`, 'ok'); loaded.vngold = 0; openTab('vngold');
      } catch (e) { flash('Chưa lưu được: ' + errMsg(e), 'err'); }
      busy();
    };
    $('vp-form').innerHTML = `<p class="small muted">Cập nhật lần cuối: ${esc(P.updated || '')}</p><div id="vp"></div><div class="actions"><button class="b gold" type="button" id="vp-save">💾 Lưu bảng giá dự phòng</button></div>`;
    const readVP = objList($('vp'), P.prices, VP_F, { brand: '', name: '', buy: 0, sell: 0 }, 'dòng giá');
    $('vp-save').onclick = async () => {
      try {
        const pr = readVP().filter(x => x.brand || x.name);
        pr.forEach(x => { if (!(x.buy > 0) || !(x.sell > 0)) throw new Error('Giá mua/bán phải là số > 0 (VD 141300000)'); });
        if (same(pr, P.prices)) { flash('Chưa có gì thay đổi.', 'info'); return; }
        busy('Đang lưu…');
        await commitJSON('data/vn-prices.json', d => { applyChanges(d, P, { prices: pr }); d.updated = nowVN().iso; d.source = 'Cập nhật thủ công (admin)'; }, 'Admin: cập nhật giá vàng dự phòng');
        flash('✅ Đã lưu bảng giá dự phòng.', 'ok'); loaded.vngold = 0; openTab('vngold');
      } catch (e) { flash('Chưa lưu được: ' + errMsg(e), 'err'); }
      busy();
    };
  }

  /* ================= Live ================= */
  const DAYS = [[0, 'Chủ nhật'], [1, 'Thứ 2'], [2, 'Thứ 3'], [3, 'Thứ 4'], [4, 'Thứ 5'], [5, 'Thứ 6'], [6, 'Thứ 7']];
  const LS_F = [{ k: 'day', l: 'Thứ', t: 'select', num: true, o: DAYS }, { k: 'time', l: 'Giờ bắt đầu (VN)', t: 'time' }, { k: 'duration', l: 'Thời lượng (phút)', t: 'number' }, { k: 'title', l: 'Tên buổi live' }, { k: 'desc', l: 'Mô tả', t: 'textarea' }, { k: 'title_en', l: 'Title (EN)' }, { k: 'desc_en', l: 'Description (EN)', t: 'textarea' }];
  const LV_F = [{ k: 'liveVideoId', l: 'Mã video đang live (YouTube)', hint: '(để trống khi không live)', ph: 'VD: dQw4w9WgXcQ' }, { k: 'topics', l: 'Chủ đề sắp tới', t: 'lines', hint: '(mỗi chủ đề cách 1 dòng trống)' }, { k: 'topics_en', l: 'Topics (EN)', t: 'lines', en: true }];
  async function loadLive() {
    const L = JSON.parse((await getFile('data/live-schedule.json')).text);
    $('live-form').innerHTML = '<div id="lvf"></div><h3>📅 Các buổi live hằng tuần</h3><div id="lvs"></div><div class="actions"><button class="b gold" type="button" id="lv-save">💾 Lưu lịch live</button></div>';
    renderFields($('lvf'), LV_F, L, 'lv_');
    const readS = objList($('lvs'), L.sessions, LS_F, { day: 1, time: '19:00', duration: 120, title: '', desc: '' }, 'buổi live');
    $('lv-save').onclick = async () => {
      try {
        const C = collectChanges($('lvf'), LV_F, L);
        if (C.liveVideoId === undefined && 'liveVideoId' in C) C.liveVideoId = '';
        if (C.liveVideoId && /youtu/.test(C.liveVideoId)) { const m = /(?:v=|youtu\.be\/|live\/)([\w-]{11})/.exec(C.liveVideoId); if (m) C.liveVideoId = m[1]; }
        const ss = readS(); if (!same(ss, L.sessions)) C.sessions = ss;
        if (!Object.keys(C).length) { flash('Chưa có gì thay đổi.', 'info'); return; }
        busy('Đang lưu…');
        await commitJSON('data/live-schedule.json', d => applyChanges(d, L, C), 'Admin: cập nhật lịch live');
        flash(`✅ Đã lưu. Khoảng 1–3 phút sau <a href="${SITE}live.html" target="_blank">trang Live</a> cập nhật.`, 'ok'); loaded.live = 0; openTab('live');
      } catch (e) { flash('Chưa lưu được: ' + errMsg(e), 'err'); }
      busy();
    };
  }

  /* ================= Nâng cao: sửa JSON thô ================= */
  const RAW_NOTE = { 'calendar-us.json': '⚠️ Tự sinh từ ForexFactory – sửa tay sẽ bị ghi đè.', 'vn-gold-history.json': '⚠️ Tự sinh – sửa tay có thể bị ghi đè.', 'vn-gold-daily.json': 'Giá/lịch sử do máy tự sinh; chỉ sửa peak/refs/analysis/advice/world_news/quick_advice.', 'strategies.json': 'File rất lớn – nên dùng tab “Sửa bài”.', 'h79-results.json': 'Kết quả kế hoạch do trợ lý ghi.', 'fund.json': 'Trang Quỹ forex.', 'follow-accounts.json': 'Trang Tài khoản follow.', 'fedwatch.json': 'Khối FedWatch trang Tin tức.', 'symbols.json': 'Danh sách mã ở trang Biểu đồ.', 'gap-history.json': 'Biểu đồ chênh lệch SJC – thế giới.' };
  let RAW = null;
  async function loadRawList() {
    const j = await gh(`/repos/${OWNER}/${REPO}/contents/data?ref=${BRANCH}&t=${Date.now()}`);
    $('raw-file').innerHTML = j.filter(x => x.type === 'file' && /\.json$/.test(x.name)).map(x => `<option value="data/${esc(x.name)}">${esc(x.name)} (${Math.round(x.size / 1024)} KB)</option>`).join('');
  }
  $('raw-load').onclick = async () => {
    const p = $('raw-file').value; if (!p) return; busy('Đang mở…');
    try { const f = await getFile(p); RAW = { path: p, sha: f.sha, text: f.text }; $('raw-text').value = f.text; $('raw-text').classList.remove('hidden'); $('raw-actions').classList.remove('hidden'); $('raw-info').textContent = (RAW_NOTE[p.split('/').pop()] || '') + ' Đã mở ' + p; }
    catch (e) { flash('Không mở được: ' + errMsg(e), 'err'); }
    busy();
  };
  function rawCheck() {
    const t = $('raw-text').value;
    try { const d = JSON.parse(t); if (VALIDATE[RAW.path]) VALIDATE[RAW.path](d); return t; }
    catch (e) { let m = e.message; const pos = /position (\d+)/.exec(m); if (pos) { const ln = t.slice(0, +pos[1]).split('\n').length; m += ` (khoảng dòng ${ln})`; } throw new Error('Lỗi cú pháp/dữ liệu: ' + m); }
  }
  $('raw-check').onclick = () => { try { rawCheck(); flash('✅ JSON hợp lệ.', 'ok'); } catch (e) { flash(errMsg(e), 'err'); } };
  $('raw-save').onclick = async () => {
    try {
      let t = rawCheck(); if (/\n$/.test(RAW.text) && !/\n$/.test(t)) t += '\n';
      if (t === RAW.text) { flash('Chưa có gì thay đổi.', 'info'); return; }
      if (!confirm('Lưu file ' + RAW.path + ' lên web?')) return;
      busy('Đang lưu…');
      const r = await putFile(RAW.path, b64enc(t), RAW.sha, 'Admin: sửa ' + RAW.path);
      RAW.sha = r.content.sha; RAW.text = t;
      flash('✅ Đã lưu ' + esc(RAW.path) + '. 1–3 phút sau web cập nhật.', 'ok');
    } catch (e) { flash(e.status === 409 ? 'File vừa bị thay đổi ở nơi khác. Bấm “Mở file” để tải bản mới rồi sửa lại.' : 'Chưa lưu được: ' + errMsg(e), 'err'); }
    busy();
  };

  /* khởi động */
  resetNew(true);
  showApp(!!TOKEN);
  if (!TOKEN) $('login').classList.remove('hidden');
})(typeof window !== 'undefined' ? window : globalThis);
