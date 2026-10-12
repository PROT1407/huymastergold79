/* Phòng Live + banner "Sắp live" trang chủ */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const H = window.HMG, $ = id => document.getElementById(id), e = H.esc;
  const CH = H.YT_LIVE_ID, UU = 'UU' + CH.slice(2);
  const DAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  H.schedule.then(sc => {
    if (!sc) return;
    const tick = () => {
      const n = H.liveNext(sc.sessions); if (!n) return;
      const cd = H.countdown(n.start - Date.now());
      document.querySelectorAll('[data-cd]').forEach(el => el.textContent = n.live ? '🔴 ĐANG LIVE' : cd);
      document.querySelectorAll('[data-next-title]').forEach(el => el.textContent = n.title);
      document.querySelectorAll('[data-next-time]').forEach(el => el.textContent = DAYS[n.day] + ' ' + n.start.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) + ' lúc ' + n.time + ' (giờ VN)');
      document.querySelectorAll('[data-gcal]').forEach(el => el.href = H.gcal(n));
    };
    tick(); setInterval(tick, 1000);
    if ($('sched')) {
      $('sched').innerHTML = (sc.example ? '<span class="badge ex">Lịch mẫu - cập nhật sau</span>' : '') +
        `<table class="tbl" style="margin-top:8px"><thead><tr><th>Ngày</th><th>Giờ (VN)</th><th>Chủ đề</th></tr></thead><tbody>${sc.sessions.map(s => `<tr><td><b>${DAYS[s.day]}</b> hằng tuần</td><td>${e(s.time)} · ${s.duration}′</td><td style="text-align:left">${e(s.title)}<br><small class="muted">${e(s.desc || '')}</small></td></tr>`).join('')}</tbody></table>`;
      $('topics').innerHTML = sc.topics.map(t => `<li>${e(t)}</li>`).join('');
      if (sc.liveVideoId) $('chat').innerHTML = `<iframe src="https://www.youtube.com/live_chat?v=${encodeURIComponent(sc.liveVideoId)}&embed_domain=${location.hostname}" style="width:100%;height:480px;border:0;border-radius:12px"></iframe>`;
    }
  });
  const pl = $('player');
  if (pl) {
    const src = { live: `https://www.youtube.com/embed/live_stream?channel=${CH}&autoplay=1&mute=1`, uploads: `https://www.youtube.com/embed/videoseries?list=${UU}` };
    const show = k => { pl.innerHTML = `<iframe src="${src[k]}" title="TRADING LIVE XAUUSD" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`; document.querySelectorAll('[data-pl]').forEach(b => b.classList.toggle('on', b.dataset.pl === k)); };
    document.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => show(b.dataset.pl));
    show('uploads');
    H.schedule.then(sc => { const n = sc && H.liveNext(sc.sessions); if (n && (n.live || n.start - Date.now() < 15 * 60e3)) show('live'); });
    $('archive-pl').innerHTML = `<iframe src="${src.uploads}" title="Video đã live" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`;
  }
});
