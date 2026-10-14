/* OneSignal web push – chỉ chạy khi js/push-config.js có ONESIGNAL_APP_ID.
   Site chạy ở subpath /huymastergold79/ nên worker phải nằm ở gốc site project
   (/huymastergold79/OneSignalSDKWorker.js) và scope = /huymastergold79/. */
(function () {
  'use strict';
  const H = window.HMG; if (!H) return;
  const s = document.createElement('script');
  s.src = H.ROOT + 'js/push-config.js?v=' + (H.V || '');
  s.onload = () => {
    const id = (window.HMG_PUSH || {}).ONESIGNAL_APP_ID;
    if (!id || !('serviceWorker' in navigator)) return;
    const base = new URL(H.ROOT || './', location.href).pathname; // vd. /huymastergold79/
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const sdk = document.createElement('script');
    sdk.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'; sdk.defer = true;
    document.head.appendChild(sdk);
    OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.init({
        appId: id,
        serviceWorkerPath: base.replace(/^\//, '') + 'OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: base },
        notifyButton: { enable: true },
        promptOptions: { slidedown: { prompts: [{ type: 'push', autoPrompt: true, delay: { pageViews: 2, timeDelay: 20 } }] } }
      });
      try { OneSignal.User.addTag('lang', H.EN ? 'en' : 'vi'); } catch (e) { }
    });
  };
  document.head.appendChild(s);
})();
