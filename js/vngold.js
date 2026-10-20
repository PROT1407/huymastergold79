/* Vàng trong nước sáng nay – data/vn-gold-daily.json */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  const H = window.HMG, $ = id => document.getElementById(id), e = H.esc;
  if (!$('vn-daily') && !$('vn-home')) return;
  const tr = v => v == null || isNaN(v) ? '–' : (v / 1e6).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const chg = v => !v ? '<span class="vg-ch side">= 0</span>' : `<span class="vg-ch ${v > 0 ? 'up' : 'down'}">${v > 0 ? '▲' : '▼'} ${(Math.abs(v) / 1e3).toLocaleString('vi-VN')}k</span>`;
  const a = (s, t) => `<a href="${e(s.url || s)}" target="_blank" rel="noopener">${e(t || s.name)} ↗</a>`;
  H.getJSON('data/vn-gold-daily.json').then(d => {
    const sjc = d.rows.find(r => r.code === 'SJL1L10'), ring = d.rows.find(r => r.code === 'SJ9999'), w = d.world, pk = d.peak;
    const al = (u, n) => `<a href="${e(u)}" target="_blank" rel="noopener">${e(n)}</a>`;
    const srcA = r => {
      if (!r || !r.src_url) return '–';
      if (r.src_mode === 'chain') {
        const via = (r.src_via || []).map(x => al(x.url, x.name)).join(' / ');
        return `${e(r.src_brand)} (${al(r.src_url, r.src_host)}) · qua ${via}`;
      }
      if (r.src_mode === 'direct') return `${e(r.src_brand)} (${al(r.src_url, r.src_host)}) – trực tiếp`;
      return a({ url: r.src_url, name: r.src_name });
    };
    const vt = srcA(sjc), loss = pk && sjc.buy ? pk.sell - sjc.buy : null;
    const head = `<div class="vg-hero">
      <div class="vg-big"><span>🧱 Vàng miếng SJC</span><b>${tr(sjc.buy)} – ${tr(sjc.sell)}</b><small>triệu đồng/lượng (mua – bán) ${chg(sjc.chg_sell)}</small></div>
      ${ring ? `<div class="vg-big"><span>💍 Nhẫn tròn 9999 SJC</span><b>${tr(ring.buy)} – ${tr(ring.sell)}</b><small>triệu đồng/lượng ${chg(ring.chg_sell)}</small></div>` : ''}
      <div class="vg-big gap"><span>⚖ Chênh SJC bán ra – thế giới</span><b>+${tr(w.gap_sjc_sell)} tr</b><small>TG ${w.xau_usd.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} USD/oz ≈ ${tr(w.vnd_per_luong)} tr/lượng</small></div></div>`;
    if ($('vn-home')) {
      $('vn-home').innerHTML = `<div class="vg-head ${sjc.chg_sell > 0 ? 'up' : sjc.chg_sell < 0 ? 'down' : 'side'}">Hôm nay vàng miếng SJC ${sjc.chg_sell ? `<b>${sjc.chg_sell > 0 ? 'tăng' : 'giảm'} ${tr(Math.abs(sjc.chg_sell))} triệu/lượng</b>` : '<b>đứng giá</b>'}</div>` + head + `<div class="vg-row2">${pk ? `<div class="vg-peak mini"><b>📉 Người mua đỉnh ${H.dateVN(pk.date)} (${tr(pk.sell)} tr) đang lỗ ≈ ${tr(loss)} triệu/lượng</b></div>` : ''}
        <div class="vg-adv mini"><b>💡 Lời khuyên:</b> ${e(d.advice).replace(/\n/g, '<br>')}</div></div>
        <p class="small muted">Nguồn: ${vt}${d.price_time ? ` lúc ${e(d.price_time)}` : ''} · <a href="gia-vang.html#vn-daily">Xem phân tích đầy đủ →</a></p>`;
    }
    if (!$('vn-daily')) return;
    const chg2 = v => v == null ? '<span class="vg-ch side">chưa có</span>' : chg(v);
    const BR = [['SJC', '🏛 SJC'], ['DOJI', '🔷 DOJI'], ['PNJ', '💎 PNJ'], ['BTMC', '🟡 Bảo Tín Minh Châu'], ['Phú Quý', '🟠 Phú Quý'], ['Mi Hồng', '🌸 Mi Hồng']];
    const coOf = r => r.co || (/DOJI/.test(r.brand) ? 'DOJI' : /PNJ/.test(r.brand) ? 'PNJ' : /Bảo Tín/.test(r.brand) ? 'BTMC' : r.brand);
    const brandCard = ([co, title]) => {
      const rs = d.rows.filter(r => coOf(r) === co); if (!rs.length) return '';
      const srcs = [...new Map(rs.filter(r => r.src_url).map(r => [r.src_name, r])).values()];
      return `<div class="card vg-b"><h3>${e(title)}</h3><table class="tbl vg-tbl"><thead><tr><th>Loại</th><th>Mua</th><th>Bán</th><th>± hôm qua</th><th>Chênh M–B</th><th>Cao hơn TG</th></tr></thead><tbody>${rs.map(r => `<tr><td>${e(r.type)}${r.brand !== co && r.brand !== title.slice(3) ? `<br><small class="muted">${e(r.brand)}</small>` : ''}<br><small class="muted">Nguồn: ${srcA(r)}</small></td><td>${tr(r.buy)}</td><td><b>${tr(r.sell)}</b></td><td>${r.sell == null ? '–' : chg2(r.chg_sell)}</td><td>${r.sell == null ? '–' : tr(r.sell - r.buy)}</td><td>${r.sell && w.vnd_per_luong ? `<span class="vg-ch down">+${tr(r.sell - w.vnd_per_luong)}</span>` : '–'}</td></tr>`).join('')}</tbody></table>
        <p class="small muted">Nguồn: ${srcs.map(r => srcA(r) + (r.src_time ? ` · ${e(r.src_time)}` : '')).join('; ') || '–'}</p></div>`;
    };

    const tipGrp = (g, title) => {
      const rs = d.rows.filter(r => r.group === g && r.buy > 0 && r.sell > 0); if (!rs.length) return '';
      const nm = r => e(r.brand) + (/^Vàng miếng SJC$/.test(r.type) || g === 'mieng' ? '' : ` <small>(${e(r.type)})</small>`);
      const pick = (f, best) => { const v = best(...rs.map(f)); return [v, rs.filter(r => f(r) === v)]; };
      const [ms, lo] = pick(r => r.sell, Math.min), [mb, hi] = pick(r => r.buy, Math.max);
      const sp = rs.map(r => r.sell - r.buy), spMin = Math.min(...sp), spMax = Math.max(...sp);
      const col = v => spMax === spMin ? 120 : Math.round(120 - (v - spMin) / (spMax - spMin) * 120);
      const bars = [...rs].sort((x, y) => (x.sell - x.buy) - (y.sell - y.buy)).map(r => { const v = r.sell - r.buy;
        return `<div class="bt-bar"><span>${e(r.brand)}</span><i style="width:${Math.max(8, v / spMax * 100).toFixed(0)}%;background:hsl(${col(v)},70%,45%)"></i><b style="color:hsl(${col(v)},75%,35%)">${tr(v)}</b></div>`; }).join('');
      const W = w.vnd_per_luong, gm = W ? Math.min(...rs.map(r => r.sell - W)) : null;
      const wg = W ? [...rs].sort((x, y) => x.sell - y.sell).map(r => { const v = r.sell - W, best = v === gm;
        return `<span class="bt-chip${best ? ' best' : ''}">${e(r.brand)}: <b>+${tr(v)} tr</b> (${(v / W * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%)${best ? ' ✅ ít bị hớ nhất' : ''}</span>`; }).join('') : '';
      return `<div class="bt-g"><h4>${title}</h4>
        <div class="bt-two"><div class="bt-k ok"><small>🛒 Mua rẻ nhất</small><b>${tr(ms)} tr</b><span>${lo.map(nm).join(', ')}</span></div>
        <div class="bt-k ok2"><small>💰 Bán lại được giá nhất</small><b>${tr(mb)} tr</b><span>${hi.map(nm).join(', ')}</span></div></div>
        <div class="bt-s"><small>📉 Mua xong lỗ ngay (chênh mua–bán, triệu/lượng)</small>${bars}</div>
        ${wg ? `<div class="bt-s"><small>🌍 Cao hơn thế giới (TG ≈ ${tr(W)} tr/lượng)</small><div class="bt-chips">${wg}</div></div>` : ''}</div>`;
    };
    const tipsBox = `<div class="card bt-box"><h3>💡 Mẹo cho người mua</h3><p class="small muted">Tự tính từ bảng giá lúc ${e(d.updated_vn || '')}, đơn vị triệu đồng/lượng.</p>
      <div class="bt-grid">${tipGrp('mieng', '🧱 Vàng miếng')}${tipGrp('nhan', '💍 Vàng nhẫn')}</div>
      <p class="bt-note">🏪 Tiệm nhỏ: so giá với các hãng lớn phía trên. Hỏi cả giá mua vào và bán ra; chênh lệch càng nhỏ càng có lợi cho người mua.</p></div>`;
    const dl = sjc.chg_sell || 0, hl = dl === 0 ? `Hôm nay vàng miếng SJC <b>đứng giá</b> ở ${tr(sjc.sell)} triệu/lượng (bán ra)` : `Hôm nay vàng miếng SJC <b>${dl > 0 ? 'tăng' : 'giảm'} ${tr(Math.abs(dl))} triệu/lượng</b>, bán ra ${tr(sjc.sell)} triệu`;
    const C = d.sjc_compare || {}, cmpBox = (k, lb) => { const x = C[k]; if (!x) return `<div class="vg-q"><small>${lb}</small><b class="muted">chưa đủ dữ liệu</b></div>`; const v = sjc.sell - x.sell;
      return `<div class="vg-q ${v > 0 ? 'up' : v < 0 ? 'down' : ''}"><small>${lb} (${H.dateVN(x.date).slice(0, 5)}: ${tr(x.sell)})</small><b>${v > 0 ? '▲ +' : v < 0 ? '▼ −' : '= '}${tr(Math.abs(v))} tr</b></div>`; };
    const gp = w.gap_sjc_sell == null ? 0 : w.gap_sjc_sell / w.vnd_per_luong * 100, verdict = gp > 8 ? ['đắt', 'Mua lúc này ĐẮT so với thế giới – trả thêm khoảng'] : gp > 3 ? ['hơi đắt', 'Mua lúc này HƠI ĐẮT so với thế giới – trả thêm khoảng'] : ['hợp lý', 'Mua lúc này tương đối HỢP LÝ so với thế giới – chênh chỉ'];
    const hs = d.history.SJL1L10 || [];
    let chart = '';
    if (hs.length > 2) {
      const v = hs.map(x => x.sell), mn = Math.min(...v) - 5e5, mx = Math.max(...v) + 5e5, W = 600, Hh = 190;
      const X = i => 44 + i * (W - 56) / (hs.length - 1), Y = q => 12 + (mx - q) / (mx - mn) * (Hh - 36);
      const pth = hs.map((x, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x.sell).toFixed(1)).join(' ');
      chart = `<svg viewBox="0 0 ${W} ${Hh}" class="vg-chart" role="img" aria-label="Giá bán SJC ${hs.length} ngày"><path d="${pth} L ${X(hs.length - 1)} ${Hh - 24} L 44 ${Hh - 24} Z" fill="rgba(240,185,11,.18)"/><path d="${pth}" fill="none" stroke="#e0a800" stroke-width="3" class="vg-line"/>
        <text x="44" y="${Hh - 6}" class="vg-ax">${H.dateVN(hs[0].date).slice(0, 5)}</text><text x="${W - 12}" y="${Hh - 6}" text-anchor="end" class="vg-ax">${H.dateVN(hs[hs.length - 1].date).slice(0, 5)}</text>
        <text x="2" y="${Y(Math.max(...v)) + 4}" class="vg-ax">${tr(Math.max(...v))}</text><text x="2" y="${Y(Math.min(...v)) + 4}" class="vg-ax">${tr(Math.min(...v))}</text>
        <circle cx="${X(hs.length - 1)}" cy="${Y(v[v.length - 1])}" r="5" fill="#e0a800" class="vg-dot"/></svg>
        <p class="small muted">SJC miếng – giá bán ra ${hs.length} ngày gần nhất, triệu đồng/lượng · ${e(d.history_note || 'Dữ liệu lưu hằng ngày của H79')}</p>`;
    }
    $('vn-daily').innerHTML = `<div class="vg-top"><span class="vg-tag">☀ VÀNG TRONG NƯỚC HÔM NAY</span><span class="muted small">Cập nhật ${e(d.updated_vn)} (giờ VN)</span></div>
      <div class="vg-head ${dl > 0 ? 'up' : dl < 0 ? 'down' : 'side'}">${dl > 0 ? '📈' : dl < 0 ? '📉' : '➖'} ${hl}</div>
      <div class="vg-qs">${cmpBox('d1', 'So hôm qua')}${cmpBox('w1', 'So 1 tuần trước')}${cmpBox('m1', 'So 1 tháng trước')}</div>
      <div class="vg-gapc ${verdict[0] === 'hợp lý' ? 'ok' : ''}"><div><small>SJC bán ra</small><b>${tr(sjc.sell)}</b></div><i>vs</i><div><small>Thế giới quy đổi</small><b>${tr(w.vnd_per_luong)}</b></div><i>=</i><div><small>Chênh</small><b>+${tr(w.gap_sjc_sell)} tr</b></div>
        <p>⚖ ${verdict[1]} <b>${tr(w.gap_sjc_sell)} triệu/lượng (≈${gp.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%)</b>. <small class="muted">TG ${w.xau_usd.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} USD/oz × ${Math.round(w.usdvnd).toLocaleString('vi-VN')} VND/USD × 1,20565, chưa thuế phí.</small></p></div>
      ${tipsBox}
      <div class="vg-brands">${BR.map(brandCard).join('')}</div>
      <div class="vg-grid">
        <div class="card vg-c"><h3>📈 Giá bán SJC ${hs.length} ngày</h3>${chart || '<p class="muted small">Chưa đủ dữ liệu.</p>'}</div>
        ${(d.world_news || []).length ? `<div class="card vg-c vg-news"><h3>🌍 Tin nóng vàng thế giới</h3><ul>${d.world_news.map(n => `<li>${e(n.text)}${n.source ? ` <small>– ${a(n.source)}</small>` : ''}</li>`).join('')}</ul>${d.quick_advice ? `<p class="vg-tip">👉 ${e(d.quick_advice)}</p>` : ''}</div>` : ''}
        ${pk ? `<div class="card vg-peak"><h3>📉 Người mua từ đỉnh</h3><div class="vg-pk"><div><small>Đỉnh ${H.dateVN(pk.date)} (bán ra)</small><b>${tr(pk.sell)}</b></div><i>→</i><div><small>Bán lại hôm nay (mua vào)</small><b>${tr(sjc.buy)}</b></div></div>
          <div class="vg-loss">Lỗ ≈ <b>${tr(loss)} triệu đồng/lượng</b> <small>(−${(loss / pk.sell * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%)</small></div>
          <p class="small muted">${e(pk.note)} – ${a(pk.source)}</p></div>` : ''}
      </div>
      <div class="card vg-an"><h3>📝 Nhận định H79</h3><ul>${(d.analysis || []).map(x => `<li>${e(x)}</li>`).join('')}</ul></div>
      <div class="vg-adv"><b>💡 Lời khuyên:</b> ${e(d.advice).replace(/\n/g, '<br>')}</div><div class="rx" data-rx="vn|${e((d.updated_vn || '').slice(-10))}"></div>
      <div class="small muted vg-src"><b>Nguồn & ghi chú:</b> SJC, DOJI, Bảo Tín Minh Châu: web chính thức (sjc.com.vn / doji.vn / btmc.vn) · qua ${a('https://giavang.org/', 'giavang.org')} / ${a('https://webgia.com/gia-vang/', 'webgia.com')}; PNJ, Phú Quý, Mi Hồng: website chính thức – trực tiếp (dự phòng cùng chuỗi qua giavang.org / webgia.com) – nguồn ghi ở từng dòng. Ô không đọc được hiển thị "–". Đơn vị: triệu đồng/lượng; Phú Quý/Mi Hồng niêm yết theo chỉ, đã nhân 10. "± hôm qua" so với giá chốt ngày giao dịch trước đã lưu (Phú Quý, Mi Hồng: bắt đầu lưu từ 15/10). Biểu đồ: dữ liệu lưu hằng ngày của H79. Giá thế giới: ${a(d.sources.gold_api, 'gold-api.com')} lúc ${new Date(w.xau_time_utc).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}; tỷ giá ${a(d.sources.fx, 'open.er-api.com')}.
      ${(d.refs || []).map(r => `<div style="margin-top:6px">📰 ${a(r, r.name)}<ul>${(r.facts || []).map(f => `<li>${e(f)}</li>`).join('')}</ul></div>`).join('')}<p><i>Nội dung tham khảo, không phải lời khuyên đầu tư.</i></p></div>`;
  }).catch(err => { console.warn(err); ['vn-daily', 'vn-home'].forEach(i => { if ($(i)) $(i).innerHTML = '<p class="muted">Chưa tải được dữ liệu vàng trong nước.</p>'; }); });
});
