/* Tin vĩ mô (data/macro-news.json): danh sách + lọc, khối trang chủ, lịch FOMC */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const H = window.HMG, $ = id => document.getElementById(id), e = H.esc;
  const IMP = { 'tăng': ['up', '▲ Tích cực cho vàng'], 'giảm': ['down', '▼ Tiêu cực cho vàng'], 'trung lập': ['side', '◆ Trung lập'] };
  const src = s => s ? (s.doc ? `<span class="badge side">📄 ${e(s.name)}</span>` : `<a href="${e(s.url)}" target="_blank" rel="noopener">${e(s.name)} ↗</a>`) : '';
  const card = (it, full) => `<article class="card macro-item" data-cat="${e(it.category)}">
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center"><span class="badge side">${e(it.category)}</span><span class="muted small">${H.dateVN(it.date)}</span><span class="badge ${IMP[it.impact][0]}" style="margin-left:auto">${IMP[it.impact][1]}</span></div>
    <h3 style="color:var(--txt);margin:8px 0 6px;font-size:1.02rem">${e(it.title)}</h3>
    ${full ? `<p class="small">${e(it.summary)}</p><p class="small" style="margin-top:6px"><b>Tác động tới vàng:</b> ${e(it.reason)}</p>${it.check ? `<p class="small note" style="margin:8px 0 0">⚠ ${e(it.check)}</p>` : ''}` : `<p class="small muted">${e(it.reason)}</p>`}
    <p class="small" style="margin-top:8px">Nguồn: ${src(it.source)}${it.source2 ? ' · ' + src(it.source2) : ''}</p></article>`;
  H.getJSON('data/macro-news.json').then(d => {
    const items = d.items.slice().sort((a, b) => b.date.localeCompare(a.date));
    if ($('macro')) {
      const cats = ['Tất cả', 'Lợi suất', 'Trái phiếu', 'Tương quan', 'Fed', 'FOMC'];
      $('macro-chips').innerHTML = cats.map((c, i) => `<button type="button" data-c="${c}" class="${i ? '' : 'on'}">${c} <small>${i ? items.filter(x => x.category === c).length : items.length}</small></button>`).join('');
      const draw = c => { $('macro').innerHTML = items.filter(x => c === 'Tất cả' || x.category === c).map(x => card(x, true)).join(''); $('macro-chips').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.c === c)); };
      $('macro-chips').onclick = ev => { const b = ev.target.closest('button'); if (b) draw(b.dataset.c); };
      const want = new URLSearchParams(location.search).get('muc'); draw(cats.includes(want) ? want : 'Tất cả');
      $('macro-upd').textContent = H.dateVN(d.updated);
    }
    if ($('macro-home')) $('macro-home').innerHTML = items.filter(x => !x.source.doc).slice(0, 4).map(x => card(x, false)).join('');
    const box = $('fomc');
    {
      const m = d.fomc.meetings, nowF = () => Date.now();
      if (box) box.innerHTML = `<table class="tbl"><thead><tr><th>Cuộc họp 2026</th><th>Giờ VN công bố</th><th></th></tr></thead><tbody>${m.map(x => { const t = new Date(x.decision); return `<tr data-t="${t.getTime()}"><td><b>${x.dates}</b>${x.sep ? ' *' : ''}${x.result ? `<br><small class="muted">${e(x.result)}</small>` : ''}</td><td>${t.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</td><td class="st"></td></tr>`; }).join('')}</tbody></table>
        <p class="small muted" style="margin-top:6px">${e(d.fomc.note)} Nguồn: <a href="${e(d.fomc.source.url)}" target="_blank" rel="noopener">${e(d.fomc.source.name)} ↗</a></p>`;
      const tick = () => {
        const n = m.map(x => new Date(x.decision)).find(t => t.getTime() > nowF());
        document.querySelectorAll('[data-fomc-cd]').forEach(el => el.textContent = n ? H.countdown(n - nowF()) : 'Hết lịch 2026');
        if (box) box.querySelectorAll('tr[data-t]').forEach(r => { const t = +r.dataset.t; r.querySelector('.st').innerHTML = t < nowF() ? '<span class="muted small">Đã họp</span>' : (n && t === n.getTime() ? '<span class="badge ex">Tiếp theo</span>' : ''); r.style.opacity = t < nowF() ? .55 : 1; });
      };
      tick(); setInterval(tick, 1000);
    }
  }).catch(err => { console.warn(err); if ($('macro')) $('macro').textContent = 'Không tải được data/macro-news.json'; });
});
