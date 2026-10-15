// ═══ CapKit Souq — Service Worker v2 ═══

const CACHE_NAME = 'capkit-v2';

// الملفات اللي نجيبها من الشبكة أولاً (HTML, JS, CSS)
// عشان التحديثات تظهر فورًا

self.addEventListener('install', (event) => {
  console.log('📦 SW Install v2');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('🚀 SW Activate v2');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // تجاهل Supabase و Google Fonts
  if (url.hostname.includes('supabase')) return;
  if (url.hostname.includes('googleapis')) return;
  if (url.hostname.includes('gstatic')) return;
  if (url.hostname.includes('jsdelivr')) return;

  // تجاهل non-GET
  if (event.request.method !== 'GET') return;

  // ═══ Network-First للـ HTML/JS/CSS ═══
  // جرب الشبكة الأول، لو فشلت استخدم الكاش
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // حفظ نسخة في الكاش
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
  return caches.match(event.request).then(cached => {
    if (cached) return cached;
    
    if (event.request.destination === 'document') {
      return caches.match('/index.html');
    }
    
    // ارجع Response فاضي بدل undefined
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
    });
  });
});
  );
});
