/* HuymasterGold79 – banner cảnh báo tin đỏ Mỹ (High impact) từ data/calendar-us.json.
   Hiện từ 15 phút trước đến 5 phút sau giờ ra tin. VI: giờ VN; EN: giờ ET. */
(function () {
  'use strict';
  const H = window.HMG; if (!H || window.__hmgNewsAlert) return; window.__hmgNewsAlert = 1;
  const EN = H.EN, BEFORE = 15 * 60e3, AFTER = 5 * 60e3;
  const st = document.createElement('style');
  st.textContent = '.hmg-news-alert{position:sticky;top:0;z-index:9999;background:#c62828;color:#fff;text-align:center;font-weight:700;font-size:.92rem;padding:8px 36px 8px 12px;line-height:1.35;animation:hmgBlink 1s steps(2,start) infinite}' +
    '.hmg-news-alert a{color:#fff;text-decoration:underline}.hmg-news-alert button{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:#fff;font-size:1.1rem;cursor:pointer}' +
    '@keyframes hmgBlink{50%{background:#8e0000}}@media (prefers-reduced-motion:reduce){.hmg-news-alert{animation:none}}';
  document.head.appendChild(st);
  let bar = null, events = [], closedKey = null;
  const timeFmt = (d) => EN
    ? d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET'
    : d.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hour12: false }) + ' VN';
  const name = e => EN ? (e.title || '') : (e.title_vi || e.title || '');
  function render() {
    const now = Date.now();
    const groups = {};
    events.forEach(e => { const t = Date.parse(e.time_utc); if (t - now <= BEFORE && now - t <= AFTER) (groups[t] = groups[t] || []).push(e); });
    const ts = Object.keys(groups).map(Number).sort((a, b) => a - b)[0];
    if (ts == null || closedKey === String(ts)) { if (bar) { bar.remove(); bar = null; } return; }
    const evs = groups[ts], names = [...new Set(evs.map(name))].join(', ');
    const mins = Math.ceil((ts - now) / 60e3), at = timeFmt(new Date(ts));
    const cal = EN ? 'en/economic-calendar.html' : 'lich-kinh-te.html';
    let msg;
    if (mins > 0) msg = EN ? `⚠️ High-impact US data in ${mins} min (${at}): ${names} – avoid opening trades right before the release, spreads widen.`
                          : `⚠️ ${mins} phút nữa (${at}) ra tin đỏ Mỹ: ${names} – tránh vào lệnh sát giờ tin, spread giãn.`;
    else msg = EN ? `⚠️ High-impact US data just released (${at}): ${names} – expect volatility, wait for spreads to normalize.`
                  : `⚠️ Tin đỏ Mỹ vừa ra (${at}): ${names} – giá biến động mạnh, chờ spread ổn định rồi hãy vào lệnh.`;
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'hmg-news-alert'; bar.setAttribute('role', 'alert');
      document.body.insertBefore(bar, document.body.firstChild);
    }
    bar.innerHTML = `${H.esc(msg)} <a href="${cal}">${EN ? 'Calendar' : 'Lịch kinh tế'}</a><button type="button" aria-label="${EN ? 'Close' : 'Đóng'}">×</button>`;
    bar.querySelector('button').onclick = () => { closedKey = String(ts); render(); };
  }
  function load() {
    H.getJSON(H.ROOT + 'data/calendar-us.json').then(j => {
      events = ((j && j.events) || []).filter(e => e.impact === 'High' && e.time_utc); render();
    }).catch(() => { });
  }
  load(); setInterval(render, 15e3); setInterval(load, 10 * 60e3);
})();
