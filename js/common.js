/* HuymasterGold79 v2 – dùng chung: header, footer, giao diện sáng/tối, thanh giá, Zalo, dữ liệu */
(function () {
  'use strict';
  const H = window.HMG = {};
  H.ZALO = 'https://zaloapp.com/qr/p/1px7atusm4iwa?src=qr';
  H.YT = 'https://www.youtube.com/@HuyNguyen-zv3zk';
  H.TG = 'https://t.me/HTFXGROUP';
  H.YT_LIVE = 'https://www.youtube.com/@tradinglivexauusd4647';
  H.YT_LIVE_ID = 'UC3wvszVefYJJ5S5V9t1kUtA';
  H.EMAIL = 'Huydaigia1407@gmail.com';
  /* Phòng Live YouTube: đặt true để mở lại (anh Huy yêu cầu tạm ẩn 19/10/2026) */
  H.LIVE_ON = false;
  if (!H.LIVE_ON) {
    try {
      const st = document.createElement('style');
      st.textContent = 'a[href$="live.html"],#live-badge,.live-banner{display:none!important}';
      (document.head || document.documentElement).appendChild(st);
      if (/(^|\/)live\.html$/.test(location.pathname)) location.replace(/\/en\/live\.html$/.test(location.pathname) ? location.pathname.replace(/live\.html$/, '') : location.pathname.replace(/live\.html$/, ''));
    } catch (e) { }
  }
  H.LUONG = 37.5 / 31.1035; // 1,20565
  H.fmt = (n, d = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString(/^en/i.test(document.documentElement.lang) ? 'en-US' : 'vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d });
  H.esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  H.dateVN = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  /* fetch có timeout (mạng di động/Safari có thể treo request vô hạn) */
  H.getJSON = (u, ms = 8000) => new Promise((ok, no) => {
    let done = false; const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => { if (done) return; done = true; try { ac && ac.abort(); } catch (e) { } no(new Error(u + ' timeout')); }, ms);
    fetch(u, ac ? { cache: 'no-store', signal: ac.signal } : { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); })
      .then(j => { if (!done) { done = true; clearTimeout(t); ok(j); } }, e => { if (!done) { done = true; clearTimeout(t); no(e); } });
  });
  /* gốc site (để đường dẫn data/ đúng cả ở en/ và bai/) */
  H.ROOT = (() => { const sc = document.currentScript || document.querySelector('script[src*="js/common.js"]'); return sc && sc.src ? sc.src.replace(/js\/common\.js.*$/, '') : ''; })();
  H.ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };

  /* ---- giao diện ---- */
  const saved = H.ls.get('hmg_theme');
  H.theme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = saved || 'dark';
  H.onTheme = [];

  /* ---- menu ---- */
  const page = document.body.dataset.page || 'home';
  const EN = H.EN = (document.documentElement.lang || '').toLowerCase().startsWith('en');
  /* ---- VI/EN: cặp trang tương ứng (giữ đồng bộ với thẻ hreflang) ---- */
  const LANG_PAIRS = H.LANG_PAIRS = { 'index.html': 'en/index.html', 'chien-luoc.html': 'en/h79-analysis.html', 've-toi.html': 'en/about.html',
    'tin-tuc.html': 'en/news.html', 'lich-kinh-te.html': 'en/economic-calendar.html', 'bieu-do.html': 'en/charts.html',
    'kien-thuc.html': 'en/learn.html', 'live.html': 'en/live.html', 'quy-forex.html': 'en/trading-fund.html', 'tai-khoan-follow.html': 'en/copy-trading.html',
    'lien-he.html': 'en/contact.html', 'bai/index.html': 'en/posts/index.html' };
  /* bài tĩnh: bai/<date>-nhan-dinh-vang-<phiên>[-hhmm].html <-> en/posts/<date>-gold-plan-<session>[-hhmm].html; tin vĩ mô <-> gold-macro-news (khớp scripts/build-seo.py) */
  const POST_SES = [['phien-au-my', 'london-ny-overlap'], ['phien-au', 'london-session'], ['phien-my', 'new-york-session'], ['phien-a', 'asian-session'], ['phien-dem', 'new-york-session']];
  const EN_ALIAS = { 'bai/2026-10-16-nhan-dinh-vang-phien-dem-2107.html': 'en/posts/2026-10-16-gold-plan-ny-morning-update.html' };
  const postEN = f => { if (EN_ALIAS[f]) return EN_ALIAS[f]; let m = /^bai\/(\d{4}-\d\d-\d\d)-nhan-dinh-vang-(phien-[a-z-]+?)(-\d{4})?\.html$/.exec(f); if (m) { const s = POST_SES.find(x => x[0] === m[2]); return s ? `en/posts/${m[1]}-gold-plan-${s[1]}${m[3] || ''}.html` : null; }
    m = /^bai\/(\d{4}-\d\d-\d\d)-tin-vi-mo-anh-huong-gia-vang\.html$/.exec(f); return m ? `en/posts/${m[1]}-gold-macro-news.html` : null; };
  const postVI = f => { const al = Object.keys(EN_ALIAS).find(k => EN_ALIAS[k] === f); if (al) return al; let m = /^en\/posts\/(\d{4}-\d\d-\d\d)-gold-plan-([a-z-]+?)(-\d{4})?\.html$/.exec(f); if (m) { const s = POST_SES.find(x => x[1] === m[2]); return s ? `bai/${m[1]}-nhan-dinh-vang-${s[0]}${m[3] || ''}.html` : null; }
    m = /^en\/posts\/(\d{4}-\d\d-\d\d)-gold-macro-news\.html$/.exec(f); return m ? `bai/${m[1]}-tin-vi-mo-anh-huong-gia-vang.html` : null; };
  const curFile = (() => { const a = location.pathname.split('/').filter(Boolean); const f = /\.html$/.test(a[a.length - 1] || '') ? a.pop() : 'index.html'; const dir = a[a.length - 1]; return (EN ? (dir === 'posts' ? 'en/posts/' : 'en/') : (dir === 'bai' ? 'bai/' : '')) + f; })();
  const langHref = EN ? (Object.keys(LANG_PAIRS).find(k => LANG_PAIRS[k] === curFile) || postVI(curFile) || (curFile.startsWith('en/posts/') ? 'bai/index.html' : 'index.html'))
    : (LANG_PAIRS[curFile] || postEN(curFile) || (curFile.startsWith('bai/') ? 'en/posts/index.html' : 'en/index.html'));
  const langBtn = `<a class="icon-btn lang-btn" href="${langHref}" hreflang="${EN ? 'vi' : 'en'}" lang="${EN ? 'vi' : 'en'}" title="${EN ? 'Tiếng Việt' : 'English version'}" aria-label="${EN ? 'Chuyển sang tiếng Việt' : 'Switch to English'}" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-weight:800;font-size:.8rem;flex:0 0 auto">${EN ? 'VI' : 'EN'}</a>`;
  const M_EN = [
    ['enhome', 'en/index.html', '🏠 Home'],
    ['strat', 'en/h79-analysis.html', '🎯 H79 Gold Plan'],
    ['market', 'en/news.html', '🌐 Markets', [
      ['en/news.html', 'Macro news & FedWatch', 'Fed, yields, dollar, geopolitics'],
      ['en/economic-calendar.html', 'US economic calendar', 'CPI, NFP, FOMC – times in ET']]],
    ['chart', 'en/charts.html', '📈 Charts'],
    ['live', 'en/live.html', '🔴 Live'],
    ['forex', 'en/trading-fund.html', '💱 Trading', [
      ['en/trading-fund.html', 'Trading fund model', 'Risk rules and roadmap'],
      ['en/copy-trading.html', 'Copy trading', 'Follow the H79 account']]],
    ['learn', 'en/learn.html', '📚 Learn'],
    ['bai', 'en/posts/index.html', '📰 Archive'],
    ['vetoi', 'en/about.html', '🙋 About'],
    ['about', 'en/contact.html', '✉ Contact']
  ];
  const M = EN ? M_EN : [
    ['home', 'index.html', '🏠 Trang chủ'],
    ['gia', 'gia-vang.html', '💰 Giá vàng VN', [
      ['gia-vang.html#bang-gia', 'Bảng giá trong nước', 'SJC, PNJ, DOJI, Bảo Tín…'],
      ['gia-vang.html#vang-mieng', 'Vàng miếng 24K', 'Mua vào / bán ra theo lượng, chỉ'],
      ['gia-vang.html#vang-nhan', 'Vàng nhẫn 9999', 'Nhẫn trơn các thương hiệu'],
      ['gia-vang.html#quy-doi', 'Quy đổi giá thế giới', 'USD/oz → VND/lượng'],
      ['gia-vang.html#may-tinh', 'Máy tính vàng', 'Theo chỉ, lượng, gram, oz'],
      ['gia-vang.html#chenh-lech', 'Chênh lệch SJC – thế giới', 'Biểu đồ lịch sử'],
      ['gia-vang.html#so-tich-luy', 'Sổ tích lũy lãi/lỗ', 'Lưu trên trình duyệt của bạn'],
      ['gia-vang.html#bac', 'Bạc & Bitcoin', 'Giá thế giới quy đổi']], true],
    ['live', 'live.html', '🔴 Live'],
    ['chart', 'bieu-do.html', '📈 Biểu đồ'],
    ['strat', 'chien-luoc.html', '🎯 Chiến lược'],
    ['market', 'tin-tuc.html', '🌐 Thị trường', [
      ['tin-tuc.html', 'Tin tức vàng', 'Dòng tin TradingView'],
      ['lich-kinh-te.html', 'Lịch kinh tế', 'Fed, CPI, việc làm Mỹ…']]],
    ['forex', 'quy-forex.html', '💱 Forex', [
      ['quy-forex.html', 'Xây dựng quỹ Forex', 'Lộ trình vốn, quản trị rủi ro'],
      ['tai-khoan-follow.html', 'Tài khoản Follow', 'Copy/theo dõi tài khoản giao dịch']]],
    ['learn', 'kien-thuc.html', '📚 Kiến thức', [
      ['kien-thuc.html#mua-vang', 'Cách mua vàng vật chất', 'Cho người mới'],
      ['kien-thuc.html#sjc-nhan', 'Vàng miếng SJC hay nhẫn 9999?', 'So sánh ưu nhược'],
      ['kien-thuc.html#doc-bieu-do', 'Đọc biểu đồ cơ bản', 'Nến, hỗ trợ, MA, RSI'],
      ['kien-thuc.html#don-vi', 'Đơn vị & quy đổi', 'Lượng, chỉ, oz, gram'],
      ['kien-thuc.html#yeu-to', 'Yếu tố tác động giá vàng', 'USD, lãi suất, lạm phát']]],
    ['bai', 'bai/index.html', '📰 Bài viết'],
    ['vetoi', 've-toi.html', '🙋 Về tôi'],
    ['about', 'lien-he.html', '👤 Liên hệ']
  ];
  const menu = M.map(([k, href, label, sub, mega]) => `<li><a href="${href}" class="${k === page ? 'on' : ''}">${label}${sub ? ' ▾' : ''}</a>${sub ? `<div class="dd${mega ? ' mega' : ''}">${sub.map(s => `<a href="${s[0]}">${s[1]}<small>${s[2]}</small></a>`).join('')}</div>` : ''}</li>`).join('');

  const hdr = `
  <div class="pricebar" aria-label="${EN ? 'Gold prices' : 'Giá vàng'}"><div class="track" id="pb-track"><span>${EN ? 'Loading gold prices…' : 'Đang tải giá vàng…'}</span></div></div>
  <header class="hdr"><div class="wrap">
    <a class="brand" href="${EN ? 'en/index.html' : 'index.html'}"><img src="assets/favicon.svg" width="34" height="34" alt="">Huymaster<b>Gold79</b></a>
    <ul class="menu" id="menu">${menu}</ul>
    <a href="${EN ? 'en/live.html' : 'live.html'}" id="live-badge" class="live-badge" hidden>● LIVE</a>
    ${langBtn}
    <button class="icon-btn" id="theme-btn" title="${EN ? 'Light/dark theme' : 'Đổi giao diện sáng/tối'}" aria-label="${EN ? 'Toggle theme' : 'Đổi giao diện'}">🌓</button>
    <button class="icon-btn burger" id="burger" aria-label="Menu">☰</button>
  </div></header>`;
  const ftrEN = `
  <footer><div class="wrap">
    <div class="cols">
      <div><a class="brand" href="en/index.html" style="display:flex"><img src="assets/favicon.svg" width="30" height="30" alt="">Huymaster<b>Gold79</b></a>
        <p class="muted small" style="margin-top:8px">Independent gold (XAU/USD) analysis by Ngọc Huy.</p>
        <div class="share"><a href="${H.YT}" target="_blank" rel="noopener">▶ YouTube</a><a class="tg-link" href="${H.TG}" target="_blank" rel="noopener">✈ Telegram</a><a href="mailto:${H.EMAIL}">✉ Email</a></div></div>
      <div><h4>Analysis</h4><a href="en/h79-analysis.html">H79 Gold Plan</a><a href="en/news.html">Macro news & FedWatch</a><a href="en/economic-calendar.html">Economic calendar</a><a href="en/charts.html">Charts</a><a href="en/live.html">Live room</a><a href="en/posts/index.html">Archive</a></div>
      <div><h4>More</h4><a href="en/trading-fund.html">Trading fund model</a><a href="en/copy-trading.html">Copy trading</a><a href="en/learn.html">Learn</a><a href="en/about.html">About</a><a href="en/contact.html">Contact</a><a href="index.html" hreflang="vi" lang="vi">Tiếng Việt</a></div>
    </div>
    <p class="disc">⚠ <b>Disclaimer:</b> All content is for information and education only and reflects personal opinion; it is <b>not investment advice</b>. Trading gold, forex and CFDs involves a high risk of loss. Past performance does not guarantee future results. Third-party data (TradingView, gold-api.com, Yahoo Finance) may be delayed or inaccurate.<br>© ${new Date().getFullYear()} HuymasterGold79</p>
  </div></footer>`;
  const ftr = EN ? ftrEN : `
  <footer><div class="wrap">
    <div class="cols">
      <div><a class="brand" href="index.html" style="display:flex"><img src="assets/favicon.svg" width="30" height="30" alt="">Huymaster<b>Gold79</b></a>
        <p class="muted small" style="margin-top:8px">Nhà phân tích vàng cá nhân. Chiến lược mỗi sáng cho người mua vàng vật chất tại Việt Nam.</p>
        <div class="share"><a href="${H.YT}" target="_blank" rel="noopener">▶ YouTube</a><a href="#" data-zalo>💬 Zalo</a><a class="tg-link" href="${H.TG}" target="_blank" rel="noopener">✈ Telegram</a><a href="mailto:${H.EMAIL}">✉ Email</a></div>
        <p class="small" style="margin-top:8px">🔴 Kênh live: <a href="${H.YT_LIVE}" target="_blank" rel="noopener">TRADING LIVE XAUUSD</a></p></div>
      <div><h4>Giá vàng</h4><a href="gia-vang.html#bang-gia">Bảng giá trong nước</a><a href="gia-vang.html#quy-doi">Quy đổi thế giới</a><a href="gia-vang.html#may-tinh">Máy tính vàng</a><a href="gia-vang.html#chenh-lech">Chênh lệch SJC</a></div>
      <div><h4>Phân tích</h4><a href="live.html">🔴 Phòng Live</a><a href="chien-luoc.html">Chiến lược hôm nay</a><a href="bieu-do.html">Biểu đồ toàn màn hình</a><a href="lich-kinh-te.html">Lịch kinh tế</a><a href="tin-tuc.html">Tin tức</a><a href="quy-forex.html">Quỹ Forex</a><a href="tai-khoan-follow.html">Tài khoản Follow</a></div>
      <div><h4>Thông tin</h4><a href="kien-thuc.html">Kiến thức</a><a href="ve-toi.html">Về tôi</a><a href="lien-he.html#lien-he">Liên hệ</a><a href="mailto:${H.EMAIL}">${H.EMAIL}</a></div>
    </div>
    <p class="disc">⚠ <b>Miễn trừ trách nhiệm:</b> Nội dung chỉ mang tính tham khảo, là quan điểm cá nhân, <b>không phải lời khuyên đầu tư</b>. Giá quy đổi là ước tính, chưa gồm thuế phí. Dữ liệu từ bên thứ ba (TradingView, gold-api.com, open.er-api.com, webgia.com, website các thương hiệu) có thể chậm hoặc sai lệch.<br>© ${new Date().getFullYear()} HuymasterGold79.com.vn</p>
  </div></footer>
  <button class="zfloat" data-zalo aria-label="Kết bạn Zalo">Zalo</button>
  <div id="zalo-modal" class="modal" hidden><div class="modal-box"><button class="x" aria-label="Đóng">×</button>
    <h3 style="color:var(--gold)">Kết bạn Zalo – Ngọc Huy</h3><img src="assets/zalo-qr.jpg" alt="Mã QR Zalo Ngọc Huy">
    <p class="muted small">Quét mã bằng Zalo để nhận chiến lược mỗi sáng</p><a class="btn zalo" href="${H.ZALO}" target="_blank" rel="noopener">Mở Zalo</a></div></div>`;
  document.getElementById('site-header').outerHTML = hdr;
  document.getElementById('site-footer').outerHTML = ftr + (EN ? `<div id="zalo-modal" class="modal" hidden><div class="modal-box"><button class="x" aria-label="Close">×</button><h3 style="color:var(--gold)">Zalo – Ngọc Huy</h3><img src="assets/zalo-qr.jpg" alt="Zalo QR code"><a class="btn zalo" href="${H.ZALO}" target="_blank" rel="noopener">Open Zalo</a></div></div>` : '');

  document.getElementById('burger').onclick = () => document.body.classList.toggle('nav-open');
  document.getElementById('theme-btn').onclick = () => {
    const t = H.theme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t; H.ls.set('hmg_theme', t);
    H.onTheme.forEach(f => f(t));
  };
  const modal = document.getElementById('zalo-modal');
  document.addEventListener('click', e => {
    const z = e.target.closest('[data-zalo]');
    if (z) { e.preventDefault(); if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) location.href = H.ZALO; else modal.hidden = false; }
    if (e.target === modal || e.target.closest('.modal .x')) modal.hidden = true;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.hidden = true; });

  /* ---- chia sẻ ---- */
  H.shareHTML = (text) => {
    const u = encodeURIComponent(location.href.split('#')[0]), t = encodeURIComponent(text || document.title);
    return `<div class="share"><a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${u}">Chia sẻ Facebook</a><a target="_blank" rel="noopener" href="https://zalo.me/share?u=${u}">Chia sẻ Zalo</a><a target="_blank" rel="noopener" href="https://t.me/share/url?url=${u}&text=${t}">Chia sẻ Telegram</a><a class="tg-link" target="_blank" rel="noopener" href="${H.TG}">✈ Vào nhóm Telegram</a><button type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(location.href);this.textContent='Đã sao chép ✓'">Sao chép link</button></div>`;
  };
  document.querySelectorAll('[data-share]').forEach(el => el.innerHTML = H.shareHTML(el.dataset.share));

  /* ---- TradingView widget theo giao diện ---- */
  H.tv = function (el, file, cfgFn) {
    const draw = () => {
      el.innerHTML = ''; el.className = (el.className.replace('tradingview-widget-container', '') + ' tradingview-widget-container').trim();
      const w = document.createElement('div'); w.className = 'tradingview-widget-container__widget'; w.style.height = '100%';
      const s = document.createElement('script'); s.async = true; s.src = 'https://s3.tradingview.com/external-embedding/' + file;
      s.innerHTML = JSON.stringify(cfgFn(H.theme())); el.append(w, s);
    };
    draw(); H.onTheme.push(draw); return draw;
  };
  H.lazy = (el, fn) => new IntersectionObserver((es, o) => { if (es.some(e => e.isIntersecting)) { o.disconnect(); fn(); } }, { rootMargin: '300px' }).observe(el);

  /* ---- dữ liệu giá (dùng chung, làm mới 60s) ---- */
  const BRANDS = [
    ['SJL1L10', 'SJC', 'mieng'], ['VIETTINMSJC', 'Viettin SJC', 'mieng'], ['DOHNL', 'DOJI Hà Nội', 'mieng'], ['DOHCML', 'DOJI TP.HCM', 'mieng'], ['PQHNVM', 'PNJ', 'mieng'], ['BTSJC', 'Bảo Tín SJC', 'mieng'], ['VNGSJC', 'VN Gold SJC', 'mieng'],
    ['SJ9999', 'SJC nhẫn 9999', 'nhan'], ['PQHN24NTT', 'PNJ nhẫn 24K', 'nhan'], ['DOJINHTV', 'DOJI Hưng Thịnh Vượng', 'nhan'], ['BT9999NTT', 'Bảo Tín nhẫn 9999', 'nhan']];
  H.data = { xau: null, xag: null, btc: null, fx: null, rows: [], vnSrc: '', time: null };
  H.subs = [];
  async function safe(p) { try { return await p; } catch (e) { console.warn(e.message || e); return null; } }
  const TK = 'hmg_ticker_v1';
  function computeDerived() {
    const D = H.data;
    D.world = D.xau && D.fx ? D.xau * D.fx * H.LUONG : null;
    const sjc = D.rows.find(r => r.name === 'SJC'); D.sjcSell = sjc ? sjc.sell : null;
    D.gap = D.world && D.sjcSell ? D.sjcSell - D.world : null;
  }
  function saveCache() {
    const D = H.data; H.ls.set(TK, JSON.stringify({ t: Date.now(), xau: D.xau, xag: D.xag, btc: D.btc, fx: D.fx, eur: D.eur, jpy: D.jpy, dxy: D.dxy, rows: D.live_rows ? D.rows : [], vnSrc: D.live_rows ? D.vnSrc : '' }));
  }
  function loadCache() { try { return JSON.parse(H.ls.get(TK) || 'null'); } catch (e) { return null; } }
  H.refresh = async function () {
    const D = H.data; let live = 0;
    const upd = () => { computeDerived(); D.stale = null; renderBar(); };
    const job = (u, f) => safe(H.getJSON(u)).then(j => { if (j) { try { if (f(j) !== false) { live++; upd(); } } catch (e) { console.warn(e); } } });
    await Promise.all([
      job('https://api.gold-api.com/price/XAU', g => { if (!g.price) return false; D.xau = g.price; }),
      job('https://api.gold-api.com/price/XAG', g => { if (!g.price) return false; D.xag = g.price; }),
      job('https://api.gold-api.com/price/BTC', g => { if (!g.price) return false; D.btc = g.price; }),
      job('https://open.er-api.com/v6/latest/USD', f => { if (!f.rates) return false; const R = f.rates; D.fx = R.VND;
        if (R.EUR && R.JPY && R.GBP && R.CAD && R.SEK && R.CHF) { D.eur = 1 / R.EUR; D.jpy = R.JPY; D.dxy = 50.14348112 * Math.pow(R.EUR, 0.576) * Math.pow(R.JPY, 0.136) * Math.pow(R.GBP, 0.119) * Math.pow(R.CAD, 0.091) * Math.pow(R.SEK, 0.042) * Math.pow(R.CHF, 0.036); } }),
      EN ? null : job(H.ROOT + 'data/vn-gold-daily.json', v => { if (!v.rows) return false; const m = {}; v.rows.forEach(r => m[r.code] = r);
        const rows = BRANDS.filter(k => m[k[0]] && m[k[0]].sell).map(k => ({ code: k[0], name: k[1], type: k[2], buy: m[k[0]].buy, sell: m[k[0]].sell, change_buy: m[k[0]].chg_buy, change_sell: m[k[0]].chg_sell }));
        if (!rows.length) return false; D.rows = rows; D.live_rows = true; D.rowsStale = null; D.fallback = null;
        D.vnSrc = 'webgia.com & web chính thức · ' + (v.updated_vn || ''); })]);
    if (!EN && !D.rows.length) { // dự phòng: giá nhập tay trong data/vn-prices.json (giá thật, có ghi thời điểm)
      const j = await safe(H.getJSON(H.ROOT + 'data/vn-prices.json'));
      if (j && j.prices) { D.rows = j.prices.map(r => ({ name: r.name, type: /nhẫn/i.test(r.name) ? 'nhan' : 'mieng', buy: r.buy, sell: r.sell, change_buy: 0, change_sell: 0 })); D.vnSrc = 'Nhập tay · ' + new Date(j.updated).toLocaleString('vi-VN'); D.fallback = j.updated; }
    }
    computeDerived();
    if (live) { D.time = new Date(); saveCache(); }
    else if (!D.time) { // không có nguồn trực tuyến nào: dùng giá đã lưu lần trước (ghi rõ thời điểm)
      const c = loadCache();
      if (c) { ['xau', 'xag', 'btc', 'fx', 'eur', 'jpy', 'dxy'].forEach(k => { if (D[k] == null && c[k] != null) D[k] = c[k]; }); if (!D.rows.length && c.rows && c.rows.length) { D.rows = c.rows; D.vnSrc = c.vnSrc; D.rowsStale = c.t; } D.stale = c.t; computeDerived(); }
    }
    if (D.world && D.sjcSell && D.live_rows && live) { // lưu lịch sử chênh lệch mỗi ngày trên trình duyệt
      try { const k = 'hmg_gap', h = JSON.parse(H.ls.get(k) || '{}'); h[D.time.toISOString().slice(0, 10)] = { world: Math.round(D.world), sjc: D.sjcSell }; H.ls.set(k, JSON.stringify(h)); } catch (e) { }
    }
    D.settled = true;
    renderBar(); H.subs.forEach(fn => { try { fn(D); } catch (e) { console.error(e); } });
  };
  H.sub = fn => { H.subs.push(fn); if (H.data.time) fn(H.data); };
  function chg(n) { if (!n) return ''; return `<small class="${n > 0 ? 'u' : 'd'}">${n > 0 ? '▲' : '▼'}${H.fmt(Math.abs(n) / 1000)}k</small>`; }
  function renderBar() {
    const D = H.data, items = [], tr = document.getElementById('pb-track'); if (!tr) return;
    const st = D.stale ? `<span class="pb-stale">${EN ? 'Last saved' : 'Giá lưu lúc'} ${new Date(D.stale).toLocaleString(EN ? 'en-US' : 'vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>` : (!EN && D.rowsStale && !D.live_rows ? `<span class="pb-stale">Giá trong nước lưu lúc ${new Date(D.rowsStale).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>` : !EN && D.fallback && !D.live_rows ? `<span class="pb-stale">${H.esc(D.vnSrc)}</span>` : '');
    if (st) items.push(st);
    if (EN) { // EN pages: international ticker only (no domestic VN gold brands)
      if (D.xau) items.push(`<span>XAU/USD ${H.fmt(D.xau, 2)}</span>`);
      if (D.xag) items.push(`<span>Silver (XAG/USD) ${H.fmt(D.xag, 2)}</span>`);
      if (D.dxy) items.push(`<span title="Computed from daily FX reference rates">DXY ~${H.fmt(D.dxy, 2)}</span>`);
      if (D.eur) items.push(`<span>EUR/USD ${H.fmt(D.eur, 4)}</span>`);
      if (D.jpy) items.push(`<span>USD/JPY ${H.fmt(D.jpy, 2)}</span>`);
      if (D.btc) items.push(`<span>BTC/USD ${H.fmt(D.btc)}</span>`);
      if (!items.length && !D.settled) return;
      const h = items.join('') || '<span>Prices temporarily unavailable – retrying…</span>';
      tr.innerHTML = h + h; return;
    }
    if (D.xau) items.push(`<span>🌍 XAU/USD ${H.fmt(D.xau, 1)}</span>`);
    if (D.world) items.push(`<span>Quy đổi ${H.fmt(D.world / 1e6, 2)} tr/lượng</span>`);
    D.rows.slice(0, 8).forEach(r => items.push(`<span>${H.esc(r.name)}: ${H.fmt(r.buy / 1e3)} – ${H.fmt(r.sell / 1e3)}${chg(r.change_sell)}</span>`));
    if (D.gap) items.push(`<span>Chênh SJC: +${H.fmt(D.gap / 1e6, 2)} tr</span>`);
    if (D.fx) items.push(`<span>USD/VND ${H.fmt(D.fx)}</span>`);
    if (!items.length && !D.settled) return;
    const html = items.join('') || '<span>Tạm thời chưa tải được giá – đang thử lại…</span>';
    tr.innerHTML = html + html;
  }
  /* ---- lịch live (giờ VN, GMT+7) ---- */
  H.liveNext = function (sessions, now = Date.now()) {
    const VN = 7 * 3600e3; let best = null;
    sessions.forEach(s => {
      const [hh, mm] = s.time.split(':').map(Number), vn = new Date(now + VN);
      for (let add = -1; add <= 7; add++) {
        const d = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + add, hh, mm) - VN);
        if (new Date(d.getTime() + VN).getUTCDay() !== s.day) continue;
        const end = d.getTime() + (s.duration || 60) * 60e3;
        if (end > now && (!best || d < best.start)) best = { ...s, start: d, end: new Date(end), live: d.getTime() <= now };
      }
    });
    return best;
  };
  H.countdown = ms => { if (ms <= 0) return 'Đang live'; const s = Math.floor(ms / 1e3), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (d ? d + ' ngày ' : '') + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };
  H.gcal = n => { const z = d => d.toISOString().replace(/[-:]|\.\d{3}/g, ''); return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(n.title) + '&dates=' + z(n.start) + '/' + z(n.end) + '&details=' + encodeURIComponent((n.desc || '') + '\nXem tại: https://www.youtube.com/@tradinglivexauusd4647/live') + '&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY') + '&ctz=Asia/Ho_Chi_Minh'; };
  H.schedule = H.getJSON('data/live-schedule.json').catch(() => null);
  H.schedule.then(sc => { if (!sc) return; const tick = () => { const n = H.liveNext(sc.sessions); document.getElementById('live-badge').hidden = !(n && n.live); }; tick(); setInterval(tick, 30000); });
  { const c = loadCache(); if (c && Date.now() - c.t < 3 * 864e5) { // hiển thị ngay giá đã lưu trong lúc chờ API
      ['xau', 'xag', 'btc', 'fx', 'eur', 'jpy', 'dxy'].forEach(k => { if (c[k] != null) H.data[k] = c[k]; }); if (c.rows && c.rows.length) { H.data.rows = c.rows; H.data.vnSrc = c.vnSrc; H.data.rowsStale = c.t; } H.data.stale = c.t; computeDerived(); try { renderBar(); } catch (e) { } } }
  setTimeout(() => { if (!H.data.settled) { H.data.settled = true; try { renderBar(); } catch (e) { } } }, 12000); // không bao giờ kẹt ở "Đang tải"
  H.refresh().catch(e => { console.error(e); H.data.settled = true; renderBar(); }); setInterval(() => H.refresh().catch(console.error), 60000);
  /* banner tin đỏ + web push (tùy chọn) */
  H.V = '20261019x';
  ['js/news-alert.js', 'js/push.js'].forEach(f => { const x = document.createElement('script'); x.src = H.ROOT + f + '?v=' + H.V; x.defer = true; document.head.appendChild(x); });
})();
