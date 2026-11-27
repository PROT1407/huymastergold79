/* Lấp khoảng trống: ô "Lệnh H79 đang theo dõi" (trang chủ) + thẻ giá nhanh / nhận định mới nhất ở cột phải trang tin tức.
   Chỉ hiển thị điều suy ra được từ dữ liệu: ngày/vùng/SL/TP của nhận định và so giá spot hiện tại với vùng (không nói đã khớp/lãi). */
(function () {
  'use strict';
  /* Công tắc từng mục: data/features.json = { "<mục>": true|false, ... }. Mục nào true -> thêm class "fg-<mục>" vào <html>, CSS/JS của mục đó mới chạy.
     Mục mới thêm sau này mặc định false. Xem thử riêng: ?h79preview=1 (lưu localStorage) bật TẤT CẢ mục kể cả mục đang tắt; ?h79preview=0 xoá.
     Không mục nào bật -> file này không thêm class nào, trang giữ nguyên như cũ. Trang quản lý: h79-admin.html. */
  const KEY = 'h79_preview', qs = new URLSearchParams(location.search), pv = qs.get('h79preview');
  const KNOWN = ['homeOrders', 'cptCard', 'newsSidebar', 'stickyCard', 'mobileLayout'];
  try {
    if (pv === '1') localStorage.setItem(KEY, '1'); else if (pv === '0') localStorage.removeItem(KEY);
    if (pv === '0' || pv === '1') { qs.delete('h79preview'); const q = qs.toString(); history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); }
  } catch (e) { }
  const localOn = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const HM = window.HMG;
  if (!HM) return;
  const allOn = j => { const o = {}; KNOWN.concat(Object.keys(j || {})).forEach(k => { if (/^[A-Za-z0-9_]+$/.test(k)) o[k] = true; }); return o; };
  let started = false;
  function apply(flags) {
    const on = Object.keys(flags || {}).filter(k => flags[k] === true && /^[A-Za-z0-9_]+$/.test(k));
    if (!on.length) return;
    const cl = document.documentElement.classList;
    on.forEach(k => cl.add('fg-' + k));
    if (started) return;
    started = true; cl.add('fillgaps'); start(flags);
  }
  if (localOn()) { apply(allOn()); HM.getJSON(HM.ROOT + 'data/features.json').then(j => apply(allOn(j))).catch(() => { }); }
  else HM.getJSON(HM.ROOT + 'data/features.json').then(j => apply(j)).catch(() => { });

  function start(F) {
  const on = k => F[k] === true || localOn();
  const H = window.HMG, $ = id => document.getElementById(id), E = H.esc;
  const EN = /^en/i.test(document.documentElement.lang || '');
  const T = EN
    ? { title: 'H79 plan on watch', gold: 'Gold impact', open: 'Read the post →', price: 'Spot', zoneIn: 'Price inside the zone', wait: 'Waiting for price to reach the zone', above: 'Price is above the stop level',
        below: 'Price is below the stop level', sell: 'SELL', buy: 'BUY', sl: 'SL', tp: 'TP', plan: 'Daily Outlook', none: 'No active plan yet.', stale: 'Plan of' }
    : { title: 'Lệnh H79 đang theo dõi', open: 'Xem bài nhận định →', price: 'Giá giao ngay', zoneIn: 'Giá trong vùng', wait: 'Chờ giá về vùng', above: 'Giá đã vượt mức SL',
        below: 'Giá đã thủng mức SL', sell: 'BÁN', buy: 'MUA', sl: 'SL', tp: 'TP', plan: 'Nhận định chung', none: 'Chưa có kế hoạch.', stale: 'Kế hoạch ngày' };

  /* "3.677 – 3.722" (VI) hay "3,677–3,722" (EN) -> [3677, 3722]. Chỉ nhận số nguyên nghìn hoặc số có phần thập phân 1–2 chữ số. */
  const num = s => {
    s = String(s).replace(/\s/g, '');
    if (/^\d{1,3}([.,]\d{3})+$/.test(s) || /^\d+$/.test(s)) return +s.replace(/[.,]/g, '');
    const m = s.match(/^(\d[\d.,]*)[.,](\d{1,2})$/);
    return m ? +(m[1].replace(/[.,]/g, '') + '.' + m[2]) : NaN;
  };
  const nums = s => (String(s || '').match(/\d[\d.,]*\d|\d/g) || []).map(num).filter(x => !isNaN(x));
  const f1 = n => H.fmt(n, 1);

  const pick = list => (list || []).filter(s => !s.news && !s.example && /^Nhận định chung$/.test(s.session || '') && s.summary && (s.summary.sell || s.summary.buy))
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))[0];

  const legs = s => ['sell', 'buy'].filter(k => s.summary[k] && s.summary[k].zone).map(k => {
    const o = s.summary[k], z = EN ? (o.zone_en || o.zone) : o.zone, sl = EN ? (o.sl_en || o.sl) : o.sl, tp = EN ? (o.tp_en || o.tp) : o.tp;
    const zn = nums(z), sln = nums(sl);
    return { k, z, sl, tp, lo: zn.length >= 2 ? Math.min(zn[0], zn[1]) : NaN, hi: zn.length >= 2 ? Math.max(zn[0], zn[1]) : NaN, slNum: /^[\d.,\s]+$/.test(String(sl || '')) && sln.length === 1 ? sln[0] : NaN };
  });

  const status = (leg, p) => {
    if (!p || isNaN(leg.lo)) return null;
    if (p >= leg.lo && p <= leg.hi) return ['in', T.zoneIn];
    if (!isNaN(leg.slNum)) {
      if (leg.k === 'sell' && p > leg.slNum) return ['out', T.above];
      if (leg.k === 'buy' && p < leg.slNum) return ['out', T.below];
    }
    return ['', T.wait];
  };

  const dShort = d => { const [y, m, dd] = d.split('-'); return EN ? new Date(Date.UTC(+y, +m - 1, +dd)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : dd + '/' + m; };

  let PLAN = null;
  const link = s => (EN ? s.url_en : s.url) || s.url;
  const planTitle = s => (EN ? (s.headline_en || s.title_en) : (s.headline || s.title)) || '';

  function drawHome() {
    const box = $('h79-plan'); if (!box || !on('homeOrders')) return;
    if (!PLAN) { box.hidden = true; return; }
    const D = H.data, p = D && D.xau, L = legs(PLAN);
    const rows = L.map(l => {
      const st = status(l, p);
      return `<div class="pb-row"><b class="${l.k}">${l.k === 'sell' ? T.sell : T.buy}</b> ${E(l.z)}${l.sl ? ` · ${T.sl} ${E(l.sl)}` : ''}${l.tp ? ` · ${T.tp} ${E(l.tp)}` : ''}${st ? `<br><span class="pb-st ${st[0]}">${E(st[1])}</span>` : ''}</div>`;
    }).join('');
    const html = `<h3>🎯 ${T.title}</h3><div class="pb-meta">${T.plan} ${dShort(PLAN.date)}${PLAN.time ? ' ' + PLAN.time : ''}${p ? ` · ${T.price} $${f1(p)}` : ''}</div>${rows}<a class="pb-link" href="${E(link(PLAN))}">${T.open}</a>`;
    box.innerHTML = html; box.hidden = false;
  }

  function drawSide() {
    const el = $('sc-plan'); if (!el || !on('newsSidebar')) return;
    if (!PLAN) { el.hidden = true; return; }
    const L = legs(PLAN), D = H.data, p = D && D.xau;
    const html = `<h3>🎯 ${EN ? 'Latest plan' : 'Nhận định mới nhất'}</h3><div class="pb-meta muted small">${T.plan} ${dShort(PLAN.date)}${PLAN.time ? ' ' + PLAN.time : ''}</div>
      <p class="small" style="margin:6px 0 4px;font-weight:700">${E(planTitle(PLAN))}</p>
      ${L.map(l => { const st = status(l, p); return `<div class="small"><b style="color:var(--${l.k === 'sell' ? 'down' : 'up'})">${l.k === 'sell' ? T.sell : T.buy}</b> ${E(l.z)}${l.sl ? ` · ${T.sl} ${E(l.sl)}` : ''}${st ? ` · <span class="muted">${E(st[1])}</span>` : ''}</div>`; }).join('')}
      <a class="small" style="display:inline-block;margin-top:6px;font-weight:700" href="${E(link(PLAN))}">${T.open}</a>`;
    el.innerHTML = html; el.hidden = false;
  }

  function drawPrice() {
    const el = $('sc-price'); if (!el || !on('newsSidebar')) return;
    const D = H.data, row = n => (D.rows || []).find(r => r.name === n);
    const tr = v => H.fmt(v / 1e6, 2);
    const lines = [];
    if (D.xau) lines.push([EN ? 'Spot gold (XAU/USD)' : 'Vàng thế giới', '$' + f1(D.xau)]);
    if (EN && D.dxy) lines.push(['DXY', H.fmt(D.dxy, 2)]);
    const sjc = row('SJC'), nh = row('SJC nhẫn 9999');
    if (!EN && sjc && sjc.sell) lines.push(['SJC mua – bán', tr(sjc.buy) + ' – ' + tr(sjc.sell)]);
    if (!EN && nh && nh.sell) lines.push(['Nhẫn SJC 9999', tr(nh.buy) + ' – ' + tr(nh.sell)]);
    el.querySelector('.sc-rows').innerHTML = lines.length ? lines.map(l => `<div><span>${E(l[0])}</span><b>${E(l[1])}</b></div>`).join('') : '<div><span>…</span></div>';
    const u = el.querySelector('[data-sc-unit]'); if (u) u.textContent = EN ? '' : 'triệu đồng/lượng · ' + (D.time ? D.time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');
  }

  H.getJSON(H.ROOT + 'data/strategies.json').then(d => { PLAN = pick(d.strategies); drawHome(); drawSide(); }).catch(() => { PLAN = null; drawHome(); drawSide(); });
  H.sub(() => { drawHome(); drawSide(); drawPrice(); });
  }
})();
