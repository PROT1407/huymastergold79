/* HuymasterGold79 – English H79 analysis renderer (en/h79-analysis.html, en/index.html).
   Reads data/strategies.json. Uses *_en fields when present, otherwise falls back gracefully:
   trend from the enum, zones/SL/TP numbers (reformatted 4.211 → 4,211), details → link to the Vietnamese page. */
(function () {
  'use strict';
  const H = window.HMG, E = H.esc, $ = id => document.getElementById(id);
  const TI = { up: ['🔺', 'Bullish'], down: ['🔻', 'Bearish'], side: ['↔️', 'Sideways'] };
  const SES = { 'Phiên Á': 'Asian session', 'Phiên Âu': 'European session', 'Phiên Mỹ': 'US session', 'Phiên Âu – Mỹ': 'European – US session' };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const num = t => String(t == null ? '' : t).replace(/(\d)\.(\d{3})(?!\d)/g, '$1,$2'); // VN thousands "." → ","
  const hasVi = t => /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(t || '');
  const pick = (o, k) => o[k + '_en'];
  const dEN = d => { const [y, m, dd] = d.split('-'); return `${+dd} ${MON[+m - 1]} ${y}`; };
  const when = s => `${s.time ? E(s.time) + ' ' : ''}${dEN(s.date)} (Vietnam time, GMT+7)`;
  const ses = s => E(s.session_en || SES[s.session] || '');
  const zoneTxt = o => o.zone_en || (hasVi(o.zone) ? num(o.zone.replace(/\s*\(.*?\)\s*/g, ' ').trim()) : num(o.zone));
  function sumHTML(s) {
    const m = s.summary; if (!m) return '';
    const tk = m.trend || s.trendType || 'side', t = TI[tk] || TI.side;
    const z = (o, c, ic, lb) => o && o.zone ? `<div class="z ${c}">${ic} ${lb} <b>${E(zoneTxt(o))}</b>${o.sl ? ` <span class="k">| SL</span> ${E(num(o.sl_en || o.sl))}` : ''}${o.tp ? ` <span class="k">| TP</span> ${E(num(o.tp_en || o.tp))}` : ''}</div>` : '';
    const pn = m.priceNote_en || (m.price === 'spot' ? 'Spot XAU/USD price' : m.price === 'futures' ? 'COMEX gold futures price (GC=F), not spot' : '');
    return `<div class="h79s"><div class="t ${tk}">Trend: ${t[0]} ${E(m.trendText_en || t[1])}</div>${z(m.sell, 'sell', '🔴', 'SELL')}${z(m.buy, 'buy', '🟢', 'BUY')}${m.note_en ? `<div class="n">⚠️ ${E(m.note_en)}</div>` : ''}${pn ? `<div class="p">💲 ${m.price === 'spot' ? '✅' : '⚠️'} ${E(pn)}</div>` : ''}</div>`;
  }
  const list = (arr, h) => arr && arr.length ? `<div class="card" style="margin:0 0 12px"><h3>${h}</h3><ul style="padding-left:18px">${arr.map(x => `<li>${E(x)}</li>`).join('')}</ul></div>` : '';
  const viLink = s => `chien-luoc.html?ngay=${encodeURIComponent(s.id || s.date)}`;
  function details(s) {
    const lv = `<div class="grid g3" style="margin:14px 0"><div class="card"><h3>🟢 Support (USD/oz)</h3>${(s.support || []).map(v => `<span class="pill s">${num(H.fmt(v))}</span> `).join('')}</div><div class="card"><h3>🔴 Resistance (USD/oz)</h3>${(s.resistance || []).map(v => `<span class="pill r">${num(H.fmt(v))}</span> `).join('')}</div></div>`;
    const any = s.trend_en || s.entryZones_en || s.scenarios_en;
    return `${s.trend_en ? `<p><b>Detailed trend:</b> ${E(s.trend_en)}</p>` : ''}${lv}${list(s.entryZones_en, '🎯 Buy zones')}${list(s.sellZones_en, '🔻 Sell zones / invalidation')}${list(s.scenarios_en, '🧭 Plan & scenarios')}${s.physicalAdvice_en ? `<div class="note"><b>🏅 Physical gold:</b> ${E(s.physicalAdvice_en)}</div>` : ''}${list(s.macro_en, '🌐 Macro context')}${s.notes_en ? `<p class="muted small" style="margin-top:8px">📝 ${E(s.notes_en)}</p>` : ''}${s.dataTime_en ? `<p class="small muted">🕐 ${E(s.dataTime_en)}</p>` : ''}${any ? '' : `<p class="small muted">Full indicator details for this post are available in Vietnamese only.</p>`}<p class="small"><a href="${viLink(s)}" hreflang="vi">🇻🇳 Read the full original (Vietnamese) →</a></p>`;
  }
  const title = s => s.title_en || `H79 ANALYSIS – ${ses(s) || 'Gold'} ${dEN(s.date)}`;
  function full(s) {
    return `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px"><div><span class="muted">📅 ${ses(s) ? ses(s) + ' · ' : ''}${when(s)}</span><h2 style="font-size:1.4rem;color:var(--txt);margin:4px 0">${E(title(s))}</h2></div><div><span class="badge ex">H79 ANALYSIS</span></div></div>${sumHTML(s)}<details class="h79more"><summary>See more: indicators, scenarios, macro</summary>${details(s)}</details><p class="small muted" style="margin-top:8px"><i>${E(s.disclaimer_en || 'Technical analysis for reference only, not investment advice.')}</i></p>`;
  }
  function compact(s) {
    return `<span class="tag">⚡ ${ses(s) ? ses(s) + ' · ' : ''}${when(s)}</span> <span class="badge ex">H79 ANALYSIS</span><h2>${E(title(s))}</h2>${sumHTML(s)}<a class="btn" style="margin-top:10px" href="en/h79-analysis.html">Open the H79 analysis →</a>`;
  }
  if (!$('strategy') && !$('quick')) return;
  H.getJSON('data/strategies.json').then(d => {
    const key = s => s.id || s.date;
    const L = (d.strategies || []).filter(s => !s.example).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    if (!L.length) { ($('strategy') || $('quick')).textContent = 'No analysis published yet.'; return; }
    if ($('quick')) $('quick').innerHTML = compact(L[0]);
    if (!$('strategy')) return;
    const arc = $('archive'), want = new URLSearchParams(location.search).get('id');
    const show = s => { $('strategy').innerHTML = full(s); arc.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.d === key(s))); };
    arc.innerHTML = L.map(s => { const m = s.summary || {}, t = TI[m.trend || s.trendType] || TI.side; return `<button type="button" data-d="${E(key(s))}"><b>${dEN(s.date)}${s.time ? ' ' + E(s.time) : ''}</b>${ses(s) ? ' · ' + ses(s) : ''} – ${t[0]} ${E(m.trendText_en || t[1])}${m.sell && m.sell.zone ? ' · 🔴 SELL ' + E(zoneTxt(m.sell)) : ''}${m.buy && m.buy.zone ? ' · 🟢 BUY ' + E(zoneTxt(m.buy)) : ''}</button>`; }).join('');
    arc.onclick = e => { const b = e.target.closest('button'); if (b) { show(L.find(s => key(s) === b.dataset.d)); scrollTo({ top: 0, behavior: 'smooth' }); } };
    show(L.find(s => key(s) === want) || L[0]);
  }).catch(e => { console.warn(e); $('strategy') && ($('strategy').textContent = 'Could not load the analysis.'); });
})();
