/* HuymasterGold79 v2 – các khối chức năng (tự kích hoạt nếu phần tử tồn tại trên trang) */
(function () {
  'use strict';
  const H = window.HMG, $ = id => document.getElementById(id), f = H.fmt;

  /* ---------- Ô giá nhanh ---------- */
  H.sub(D => {
    if ($('t-xau')) { $('t-xau').textContent = D.xau ? '$' + f(D.xau, 1) : '—'; $('t-xau-v').textContent = D.world ? '≈ ' + f(D.world / 1e6, 2) + ' tr/lượng' : ''; }
    if ($('t-xag')) { $('t-xag').textContent = D.xag ? '$' + f(D.xag, 2) : '—'; $('t-xag-v').textContent = D.xag && D.fx ? '≈ ' + f(D.xag * D.fx * H.LUONG / 1e6, 3) + ' tr/lượng' : ''; }
    if ($('t-btc')) { $('t-btc').textContent = D.btc ? '$' + f(D.btc) : '—'; $('t-btc-v').textContent = D.btc && D.fx ? '≈ ' + f(D.btc * D.fx / 1e9, 2) + ' tỷ/BTC' : ''; }
    if ($('t-gap')) { $('t-gap').textContent = D.gap ? '+' + f(D.gap / 1e6, 2) + ' tr' : '—'; $('t-gap-v').textContent = D.gap ? '+' + f(D.gap / D.world * 100, 2) + '% so với thế giới' : ''; }
    document.querySelectorAll('[data-upd]').forEach(e => e.textContent = D.time.toLocaleTimeString('vi-VN') + ' ' + D.time.toLocaleDateString('vi-VN'));
    document.querySelectorAll('[data-vnsrc]').forEach(e => e.textContent = D.vnSrc);
  });

  /* ---------- Bảng giá vàng miếng / nhẫn ---------- */
  const unit = { v: localStorage.getItem('hmg_unit') || 'luong' };
  function table(type) {
    const D = H.data, div = unit.v === 'chi' ? 10 : 1, rows = D.rows.filter(r => !type || r.type === type);
    const c = n => n ? `<span class="chg ${n > 0 ? 'up' : 'down'}">${n > 0 ? '▲' : '▼'}${f(Math.abs(n) / div / 1000)}</span>` : '<span class="chg muted">–</span>';
    return `<table class="tbl"><thead><tr><th>Thương hiệu</th><th>Mua vào</th><th>Bán ra</th><th>Tăng/giảm</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${H.esc(r.name)}</b></td><td>${f(r.buy / div / 1000)}</td><td><b>${f(r.sell / div / 1000)}</b></td><td>${c(r.change_buy)} ${c(r.change_sell)}</td></tr>`).join('') || '<tr><td colspan="4">Đang tải…</td></tr>'}</tbody></table><p class="muted small" style="margin-top:6px">Đơn vị: nghìn đồng/${unit.v === 'chi' ? 'chỉ' : 'lượng'}</p>`;
  }
  function drawTables() { document.querySelectorAll('[data-table]').forEach(el => el.innerHTML = table(el.dataset.table)); document.querySelectorAll('.unit-toggle button').forEach(b => b.classList.toggle('on', b.dataset.u === unit.v)); }
  document.addEventListener('click', e => { const b = e.target.closest('.unit-toggle button'); if (b) { unit.v = b.dataset.u; localStorage.setItem('hmg_unit', unit.v); drawTables(); } });
  H.sub(drawTables);

  /* ---------- Bộ quy đổi ---------- */
  const cx = $('c-xau'), cf = $('c-fx');
  if (cx) {
    let manual = false;
    const calc = () => {
      const w = +cx.value * +cf.value * H.LUONG, s = H.data.sjcSell;
      $('c-out').textContent = w ? f(w) + ' ₫' : '—';
      if ($('c-out1')) $('c-out1').textContent = w ? f(w * 1.01 / 1e6, 2) + ' tr' : '—';
      if ($('c-gap')) $('c-gap').textContent = w && s ? (s - w > 0 ? '+' : '') + f((s - w) / 1e6, 2) + ' tr (' + f((s - w) / w * 100, 2) + '%)' : '—';
    };
    [cx, cf].forEach(i => i.addEventListener('input', () => { manual = true; calc(); }));
    if ($('c-reset')) $('c-reset').onclick = () => { manual = false; H.refresh(); };
    H.sub(D => { if (!manual) { if (D.xau) cx.value = D.xau.toFixed(2); if (D.fx) cf.value = Math.round(D.fx); } calc(); });
  }

  /* ---------- Máy tính vàng ---------- */
  const qQty = $('k-qty');
  if (qQty) {
    const G = { luong: 37.5, chi: 3.75, gram: 1, oz: 31.1035, kg: 1000 };
    const run = () => {
      const D = H.data, grams = +qQty.value * G[$('k-unit').value], basis = $('k-basis').value;
      let perLuong = null, label = '';
      if (basis === 'world') { perLuong = D.world; label = 'giá thế giới quy đổi'; }
      else { const r = D.rows.find(x => x.name === basis); if (r) { perLuong = $('k-side').value === 'buy' ? r.buy : r.sell; label = basis + ($('k-side').value === 'buy' ? ' mua vào' : ' bán ra'); } }
      const v = perLuong ? perLuong / 37.5 * grams : null;
      $('k-out').textContent = v ? f(v) + ' ₫' : '—';
      $('k-info').textContent = v ? `${f(grams, 2)} gram = ${f(grams / 3.75, 2)} chỉ = ${f(grams / 37.5, 3)} lượng · theo ${label}` : 'Đang chờ dữ liệu giá…';
    };
    ['k-qty', 'k-unit', 'k-basis', 'k-side'].forEach(id => $(id).addEventListener('input', run));
    H.sub(D => {
      const sel = $('k-basis'), cur = sel.value;
      sel.innerHTML = '<option value="world">Thế giới quy đổi</option>' + D.rows.map(r => `<option>${H.esc(r.name)}</option>`).join('');
      sel.value = [...sel.options].some(o => o.value === cur) ? cur : (D.rows.length ? 'SJC' : 'world'); run();
    });
  }

  /* ---------- Biểu đồ chênh lệch SJC – thế giới ---------- */
  const gapEl = $('gap-chart');
  if (gapEl) {
    H.getJSON('data/gap-history.json').then(j => {
      const draw = () => {
        const m = {}; j.history.forEach(r => m[r.date] = { ...r, ex: j.example });
        const loc = JSON.parse(localStorage.getItem('hmg_gap') || '{}'); Object.entries(loc).forEach(([d, r]) => m[d] = { date: d, ...r, ex: false });
        const rows = Object.values(m).sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
        const W = 800, Hh = 260, p = 40, gaps = rows.map(r => (r.sjc - r.world) / 1e6), max = Math.max(...gaps) * 1.1, min = Math.min(0, Math.min(...gaps));
        const x = i => p + i * (W - p * 1.5) / Math.max(1, rows.length - 1), y = v => Hh - 28 - (v - min) / (max - min) * (Hh - 50);
        const pts = gaps.map((g, i) => `${x(i)},${y(g)}`).join(' ');
        const ticks = [0, .25, .5, .75, 1].map(t => min + (max - min) * t);
        gapEl.innerHTML = `<svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none">
          ${ticks.map(t => `<line x1="${p}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="currentColor" opacity=".1"/><text x="2" y="${y(t) + 4}" font-size="11" fill="currentColor" opacity=".6">${f(t, 1)}tr</text>`).join('')}
          <polygon points="${x(0)},${y(min)} ${pts} ${x(rows.length - 1)},${y(min)}" fill="rgba(240,185,11,.18)"/>
          <polyline points="${pts}" fill="none" stroke="#f0b90b" stroke-width="2.5"/>
          ${rows.map((r, i) => i % Math.ceil(rows.length / 8) === 0 ? `<text x="${x(i)}" y="${Hh - 8}" font-size="11" text-anchor="middle" fill="currentColor" opacity=".6">${r.date.slice(8)}/${r.date.slice(5, 7)}</text>` : '').join('')}
          ${rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(gaps[i])}" r="${r.ex ? 2.5 : 4.5}" fill="${r.ex ? '#f0b90b' : '#16c784'}"><title>${H.dateVN(r.date)}: +${f(gaps[i], 2)} tr/lượng${r.ex ? ' (ví dụ)' : ''}</title></circle>`).join('')}
        </svg>`;
        const last = rows[rows.length - 1]; if ($('gap-last')) $('gap-last').textContent = last ? `+${f(gaps[gaps.length - 1], 2)} tr/lượng (${H.dateVN(last.date)})` : '';
      };
      draw(); H.sub(draw);
    }).catch(e => { gapEl.textContent = 'Không tải được dữ liệu chênh lệch.'; console.warn(e); });
  }

  /* ---------- Sổ tích lũy (localStorage) ---------- */
  const book = $('book');
  if (book) {
    const K = 'hmg_book', load = () => JSON.parse(localStorage.getItem(K) || '[]'), save = a => localStorage.setItem(K, JSON.stringify(a));
    const draw = () => {
      const a = load(), D = H.data; let cost = 0, val = 0;
      const rows = a.map((r, i) => {
        const now = D.rows.find(x => x.name === r.brand), cur = now ? now.buy / 10 * r.chi : null; cost += r.price * r.chi; val += cur || 0;
        const pl = cur ? cur - r.price * r.chi : null;
        return `<tr><td>${H.esc(r.date)}<br><small class="muted">${H.esc(r.brand)}</small></td><td>${f(r.chi, 2)} chỉ</td><td>${f(r.price)}</td><td>${cur ? f(cur) : '—'}</td><td class="${pl >= 0 ? 'up' : 'down'}">${pl == null ? '—' : (pl >= 0 ? '+' : '') + f(pl)}</td><td><button class="icon-btn" style="width:30px;height:30px" data-del="${i}" title="Xoá">✕</button></td></tr>`;
      }).join('');
      book.innerHTML = a.length ? `<table class="tbl"><thead><tr><th>Ngày / loại</th><th>Số lượng</th><th>Giá mua/chỉ</th><th>Giá trị nay*</th><th>Lãi/lỗ</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        <p style="margin-top:10px"><b>Tổng vốn:</b> ${f(cost)} ₫ · <b>Giá trị nếu bán:</b> ${f(val)} ₫ · <b class="${val - cost >= 0 ? 'up' : 'down'}">${val - cost >= 0 ? '+' : ''}${f(val - cost)} ₫</b></p><p class="muted small">*Tính theo giá MUA VÀO hiện tại của thương hiệu (giá tiệm mua lại của bạn).</p>`
        : '<p class="muted">Chưa có giao dịch. Thêm lần mua vàng đầu tiên của bạn ở trên – dữ liệu chỉ lưu trên trình duyệt này, không gửi đi đâu.</p>';
      const sel = $('b-brand'); if (sel && D.rows.length && sel.options.length < 2) sel.innerHTML = D.rows.map(r => `<option>${H.esc(r.name)}</option>`).join('');
    };
    $('b-date').value = new Date().toISOString().slice(0, 10);
    $('book-form').addEventListener('submit', e => { e.preventDefault(); const a = load(); a.push({ date: $('b-date').value, brand: $('b-brand').value, chi: +$('b-chi').value, price: +$('b-price').value * 1000 }); save(a); e.target.reset(); $('b-date').value = new Date().toISOString().slice(0, 10); draw(); });
    book.addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) { const a = load(); a.splice(+b.dataset.del, 1); save(a); draw(); } });
    H.sub(draw);
  }

  /* ---------- Chiến lược ---------- */
  const trendCls = { up: 'up', down: 'down', side: 'side' };
  const TI = { up: ['🔺', 'Tăng'], down: ['🔻', 'Giảm'], side: ['↔️', 'Đi ngang'] };
  function sumHTML(s) {
    const m = s.summary; if (!m) return '';
    const t = TI[m.trend || s.trendType] || TI.side, E = H.esc;
    const z = (o, c, ic, lb) => o && o.zone ? `<div class="z ${c}">${ic} ${lb} <b>${E(o.zone)}</b>${o.sl ? ` <span class="k">| SL</span> ${E(o.sl)}` : ''}${o.tp ? ` <span class="k">| TP</span> ${E(o.tp)}` : ''}</div>` : '';
    return `<div class="h79s"><div class="t ${m.trend || s.trendType || 'side'}">Xu hướng: ${t[0]} ${E(m.trendText || t[1])}</div>${z(m.sell, 'sell', '🔴', 'BÁN')}${z(m.buy, 'buy', '🟢', 'MUA')}${m.note ? `<div class="n">⚠️ ${E(m.note)}</div>` : ''}${m.priceNote ? `<div class="p">💲 ${m.price === 'spot' ? '✅' : '⚠️'} ${E(m.priceNote)}</div>` : ''}</div>`;
  }
  function strategyHTML(s, compact) {
    const lv = `<div class="lv">${(s.support || []).map(v => `<span class="pill s">HT ${f(v)}</span>`).join('')}${(s.resistance || []).map(v => `<span class="pill r">KC ${f(v)}</span>`).join('')}</div>`;
    if (compact) return `<span class="tag">⚡ NHẬN ĐỊNH NHANH · ${s.session ? H.esc(s.session) + ' · ' : ''}${s.time ? H.esc(s.time) + ' ' : ''}${H.dateVN(s.date)}</span> <span class="badge ex">H79 NHẬN ĐỊNH</span>
      <h2>${H.esc(s.title)}</h2>${sumHTML(s)}${s.summary ? '<details class="h79more"><summary>Xem thêm</summary>' : ''}<p>Xu hướng: <span class="badge ${trendCls[s.trendType] || 'side'}">${H.esc(s.trend)}</span></p>${lv}
      <p class="small"><b>🏅 Lời khuyên:</b> ${H.esc(s.physicalAdvice)}</p>${s.summary ? '</details>' : ''}${s.dataTime ? `<p class="small muted" style="margin-top:6px">🕐 ${H.esc(s.dataTime)}</p>` : ''}${s.disclaimer ? `<p class="small muted"><i>${H.esc(s.disclaimer)}</i></p>` : ''}<a class="btn" style="margin-top:10px" href="chien-luoc.html">Xem kế hoạch đầy đủ →</a>`;
    return `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px"><div><span class="muted">📅 ${s.session ? H.esc(s.session) + ' · ' : ''}${s.time ? H.esc(s.time) + ' ' : ''}${H.dateVN(s.date)}</span><h2 style="font-size:1.4rem;color:var(--txt);margin:4px 0">${H.esc(s.title)}</h2></div>
      <div><span class="badge ex">H79 NHẬN ĐỊNH</span>${s.summary ? '' : ` <span class="badge ${trendCls[s.trendType] || 'side'}">Xu hướng: ${H.esc(s.trend)}</span>`}</div></div>${sumHTML(s)}${s.summary ? `<details class="h79more"><summary>Xem thêm: chỉ báo, kịch bản, vĩ mô</summary><p><b>Xu hướng chi tiết:</b> ${H.esc(s.trend)}</p>` : ''}
      <div class="grid g3" style="margin:14px 0">
        <div class="card"><h3>🟢 Hỗ trợ (USD/oz)</h3>${(s.support || []).map(v => `<span class="pill s">${f(v)}</span> `).join('')}</div>
        <div class="card"><h3>🔴 Kháng cự (USD/oz)</h3>${(s.resistance || []).map(v => `<span class="pill r">${f(v)}</span> `).join('')}</div>
        <div class="card"><h3>🎯 Vùng mua</h3><ul style="padding-left:18px">${(s.entryZones || []).map(z => `<li>${H.esc(z)}</li>`).join('')}</ul>${(s.sellZones || []).length ? `<h3 style="margin-top:10px">🔻 Vùng bán</h3><ul style="padding-left:18px">${s.sellZones.map(z => `<li>${H.esc(z)}</li>`).join('')}</ul>` : ''}</div></div>
      ${(s.scenarios || []).length ? `<div class="card" style="margin:0 0 12px"><h3>🧭 Kế hoạch & kịch bản</h3><ul style="padding-left:18px">${s.scenarios.map(z => `<li>${H.esc(z)}</li>`).join('')}</ul></div>` : ''}<div class="note"><b>🏅 Lời khuyên:</b> ${H.esc(s.physicalAdvice)}</div>${(s.macro || []).length ? `<div class="card" style="margin-top:12px"><h3>🌐 Bối cảnh vĩ mô</h3><ul style="padding-left:18px" class="small">${s.macro.map(z => `<li>${H.esc(z)}</li>`).join('')}</ul></div>` : ''}${s.notes ? `<p class="muted small" style="margin-top:8px">📝 ${H.esc(s.notes)}</p>` : ''}${s.dataTime ? `<p class="small muted" style="margin-top:6px">🕐 ${H.esc(s.dataTime)}</p>` : ''}${s.disclaimer ? `<p class="small muted"><i>${H.esc(s.disclaimer)}</i></p>` : ''}${s.summary ? '</details>' : ''}<div class="rx" data-rx="cl|${H.esc(s.id || s.date)}"></div>${H.shareHTML('Chiến lược vàng ' + H.dateVN(s.date) + ' – HuymasterGold79')}`;
  }
  if ($('quick') || $('strategy')) {
    H.getJSON('data/strategies.json').then(d => {
      const key = s => s.id || s.date, list = (d.strategies || []).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))); if (!list.length) return;
      if ($('quick')) $('quick').innerHTML = strategyHTML(list[0], true);
      if ($('strategy')) {
        const want = new URLSearchParams(location.search).get('ngay'), show = s => { $('strategy').innerHTML = strategyHTML(s); arc.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.d === key(s))); };
        const arc = $('archive');
        arc.innerHTML = list.map(s => `<button type="button" data-d="${H.esc(key(s))}"><b>${H.dateVN(s.date)}${s.time ? ' ' + H.esc(s.time) : ''}</b>${s.session ? ' · ' + H.esc(s.session) : ''} – ${(() => { const m = s.summary || {}, t = TI[m.trend || s.trendType] || TI.side; return `${t[0]} ${H.esc(m.trendText || t[1])}${m.sell && m.sell.zone ? ' · 🔴 BÁN ' + H.esc(m.sell.zone) : ''}${m.buy && m.buy.zone ? ' · 🟢 MUA ' + H.esc(m.buy.zone) : ''}`; })()}</button>`).join('');
        arc.onclick = e => { const b = e.target.closest('button'); if (b) { show(list.find(s => key(s) === b.dataset.d)); scrollTo({ top: 0, behavior: 'smooth' }); } };
        show(list.find(s => key(s) === want) || list.find(s => s.date === want) || list[0]);
      }
    }).catch(e => console.warn(e));
  }

  /* ---------- Biểu đồ TradingView + bộ chọn mã ---------- */
  const box = $('tv-chart');
  if (box) {
    const KEY = 'hmg_symbol', q = new URLSearchParams(location.search).get('symbol');
    let symbol = (q || localStorage.getItem(KEY) || 'OANDA:XAUUSD').toUpperCase(), draw = null, data = null, cat = 0;
    const cfg = t => ({ autosize: true, symbol, interval: /^(HNX|UPCOM|HOSE):/.test(symbol) ? 'D' : '45', timezone: 'Asia/Ho_Chi_Minh', theme: t, style: '1', locale: 'vi_VN',
      allow_symbol_change: true, calendar: false, hide_side_toolbar: false, hide_top_toolbar: false, hide_legend: false, withdateranges: true, details: box.dataset.details !== 'false',
      show_popup_button: true, popup_width: '1200', popup_height: '750', save_image: true, hide_volume: true, backgroundColor: t === 'dark' ? 'rgba(13,17,23,1)' : 'rgba(255,253,247,1)',
      studies: [{ id: 'BB@tv-basicstudies', inputs: { length: 90, mult: 2 } }, { id: 'MASimple@tv-basicstudies', inputs: { length: 34 } }, { id: 'MASimple@tv-basicstudies', inputs: { length: 89 } }, { id: 'MACD@tv-basicstudies', inputs: { fastLength: 12, slowLength: 26, signalLength: 9 } }, { id: 'RSI@tv-basicstudies', inputs: { length: 14 } }],
      support_host: 'https://www.tradingview.com' });
    H.lazy(box, () => { draw = H.tv(box, 'embed-widget-advanced-chart.js', cfg); });
    const mark = () => { document.querySelectorAll('[data-s]').forEach(c => c.classList.toggle('active', c.dataset.s === symbol)); if ($('cur-sym')) $('cur-sym').textContent = symbol; };
    const set = s => { symbol = s; localStorage.setItem(KEY, s); const u = new URL(location.href); u.searchParams.set('symbol', s); history.replaceState(null, '', u); mark(); if (draw) draw(); };
    document.addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (b) set(b.dataset.s); });
    if ($('fs-btn')) $('fs-btn').onclick = () => { const el = box.parentElement; document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen && el.requestFullscreen(); };
    const tabs = $('sym-tabs'), list = $('sym-list'), search = $('sym-search');
    const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
    const chip = x => `<button type="button" class="chip" data-s="${H.esc(x.s)}"><b>${H.esc(x.s.split(':')[1])}</b><span>${H.esc(x.n)}</span></button>`;
    const drawList = () => {
      const t = norm(search.value.trim()), items = t ? data.categories.flatMap(c => c.symbols).filter(x => norm(x.s + ' ' + x.n).includes(t)) : data.categories[cat].symbols;
      list.innerHTML = items.map(chip).join('') || '<p class="muted small">Không tìm thấy.</p>';
      tabs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', !t && i === cat)); mark();
    };
    if (tabs) H.getJSON('data/symbols.json').then(d => {
      data = d; const n = d.categories.reduce((a, c) => a + c.symbols.length, 0);
      $('sym-total').textContent = n; search.placeholder = `🔍 Tìm trong ${n} mã (FPT, cà phê, dầu…)`;
      tabs.innerHTML = d.categories.map((c, i) => `<button type="button" data-i="${i}">${H.esc(c.name)} ${c.symbols.length}</button>`).join('');
      tabs.onclick = e => { const b = e.target.closest('button'); if (b) { cat = +b.dataset.i; search.value = ''; drawList(); } };
      const ci = d.categories.findIndex(c => c.symbols.some(x => x.s === symbol)); if (ci >= 0) cat = ci;
      search.oninput = () => { if (search.value) search.closest('details').open = true; drawList(); };
      drawList();
      if ($('ext-list')) $('ext-list').innerHTML = d.external.map(x => `<a class="chip" target="_blank" rel="noopener" href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(x.s)}"><b>${H.esc(x.s.split(':')[1])} ↗</b><span>${H.esc(x.n)}</span></a>`).join('');
    }).catch(e => console.warn(e));
    mark();
  }

  /* ---------- Widget phụ: tin tức, lịch kinh tế, mini chart ---------- */
  const news = $('tv-news');
  if (news) H.lazy(news, () => H.tv(news, 'embed-widget-timeline.js', t => ({ feedMode: 'symbol', symbol: news.dataset.symbol || 'OANDA:XAUUSD', colorTheme: t, isTransparent: true, displayMode: 'regular', width: '100%', height: '100%', locale: 'vi_VN' })));
  const cal = $('tv-cal');
  if (cal) H.lazy(cal, () => H.tv(cal, 'embed-widget-events.js', t => ({ colorTheme: t, isTransparent: true, width: '100%', height: '100%', locale: 'vi_VN', importanceFilter: cal.dataset.imp || '0,1', countryFilter: 'us,eu,cn,jp,gb,vn' })));
  document.querySelectorAll('[data-mini]').forEach(el => H.lazy(el, () => H.tv(el, 'embed-widget-mini-symbol-overview.js', t => ({ symbol: el.dataset.mini, width: '100%', height: '100%', locale: 'vi_VN', dateRange: '1M', colorTheme: t, isTransparent: true, autosize: true }))));
})();
