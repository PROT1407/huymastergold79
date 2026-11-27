/* Chia sẻ từng tin vĩ mô: chép nội dung + link riêng của tin, mở khung chia sẻ của điện thoại (hoặc Facebook).
   Nút: <button class="sh-story" data-title data-summary data-reason data-url>. Dùng cho tin-tuc.html, en/news.html và trang tin lẻ. */
(function () {
  'use strict';
  const EN = /^en/i.test(document.documentElement.lang || '');
  const L = EN ? { impact: 'Gold impact:', done: 'Content copied', fail: 'Could not copy, please copy manually' }
    : { impact: 'Tác động tới vàng:', done: 'Đã chép nội dung', fail: 'Không chép được, hãy thử lại' };
  const css = '.sh-story{font-weight:700;font-size:.78rem;font-family:inherit;padding:5px 12px;border-radius:999px;border:1px solid var(--gold,#f0b90b);background:transparent;color:var(--gold,#f0b90b);cursor:pointer;white-space:nowrap}' +
    '.sh-story:hover,.sh-story:active{background:rgba(240,185,11,.16)}.mi-src{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px}.mi-src>span{flex:1 1 100%}' +
    '.sh-toast{position:fixed;left:50%;bottom:84px;transform:translate(-50%,20px);background:#1a1405;color:#f0b90b;border:1px solid #f0b90b;border-radius:999px;padding:9px 18px;font-weight:700;font-size:.85rem;line-height:1.2;font-family:inherit;z-index:9999;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;max-width:90vw;text-align:center}' +
    '.sh-toast.on{opacity:1;transform:translate(-50%,0)}';
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* Cắt tối đa n câu (không cắt ở "U.S.", số thập phân), rồi giới hạn ký tự */
  const brief = (t, n, max) => {
    t = String(t || '').replace(/\s+/g, ' ').trim(); const out = []; let from = 0;
    for (let i = 0; i < t.length && out.length < n; i++) {
      if (!/[.!?]/.test(t[i]) || !/\s/.test(t[i + 1] || ' ') ) continue;
      const word = t.slice(from, i).split(' ').pop();
      if (t[i] === '.' && (/^(?:[A-Za-z]\.)+[A-Za-z]$/.test(word) || /^(mr|mrs|ms|dr|vs|no|st|inc|co|jr|sr)$/i.test(word))) continue;
      out.push(t.slice(from, i + 1).trim()); from = i + 1;
    }
    if (out.length < n && from < t.length) out.push(t.slice(from).trim());
    let s = out.join(' ');
    if (s.length > max) { s = s.slice(0, max); s = s.slice(0, Math.max(s.lastIndexOf(' '), max - 30)).replace(/[\s,;:.]+$/, '') + '…'; }
    return s;
  };
  const build = d => {
    const sum = brief(d.summary, 2, 260), why = brief(d.reason, 1, 170);
    const body = [d.title, sum, why ? L.impact + ' ' + why : ''].filter(Boolean).join('\n\n');
    return { body, text: body + '\n\n' + d.url };
  };
  const toast = msg => {
    let el = document.querySelector('.sh-toast');
    if (!el) { el = document.createElement('div'); el.className = 'sh-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2200);
  };
  const copy = text => {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise((ok, no) => {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      let good = false; try { good = document.execCommand('copy'); } catch (e) { }
      ta.remove(); good ? ok() : no(new Error('copy'));
    });
  };
  window.HMG = window.HMG || {};
  window.HMG.storyText = build;
  document.addEventListener('click', ev => {
    const b = ev.target.closest('.sh-story'); if (!b) return;
    ev.preventDefault();
    const d = { title: b.dataset.title || '', summary: b.dataset.summary || '', reason: b.dataset.reason || '', url: b.dataset.url || location.href.split('#')[0] };
    const t = build(d);
    /* chép và mở khung chia sẻ cùng lúc trong thao tác chạm (iOS chỉ cho phép trong lúc chạm) */
    copy(t.text).then(() => { toast(L.done); }, () => { toast(L.fail); });
    if (navigator.share) {
      navigator.share({ title: d.title, text: t.body, url: d.url }).catch(() => { });
    } else {
      window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(d.url), '_blank', 'noopener');
    }
  });
})();
