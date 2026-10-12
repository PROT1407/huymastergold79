/* Trang Forex: quỹ & tài khoản follow – dữ liệu từ data/fund.json, data/follow-accounts.json */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const H = window.HMG, $ = id => document.getElementById(id), e = H.esc, f = H.fmt;
  const pct = n => n == null ? '—' : `<span class="${n >= 0 ? 'up' : 'down'}">${n >= 0 ? '+' : ''}${f(n, 1)}%</span>`;
  const sample = ex => ex ? '<span class="badge ex">SỐ LIỆU VÍ DỤ MẪU</span>' : '';
  if ($('fund')) H.getJSON('data/fund.json').then(d => {
    $('fund-intro').innerHTML = `${sample(d.example)} <p style="margin-top:8px">${e(d.intro)}</p>`;
    $('fund-summary').innerHTML = d.summary.map(s => `<div class="card tile"><div class="sub">${e(s.label)}</div><div class="val" style="font-size:1.15rem">${e(s.value)}</div></div>`).join('');
    $('fund-roadmap').innerHTML = d.roadmap.map((r, i) => `<div class="card"><span class="tag" style="background:var(--gold);color:#1a1405;padding:2px 8px;border-radius:6px;font-weight:800;font-size:.75rem">BƯỚC ${i + 1} · ${e(r.time)}</span><h3 style="margin-top:8px">${e(r.phase)}</h3><p class="muted">${e(r.desc)}</p></div>`).join('');
    $('fund-risk').innerHTML = d.risk_rules.map(r => `<li>${e(r)}</li>`).join('');
    const tot = d.performance.reduce((a, r) => a * (1 + r.return_pct / 100), 1) - 1;
    $('fund-perf').innerHTML = `${sample(d.example)}<table class="tbl" style="margin-top:8px"><thead><tr><th>Tháng</th><th>Lợi nhuận</th><th>Sụt giảm tối đa</th><th>Số lệnh</th><th>Ghi chú</th></tr></thead><tbody>${d.performance.map(r => `<tr><td>${e(r.month.slice(5) + '/' + r.month.slice(0, 4))}</td><td>${pct(r.return_pct)}</td><td class="down">-${f(r.max_dd_pct, 1)}%</td><td>${f(r.trades)}</td><td class="muted">${e(r.note)}</td></tr>`).join('')}</tbody></table><p class="small muted" style="margin-top:6px">Lũy kế (ví dụ): ${pct(tot * 100)}</p>`;
  }).catch(err => { console.warn(err); $('fund-perf').textContent = 'Không tải được data/fund.json'; });

  if ($('follow')) H.getJSON('data/follow-accounts.json').then(d => {
    $('fl-steps').innerHTML = d.steps.map((s, i) => `<div class="card"><div style="width:38px;height:38px;border-radius:50%;background:var(--gold);color:#1a1405;display:grid;place-items:center;font-weight:900">${i + 1}</div><h3 style="margin-top:10px">${e(s.title)}</h3><p class="muted small">${e(s.desc)}</p></div>`).join('');
    $('fl-acc').innerHTML = d.accounts.map(a => `<div class="card">${sample(d.example)}<h3 style="margin-top:8px">${e(a.name)}</h3><p class="muted small">${e(a.platform)} · ${e(a.style)}</p>
      <div class="mini-out"><div><span>Tăng trưởng</span><b>${pct(a.gain_pct)}</b></div><div class="r"><span>Sụt giảm tối đa</span><b class="down">-${f(a.max_dd_pct, 1)}%</b></div><div><span>Thời gian</span><b>${f(a.months)} tháng</b></div><div><span>Vốn tối thiểu</span><b>${e(a.min_deposit)}</b></div></div>
      <p class="small" style="margin-top:8px">Trạng thái: <b>${e(a.status)}</b> · Người theo dõi: ${f(a.followers)}</p>
      <div class="share">${a.verify_url ? `<a href="${e(a.verify_url)}" target="_blank" rel="noopener">🔎 Xác minh kết quả</a>` : '<span class="muted small">Chưa có link xác minh</span>'}<a href="#" data-zalo>💬 Đăng ký qua Zalo</a></div></div>`).join('');
    $('fl-faq').innerHTML = d.faq.map(q => `<details class="card" style="margin-bottom:10px"><summary>${e(q.q)}</summary><p style="margin-top:8px">${e(q.a)}</p></details>`).join('');
  }).catch(err => { console.warn(err); $('fl-acc').textContent = 'Không tải được data/follow-accounts.json'; });
});
