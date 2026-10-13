/* Vàng trong nước sáng nay – data/vn-gold-daily.json */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const H = window.HMG, $ = id => document.getElementById(id), e = H.esc;
  if (!$('vn-daily') && !$('vn-home')) return;
  const tr = v => (v / 1e6).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const chg = v => !v ? '<span class="vg-ch side">= 0</span>' : `<span class="vg-ch ${v > 0 ? 'up' : 'down'}">${v > 0 ? '▲' : '▼'} ${(Math.abs(v) / 1e3).toLocaleString('vi-VN')}k</span>`;
  const a = (s, t) => `<a href="${e(s.url || s)}" target="_blank" rel="noopener">${e(t || s.name)} ↗</a>`;
  H.getJSON('data/vn-gold-daily.json').then(d => {
    const sjc = d.rows.find(r => r.code === 'SJL1L10'), ring = d.rows.find(r => r.code === 'SJ9999'), w = d.world, pk = d.peak;
    const vt = a(d.sources.vang_today, 'vang.today'), loss = pk ? pk.sell - sjc.buy : 0;
    const head = `<div class="vg-hero">
      <div class="vg-big"><span>🧱 Vàng miếng SJC</span><b>${tr(sjc.buy)} – ${tr(sjc.sell)}</b><small>triệu đồng/lượng (mua – bán) ${chg(sjc.chg_sell)}</small></div>
      ${ring ? `<div class="vg-big"><span>💍 Nhẫn tròn 9999 SJC</span><b>${tr(ring.buy)} – ${tr(ring.sell)}</b><small>triệu đồng/lượng ${chg(ring.chg_sell)}</small></div>` : ''}
      <div class="vg-big gap"><span>⚖ Chênh SJC bán ra – thế giới</span><b>+${tr(w.gap_sjc_sell)} tr</b><small>TG ${w.xau_usd.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} USD/oz ≈ ${tr(w.vnd_per_luong)} tr/lượng</small></div></div>`;
    if ($('vn-home')) {
      $('vn-home').innerHTML = head + `<div class="vg-row2">${pk ? `<div class="vg-peak mini"><b>📉 Người mua đỉnh ${H.dateVN(pk.date)} (${tr(pk.sell)} tr) đang lỗ ≈ ${tr(loss)} triệu/lượng</b></div>` : ''}
        <div class="vg-adv mini"><b>💡 Lời khuyên:</b> ${e(d.advice)}</div></div>
        <p class="small muted">Giá: ${vt} lúc ${e(d.vt_time)} · <a href="gia-vang.html#vn-daily">Xem phân tích đầy đủ →</a></p>`;
    }
    if (!$('vn-daily')) return;
    const tbl = g => `<table class="tbl vg-tbl"><thead><tr><th>Thương hiệu</th><th>Mua</th><th>Bán</th><th>So hôm qua</th></tr></thead><tbody>${d.rows.filter(r => r.group === g).map(r => `<tr><td><b>${e(r.brand)}</b><br><small class="muted">${e(r.type)}</small></td><td>${tr(r.buy)}</td><td><b>${tr(r.sell)}</b></td><td>${chg(r.chg_sell)}</td></tr>`).join('')}</tbody></table>`;
    const hs = d.history.SJL1L10 || [], hr = d.history.SJ9999 || [];
    let chart = '';
    if (hs.length > 2) {
      const all = hs.map(x => x.sell).concat(hr.map(x => x.sell)), mn = Math.min(...all) - 1e6, mx = Math.max(...all) + 1e6, W = 600, Hh = 180;
      const X = i => 30 + i * (W - 40) / (hs.length - 1), Y = v => 10 + (mx - v) / (mx - mn) * (Hh - 30);
      const path = arr => arr.map((x, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x.sell).toFixed(1)).join(' ');
      chart = `<svg viewBox="0 0 ${W} ${Hh}" class="vg-chart" role="img" aria-label="Giá bán SJC 30 ngày"><path d="${path(hs)} L ${X(hs.length - 1)} ${Hh - 20} L 30 ${Hh - 20} Z" fill="rgba(240,185,11,.12)"/><path d="${path(hs)}" fill="none" stroke="#f0b90b" stroke-width="2.5" class="vg-line"/>${hr.length === hs.length ? `<path d="${path(hr)}" fill="none" stroke="#16c784" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
        <text x="30" y="${Hh - 4}" class="vg-ax">${H.dateVN(hs[0].date).slice(0, 5)}</text><text x="${W - 10}" y="${Hh - 4}" text-anchor="end" class="vg-ax">${H.dateVN(hs[hs.length - 1].date).slice(0, 5)}</text>
        <text x="4" y="${Y(mx - 1e6) + 4}" class="vg-ax">${tr(mx - 1e6)}</text><text x="4" y="${Y(mn + 1e6) + 4}" class="vg-ax">${tr(mn + 1e6)}</text>
        <circle cx="${X(hs.length - 1)}" cy="${Y(hs[hs.length - 1].sell)}" r="5" fill="#f0b90b" class="vg-dot"/></svg>
        <p class="small muted"><span style="color:#f0b90b">━</span> SJC miếng (bán ra) · <span style="color:#16c784">┅</span> Nhẫn SJC 9999 (bán ra) · 30 ngày, triệu đồng/lượng · Nguồn ${vt}</p>`;
    }
    $('vn-daily').innerHTML = `<div class="vg-top"><span class="vg-tag">☀ VÀNG TRONG NƯỚC SÁNG NAY</span><span class="muted small">Cập nhật ${e(d.updated_vn)} (giờ VN) · giá ${vt} lúc ${e(d.vt_time)}</span></div>${head}
      <div class="vg-grid">
        <div class="card vg-c"><h3>🧱 Vàng miếng SJC</h3>${tbl('mieng')}</div>
        <div class="card vg-c"><h3>💍 Vàng nhẫn</h3>${tbl('nhan')}</div>
        <div class="card vg-c"><h3>📈 Giá bán 30 ngày</h3>${chart || '<p class="muted small">Chưa đủ dữ liệu.</p>'}</div>
        ${pk ? `<div class="card vg-peak"><h3>📉 Người mua từ đỉnh</h3><div class="vg-pk"><div><small>Đỉnh ${H.dateVN(pk.date)} (bán ra)</small><b>${tr(pk.sell)}</b></div><i>→</i><div><small>Bán lại hôm nay (mua vào)</small><b>${tr(sjc.buy)}</b></div></div>
          <div class="vg-loss">Lỗ ≈ <b>${tr(loss)} triệu đồng/lượng</b> <small>(−${(loss / pk.sell * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%)</small></div>
          <p class="small">Chênh lệch mua – bán SJC hiện: <b>${tr(sjc.sell - sjc.buy)} triệu/lượng</b> – mua hôm nay phải tăng ngần ấy mới hòa vốn.</p>
          <p class="small muted">${e(pk.note)} – ${a(pk.source)}</p></div>` : ''}
      </div>
      <div class="card vg-an"><h3>📝 Nhận định H79</h3><ul>${(d.analysis || []).map(x => `<li>${e(x)}</li>`).join('')}</ul></div>
      <div class="vg-adv"><b>💡 Lời khuyên:</b> ${e(d.advice)}</div>
      <div class="small muted vg-src"><b>Nguồn & ghi chú:</b> Giá thương hiệu: ${vt} (tổng hợp SJC, DOJI, PNJ, Bảo Tín Minh Châu). Giá thế giới: ${a(d.sources.gold_api, 'gold-api.com')} lúc ${new Date(w.xau_time_utc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}; tỷ giá ${Math.round(w.usdvnd).toLocaleString('vi-VN')} VND/USD (${a(d.sources.fx, 'open.er-api.com')}, tỷ giá thị trường); quy đổi = USD/oz × USD/VND × 1,20565, chưa gồm thuế phí.
      ${(d.refs || []).map(r => `<div style="margin-top:6px">📰 ${a(r, r.name)}<ul>${(r.facts || []).map(f => `<li>${e(f)}</li>`).join('')}</ul></div>`).join('')}<p><i>Nội dung tham khảo, không phải lời khuyên đầu tư.</i></p></div>`;
  }).catch(err => { console.warn(err); ['vn-daily', 'vn-home'].forEach(i => { if ($(i)) $(i).innerHTML = '<p class="muted">Chưa tải được dữ liệu vàng trong nước.</p>'; }); });
});
