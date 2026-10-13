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
  H.LUONG = 37.5 / 31.1035; // 1,20565
  H.fmt = (n, d = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d });
  H.esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  H.dateVN = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  H.getJSON = async u => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };

  /* ---- giao diện ---- */
  const saved = localStorage.getItem('hmg_theme');
  H.theme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = saved || 'dark';
  H.onTheme = [];

  /* ---- menu ---- */
  const page = document.body.dataset.page || 'home';
  const M = [
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
    ['about', 'lien-he.html', '👤 Liên hệ']
  ];
  const menu = M.map(([k, href, label, sub, mega]) => `<li><a href="${href}" class="${k === page ? 'on' : ''}">${label}${sub ? ' ▾' : ''}</a>${sub ? `<div class="dd${mega ? ' mega' : ''}">${sub.map(s => `<a href="${s[0]}">${s[1]}<small>${s[2]}</small></a>`).join('')}</div>` : ''}</li>`).join('');

  const hdr = `
  <div class="pricebar" aria-label="Giá vàng"><div class="track" id="pb-track"><span>Đang tải giá vàng…</span></div></div>
  <header class="hdr"><div class="wrap">
    <a class="brand" href="index.html"><img src="assets/favicon.svg" width="34" height="34" alt="">Huymaster<b>Gold79</b></a>
    <ul class="menu" id="menu">${menu}</ul>
    <a href="live.html" id="live-badge" class="live-badge" hidden>● LIVE</a>
    <button class="icon-btn" id="theme-btn" title="Đổi giao diện sáng/tối" aria-label="Đổi giao diện">🌓</button>
    <button class="icon-btn burger" id="burger" aria-label="Menu">☰</button>
  </div></header>`;
  const ftr = `
  <footer><div class="wrap">
    <div class="cols">
      <div><a class="brand" href="index.html" style="display:flex"><img src="assets/favicon.svg" width="30" height="30" alt="">Huymaster<b>Gold79</b></a>
        <p class="muted small" style="margin-top:8px">Nhà phân tích vàng cá nhân. Chiến lược mỗi sáng cho người mua vàng vật chất tại Việt Nam.</p>
        <div class="share"><a href="${H.YT}" target="_blank" rel="noopener">▶ YouTube</a><a href="#" data-zalo>💬 Zalo</a><a class="tg-link" href="${H.TG}" target="_blank" rel="noopener">✈ Telegram</a><a href="mailto:${H.EMAIL}">✉ Email</a></div>
        <p class="small" style="margin-top:8px">🔴 Kênh live: <a href="${H.YT_LIVE}" target="_blank" rel="noopener">TRADING LIVE XAUUSD</a></p></div>
      <div><h4>Giá vàng</h4><a href="gia-vang.html#bang-gia">Bảng giá trong nước</a><a href="gia-vang.html#quy-doi">Quy đổi thế giới</a><a href="gia-vang.html#may-tinh">Máy tính vàng</a><a href="gia-vang.html#chenh-lech">Chênh lệch SJC</a></div>
      <div><h4>Phân tích</h4><a href="live.html">🔴 Phòng Live</a><a href="chien-luoc.html">Chiến lược hôm nay</a><a href="bieu-do.html">Biểu đồ toàn màn hình</a><a href="lich-kinh-te.html">Lịch kinh tế</a><a href="tin-tuc.html">Tin tức</a><a href="quy-forex.html">Quỹ Forex</a><a href="tai-khoan-follow.html">Tài khoản Follow</a></div>
      <div><h4>Thông tin</h4><a href="kien-thuc.html">Kiến thức</a><a href="lien-he.html">Về tôi</a><a href="lien-he.html#lien-he">Liên hệ</a><a href="mailto:${H.EMAIL}">${H.EMAIL}</a></div>
    </div>
    <p class="disc">⚠ <b>Miễn trừ trách nhiệm:</b> Nội dung chỉ mang tính tham khảo, là quan điểm cá nhân, <b>không phải lời khuyên đầu tư</b>. Giá quy đổi là ước tính, chưa gồm thuế phí. Dữ liệu từ bên thứ ba (TradingView, gold-api.com, open.er-api.com, vang.today) có thể chậm hoặc sai lệch.<br>© ${new Date().getFullYear()} HuymasterGold79.com.vn</p>
  </div></footer>
  <button class="zfloat" data-zalo aria-label="Kết bạn Zalo">Zalo</button>
  <div id="zalo-modal" class="modal" hidden><div class="modal-box"><button class="x" aria-label="Đóng">×</button>
    <h3 style="color:var(--gold)">Kết bạn Zalo – Ngọc Huy</h3><img src="assets/zalo-qr.jpg" alt="Mã QR Zalo Ngọc Huy">
    <p class="muted small">Quét mã bằng Zalo để nhận chiến lược mỗi sáng</p><a class="btn zalo" href="${H.ZALO}" target="_blank" rel="noopener">Mở Zalo</a></div></div>`;
  document.getElementById('site-header').outerHTML = hdr;
  document.getElementById('site-footer').outerHTML = ftr;

  document.getElementById('burger').onclick = () => document.body.classList.toggle('nav-open');
  document.getElementById('theme-btn').onclick = () => {
    const t = H.theme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t; localStorage.setItem('hmg_theme', t);
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
  H.refresh = async function () {
    const [g, s, b, f, v] = await Promise.all([
      safe(H.getJSON('https://api.gold-api.com/price/XAU')), safe(H.getJSON('https://api.gold-api.com/price/XAG')), safe(H.getJSON('https://api.gold-api.com/price/BTC')),
      safe(H.getJSON('https://open.er-api.com/v6/latest/USD')), safe(H.getJSON('https://www.vang.today/api/prices'))]);
    const D = H.data;
    if (g) D.xau = g.price; if (s) D.xag = s.price; if (b) D.btc = b.price; if (f && f.rates) D.fx = f.rates.VND;
    if (v && v.prices) {
      D.rows = BRANDS.filter(k => v.prices[k[0]] && v.prices[k[0]].sell).map(k => ({ ...v.prices[k[0]], name: k[1], type: k[2] }));
      D.vnSrc = 'vang.today · ' + (v.time || '') + ' ' + (v.date ? H.dateVN(v.date) : '');
    }
    if (!D.rows.length) {
      const j = await safe(H.getJSON('data/vn-prices.json'));
      if (j) { D.rows = j.prices.map(r => ({ name: r.name, type: /nhẫn/i.test(r.name) ? 'nhan' : 'mieng', buy: r.buy, sell: r.sell, change_buy: 0, change_sell: 0 })); D.vnSrc = 'Nhập tay · ' + new Date(j.updated).toLocaleString('vi-VN'); }
    }
    D.world = D.xau && D.fx ? D.xau * D.fx * H.LUONG : null;
    const sjc = D.rows.find(r => r.name === 'SJC'); D.sjcSell = sjc ? sjc.sell : null;
    D.gap = D.world && D.sjcSell ? D.sjcSell - D.world : null;
    D.time = new Date();
    if (D.world && D.sjcSell) { // lưu lịch sử chênh lệch mỗi ngày trên trình duyệt
      const k = 'hmg_gap', h = JSON.parse(localStorage.getItem(k) || '{}'); h[D.time.toISOString().slice(0, 10)] = { world: Math.round(D.world), sjc: D.sjcSell }; localStorage.setItem(k, JSON.stringify(h));
    }
    renderBar(); H.subs.forEach(fn => { try { fn(D); } catch (e) { console.error(e); } });
  };
  H.sub = fn => { H.subs.push(fn); if (H.data.time) fn(H.data); };
  function chg(n) { if (!n) return ''; return `<small class="${n > 0 ? 'u' : 'd'}">${n > 0 ? '▲' : '▼'}${H.fmt(Math.abs(n) / 1000)}k</small>`; }
  function renderBar() {
    const D = H.data, items = [];
    if (D.xau) items.push(`<span>🌍 XAU/USD ${H.fmt(D.xau, 1)}</span>`);
    if (D.world) items.push(`<span>Quy đổi ${H.fmt(D.world / 1e6, 2)} tr/lượng</span>`);
    D.rows.slice(0, 8).forEach(r => items.push(`<span>${H.esc(r.name)}: ${H.fmt(r.buy / 1e3)} – ${H.fmt(r.sell / 1e3)}${chg(r.change_sell)}</span>`));
    if (D.gap) items.push(`<span>Chênh SJC: +${H.fmt(D.gap / 1e6, 2)} tr</span>`);
    if (D.fx) items.push(`<span>USD/VND ${H.fmt(D.fx)}</span>`);
    const html = items.join('') || '<span>Không tải được giá</span>';
    document.getElementById('pb-track').innerHTML = html + html;
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
  H.refresh(); setInterval(H.refresh, 60000);
})();
