/* HuymasterGold79 – English H79 analysis renderer (en/h79-analysis.html, en/index.html).
   Reads data/strategies.json. Uses *_en fields when present, otherwise falls back gracefully:
   trend from the enum, zones/SL/TP numbers (reformatted 4.211 → 4,211), details → link to the Vietnamese page. */
(function () {
  'use strict';
  const H = window.HMG, E = H.esc, $ = id => document.getElementById(id);
  const TI = { up: ['🔺', 'Bullish'], down: ['🔻', 'Bearish'], side: ['↔️', 'Sideways'] };
  // EN session labels from US Eastern clock (never VN-centric "Night session" / phiên đêm).
  // Post times in data are Vietnam time (UTC+7, no DST) -> America/New_York (DST auto).
  const vnDate = s => { const [y, m, d] = s.date.split('-').map(Number), [hh, mm] = (s.time || '12:00').split(':').map(Number); return new Date(Date.UTC(y, m - 1, d, hh - 7, mm)); };
  const fET = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fETd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' });
  const fLoc = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const fETparts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: false });
  const etMins = d => { const p = Object.fromEntries(fETparts.formatToParts(d).filter(x => x.type !== 'literal').map(x => [x.type, x.value])); return (+p.hour) * 60 + (+p.minute); };
  const etSessionLabel = d => {
    const m = etMins(d);
    if (m >= 9 * 60 + 30 && m < 11 * 60 + 30) return 'New York morning session (US open)';
    if (m >= 11 * 60 + 30 && m < 14 * 60) return 'New York midday session';
    if (m >= 14 * 60 && m < 17 * 60) return 'New York afternoon / late session';
    if (m >= 8 * 60 && m < 9 * 60 + 30) return 'New York pre-market';
    if (m >= 2 * 60 && m < 8 * 60) return 'London session (ET early morning)';
    return 'Asian session (ET evening)';
  };
  const etTime = s => s.time ? fET.format(vnDate(s)) + ' ET' : fETd.format(vnDate(s));
  const tip = s => s.time ? ` title="Your local time: ${E(fLoc.format(vnDate(s)))}"` : '';
  const num = t => String(t == null ? '' : t).replace(/(\d)\.(\d{3})(?!\d)/g, '$1,$2'); // VN thousands "." → ","
  const hasVi = t => /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(t || '');
  const pick = (o, k) => o[k + '_en'];
  const when = s => `<time datetime="${vnDate(s).toISOString()}"${tip(s)}>${E(etTime(s))}</time>`;
  const ses = s => E(s.time ? etSessionLabel(vnDate(s)) : (s.session_en || ''));
  const zoneTxt = o => o.zone_en || (hasVi(o.zone) ? num(o.zone.replace(/\s*\(.*?\)\s*/g, ' ').trim()) : num(o.zone));
  function mpHTML(s) {
    const m = s.market_picture_en, X = H.esc; if (!m || !m.text) return '';
    const chips = (m.chips || []).map(c => `<span class="chip ${X(c.dir || '')}"><b>${X(c.k)}</b> ${X(c.v)}</span>`).join('');
    const src = (m.sources || []).map(x => `<a href="${X(x.url)}" target="_blank" rel="noopener nofollow">${X(x.name)}</a>`).join(' · ');
    return `<section class="h79mp"><h3>🌍 Market Picture</h3>${chips ? `<div class="chips">${chips}</div>` : ''}<p>${X(m.text)}</p>${src ? `<p class="src">Sources: ${src}</p>` : ''}</section>`;
  }
  function sumHTML(s) {
    const m = s.summary; if (!m) return '';
    const tk = m.trend || s.trendType || 'side', t = TI[tk] || TI.side;
    const z = (o, c, ic, lb) => o && o.zone ? `<div class="z ${c}">${ic} ${lb} <b>${E(zoneTxt(o))}</b>${o.sl ? ` <span class="k">| SL</span> ${E(num(o.sl_en || o.sl))}` : ''}${o.tp ? ((tp) => /^TP/.test(tp) ? ` <span class="k">|</span> ${E(tp)}` : ` <span class="k">| TP</span> ${E(tp)}`)(num(o.tp_en || o.tp)) : ''}</div>` : '';
    const pn = m.priceNote_en || (m.price === 'spot' ? 'Levels are spot XAU/USD' : m.price === 'futures' ? 'Levels are COMEX gold futures (GC=F), not spot' : '');
    return `${s.image ? `<figure class="h79img"><a href="${E(s.image_en || s.image)}" target="_blank" rel="noopener"><img src="${E(s.image_en || s.image)}" alt="${E(s.image_alt_en || 'Gold chart')}" loading="lazy" width="1600" height="900"></a></figure>` : ''}<div class="h79s"><div class="t ${tk}">Bias: ${t[0]} ${E(m.trendText_en || t[1])}</div>${z(m.sell, 'sell', '🔴', 'SELL zone')}${z(m.buy, 'buy', '🟢', 'BUY zone')}${m.note_en ? `<div class="n">⚠️ Key risk: ${E(m.note_en.replace(/^key risk:\s*/i, ''))}</div>` : ''}${pn ? `<div class="p">💲 ${m.price === 'spot' ? '✅' : '⚠️'} ${E(pn)}</div>` : ''}</div>${mpHTML(s)}`;
  }
  const list = (arr, h) => arr && arr.length ? `<div class="card" style="margin:0 0 12px"><h3>${h}</h3><ul style="padding-left:18px">${arr.map(x => `<li>${E(x)}</li>`).join('')}</ul></div>` : '';
  const viLink = s => `chien-luoc.html?ngay=${encodeURIComponent(s.id || s.date)}`;
  function details(s) {
    if (s.brief) {
      return `${list(s.scenarios_en, '🧭 Plan & scenarios')}${s.physicalAdvice_en || s.physicalAdvice ? `<div class="note"><b>💡 Our take:</b> ${E(s.physicalAdvice_en || s.physicalAdvice)}</div>` : ''}${s.dataTime_en ? `<p class="small muted">🕐 ${E(s.dataTime_en)}</p>` : ''}`;
    }
    const lv = `<div class="grid g3" style="margin:14px 0"><div class="card"><h3>🟢 Support (USD/oz)</h3>${(s.support || []).map(v => `<span class="pill s">${num(H.fmt(v))}</span> `).join('')}</div><div class="card"><h3>🔴 Resistance (USD/oz)</h3>${(s.resistance || []).map(v => `<span class="pill r">${num(H.fmt(v))}</span> `).join('')}</div></div>`;
    const any = s.trend_en || s.entryZones_en || s.scenarios_en;
    return `${s.trend_en ? `<p><b>Trend read:</b> ${E(s.trend_en)}</p>` : ''}${lv}${list(s.entryZones_en, '🎯 Long setups')}${list(s.sellZones_en, '🔻 Short setups & invalidation')}${list(s.scenarios_en, '🧭 Levels, indicators & scenarios')}${list(s.macro_en, '🌐 Macro backdrop')}${s.physicalAdvice_en || s.physicalAdvice ? `<div class="note"><b>💡 Our take:</b> ${E(s.physicalAdvice_en || s.physicalAdvice)}</div>` : ''}${s.notes_en ? `<p class="muted small" style="margin-top:8px">📝 ${E(s.notes_en)}</p>` : ''}${s.dataTime_en ? `<p class="small muted">🕐 ${E(s.dataTime_en)}</p>` : ''}${any ? '' : `<p class="small muted">No detailed breakdown was published for this plan.</p>`}`;
  }
  const title = s => s.title_en || `H79 Gold Plan – ${ses(s) || 'XAUUSD'}, ${fETd.format(vnDate(s))}`;
  function full(s) {
    const sumLabel = s.brief ? 'More details' : 'Full breakdown: indicators, scenarios, macro';
    return `<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px"><div><span class="muted">📅 ${ses(s) ? ses(s) + ' · ' : ''}${when(s)}</span><h2 style="font-size:1.4rem;color:var(--txt);margin:4px 0">${E(title(s))}</h2></div><div><span class="badge ex">H79 PLAN</span></div></div>${sumHTML(s)}<details class="h79more"><summary>${sumLabel}</summary>${details(s)}</details><p class="small muted" style="margin-top:8px"><i>${E(s.disclaimer_en || 'Technical analysis for educational purposes only – not investment advice.')}</i></p>`;
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
