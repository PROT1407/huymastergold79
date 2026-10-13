/* CME FedWatch (data/fedwatch.json): xác suất lãi suất Fed cho các cuộc họp FOMC tới. #fedwatch = bản đầy đủ, #fedwatch-mini = bản gọn trang chủ */
document.addEventListener('DOMContentLoaded', () => {
  const full = document.getElementById('fedwatch'), mini = document.getElementById('fedwatch-mini');
  if (!full && !mini) return;
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const R = r => (r[0] / 100).toFixed(2).replace('.', ',') + '–' + (r[1] / 100).toFixed(2).replace('.', ',') + '%';
  const pc = v => v.toFixed(1).replace('.', ',') + '%';
  const CME = 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html';
  const kind = (r, cur) => r[0] === cur[0] ? ['hold', 'Giữ nguyên'] : r[0] < cur[0] ? ['cut', 'Giảm ' + (cur[0] - r[0]) + 'bps'] : ['hike', 'Tăng ' + (r[0] - cur[0]) + 'bps'];
  const pending = el => el && (el.innerHTML = `<div class="fw-pending">⏳ Dữ liệu FedWatch <b>đang cập nhật</b>. Xem trực tiếp tại <a href="${CME}" target="_blank" rel="noopener">CME FedWatch ↗</a></div>`);
  fetch('data/fedwatch.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
    const m = (d.meetings || []).filter(x => new Date(x.decision) > Date.now() - 864e5);
    if (!m.length || !d.current_range) { pending(full); pending(mini); return; }
    const cur = d.current_range, n = m[0];
    const sum = (x, k) => x.probs.filter(p => kind(p.range, cur)[0] === k).reduce((a, p) => a + p.p, 0);
    const pill = (x) => ['cut', 'hold', 'hike'].map(k => `<span class="fw-pill ${k}">${({ cut: '⬇ Giảm', hold: '⏸ Giữ', hike: '⬆ Tăng' })[k]} <b>${pc(sum(x, k))}</b></span>`).join('');
    const bars = x => x.probs.slice().sort((a, b) => a.range[0] - b.range[0]).map(p => { const [k, t] = kind(p.range, cur); return `<div class="fw-row"><div class="fw-lb"><b>${R(p.range)}</b><small class="${k}">${t}</small></div><div class="fw-track"><i class="${k}" style="--w:${p.p}%"></i></div><b class="fw-v">${pc(p.p)}</b></div>`; }).join('');
    const src = `<p class="small muted fw-src">Nguồn: <a href="${e(d.cme_url || CME)}" target="_blank" rel="noopener">CME FedWatch ↗</a> · số liệu trích từ <a href="${e(d.source.url)}" target="_blank" rel="noopener">${e(d.source.name)}</a> · cập nhật ${e(d.updated_vn)}</p>`;
    const head = `<div class="fw-head"><div><small class="muted">Họp FOMC tiếp theo</small><b>${e(n.label)}</b></div><div><small class="muted">Lãi suất hiện tại</small><b>${R(cur)}</b></div></div>`;
    if (mini) mini.innerHTML = head + `<div class="fw-pills">${pill(n)}</div>${bars(n)}<p class="small muted fw-src">Nguồn: <a href="${e(d.cme_url || CME)}" target="_blank" rel="noopener">CME FedWatch ↗</a> · ${e(d.updated_vn)} · <a href="tin-tuc.html#fedwatch-sec">Chi tiết →</a></p>`;
    if (full) {
      const rs = [...new Set(m.flatMap(x => x.probs.map(p => p.range[0])))].sort((a, b) => a - b);
      const tbl = `<div class="tbl-wrap"><table class="tbl fw-tbl"><thead><tr><th>Cuộc họp</th>${rs.map(r => `<th>${R([r, r + 25])}</th>`).join('')}</tr></thead><tbody>${m.map(x => `<tr><td><b>${e(x.label)}</b></td>${rs.map(r => { const p = x.probs.find(q => q.range[0] === r); const mx = Math.max(...x.probs.map(q => q.p)); return `<td class="${p && p.p === mx ? 'fw-max' : ''}">${p ? pc(p.p) : '–'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
      full.innerHTML = `<div class="grid fw-grid"><div>${head}<div class="fw-pills">${pill(n)}</div>${bars(n)}</div><div><h3>📅 Xác suất các cuộc họp tới</h3>${tbl}<p class="small muted" style="margin-top:6px">Ô sáng = kịch bản có xác suất cao nhất. Xác suất tính theo mức lãi suất mục tiêu sau cuộc họp.</p></div></div>${src}`;
    }
  }).catch(err => { console.warn(err); pending(full); pending(mini); });
});
