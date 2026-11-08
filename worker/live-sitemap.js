// ═══════════════════════════════════════════════════════════════════════
// live-sitemap — خريطة موقع حيّة من Supabase
// ═══════════════════════════════════════════════════════════════════════
// المسار: https://capkitco.com/sitemap.xml
// الاستراتيجية: تُبنى عند الطلب وتُخزَّن 10 دقائق في Cache API،
// مع إمكانية إبطال فوري عبر ?purge=SECRET.
//
// متغيرات البيئة المطلوبة:
//   SUPABASE_URL          → https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  → service_role (أو anon إن كانت الصلاحيات تسمح)
//   PURGE_SECRET          → نص عشوائي لإبطال الكاش
// ═══════════════════════════════════════════════════════════════════════

const SITE = 'https://capkitco.com';
const TTL_SECONDS = 600; // 10 دقائق

const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/magazine.html', changefreq: 'weekly', priority: '0.8' },
  { path: '/capkit-co.html', changefreq: 'weekly', priority: '0.9' },
  { path: '/about.html', changefreq: 'monthly', priority: '0.6' },
  { path: '/manifesto.html', changefreq: 'yearly', priority: '0.5' },
  { path: '/contact.html', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms.html', changefreq: 'yearly', priority: '0.3' },
];

const CACHE_KEY_URL = `${SITE}/__sitemap-cache`;

const xmlEscape = (value) =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const pad2 = (n) => String(n).padStart(2, '0');
const shortId = (id) => String(id).replace(/-/g, '').slice(0, 8);
const day = (iso) => (iso ? String(iso).slice(0, 10) : new Date().toISOString().slice(0, 10));

/** slug المنتج/الورشة كما في prerender.mjs */
const productSlug = (p) =>
  /^[a-zA-Z0-9_-]+$/.test(String(p.slug || '')) ? p.slug : `p-${shortId(p.id)}`;

const workshopSlug = (w) =>
  /^[a-zA-Z0-9_-]+$/.test(String(w.slug || '')) ? w.slug : `w-${shortId(w.id)}`;

async function sb(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

function urlTag({ loc, lastmod, changefreq, priority }) {
  return (
    '  <url>\n' +
    `    <loc>${xmlEscape(loc)}</loc>\n` +
    `    <lastmod>${xmlEscape(day(lastmod))}</lastmod>\n` +
    `    <changefreq>${changefreq}</changefreq>\n` +
    `    <priority>${priority}</priority>\n` +
    '  </url>'
  );
}

async function buildSitemap(env) {
  const entries = STATIC_PAGES.map((p) => ({ ...p, loc: SITE + p.path }));

  // بيانات ديناميكية — فشل مصدر واحد لا يُسقط الخريطة كلها
  const [products, workshops, issues, articles] = await Promise.all([
    sb(env, 'products?select=id,slug,created_at&status=eq.published&limit=5000').catch(() => []),
    sb(env, 'workshops?select=id,slug,created_at&status=eq.active&limit=2000').catch(() => []),
    sb(env, 'issues?select=id,issue_number,publish_date,created_at&is_published=eq.true&limit=1000').catch(() => []),
    sb(env, 'articles?select=id,issue_id,order_index&limit=10000').catch(() => []),
  ]);

  for (const p of products) {
    entries.push({
      loc: `${SITE}/product/${productSlug(p)}/`,
      lastmod: p.created_at,
      changefreq: 'weekly',
      priority: '0.7',
    });
  }

  for (const w of workshops) {
    entries.push({
      loc: `${SITE}/workshop/${workshopSlug(w)}/`,
      lastmod: w.created_at,
      changefreq: 'monthly',
      priority: '0.6',
    });
  }

  const issueById = new Map(issues.map((i) => [i.id, i]));

  for (const issue of issues) {
    const issuePath = `/issue/${pad2(issue.issue_number)}/`;
    entries.push({
      loc: SITE + issuePath,
      lastmod: issue.publish_date || issue.created_at,
      changefreq: 'monthly',
      priority: '0.8',
    });
  }

  for (const a of articles) {
    const issue = issueById.get(a.issue_id);
    if (!issue) continue; // مقالات أعداد غير منشورة لا تُدرج
    entries.push({
      loc: `${SITE}/issue/${pad2(issue.issue_number)}/${a.order_index}-${shortId(a.id)}/`,
      lastmod: issue.publish_date || issue.created_at,
      changefreq: 'monthly',
      priority: '0.7',
    });
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(urlTag)
    .join('\n')}\n</urlset>\n`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== '/sitemap.xml') {
      return new Response('Not Found', { status: 404 });
    }

    const cache = caches.default;
    const cacheKey = new Request(CACHE_KEY_URL, { method: 'GET' });
    const purgeToken = url.searchParams.get('purge');
    const shouldPurge = purgeToken && env.PURGE_SECRET && purgeToken === env.PURGE_SECRET;

    if (shouldPurge) await cache.delete(cacheKey);

    if (!shouldPurge) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const res = new Response(cached.body, cached);
        res.headers.set('X-Cache', 'HIT');
        return res;
      }
    }

    let xml;
    try {
      xml = await buildSitemap(env);
    } catch (err) {
      console.error('[live-sitemap] build failed:', err?.message || err);
      // لا نُعيد 5xx لتجنّب إسقاط الخريطة من فهرس جوجل
      xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${STATIC_PAGES.map(
        (p) => urlTag({ loc: SITE + p.path, lastmod: new Date(), ...p }),
      ).join('\n')}\n</urlset>\n`;
    }

    const response = new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': `public, max-age=${TTL_SECONDS}, s-maxage=${TTL_SECONDS}`,
        'X-Cache': 'MISS',
      },
    });

    if (!shouldPurge) ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  },
};
