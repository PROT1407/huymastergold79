/* Tương tác: cảm xúc (đếm chung qua Abacus – API đếm miễn phí, không cần tài khoản), thanh chia sẻ dọc, thẻ Nhận tin */
(function () {
  'use strict';
  const H = window.HMG, NS = 'huymastergold79', API = 'https://abacus.jasoncameron.dev';
  const EMO = [['like', '👍'], ['love', '❤️'], ['clap', '👏'], ['fire', '🔥']];
  const hash = s => { let h = 5381; for (const c of s) h = (h * 33 ^ c.codePointAt(0)) >>> 0; return h.toString(36); };
  const keyOf = (id, k) => ('rx-' + hash(id) + '-' + k);
  const mine = id => { try { return JSON.parse(localStorage.getItem('hmg_rx_' + hash(id)) || '[]'); } catch (e) { return []; } };
  const setMine = (id, a) => localStorage.setItem('hmg_rx_' + hash(id), JSON.stringify(a));
  /* Hàng đợi để không vượt giới hạn 30 yêu cầu/10 giây */
  const q = []; let busy = false;
  const run = () => { if (busy || !q.length) return; busy = true; const [u, cb] = q.shift();
    fetch(u).then(r => r.status === 404 ? { value: 0 } : r.ok ? r.json() : Promise.reject(r.status)).then(j => cb(j.value)).catch(() => cb(null)).finally(() => setTimeout(() => { busy = false; run(); }, 380)); };
  const req = (u, cb) => { q.push([u, cb]); run(); };
  const fmt = n => n == null ? '·' : n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(n);
  function render(el) {
    const id = el.dataset.rx, my = mine(id);
    el.innerHTML = EMO.map(([k, ic]) => `<button type="button" class="rxb${my.includes(k) ? ' on' : ''}" data-k="${k}" aria-label="Bày tỏ ${ic}">${ic} <b>·</b></button>`).join('') + '<span class="rx-n">Lượt bày tỏ của mọi người</span>';
    el.dataset.ready = '1';
  }
  function load(el) {
    if (el.dataset.loaded) return; el.dataset.loaded = '1';
    el.querySelectorAll('.rxb').forEach(b => req(`${API}/get/${NS}/${keyOf(el.dataset.rx, b.dataset.k)}`, v => { b.querySelector('b').textContent = fmt(v); }));
  }
  document.addEventListener('click', ev => {
    const b = ev.target.closest('.rxb'); if (!b) return;
    const el = b.closest('[data-rx]'), id = el.dataset.rx, k = b.dataset.k, my = mine(id);
    if (my.includes(k)) { b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 400); return; } // mỗi trình duyệt 1 lần / biểu tượng
    my.push(k); setMine(id, my); b.classList.add('on', 'pop');
    const lab = b.querySelector('b'), cur = parseInt(lab.textContent, 10); if (!isNaN(cur)) lab.textContent = fmt(cur + 1);
    req(`${API}/hit/${NS}/${keyOf(id, k)}`, v => { if (v != null) lab.textContent = fmt(v); });
  });
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { io.unobserve(x.target); load(x.target); } }), { rootMargin: '200px' }) : null;
  const scan = () => document.querySelectorAll('[data-rx]:not([data-ready])').forEach(el => { render(el); io ? io.observe(el) : load(el); });
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => {
    scan();
    if (!document.body.hasAttribute('data-engage')) return;
    const u = encodeURIComponent(location.href), t = encodeURIComponent(document.title);
    const SN = 'huymastergold79', PG = (location.pathname.split('/').pop() || 'index.html'), PID = 'hmg79-' + PG.replace('.html', ''), PURL = 'https://prot1407.github.io/huymastergold79/' + PG;
    const bar = document.createElement('nav'); bar.className = 'sbar'; bar.setAttribute('aria-label', 'Chia sẻ');
    bar.innerHTML = `<a class="sb fb" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${u}" title="Chia sẻ Facebook">f</a>
      <a class="sb za" target="_blank" rel="noopener" href="https://zalo.me/share?u=${u}" title="Chia sẻ Zalo">Zalo</a>
      <a class="sb tg" target="_blank" rel="noopener" href="https://t.me/share/url?url=${u}&text=${t}" title="Chia sẻ Telegram">✈</a>
      <button type="button" class="sb cp" title="Sao chép link">🔗</button>
      <a class="sb cm" href="#binh-luan" title="Bình luận">💬<span class="disqus-comment-count sb-n" data-disqus-identifier="${PID}" data-disqus-url="${PURL}">0</span></a>
      <a class="sb nt" href="#nhan-tin" title="Nhận tin & thảo luận">🔔</a>`;
    document.body.appendChild(bar); document.body.classList.add('has-sbar');
    bar.querySelector('.cp').onclick = e => { const b = e.currentTarget; (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(() => { b.textContent = '✓'; b.classList.add('ok'); setTimeout(() => { b.textContent = '🔗'; b.classList.remove('ok'); }, 1500); }).catch(() => prompt('Sao chép link:', location.href)); };
    const main = document.querySelector('main');
    /* Bình luận Disqus – chỉ tải khi cuộn tới / bấm */
    if (main && !document.getElementById('binh-luan')) {
      const cs = document.createElement('section'); cs.id = 'binh-luan'; cs.className = 'cm-card sec';
      cs.innerHTML = `<div class="cm-h"><h2>💬 Bình luận</h2><span class="muted small">Đăng nhập bằng Google, Facebook, X hoặc tài khoản Disqus</span></div>
        <button type="button" class="btn cm-load">💬 Xem & viết bình luận</button><div id="disqus_thread"></div>
        <p class="small muted cm-note">Bình luận do Disqus cung cấp (có quảng cáo). Vui lòng trao đổi văn minh; nội dung không phải lời khuyên đầu tư.</p>`;
      main.appendChild(cs);
      let loaded = false;
      const loadDisqus = () => { if (loaded) return; loaded = true; cs.querySelector('.cm-load').remove();
        window.disqus_config = function () { this.page.url = PURL; this.page.identifier = PID; this.page.title = document.title; this.language = 'vi'; };
        const d = document.createElement('script'); d.src = 'https://' + SN + '.disqus.com/embed.js'; d.setAttribute('data-timestamp', +new Date()); d.async = true; document.body.appendChild(d); };
      cs.querySelector('.cm-load').onclick = loadDisqus;
      if ('IntersectionObserver' in window) { const o = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { o.disconnect(); loadDisqus(); } }, { rootMargin: '300px' }); o.observe(cs); }
      if (location.hash === '#binh-luan') loadDisqus();
      bar.querySelector('.cm').addEventListener('click', loadDisqus);
      const c = document.createElement('script'); c.id = 'dsq-count-scr'; c.src = 'https://' + SN + '.disqus.com/count.js'; c.async = true; document.body.appendChild(c);
    }
    if (main && !document.getElementById('nhan-tin')) {
      const c = document.createElement('section'); c.id = 'nhan-tin'; c.className = 'nt-card sec';
      c.innerHTML = `<div class="nt-l"><span class="nt-bell">🔔</span><div><h2>Nhận tin vàng mỗi ngày</h2><p>Nhận định H79, tin vĩ mô và cảnh báo biến động – gửi thẳng tới điện thoại. Trao đổi, góp ý trực tiếp trong nhóm.</p>
        <div class="nt-btns"><a class="btn tg" href="${H.TG}" target="_blank" rel="noopener">✈ Vào nhóm Telegram</a><a class="btn zalo" href="#" data-zalo>💬 Kết bạn Zalo</a></div></div></div>
        <a class="nt-qr" href="#" data-zalo title="Mã QR Zalo"><img src="assets/zalo-qr.jpg" alt="Mã QR Zalo Ngọc Huy" loading="lazy"><small>Quét QR Zalo</small></a>`;
      main.appendChild(c);
    }
  });
})();
