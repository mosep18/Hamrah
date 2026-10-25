/* همراه v0.6.0: پوسته و آیکون‌های محلی برای استفادهٔ آفلاین cache می‌شوند. */
const CACHE_NAME = 'hamrah-shell-v0.6.1';
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./data.js",
  "./safety-data.js",
  "./app.js",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./favicon.svg",
  "./icons/hamrah-icon.svg",
  "./icons/hamrah-icon-192.png",
  "./icons/hamrah-icon-512.png",
  "./icons/favicon-32.png",
  "./README.md",
  "./CHANGELOG.md",
  "./assets/tool-icons/shir-o-khorshid-toolbox.svg",
  "./assets/tool-icons/v2ray-config-tool.svg",
  "./assets/tool-icons/shir-o-khorshid-app.svg",
  "./assets/tool-icons/bpb-worker-panel.svg",
  "./assets/tool-icons/azaditunnel.svg",
  "./assets/tool-icons/rocket-chat.svg",
  "./assets/tool-icons/matrix.svg",
  "./assets/tool-icons/delta-chat.svg",
  "./assets/tool-icons/nedagram.svg",
  "./assets/tool-icons/masterdns.svg",
  "./assets/tool-icons/slipstream.svg",
  "./assets/tool-icons/mahsa-alert.svg",
  "./assets/tool-icons/duta.svg",
  "./assets/tool-icons/thefeed.svg",
  "./assets/tool-icons/rostam-media.svg",
  "./assets/tool-icons/toosheh.svg",
  "./assets/tool-icons/bitchat.svg",
  "./assets/tool-icons/briar.svg",
  "./assets/tool-icons/bazitory.svg",
  "./assets/tool-icons/rayanvand.svg",
  "./assets/tool-icons/zoomusers.svg",
  "./assets/tool-icons/organic-maps.svg",
  "./assets/tool-icons/toogoosh.svg",
  "./assets/tool-icons/nooshdaroo-crisis.svg",
  "./assets/tool-icons/strategicclub-lan.svg",
  "./assets/tool-icons/hoosha.svg",
  "./assets/tool-icons/morse-code-torch.svg",
  "./assets/tool-icons/vasl-social.svg",
  "./assets/tool-icons/pastehub.svg"
];
const REMOTE_FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/Vazirmatn%5Bwght%5D.woff2"
];
const scopeURL = self.registration.scope;
const resolvedShell = APP_SHELL.map(path => new URL(path, scopeURL).href);

async function cacheOptionalFont(cache, url) {
  try {
    const request = new Request(url, { mode: 'cors', credentials: 'omit', cache: 'reload' });
    const response = await Promise.race([fetch(request), new Promise(resolve => setTimeout(() => resolve(null), 4000))]);
    if (response && response.ok) { try { await cache.put(url, response.clone()); } catch {} }
  } catch {}
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(resolvedShell.map(async url => { try { await cache.add(url); } catch {} }));
    await Promise.all(REMOTE_FONT_URLS.map(url => cacheOptionalFont(cache, url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('hamrah-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (!REMOTE_FONT_URLS.includes(url.href)) return;
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(url.href, { ignoreVary: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(url.href, response.clone()).catch(() => {});
        return response;
      } catch { return new Response('', { status: 504, statusText: 'Offline' }); }
    })());
    return;
  }
  if (!url.href.startsWith(scopeURL)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const isDocument = request.mode === 'navigate';
    if (cached && !isDocument) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch {
      return cached || await cache.match(new URL('index.html', scopeURL).href) || new Response('این صفحه به‌صورت آفلاین ذخیره نشده است.', {status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
    }
  })());
});
