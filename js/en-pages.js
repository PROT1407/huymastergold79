/* HuymasterGold79 – English page renderers (en/*.html). VI pages never load this file.
   Data stays in Vietnam time (Asia/Ho_Chi_Minh) in JSON; everything is shown in US Eastern (America/New_York, auto DST).
   Reads optional *_en fields; items without English copy are left out rather than shown in Vietnamese. */
(function () {
  'use strict';
  const H = window.HMG, $ = id => document.getElementById(id), E = H.esc, NY = 'America/New_York';
  const fmt = (d, o) => new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: NY }, o)).format(d);
  const et = d => fmt(d, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
  const etT = d => fmt(d, { hour: 'numeric', minute: '2-digit' }) + ' ET';
  const etD = d => fmt(d, { month: 'short', day: 'numeric', year: 'numeric' });
  const dayKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: NY }).format(d);
  const loc = d => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  const tm = d => `<time datetime="${d.toISOString()}" title="Your local time: ${E(loc(d))}">${E(et(d))}</time>`;
  // "07:23 14/10/2026" or "2026-10-14 06:55 (UTC+7)" (Vietnam time) -> Date
  const vnParse = s => { let m = /(\d\d):(\d\d) (\d\d)\/(\d\d)\/(\d{4})/.exec(s || ''); if (m) return new Date(Date.UTC(+m[5], m[4] - 1, +m[3], m[1] - 7, +m[2]));
    m = /(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/.exec(s || ''); if (m) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3], m[4] - 7, +m[5])); return null; };
  const ymd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
  const dShort = s => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(ymd(s));
  const f = (n, d = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const cd = (ms, labels = ['d', 'h', 'm', 's']) => { const s = Math.max(0, Math.floor(ms / 1e3)); return [[Math.floor(s / 86400), labels[0]], [Math.floor(s % 86400 / 3600), labels[1]], [Math.floor(s % 3600 / 60), labels[2]], [s % 60, labels[3]]]; };
  const cdBox = p => p.map(x => `<div><b>${String(x[0]).padStart(2, '0')}</b><small>${x[1]}</small></div>`).join('');
  const sample = ex => ex ? '<span class="badge ex">SAMPLE DATA – NOT REAL RESULTS</span>' : '';

  /* ---------- TradingView widgets (same chart defaults as js/app.js, English locale, ET) ---------- */
  document.querySelectorAll('[data-mini]').forEach(el => H.lazy(el, () => H.tv(el, 'embed-widget-mini-symbol-overview.js', t => ({ symbol: el.dataset.mini, width: '100%', height: '100%', locale: 'en', dateRange: el.dataset.range || '1M', colorTheme: t, isTransparent: true, autosize: true }))));
  const news = $('tv-news');
  if (news) H.lazy(news, () => H.tv(news, 'embed-widget-timeline.js', t => ({ feedMode: 'symbol', symbol: news.dataset.symbol || 'OANDA:XAUUSD', colorTheme: t, isTransparent: true, displayMode: 'regular', width: '100%', height: '100%', locale: 'en' })));
  const cal = $('tv-cal');
  if (cal) H.lazy(cal, () => H.tv(cal, 'embed-widget-events.js', t => ({ colorTheme: t, isTransparent: true, width: '100%', height: '100%', locale: 'en', importanceFilter: cal.dataset.imp || '0,1', countryFilter: 'us,eu,cn,jp,gb' })));
  const box = $('tv-chart');
  if (box) {
    const KEY = 'hmg_symbol', q = new URLSearchParams(location.search).get('symbol');
    let symbol = (q || localStorage.getItem(KEY) || 'OANDA:XAUUSD').toUpperCase(), draw = null, data = null, cat = 0;
    const cfg = t => ({ autosize: true, symbol, interval: /^(HNX|UPCOM|HOSE):/.test(symbol) ? 'D' : '45', timezone: NY, theme: t, style: '1', locale: 'en',
      allow_symbol_change: true, calendar: false, hide_side_toolbar: false, hide_top_toolbar: false, hide_legend: false, withdateranges: true, details: true,
      show_popup_button: true, popup_width: '1200', popup_height: '750', save_image: true, hide_volume: false, backgroundColor: t === 'dark' ? 'rgba(13,17,23,1)' : 'rgba(255,253,247,1)',
      studies: [{ id: 'BB@tv-basicstudies', inputs: { length: 90, mult: 2 } }, { id: 'MASimple@tv-basicstudies', inputs: { length: 34 } }, { id: 'MASimple@tv-basicstudies', inputs: { length: 89 } }, { id: 'MACD@tv-basicstudies', inputs: { fastLength: 12, slowLength: 26, signalLength: 9 } }, { id: 'RSI@tv-basicstudies', inputs: { length: 14 } }],
      support_host: 'https://www.tradingview.com' });
    H.lazy(box, () => { draw = H.tv(box, 'embed-widget-advanced-chart.js', cfg); });
    const mark = () => { document.querySelectorAll('[data-s]').forEach(c => c.classList.toggle('active', c.dataset.s === symbol)); if ($('cur-sym')) $('cur-sym').textContent = symbol; };
    const set = s => { symbol = s; localStorage.setItem(KEY, s); const u = new URL(location.href); u.searchParams.set('symbol', s); history.replaceState(null, '', u); mark(); if (draw) draw(); };
    document.addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (b) set(b.dataset.s); });
    if ($('fs-btn')) $('fs-btn').onclick = () => { const el = box.parentElement; document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen && el.requestFullscreen(); };
    const tabs = $('sym-tabs'), list = $('sym-list'), search = $('sym-search');
    const nm = x => x.n_en || x.n;
    const chip = x => `<button type="button" class="chip" data-s="${E(x.s)}"><b>${E(x.s.split(':')[1])}</b><span>${E(nm(x))}</span></button>`;
    const drawList = () => {
      const t = search.value.trim().toLowerCase(), items = t ? data.categories.flatMap(c => c.symbols).filter(x => (x.s + ' ' + nm(x)).toLowerCase().includes(t)) : data.categories[cat].symbols;
      list.innerHTML = items.map(chip).join('') || '<p class="muted small">No matches.</p>';
      tabs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', !t && i === cat)); mark();
    };
    if (tabs) H.getJSON('data/symbols.json').then(d => {
      data = d; const n = d.categories.reduce((a, c) => a + c.symbols.length, 0);
      $('sym-total').textContent = n; search.placeholder = `🔍 Search ${n} symbols (copper, oil, SPY…)`;
      tabs.innerHTML = d.categories.map((c, i) => `<button type="button" data-i="${i}">${E(c.name_en || c.name)} ${c.symbols.length}</button>`).join('');
      tabs.onclick = e => { const b = e.target.closest('button'); if (b) { cat = +b.dataset.i; search.value = ''; drawList(); } };
      const ci = d.categories.findIndex(c => c.symbols.some(x => x.s === symbol)); if (ci >= 0) cat = ci;
      search.oninput = () => { if (search.value) search.closest('details').open = true; drawList(); };
      drawList();
      if ($('ext-list')) $('ext-list').innerHTML = d.external.filter(x => !/^HOSE:/.test(x.s)).map(x => `<a class="chip" target="_blank" rel="noopener" href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(x.s)}"><b>${E(x.s.split(':')[1])} ↗</b><span>${E(nm(x))}</span></a>`).join('');
    }).catch(e => console.warn(e));
    mark();
  }

  /* ---------- Macro news + FOMC (data/macro-news.json) ---------- */
  const CAT = { 'Chiến tranh': ['⚔️', 'War & geopolitics'], 'Lạm phát': ['🔥', 'Inflation'], 'Fed': ['🏦', 'Fed'], 'FOMC': ['🏛', 'FOMC'], 'Lợi suất': ['📈', 'Yields'], 'Trái phiếu': ['🧾', 'Bonds'],
    'Tương quan': ['🔗', 'Cross-asset'], 'Ngân hàng TW': ['🪙', 'Central banks'], 'Vàng': ['🥇', 'Gold'], 'Dầu mỏ': ['🛢', 'Oil'] };
  const IMP = { 'tăng': ['up', '▲ Bullish gold'], 'giảm': ['down', '▼ Bearish gold'], 'trung lập': ['side', '◆ Neutral'] };
  const cat = c => CAT[c] || ['📰', c];
  const src = s => s && s.url ? `<a href="${E(s.url)}" target="_blank" rel="noopener">${E(s.name_en || s.name)} ↗</a>` : '';
  const mcard = (it, full, i) => { const c = cat(it.category), im = IMP[it.impact] || IMP['trung lập'];
    return `<article class="card macro-item anim i-${im[0]}" style="animation-delay:${Math.min(i || 0, 10) * 60}ms">${full ? `<span class="tl-date">${E(dShort(it.date))}</span>` : ''}
    <div class="mi-head"><span class="mi-ic" title="${E(c[1])}">${c[0]}</span><span class="badge side">${E(c[1])}</span><span class="muted small">${E(dShort(it.date))}</span>${it.priority === 1 ? '<span class="badge ex">Direct impact</span>' : ''}<span class="imp ${im[0]}">${im[1]}</span></div>
    <h3 style="color:var(--txt);margin:8px 0 2px;font-size:1.02rem">${E(it.title_en)}</h3>${it.time_en ? `<span class="mi-time">🕐 ${E(it.time_en)}</span>` : ''}
    ${full ? `<p class="small" style="margin-top:8px">${E(it.summary_en || '')}</p>${it.reason_en ? `<p class="small" style="margin-top:6px"><b>Gold impact:</b> ${E(it.reason_en)}</p>` : ''}${it.check_en ? `<p class="small note" style="margin:8px 0 0">⚠ ${E(it.check_en)}</p>` : ''}` : `<p class="small muted" style="margin-top:6px">${E(it.reason_en || '')}</p>`}
    <p class="small" style="margin-top:8px">Source: ${src(it.source)}${it.source2 ? ' · ' + src(it.source2) : ''}</p></article>`; };
  if ($('macro') || $('fomc') || $('macro-home') || document.querySelector('[data-fomc-cd]')) H.getJSON('data/macro-news.json').then(d => {
    const items = d.items.filter(x => x.title_en).sort((a, b) => (a.priority || 2) - (b.priority || 2) || b.date.localeCompare(a.date));
    if ($('macro')) {
      const cats = ['All'].concat([...new Set(items.map(x => x.category))]);
      $('macro-chips').innerHTML = cats.map((c, i) => `<button type="button" data-c="${E(c)}" class="${i ? '' : 'on'}">${E(i ? cat(c)[1] : 'All')} <small>${i ? items.filter(x => x.category === c).length : items.length}</small></button>`).join('');
      const draw = c => { $('macro').innerHTML = items.filter(x => c === 'All' || x.category === c).map((x, i) => mcard(x, true, i)).join('') || '<p class="muted">No stories yet.</p>'; $('macro-chips').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.c === c)); };
      $('macro-chips').onclick = ev => { const b = ev.target.closest('button'); if (b) draw(b.dataset.c); };
      draw('All');
      const top = items.filter(x => x.priority === 1).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (top && $('macro-hl')) $('macro-hl').innerHTML = mcard(top, true, 0).replace('<div class="mi-head">', '<div class="mi-head"><span class="tag">★ TOP STORY</span>');
      $('macro-upd').textContent = dShort(d.updated);
    }
    if ($('macro-home')) $('macro-home').innerHTML = items.slice(0, 4).map((x, i) => mcard(x, false, i)).join('');
    if ($('us-sched')) $('us-sched').innerHTML = `<table class="tbl"><thead><tr><th>US release</th><th>Time (ET)</th></tr></thead><tbody>${d.us_schedule.map(x => { const m = /(\d\d):(\d\d)/.exec(x.et || ''), h = m ? +m[1] : 0; return `<tr><td style="text-align:left">${E(x.event_en || x.et)}</td><td><b>${m ? (h % 12 || 12) + ':' + m[2] + (h < 12 ? ' AM' : ' PM') : E(x.et)}</b></td></tr>`; }).join('')}</tbody></table>`;
    const m = d.fomc.meetings, box = $('fomc');
    if (box) box.innerHTML = `<table class="tbl"><thead><tr><th>2026 meeting</th><th>Decision</th><th></th></tr></thead><tbody>${m.map(x => { const t = new Date(x.decision), s = new Date(t - 864e5); return `<tr data-t="${t.getTime()}"><td><b>${fmt(s, { month: 'short', day: 'numeric' })}–${fmt(t, { day: 'numeric' })}</b>${x.sep ? ' *' : ''}${x.result_en ? `<br><small class="muted">${E(x.result_en)}</small>` : ''}</td><td>${tm(t)}</td><td class="st"></td></tr>`; }).join('')}</tbody></table>
      <p class="small muted" style="margin-top:6px">${E(d.fomc.note_en || '* = with economic projections (dot plot).')} Source: <a href="${E(d.fomc.source.url)}" target="_blank" rel="noopener">${E(d.fomc.source.name)} ↗</a></p>`;
    const tick = () => {
      const now = Date.now(), n = m.map(x => new Date(x.decision)).find(t => t > now), prev = m.map(x => new Date(x.decision)).filter(t => t <= now).pop();
      document.querySelectorAll('[data-fomc-cd]').forEach(el => { el.innerHTML = n ? cdBox(cd(n - now, ['days', 'hrs', 'min', 'sec'])) : 'No more 2026 meetings'; });
      document.querySelectorAll('[data-fomc-bar]').forEach(el => el.style.width = (n && prev ? Math.min(100, (now - prev) / (n - prev) * 100) : 0).toFixed(2) + '%');
      if (box) box.querySelectorAll('tr[data-t]').forEach(r => { const t = +r.dataset.t; r.querySelector('.st').innerHTML = t < now ? '<span class="muted small">Done</span>' : (n && t === n.getTime() ? '<span class="badge ex">Next</span>' : ''); r.style.opacity = t < now ? .55 : 1; });
    };
    tick(); setInterval(tick, 1000);
  }).catch(err => { console.warn(err); if ($('macro')) $('macro').textContent = "Couldn't load the macro feed."; });

  /* ---------- CME FedWatch (data/fedwatch.json) ---------- */
  const fwFull = $('fedwatch'), fwMini = $('fedwatch-mini');
  if (fwFull || fwMini) {
    const CME = 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html';
    const Rg = r => (r[0] / 100).toFixed(2) + '–' + (r[1] / 100).toFixed(2) + '%', pc = v => v.toFixed(1) + '%';
    const kind = (r, cur) => r[0] === cur[0] ? ['hold', 'Hold'] : r[0] < cur[0] ? ['cut', 'Cut ' + (cur[0] - r[0]) + ' bp'] : ['hike', 'Hike ' + (r[0] - cur[0]) + ' bp'];
    const pending = el => el && (el.innerHTML = `<div class="fw-pending">⏳ FedWatch data is <b>being updated</b>. See it live at <a href="${CME}" target="_blank" rel="noopener">CME FedWatch ↗</a></div>`);
    const lbl = x => x.label_en || (() => { const t = new Date(x.decision), s = new Date(t - 864e5); return `${fmt(s, { month: 'short', day: 'numeric' })}–${fmt(t, { day: 'numeric' })}, ${fmt(t, { year: 'numeric' })}`; })();
    H.getJSON('data/fedwatch.json').then(d => {
      const m = (d.meetings || []).filter(x => new Date(x.decision) > Date.now() - 864e5);
      if (!m.length || !d.current_range) { pending(fwFull); pending(fwMini); return; }
      const cur = d.current_range, n = m[0], upd = vnParse(d.updated_vn);
      const sum = (x, k) => x.probs.filter(p => kind(p.range, cur)[0] === k).reduce((a, p) => a + p.p, 0);
      const pill = x => ['cut', 'hold', 'hike'].map(k => `<span class="fw-pill ${k}">${({ cut: '⬇ Cut', hold: '⏸ Hold', hike: '⬆ Hike' })[k]} <b>${pc(sum(x, k))}</b></span>`).join('');
      const bars = x => x.probs.slice().sort((a, b) => a.range[0] - b.range[0]).map(p => { const [k, t] = kind(p.range, cur); return `<div class="fw-row"><div class="fw-lb"><b>${Rg(p.range)}</b><small class="${k}">${t}</small></div><div class="fw-track"><i class="${k}" style="--w:${p.p}%"></i></div><b class="fw-v">${pc(p.p)}</b></div>`; }).join('');
      const head = `<div class="fw-head"><div><small class="muted">Next FOMC</small><b>${E(lbl(n))}</b></div><div><small class="muted">Current target range</small><b>${Rg(cur)}</b></div></div>`;
      const srcs = `Source: <a href="${E(d.cme_url || CME)}" target="_blank" rel="noopener">CME FedWatch ↗</a> via <a href="${E(d.source.url)}" target="_blank" rel="noopener">${E((d.source.name || '').replace(/\(trích CME FedWatch\)/, '(citing CME FedWatch)'))}</a>${upd ? ' · updated ' + tm(upd) : ''}`;
      if (fwMini) fwMini.innerHTML = head + `<div class="fw-pills">${pill(n)}</div>${bars(n)}<p class="small muted fw-src">${srcs} · <a href="en/news.html#fedwatch-sec">Details →</a></p>`;
      if (fwFull) {
        const rs = [...new Set(m.flatMap(x => x.probs.map(p => p.range[0])))].sort((a, b) => a - b);
        const tbl = `<div class="tbl-wrap"><table class="tbl fw-tbl"><thead><tr><th>Meeting</th>${rs.map(r => `<th>${Rg([r, r + 25])}</th>`).join('')}</tr></thead><tbody>${m.map(x => { const mx = Math.max(...x.probs.map(q => q.p)); return `<tr><td><b>${E(lbl(x))}</b></td>${rs.map(r => { const p = x.probs.find(q => q.range[0] === r); return `<td class="${p && p.p === mx ? 'fw-max' : ''}">${p ? pc(p.p) : '–'}</td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>`;
        fwFull.innerHTML = `<div class="grid fw-grid"><div>${head}<div class="fw-pills">${pill(n)}</div>${bars(n)}</div><div><h3>📅 Odds for upcoming meetings</h3>${tbl}<p class="small muted" style="margin-top:6px">Highlighted cell = most likely outcome. Probabilities are for the target range after each meeting.</p></div></div><p class="small muted fw-src">${srcs}</p>`;
      }
    }).catch(err => { console.warn(err); pending(fwFull); pending(fwMini); });
  }

  /* ---------- US economic calendar (data/calendar-us.json, ForexFactory) ---------- */
  if ($('ffcal') || $('us-next')) H.getJSON('data/calendar-us.json').then(d => {
    const ev = (d.events || []).filter(x => x.impact === 'High').map(x => Object.assign({}, x, { t: new Date(x.time_utc) }));
    const now = () => Date.now(), next = () => ev.find(x => x.t.getTime() > now());
    if ($('us-next')) { const l = ev.filter(x => x.t.getTime() > now()).slice(0, 3); $('us-next').innerHTML = l.length ? l.map(x => `<a class="usn" href="en/economic-calendar.html"><span class="usn-t"><b>${etT(x.t)}</b><small>${fmt(x.t, { weekday: 'short', month: 'short', day: 'numeric' })}</small></span><span class="usn-x"><b>${E(x.title)}</b><small>${x.forecast ? 'Forecast ' + E(x.forecast) : ''}</small></span></a>`).join('') : '<p class="muted small">No more high-impact US releases this week.</p>'; }
    if (!$('ffcal')) return;
    const upd = d.updated_utc ? new Date(d.updated_utc) : vnParse(d.updated_vn); $('ff-upd').innerHTML = upd ? tm(upd) : '—';
    const dash = v => v ? E(v) : '<span class="muted">—</span>';
    function draw() {
      const g = {}, today = dayKey(new Date()), nx = next();
      ev.forEach(x => (g[dayKey(x.t)] = g[dayKey(x.t)] || []).push(x));
      $('ffcal').innerHTML = Object.keys(g).sort().map((k, gi) => { const d0 = g[k][0].t;
        return `<div class="ffday${k === today ? ' today' : ''}${k < today ? ' past' : ''}" style="animation-delay:${gi * 70}ms"><div class="ffday-h"><b>${fmt(d0, { weekday: 'long' })}</b> ${fmt(d0, { month: 'short', day: 'numeric', year: 'numeric' })}${k === today ? ' <span class="ff-today">TODAY</span>' : ''}</div>
        ${g[k].map(x => `<div class="ffev${x.t.getTime() <= now() ? ' done' : ''}${nx === x ? ' next' : ''}"><div class="ffev-t">${fmt(x.t, { hour: 'numeric', minute: '2-digit' })}<small>ET</small></div>
          <div class="ffev-b"><div class="ffev-h"><span class="flag">🇺🇸</span><b>${E(x.title)}</b><span class="ffb hi">High impact</span>${nx === x ? '<span class="ff-nx">⏭ Next</span>' : ''}</div>
          ${x.explain_en ? `<div class="small ffev-x">💡 ${E(x.explain_en)}</div>` : ''}
          <div class="ffnum"><span>Actual<b>${dash(x.actual)}</b></span><span>Forecast<b>${dash(x.forecast)}</b></span><span>Previous<b>${dash(x.previous)}</b></span></div></div></div>`).join('')}</div>`; }).join('') || '<p class="muted">No events.</p>';
    }
    draw();
    const tick = () => { const n = next(), el = $('ff-cd'); if (!n) { el.innerHTML = '<span class="muted">No more high-impact US releases this week</span>'; return; }
      el.innerHTML = `<div class="ffcd-l"><b>${E(n.title)}</b><small>${fmt(n.t, { weekday: 'short' })} ${et(n.t)}</small></div><div class="fomc-cd">${cdBox(cd(n.t - now(), ['days', 'hrs', 'min', 'sec']))}</div>`; };
    tick(); setInterval(tick, 1000); setInterval(draw, 60000);
  }).catch(err => { console.warn(err); if ($('ffcal')) { $('ffcal').innerHTML = "<p class=\"muted\">Couldn't load the ForexFactory data – see the TradingView calendar below.</p>"; const fb = $('tv-fallback'); if (fb) fb.open = true; } });

  /* ---------- Live room (data/live-schedule.json; session times are Vietnam time in the data) ---------- */
  if (document.querySelector('[data-cd]') || $('sched') || $('player')) {
    const CH = H.YT_LIVE_ID, UU = 'UU' + CH.slice(2);
    H.schedule.then(sc => {
      if (!sc) return;
      const tick = () => { const n = H.liveNext(sc.sessions); if (!n) return; const p = cd(n.start - Date.now());
        document.querySelectorAll('[data-cd]').forEach(el => el.textContent = n.live ? '🔴 LIVE NOW' : (p[0][0] ? p[0][0] + 'd ' : '') + p.slice(1).map(x => String(x[0]).padStart(2, '0')).join(':'));
        document.querySelectorAll('[data-next-title]').forEach(el => el.textContent = n.title_en || 'Live gold room');
        document.querySelectorAll('[data-next-time]').forEach(el => el.textContent = fmt(n.start, { weekday: 'long' }) + ', ' + et(n.start));
        document.querySelectorAll('[data-gcal]').forEach(el => { const z = d => d.toISOString().replace(/[-:]|\.\d{3}/g, ''); el.href = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('HuymasterGold79 – ' + (n.title_en || 'Live gold room')) + '&dates=' + z(n.start) + '/' + z(n.end) + '&details=' + encodeURIComponent((n.desc_en || '') + '\nWatch: https://www.youtube.com/@tradinglivexauusd4647/live') + '&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY') + '&ctz=' + NY; });
      };
      tick(); setInterval(tick, 1000);
      if ($('sched')) {
        $('sched').innerHTML = (sc.example ? '<span class="badge ex">Sample schedule – to be confirmed</span>' : '') + `<table class="tbl" style="margin-top:8px"><thead><tr><th>Day</th><th>Time (ET)</th><th>Topic</th></tr></thead><tbody>${sc.sessions.map(s => { const n = H.liveNext([s]); return `<tr><td><b>${n ? fmt(n.start, { weekday: 'long' }) + 's' : ''}</b></td><td>${n ? etT(n.start) : ''} · ${s.duration} min</td><td style="text-align:left">${E(s.title_en || 'Live gold room')}<br><small class="muted">${E(s.desc_en || '')}</small></td></tr>`; }).join('')}</tbody></table><p class="small muted" style="margin-top:6px">Hover a time for your local time. Note: the stream itself is not in English.</p>`;
        $('topics').innerHTML = (sc.topics_en || []).map(t => `<li>${E(t)}</li>`).join('');
      }
    });
    const pl = $('player');
    if (pl) {
      const s = { live: `https://www.youtube.com/embed/live_stream?channel=${CH}&autoplay=1&mute=1`, uploads: `https://www.youtube.com/embed/videoseries?list=${UU}` };
      const show = k => { pl.innerHTML = `<iframe src="${s[k]}" title="TRADING LIVE XAUUSD" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`; document.querySelectorAll('[data-pl]').forEach(b => b.classList.toggle('on', b.dataset.pl === k)); };
      document.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => show(b.dataset.pl));
      show('uploads');
      H.schedule.then(sc => { const n = sc && H.liveNext(sc.sessions); if (n && (n.live || n.start - Date.now() < 15 * 60e3)) show('live'); });
    }
  }

  /* ---------- Fund & copy trading (data/fund.json, data/follow-accounts.json) ---------- */
  const pct = n => n == null ? '—' : `<span class="${n >= 0 ? 'up' : 'down'}">${n >= 0 ? '+' : ''}${f(n, 1)}%</span>`;
  if ($('fund-perf')) H.getJSON('data/fund.json').then(d => {
    $('fund-intro').innerHTML = `${sample(d.example)} <p style="margin-top:8px">${E(d.intro_en || '')}</p>`;
    $('fund-summary').innerHTML = d.summary.filter(s => s.label_en).map(s => `<div class="card tile"><div class="sub">${E(s.label_en)}</div><div class="val" style="font-size:1.15rem">${E(s.value_en)}</div></div>`).join('');
    $('fund-roadmap').innerHTML = d.roadmap.filter(r => r.phase_en).map((r, i) => `<div class="card"><span class="tag" style="background:var(--gold);color:#1a1405;padding:2px 8px;border-radius:6px;font-weight:800;font-size:.75rem">STEP ${i + 1} · ${E(r.time_en)}</span><h3 style="margin-top:8px">${E(r.phase_en)}</h3><p class="muted">${E(r.desc_en)}</p></div>`).join('');
    $('fund-risk').innerHTML = (d.risk_rules_en || []).map(r => `<li>${E(r)}</li>`).join('');
    const tot = d.performance.reduce((a, r) => a * (1 + r.return_pct / 100), 1) - 1;
    $('fund-perf').innerHTML = `${sample(d.example)}<div class="tbl-wrap"><table class="tbl" style="margin-top:8px"><thead><tr><th>Month</th><th>Return</th><th>Max drawdown</th><th>Trades</th><th>Note</th></tr></thead><tbody>${d.performance.map(r => `<tr><td>${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' }).format(ymd(r.month + '-01'))}</td><td>${pct(r.return_pct)}</td><td class="down">-${f(r.max_dd_pct, 1)}%</td><td>${f(r.trades)}</td><td class="muted">${E(r.note_en || '')}</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin-top:6px">Cumulative${d.example ? ' (sample)' : ''}: ${pct(tot * 100)}</p>`;
  }).catch(err => { console.warn(err); $('fund-perf').textContent = "Couldn't load the fund data."; });
  if ($('fl-acc')) H.getJSON('data/follow-accounts.json').then(d => {
    $('fl-steps').innerHTML = d.steps.filter(s => s.title_en).map((s, i) => `<div class="card"><div style="width:38px;height:38px;border-radius:50%;background:var(--gold);color:#1a1405;display:grid;place-items:center;font-weight:900">${i + 1}</div><h3 style="margin-top:10px">${E(s.title_en)}</h3><p class="muted small">${E(s.desc_en)}</p></div>`).join('');
    $('fl-acc').innerHTML = d.accounts.filter(a => a.name_en).map(a => `<div class="card">${sample(d.example)}<h3 style="margin-top:8px">${E(a.name_en)}</h3><p class="muted small">${E(a.platform_en)} · ${E(a.style_en)}</p>
      <div class="mini-out"><div><span>Return</span><b>${pct(a.gain_pct)}</b></div><div class="r"><span>Max drawdown</span><b class="down">-${f(a.max_dd_pct, 1)}%</b></div><div><span>Track record</span><b>${f(a.months)} months</b></div><div><span>Minimum</span><b>${E(a.min_deposit_en)}</b></div></div>
      <p class="small" style="margin-top:8px">Status: <b>${E(a.status_en)}</b> · Followers: ${f(a.followers)}</p>
      <div class="share">${a.verify_url ? `<a href="${E(a.verify_url)}" target="_blank" rel="noopener">🔎 Verify results</a>` : '<span class="muted small">No verification link yet</span>'}</div></div>`).join('');
    $('fl-faq').innerHTML = d.faq.filter(q => q.q_en).map(q => `<details class="card" style="margin-bottom:10px"><summary>${E(q.q_en)}</summary><p style="margin-top:8px">${E(q.a_en)}</p></details>`).join('');
  }).catch(err => { console.warn(err); $('fl-acc').textContent = "Couldn't load the account data."; });

  /* ---------- Vietnam gold market / SJC premium (data/vn-gold-daily.json + live feeds) ---------- */
  const OZ_PER_TAEL = H.LUONG; // 1 tael (37.5 g) = 1.20565 troy oz
  const usdOz = (vnd, fx) => fx ? vnd / fx / OZ_PER_TAEL : null;
  if ($('vn-market')) H.getJSON('data/vn-gold-daily.json').then(d => {
    const w = d.world, fx = w.usdvnd, sjc = d.rows.find(r => r.code === 'SJL1L10'), ring = d.rows.find(r => r.code === 'SJ9999');
    const prem = r => usdOz(r.sell, fx) - w.xau_usd, premPct = r => prem(r) / w.xau_usd * 100;
    const BR = { 'Vàng miếng SJC': 'SJC bar', 'Nhẫn tròn 9999': '9999 ring', 'Nhẫn 24K': '24K ring', 'Nhẫn/trang sức 9999 (DOJI Jewelry)': '9999 ring/jewelry' };
    const brand = s => s.replace('Hà Nội', 'Hanoi').replace('TP.HCM', 'HCMC').replace('Bảo Tín Minh Châu', 'Bao Tin Minh Chau');
    const upd = vnParse(d.updated_vn), wt = new Date(w.xau_time_utc);
    const rows = d.rows.map(r => `<tr><td style="text-align:left"><b>${E(brand(r.brand))}</b><br><small class="muted">${E(BR[r.type] || r.type)}</small></td><td>$${f(usdOz(r.buy, fx))}</td><td><b>$${f(usdOz(r.sell, fx))}</b></td><td class="${prem(r) > 0 ? 'down' : 'up'}">+$${f(prem(r))} <small>(${f(premPct(r), 1)}%)</small></td><td class="muted">${f(r.buy / 1e6, 1)} / ${f(r.sell / 1e6, 1)}</td></tr>`).join('');
    const hs = d.history.SJL1L10 || [];
    let chart = '';
    if (hs.length > 2) { const v = hs.map(x => usdOz(x.sell, fx)), mn = Math.min(...v) - 20, mx = Math.max(...v) + 20, W = 600, Hh = 180, X = i => 40 + i * (W - 50) / (v.length - 1), Y = y => 10 + (mx - y) / (mx - mn) * (Hh - 30);
      chart = `<svg viewBox="0 0 ${W} ${Hh}" class="vg-chart" role="img" aria-label="SJC bar ask price, USD/oz equivalent, 30 days"><path d="${v.map((y, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(y).toFixed(1)).join(' ')}" fill="none" stroke="#f0b90b" stroke-width="2.5" class="vg-line"/><text x="40" y="${Hh - 4}" class="vg-ax">${E(dShort(hs[0].date).replace(/, \d{4}/, ''))}</text><text x="${W - 10}" y="${Hh - 4}" text-anchor="end" class="vg-ax">${E(dShort(hs[hs.length - 1].date).replace(/, \d{4}/, ''))}</text><text x="2" y="${Y(mx - 20) + 4}" class="vg-ax">$${f(mx - 20)}</text><text x="2" y="${Y(mn + 20) + 4}" class="vg-ax">$${f(mn + 20)}</text></svg><p class="small muted">SJC bar ask, 30 days, converted at today's USD/VND rate (${f(fx)}), so the line reflects local-price moves only.</p>`; }
    const pk = d.peak;
    $('vn-market').innerHTML = `<div class="vg-hero">
      <div class="vg-big"><span>🧱 SJC 1-tael bar (ask)</span><b>$${f(usdOz(sjc.sell, fx))}/oz</b><small>equivalent · bid $${f(usdOz(sjc.buy, fx))}</small></div>
      <div class="vg-big gap"><span>⚖ SJC premium over spot</span><b>+$${f(prem(sjc))}/oz</b><small>${f(premPct(sjc), 1)}% over XAU/USD $${f(w.xau_usd, 2)}</small></div>
      ${ring ? `<div class="vg-big"><span>💍 SJC 9999 ring (ask)</span><b>$${f(usdOz(ring.sell, fx))}/oz</b><small>premium +$${f(prem(ring))} (${f(premPct(ring), 1)}%)</small></div>` : ''}</div>
      <p class="small muted">Snapshot ${upd ? tm(upd) : ''} · spot XAU/USD (gold-api.com) ${tm(wt)} · USD/VND ${f(fx)} (open.er-api.com market rate). Converted at 1 tael = 37.5 g = 1.20565 troy oz; excludes taxes and fees.</p>
      <div class="grid g2 sec" style="gap:16px"><div class="card"><h3>🏪 Dealer quotes, USD/oz equivalent</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Dealer</th><th>Bid</th><th>Ask</th><th>Premium (ask)</th><th>VND m/tael bid/ask</th></tr></thead><tbody>${rows}</tbody></table></div><p class="small muted" style="margin-top:6px">Quotes via <a href="${E(d.sources.vang_today)}" target="_blank" rel="noopener">vang.today ↗</a> (aggregating SJC, DOJI, PNJ, Bao Tin Minh Chau).</p></div>
      <div class="card"><h3>📈 SJC bar, last 30 days</h3>${chart || '<p class="muted small">Not enough data yet.</p>'}</div></div>
      ${(d.analysis_en || []).length ? `<div class="card vg-an sec"><h3>📝 Market read</h3><ul>${d.analysis_en.map(x => `<li>${E(x)}</li>`).join('')}</ul></div>` : ''}
      ${pk && pk.note_en ? `<div class="card sec"><h3>🏔 ${E(pk.label_en || 'All-time high')}</h3><p>${E(pk.note_en)} ≈ $${f(usdOz(pk.sell, fx))}/oz at today's FX rate. A buyer at that peak selling at today's bid would be down about ${f((pk.sell - sjc.buy) / pk.sell * 100, 1)}%.</p><p class="small muted">Source: ${src(pk.source)}</p></div>` : ''}
      ${d.advice_en ? `<div class="vg-adv"><b>💡 Takeaway:</b> ${E(d.advice_en)}</div>` : ''}
      ${(d.refs || []).filter(r => r.facts_en).map(r => `<div class="small muted" style="margin-top:10px">📰 <a href="${E(r.url)}" target="_blank" rel="noopener">${E(r.name_en)} ↗</a> (Vietnamese)<ul>${r.facts_en.map(x => `<li>${E(x)}</li>`).join('')}</ul></div>`).join('')}`;
  }).catch(err => { console.warn(err); $('vn-market').innerHTML = '<p class="muted">Couldn\'t load Vietnam market data.</p>'; });
  if ($('vg-live')) H.sub(D => {
    const s = D.rows.find(r => r.name === 'SJC');
    $('vg-live').innerHTML = D.xau && D.fx && s ? `<div class="mini-out"><div><span>Spot XAU/USD</span><b>$${f(D.xau, 2)}</b></div><div class="r"><span>SJC ask (USD/oz eq.)</span><b>$${f(usdOz(s.sell, D.fx))}</b></div><div><span>Live premium</span><b>+$${f(usdOz(s.sell, D.fx) - D.xau)} (${f((usdOz(s.sell, D.fx) / D.xau - 1) * 100, 1)}%)</b></div><div class="r"><span>USD/VND</span><b>${f(D.fx)}</b></div></div><p class="small muted">Refreshes every 60 seconds · ${E(et(D.time))}</p>` : '<p class="muted small">Live quotes unavailable right now.</p>';
  });
  if ($('cv-oz')) { const run = () => { const oz = +$('cv-oz').value, fx = +$('cv-fx').value; $('cv-out').textContent = oz && fx ? f(oz * fx * OZ_PER_TAEL / 1e6, 1) + ' million VND per tael' : '—'; };
    H.sub(D => { if (!$('cv-oz').value && D.xau) $('cv-oz').value = D.xau.toFixed(1); if (!$('cv-fx').value && D.fx) $('cv-fx').value = Math.round(D.fx); run(); }); $('cv-oz').oninput = $('cv-fx').oninput = run; }
})();
