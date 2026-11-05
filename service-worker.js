// ═══ CapKit Souq — Service Worker v4 ═══
// v4: الأصول الثابتة (CSS/JS/صور/خطوط) تُخدم من الكاش فوراً مع تحديث في الخلفية
//     (stale-while-revalidate)، بينما تبقى صفحات HTML على Network-First
//     حتى لا يرى المستخدم محتوى قديماً.

const CACHE_NAME = 'capkit-v4';

// أصول لا تتغيّر كثيراً — الكاش أولاً
const STATIC_DESTINATIONS = new Set(['style', 'script', 'image', 'font']);

// ═══ Install ═══
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// ═══ Activate ═══
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ═══ Fetch ═══
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // تجاهل الخدمات الخارجية
  if (url.hostname.includes('supabase')) return;
  if (url.hostname.includes('googleapis')) return;
  if (url.hostname.includes('gstatic')) return;
  if (url.hostname.includes('jsdelivr')) return;
  if (url.hostname.includes('cloudflareinsights')) return;

  if (event.request.method !== 'GET') return;

  if (STATIC_DESTINATIONS.has(event.request.destination)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});

// ═══ الأصول: من الكاش فوراً + تحديث بالخلفية ═══
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const fresh = await network;
  if (fresh) return fresh;

  return new Response('', { status: 504, statusText: 'Offline' });
}

// ═══ الصفحات: الشبكة أولاً ثم الكاش ═══
async function networkFirst(request) {
  try {
    const response = await fetch(request);

    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (request.destination === 'document') {
      const homeResponse = await caches.match('/index.html');
      if (homeResponse) return homeResponse;
    }

    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' }),
    });
  }
}
