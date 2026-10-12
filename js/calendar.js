/* Lịch tin Mỹ từ data/calendar-us.json (ForexFactory) – giờ luôn theo Asia/Ho_Chi_Minh */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const H = window.HMG, $ = id => document.getElementById(id), e = H.esc, TZ = 'Asia/Ho_Chi_Minh';
  const fmt = (d, o) => new Intl.DateTimeFormat('vi-VN', Object.assign({ timeZone: TZ }, o)).format(d);
  const dayKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD theo giờ VN
  const IMP = { High: ['hi', 'Tác động cao'], Medium: ['md', 'Trung bình'], Holiday: ['hd', 'Nghỉ lễ'] };
  const dash = v => v ? e(v) : '<span class="muted">—</span>';
  H.getJSON('data/calendar-us.json').then(d => {
    const ev = (d.events || []).map(x => Object.assign({}, x, { t: new Date(x.time_utc) }));
    const now = () => Date.now(), today = dayKey(new Date());
    const nextHigh = () => ev.find(x => x.impact === 'High' && x.t.getTime() > now());
    /* Trang chủ: 3 tin High sắp ra */
    if ($('us-next')) {
      const list = ev.filter(x => x.impact === 'High' && x.t.getTime() > now()).slice(0, 3);
      $('us-next').innerHTML = list.length ? list.map(x => `<a class="usn" href="lich-kinh-te.html"><span class="usn-t"><b>${fmt(x.t, { hour: '2-digit', minute: '2-digit' })}</b><small>${fmt(x.t, { weekday: 'short', day: '2-digit', month: '2-digit' })}</small></span><span class="usn-x"><b>${e(x.title_vi || x.title)}</b><small>${e(x.title)}${x.forecast ? ' · Dự báo ' + e(x.forecast) : ''}</small></span><span class="ffb hi">Cao</span></a>`).join('') : '<p class="muted small">Chưa có tin tác động cao sắp ra trong tuần này.</p>';
    }
    if (!$('ffcal')) return;
    $('ff-upd').textContent = d.updated_vn || '—';
    let showMed = localStorage.getItem('hmg_ff_med') === '1';
    const tg = $('ff-med'); tg.checked = showMed; tg.onchange = () => { showMed = tg.checked; localStorage.setItem('hmg_ff_med', showMed ? '1' : '0'); draw(); };
    function draw() {
      const list = ev.filter(x => x.impact !== 'Medium' || showMed), groups = {};
      list.forEach(x => (groups[dayKey(x.t)] = groups[dayKey(x.t)] || []).push(x));
      const nx = nextHigh();
      $('ffcal').innerHTML = Object.keys(groups).sort().map((k, gi) => {
        const d0 = groups[k][0].t, isT = k === today, past = k < today;
        return `<div class="ffday${isT ? ' today' : ''}${past ? ' past' : ''}" style="animation-delay:${gi * 70}ms"><div class="ffday-h"><b>${fmt(d0, { weekday: 'long' })}</b> ${fmt(d0, { day: '2-digit', month: '2-digit', year: 'numeric' })}${isT ? ' <span class="ff-today">HÔM NAY</span>' : ''}</div>
        ${groups[k].map(x => { const im = IMP[x.impact] || IMP.Medium, done = x.t.getTime() <= now();
          return `<div class="ffev${done ? ' done' : ''}${nx === x ? ' next' : ''}"><div class="ffev-t">${fmt(x.t, { hour: '2-digit', minute: '2-digit' })}<small>giờ VN</small></div>
          <div class="ffev-b"><div class="ffev-h"><span class="flag">🇺🇸</span><b>${e(x.title_vi || x.title)}</b><span class="ffb ${im[0]}">${im[1]}</span>${nx === x ? '<span class="ff-nx">⏭ Tiếp theo</span>' : ''}</div>
          <div class="muted small">${e(x.title)}</div>${x.explain ? `<div class="small ffev-x">💡 ${e(x.explain)}</div>` : ''}
          ${x.impact !== 'Holiday' ? `<div class="ffnum"><span>Thực tế<b>${dash(x.actual)}</b></span><span>Dự báo<b>${dash(x.forecast)}</b></span><span>Kỳ trước<b>${dash(x.previous)}</b></span></div>` : ''}</div></div>`; }).join('')}</div>`;
      }).join('') || '<p class="muted">Không có sự kiện.</p>';
    }
    draw();
    const tick = () => { const n = nextHigh(), el = $('ff-cd');
      if (!n) { el.innerHTML = '<span class="muted">Không còn tin tác động cao trong tuần này</span>'; return; }
      const s = Math.floor((n.t - now()) / 1e3), p = [[Math.floor(s / 86400), 'ngày'], [Math.floor(s % 86400 / 3600), 'giờ'], [Math.floor(s % 3600 / 60), 'phút'], [s % 60, 'giây']];
      el.innerHTML = `<div class="ffcd-l"><b>${e(n.title_vi || n.title)}</b><small>${e(n.title)} · ${fmt(n.t, { hour: '2-digit', minute: '2-digit', weekday: 'short', day: '2-digit', month: '2-digit' })} giờ VN</small></div><div class="fomc-cd">${p.map(x => `<div><b>${String(x[0]).padStart(2, '0')}</b><small>${x[1]}</small></div>`).join('')}</div>`; };
    tick(); setInterval(tick, 1000); setInterval(draw, 60000);
  }).catch(err => { console.warn(err); if ($('ffcal')) { $('ffcal').innerHTML = '<p class="muted">Không tải được dữ liệu ForexFactory – xem lịch TradingView bên dưới.</p>'; const f = $('tv-fallback'); if (f) f.open = true; }
    if ($('us-next')) $('us-next').innerHTML = '<p class="muted small">Chưa tải được lịch tin.</p>'; });
});
