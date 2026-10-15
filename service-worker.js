// ═══ CapKit Souq — Service Worker v3 ═══

const CACHE_NAME = 'capkit-v3';

// ═══ Install ═══
self.addEventListener('install', (event) => {
  console.log('📦 SW Install v3');
  self.skipWaiting();
});

// ═══ Activate ═══
self.addEventListener('activate', (event) => {
  console.log('🚀 SW Activate v3');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
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

  // تجاهل non-GET
  if (event.request.method !== 'GET') return;

  event.respondWith(handleFetch(event.request));
});

// ═══ Handle Fetch — Network First ═══
async function handleFetch(request) {
  try {
    // 1. جرب الشبكة
    const networkResponse = await fetch(request);

    // حفظ في الكاش
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;

  } catch (err) {
    // 2. الشبكة فشلت → جرب الكاش
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }

    // 3. للصفحات، رجّع index.html
    if (request.destination === 'document') {
      const homeResponse = await caches.match('/index.html');
      if (homeResponse) return homeResponse;
    }

    // 4. Fallback: Response فاضي (مهم جدًا)
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain; charset=utf-8'
      })
    });
  }
}
