/* Tin vĩ mô (data/macro-news.json): danh sách + lọc, khối trang chủ, lịch FOMC */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const H = window.HMG, $ = id => document.getElementById(id), e = H.esc;
  const IMP = { 'tăng': ['up', '▲ Tăng cho vàng'], 'giảm': ['down', '▼ Giảm cho vàng'], 'trung lập': ['side', '◆ Trung lập'] };
  /* Biểu tượng theo chủ đề: ưu tiên từ khóa trong tiêu đề, sau đó theo category */
  const ICON = it => { const t = (it.title + ' ' + it.category).toLowerCase();
    if (/fomc|dot plot/.test(t)) return ['🏛', 'Fed/FOMC']; if (/việc làm|bảng lương|thất nghiệp|nfp/.test(t)) return ['👷', 'Việc làm'];
    if (/lạm phát|cpi|pce/.test(t)) return ['🔥', 'Lạm phát']; if (/usd|dxy/.test(t) && it.category === 'Tương quan') return ['💵', 'USD'];
    return ({ 'Lợi suất': ['📈', 'Lợi suất'], 'Trái phiếu': ['🧾', 'Trái phiếu'], 'Fed': ['🏦', 'Fed'], 'FOMC': ['🏛', 'FOMC'], 'Tương quan': ['🔗', 'Tương quan'] })[it.category] || ['📰', it.category]; };
  const src = s => s ? (s.doc ? `<span class="badge side">📄 ${e(s.name)}</span>` : `<a href="${e(s.url)}" target="_blank" rel="noopener">${e(s.name)} ↗</a>`) : '';
  const card = (it, full, i) => { const ic = ICON(it), im = IMP[it.impact] || IMP['trung lập'];
    return `<article class="card macro-item anim i-${im[0]}" style="animation-delay:${Math.min(i || 0, 10) * 60}ms" data-cat="${e(it.category)}">${full ? `<span class="tl-date">${H.dateVN(it.date)}</span>` : ''}
    <div class="mi-head"><span class="mi-ic" title="${e(ic[1])}">${ic[0]}</span><span class="badge side">${e(it.category)}</span><span class="muted small">${H.dateVN(it.date)}</span>${it.priority === 1 ? '<span class="badge ex">Tác động trực tiếp</span>' : ''}<span class="imp ${im[0]}">${im[1]}</span></div>
    <h3 style="color:var(--txt);margin:8px 0 2px;font-size:1.02rem">${e(it.title)}</h3><span class="mi-time">🕐 Giờ VN: ${e(it.time_vn || '—')}</span>
    ${full ? `<p class="small" style="margin-top:8px">${e(it.summary)}</p><p class="small" style="margin-top:6px"><b>Tác động tới vàng:</b> ${e(it.reason)}</p>${it.check ? `<p class="small note" style="margin:8px 0 0">⚠ ${e(it.check)}</p>` : ''}` : `<p class="small muted" style="margin-top:6px">${e(it.reason)}</p>`}
    <p class="small" style="margin-top:8px">Nguồn: ${src(it.source)}${it.source2 ? ' · ' + src(it.source2) : ''}</p></article>`; };
  const hlCard = it => { const ic = ICON(it), im = IMP[it.impact] || IMP['trung lập'];
    return `<article class="card hl anim"><div class="mi-head"><span class="tag">★ TIN NỔI BẬT</span><span class="mi-ic">${ic[0]}</span><span class="badge side">${e(it.category)}</span><span class="imp ${im[0]}">${im[1]}</span></div>
    <h3>${e(it.title)}</h3><span class="mi-time">🕐 Giờ VN: ${e(it.time_vn || '—')}</span><p class="small" style="margin-top:8px">${e(it.summary)}</p>
    <p class="small" style="margin-top:6px"><b>Tác động tới vàng:</b> ${e(it.reason)}</p><p class="small" style="margin-top:8px">Nguồn: ${src(it.source)}${it.source2 ? ' · ' + src(it.source2) : ''}</p></article>`; };
  H.getJSON('data/macro-news.json').then(d => {
    const items = d.items.slice().sort((a, b) => (a.priority || 2) - (b.priority || 2) || b.date.localeCompare(a.date));
    if ($('macro')) {
      const cats = ['Tất cả', 'Lợi suất', 'Trái phiếu', 'Tương quan', 'Fed', 'FOMC'];
      $('macro-chips').innerHTML = cats.map((c, i) => `<button type="button" data-c="${c}" class="${i ? '' : 'on'}">${c} <small>${i ? items.filter(x => x.category === c).length : items.length}</small></button>`).join('');
      const draw = c => { $('macro').innerHTML = items.filter(x => c === 'Tất cả' || x.category === c).map((x, i) => card(x, true, i)).join(''); $('macro-chips').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.c === c)); };
      $('macro-chips').onclick = ev => { const b = ev.target.closest('button'); if (b) draw(b.dataset.c); };
      const want = new URLSearchParams(location.search).get('muc'); draw(cats.includes(want) ? want : 'Tất cả');
      const top = items.filter(x => x.priority === 1 && !x.source.doc).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (top && $('macro-hl')) $('macro-hl').innerHTML = hlCard(top);
      $('macro-upd').textContent = H.dateVN(d.updated);
    }
    if ($('macro-home')) $('macro-home').innerHTML = items.filter(x => !x.source.doc).slice(0, 4).map((x, i) => card(x, false, i)).join('');
    if ($('us-sched')) $('us-sched').innerHTML = `<table class="tbl"><thead><tr><th>Loại tin Mỹ</th><th>Giờ VN (hè Mỹ)</th><th>Giờ VN (đông Mỹ)</th></tr></thead><tbody>${d.us_schedule.map(x => `<tr><td style="text-align:left">${e(x.event)}<br><small class="muted">${e(x.et)}</small></td><td><b>${e(x.vn_summer)}</b></td><td>${e(x.vn_winter)}</td></tr>`).join('')}</tbody></table><p class="small muted" style="margin-top:6px">${e(d.us_schedule_note)}</p>`;
    const box = $('fomc');
    {
      const m = d.fomc.meetings, nowF = () => Date.now();
      if (box) box.innerHTML = `<table class="tbl"><thead><tr><th>Cuộc họp 2026</th><th>Quyết định (giờ VN)</th><th></th></tr></thead><tbody>${m.map(x => { const t = new Date(x.decision); return `<tr data-t="${t.getTime()}"><td><b>${x.dates}</b>${x.sep ? ' *' : ''}${x.result ? `<br><small class="muted">${e(x.result)}</small>` : ''}</td><td>${t.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td><td class="st"></td></tr>`; }).join('')}</tbody></table>
        <p class="small muted" style="margin-top:6px">${e(d.fomc.note)} Nguồn: <a href="${e(d.fomc.source.url)}" target="_blank" rel="noopener">${e(d.fomc.source.name)} ↗</a></p>`;
      const tick = () => {
        const n = m.map(x => new Date(x.decision)).find(t => t.getTime() > nowF());
        const prev = m.map(x => new Date(x.decision)).filter(t => t.getTime() <= nowF()).pop();
        const ms = n ? n - nowF() : 0, sec = Math.floor(ms / 1e3), parts = [[Math.floor(sec / 86400), 'ngày'], [Math.floor(sec % 86400 / 3600), 'giờ'], [Math.floor(sec % 3600 / 60), 'phút'], [sec % 60, 'giây']];
        document.querySelectorAll('[data-fomc-cd]').forEach(el => {
          if (!n) { el.textContent = 'Hết lịch 2026'; return; }
          if (!el.children.length) el.innerHTML = parts.map(p => `<div><b></b><small>${p[1]}</small></div>`).join('');
          el.querySelectorAll('b').forEach((b, i) => { const v = String(parts[i][0]).padStart(2, '0'); if (b.textContent !== v) { b.textContent = v; b.classList.remove('tk'); void b.offsetWidth; b.classList.add('tk'); } });
        });
        const pct = n && prev ? Math.min(100, (nowF() - prev) / (n - prev) * 100) : 0;
        document.querySelectorAll('[data-fomc-bar]').forEach(el => el.style.width = pct.toFixed(2) + '%');
        if (box) box.querySelectorAll('tr[data-t]').forEach(r => { const t = +r.dataset.t; r.querySelector('.st').innerHTML = t < nowF() ? '<span class="muted small">Đã họp</span>' : (n && t === n.getTime() ? '<span class="badge ex">Tiếp theo</span>' : ''); r.style.opacity = t < nowF() ? .55 : 1; });
      };
      tick(); setInterval(tick, 1000);
    }
  }).catch(err => { console.warn(err); if ($('macro')) $('macro').textContent = 'Không tải được data/macro-news.json'; });
});
