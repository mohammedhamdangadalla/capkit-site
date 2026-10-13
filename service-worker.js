// ═══ CapKit Souq — Service Worker ═══

const CACHE_NAME = 'capkit-v1';
const RUNTIME_CACHE = 'capkit-runtime-v1';

// ═══ الملفات الأساسية ═══
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/search.html',
  '/auth.html',
  '/styles.css',
  '/app.js',
  '/search.js',
  '/data-loader.js',
  '/tree.js',
  '/drawer.js',
  '/user-menu.js',
  '/homepage-loader.js',
  '/supabase-config.js'
];

// ═══ Install ═══
self.addEventListener('install', (event) => {
  console.log('📦 SW Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('⚠️ Some files failed to cache:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

// ═══ Activate ═══
self.addEventListener('activate', (event) => {
  console.log('🚀 SW Activate');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ═══ Fetch ═══
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // تجاهل طلبات Supabase (لازم تكون live)
  if (url.hostname.includes('supabase')) return;

  // تجاهل طلبات غير GET
  if (event.request.method !== 'GET') return;

  // تجاهل Google Fonts (بيتحمل من CDN)
  if (url.hostname.includes('googleapis') || url.hostname.includes('gstatic')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Cache Hit — رجّع من الكاش + حدّث في الخلفية
        event.waitUntil(
          fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(RUNTIME_CACHE).then(cache => {
                  cache.put(event.request, responseClone);
                });
              }
            })
            .catch(() => {})
        );
        return cachedResponse;
      }

      // Cache Miss — جرب الشبكة
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(event.request, responseClone);
          });

          return response;
        })
        .catch(() => {
          // لو الاتصال قطع، رجّع صفحة offline
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
