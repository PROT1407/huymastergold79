/* Web analytics hook — inactive until an ID is set below. Empty = do nothing. */
(function () {
  var GA4_ID = 'G-YQKNGG2HTV';            // e.g. 'G-XXXXXXXXXX'
  var GOATCOUNTER_CODE = '';  // e.g. 'h79gold' -> https://h79gold.goatcounter.com/count

  function load(src, attrs) {
    var s = document.createElement('script');
    s.async = true; s.src = src;
    if (attrs) for (var k in attrs) s.setAttribute(k, attrs[k]);
    document.head.appendChild(s);
  }

  if (GA4_ID) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID, { anonymize_ip: true });
    load('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID));
    // Outbound click events (Telegram + other external links)
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a || !a.hostname || a.hostname === location.hostname) return;
      var tg = /(^|\.)t\.me$|(^|\.)telegram\.me$/.test(a.hostname);
      window.gtag('event', tg ? 'telegram_click' : 'outbound_click', {
        link_url: a.href, link_domain: a.hostname, transport_type: 'beacon'
      });
    }, true);
  }

  if (GOATCOUNTER_CODE) {
    load('//gc.zgo.at/count.js', { 'data-goatcounter': 'https://' + GOATCOUNTER_CODE + '.goatcounter.com/count' });
  }
})();
