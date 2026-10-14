/* HuymasterGold79 – English H79 analysis renderer (en/h79-analysis.html, en/index.html).
   Reads data/strategies.json. Uses *_en fields when present, otherwise falls back gracefully:
   trend from the enum, zones/SL/TP numbers (reformatted 4.211 → 4,211), details → link to the Vietnamese page. */
(function () {
  'use strict';
  const H = window.HMG, E = H.esc, $ = id => document.getElementById(id);
  const TI = { up: ['🔺', 'Bullish'], down: ['🔻', 'Bearish'], side: ['↔️', 'Sideways'] };
  // market-native session names; also normalizes older session_en values
  const SES = { 'Phiên Á': 'Asian session (Tokyo)', 'Phiên Âu': 'London session', 'Phiên Mỹ': 'New York session', 'Phiên Âu – Mỹ': 'London/NY overlap',
    'Asian session': 'Asian session (Tokyo)', 'European session': 'London session', 'US session': 'New York session', 'European – US session': 'London/NY overlap' };
  // Post times in data are Vietnam time (Asia/Ho_Chi_Minh, fixed UTC+7, no DST) -> shown in US Eastern with automatic DST
  const vnDate = s => { const [y, m, d] = s.date.split('-').map(Number), [hh, mm] = (s.time || '12:00').split(':').map(Number); return new Date(Date.UTC(y, m - 1, d, hh - 7, mm)); };
  const fET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fETd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
  const fLoc = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const etTime = s => s.time ? fET.format(vnDate(s)) + ' ET' : fETd.format(vnDate(s));
  const tip = s => s.time ? ` title="Your local time: ${E(fLoc.format(vnDate(s)))}"` : '';
  const num = t => String(t == null ? '' : t).replace(/(\d)\.(\d{3})(?!\d)/g, '$1,$2'); // VN thousands "." → ","
  const hasVi = t => /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(t || '');
  const pick = (o, k) => o[k + '_en'];
  const when = s => `<time datetime="${vnDate(s).toISOString()}"${tip(s)}>${E(etTime(s))}</time>`;
  const ses = s => E(SES[s.session_en] || s.session_en || SES[s.session] || '');
  const zoneTxt = o => o.zone_en || (hasVi(o.zone) ? num(o.zone.replace(/\s*\(.*?\)\s*/g, ' ').trim()) : num(o.zone));
  function sumHTML(s) {
    const m = s.summary; if (!m) return '';
    const tk = m.trend || s.trendType || 'side', t = TI[tk] || TI.side;
    const z = (o, c, ic, lb) => o && o.zone ? `<div class="z ${c}">${ic} ${lb} <b>${E(zoneTxt(o))}</b>${o.sl ? ` <span class="k">· Stop</span> ${E(num(o.sl_en || o.sl))}` : ''}${o.tp ? ` <span class="k">· Targets</span> ${E(num(o.tp_en || o.tp))}` : ''}</div>` : '';
    const pn = m.priceNote_en || (m.price === 'spot' ? 'Levels are spot XAU/USD' : m.price === 'futures' ? 'Levels are COMEX gold futures (GC=F), not spot' : '');
    return `<div class="h79s"><div class="t ${tk}">Bias: ${t[0]} ${E(m.trendText_en || t[1])}</div>${z(m.sell, 'sell', '🔴', 'Sell zone')}${z(m.buy, 'buy', '🟢', 'Buy zone')}${m.note_en ? `<div class="n">⚠️ Key risk: ${E(m.note_en.replace(/^key risk:\s*/i, ''))}</div>` : ''}${pn ? `<div class="p">💲 ${m.price === 'spot' ? '✅' : '⚠️'} ${E(pn)}</div>` : ''}</div>`;
  }
  const list = (arr, h) => arr && arr.length ? `<div class="card" style="margin:0 0 12px"><h3>${h}</h3><ul style="padding-left:18px">${arr.map(x => `<li>${E(x)}</li>`).join('')}</ul></div>` : '';
  const viLink = s => `chien-luoc.html?ngay=${encodeURIComponent(s.id || s.date)}`;
  function details(s) {
    const lv = `<div class="grid g3" style="margin:14px 0"><div class="card"><h3>🟢 Support (USD/oz)</h3>${(s.support || []).map(v => `<span class="pill s">${num(H.fmt(v))}</span> `).join('')}</div><div class="card"><h3>🔴 Resistance (USD/oz)</h3>${(s.resistance || []).map(v => `<span class="pill r">${num(H.fmt(v))}</span> `).join('')}</div></div>`;
    const any = s.trend_en || s.entryZones_en || s.scenarios_en;
    return `${s.trend_en ? `<p><b>Trend read:</b> ${E(s.trend_en)}</p>` : ''}${lv}${list(s.entryZones_en, '🎯 Long setups')}${list(s.sellZones_en, '🔻 Short setups & invalidation')}${list(s.scenarios_en, '🧭 Levels, indicators & scenarios')}${s.physicalAdvice_en ? `<div class="note"><b>🏅 Physical gold:</b> ${E(s.physicalAdvice_en)}</div>` : ''}${list(s.macro_en, '🌐 Macro backdrop')}${s.notes_en ? `<p class="muted small" style="margin-top:8px">📝 ${E(s.notes_en)}</p>` : ''}${s.dataTime_en ? `<p class="small muted">🕐 ${E(s.dataTime_en)}</p>` : ''}${any ? '' : `<p class="small muted">No detailed breakdown was published for this plan.</p>`}`;
  }
  const title = s => s.title_en || `H79 Gold Plan – ${ses(s) || 'XAUUSD'}, ${fETd.format(vnDate(s))}`;
  function full(s) {
    return `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px"><div><span class="muted">📅 ${ses(s) ? ses(s) + ' · ' : ''}${when(s)}</span><h2 style="font-size:1.4rem;color:var(--txt);margin:4px 0">${E(title(s))}</h2></div><div><span class="badge ex">H79 PLAN</span></div></div>${sumHTML(s)}<details class="h79more"><summary>Full breakdown: indicators, scenarios, macro</summary>${details(s)}</details><p class="small muted" style="margin-top:8px"><i>${E(s.disclaimer_en || 'Technical analysis for educational purposes only – not investment advice.')}</i></p>`;
  }
  function compact(s) {
    return `<span class="tag">⚡ ${ses(s) ? ses(s) + ' · ' : ''}${when(s)}</span> <span class="badge ex">H79 PLAN</span><h2>${E(title(s))}</h2>${sumHTML(s)}<a class="btn" style="margin-top:10px" href="en/h79-analysis.html">See the full plan →</a>`;
  }
  if (!$('strategy') && !$('quick')) return;
  H.getJSON('data/strategies.json').then(d => {
    const key = s => s.id || s.date;
    const L = (d.strategies || []).filter(s => !s.example).sort((a, b) => vnDate(b) - vnDate(a));
    if (!L.length) { ($('strategy') || $('quick')).textContent = 'No analysis published yet.'; return; }
    if ($('quick')) $('quick').innerHTML = compact(L[0]);
    if (!$('strategy')) return;
    const arc = $('archive'), want = new URLSearchParams(location.search).get('id');
    const show = s => { $('strategy').innerHTML = full(s); arc.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.d === key(s))); };
    arc.innerHTML = L.map(s => { const m = s.summary || {}, t = TI[m.trend || s.trendType] || TI.side; return `<button type="button" data-d="${E(key(s))}"><b>${E(etTime(s))}</b>${ses(s) ? ' · ' + ses(s) : ''} – ${t[0]} ${E(m.trendText_en || t[1])}${m.sell && m.sell.zone ? ' · 🔴 Sell ' + E(zoneTxt(m.sell)) : ''}${m.buy && m.buy.zone ? ' · 🟢 Buy ' + E(zoneTxt(m.buy)) : ''}</button>`; }).join('');
    arc.onclick = e => { const b = e.target.closest('button'); if (b) { show(L.find(s => key(s) === b.dataset.d)); scrollTo({ top: 0, behavior: 'smooth' }); } };
    show(L.find(s => key(s) === want) || L[0]);
  }).catch(e => { console.warn(e); $('strategy') && ($('strategy').textContent = "Couldn't load the analysis. Please refresh."); });
})();
