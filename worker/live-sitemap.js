// ═══════════════════════════════════════════════════════════════════════
// live-sitemap — خريطة موقع حيّة من Supabase
// ═══════════════════════════════════════════════════════════════════════
// المسار: https://capkitco.com/sitemap.xml
//
// تشخيص: أضف ?purge=<PURGE_SECRET>&debug=1 ليعيد JSON بالأعداد والأخطاء
// (لا يكشف أي مفتاح — فقط أطوال وحالة المتغيرات).
//
// متغيرات البيئة:
//   SUPABASE_URL · SUPABASE_SERVICE_KEY · PURGE_SECRET
// ═══════════════════════════════════════════════════════════════════════

const SITE = 'https://capkitco.com';
const TTL_SECONDS = 600;
const CACHE_KEY_URL = `${SITE}/__sitemap-cache`;

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

const xmlEscape = (v) =>
  String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const pad2 = (n) => String(n).padStart(2, '0');
const shortId = (id) => String(id).replace(/-/g, '').slice(0, 8);
const day = (iso) => (iso ? String(iso).slice(0, 10) : new Date().toISOString().slice(0, 10));

const productSlug = (p) =>
  /^[a-zA-Z0-9_-]+$/.test(String(p.slug || '')) ? p.slug : `p-${shortId(p.id)}`;

const workshopSlug = (w) =>
  /^[a-zA-Z0-9_-]+$/.test(String(w.slug || '')) ? w.slug : `w-${shortId(w.id)}`;

/** يحذف المسافات/علامات الاقتباس التي قد تدخل مع لصق المفتاح */
const cleanSecret = (value) =>
  String(value || '').trim().replace(/^["']|["']$/g, '');

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

async function sb(env, path, errors) {
  const key = cleanSecret(env.SUPABASE_SERVICE_KEY);
  const base = cleanSecret(env.SUPABASE_URL).replace(/\/$/, '');

  if (!key || !base) {
    errors.push(`${path}: متغيرات البيئة ناقصة (SUPABASE_URL أو SUPABASE_SERVICE_KEY)`);
    return [];
  }

  const res = await fetch(`${base}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    errors.push(`${path}: HTTP ${res.status} — ${body.slice(0, 160)}`);
    return [];
  }

  return res.json();
}

async function buildSitemap(env) {
  const errors = [];
  const counts = {};

  const entries = STATIC_PAGES.map((p) => ({ ...p, loc: SITE + p.path }));

  const [products, workshops, issues, articles] = await Promise.all([
    sb(env, 'products?select=id,slug,created_at&status=eq.published&limit=5000', errors),
    sb(env, 'workshops?select=id,slug,created_at&status=eq.active&limit=2000', errors),
    sb(env, 'issues?select=id,issue_number,publish_date,created_at&is_published=eq.true&limit=1000', errors),
    sb(env, 'articles?select=id,issue_id,order_index&limit=10000', errors),
  ]);

  counts.products = products.length;
  counts.workshops = workshops.length;
  counts.issues = issues.length;
  counts.articles = articles.length;

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
    entries.push({
      loc: `${SITE}/issue/${pad2(issue.issue_number)}/`,
      lastmod: issue.publish_date || issue.created_at,
      changefreq: 'monthly',
      priority: '0.8',
    });
  }

  for (const a of articles) {
    const issue = issueById.get(a.issue_id);
    if (!issue) continue;
    entries.push({
      loc: `${SITE}/issue/${pad2(issue.issue_number)}/${a.order_index}-${shortId(a.id)}/`,
      lastmod: issue.publish_date || issue.created_at,
      changefreq: 'monthly',
      priority: '0.7',
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries
    .map(urlTag)
    .join('\n')}\n</urlset>\n`;

  return { xml, counts, errors, total: entries.length };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // فحص صحة الـWorker (لا يكشف أسراراً)
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          ok: true,
          hasUrl: Boolean(cleanSecret(env.SUPABASE_URL)),
          keyLength: cleanSecret(env.SUPABASE_SERVICE_KEY).length,
          hasPurge: Boolean(env.PURGE_SECRET),
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.pathname !== '/sitemap.xml') {
      return new Response('Not Found', { status: 404 });
    }

    const cache = caches.default;
    const cacheKey = new Request(CACHE_KEY_URL, { method: 'GET' });
    const purgeToken = url.searchParams.get('purge');
    const purgeValid = Boolean(purgeToken && env.PURGE_SECRET && purgeToken === env.PURGE_SECRET);
    const debug = url.searchParams.get('debug') === '1' && purgeValid;

    if (purgeValid) await cache.delete(cacheKey);

    if (!purgeValid && !debug) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const res = new Response(cached.body, cached);
        res.headers.set('X-Cache', 'HIT');
        return res;
      }
    }

    const result = await buildSitemap(env);
    const degraded = result.counts.products + result.counts.workshops + result.counts.issues === 0;

    if (result.errors.length) {
      console.error('[live-sitemap] errors:', JSON.stringify(result.errors));
    }
    console.log('[live-sitemap] counts:', JSON.stringify(result.counts), 'total:', result.total);

    if (debug) {
      return new Response(
        JSON.stringify(
          {
            total: result.total,
            counts: result.counts,
            errors: result.errors,
            keyLength: cleanSecret(env.SUPABASE_SERVICE_KEY).length,
            urlValue: cleanSecret(env.SUPABASE_URL),
            degraded,
          },
          null,
          2,
        ),
        { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
      );
    }

    const headers = {
      'Content-Type': 'application/xml; charset=utf-8',
      'X-Sitemap-Total': String(result.total),
      'X-Sitemap-Dynamic': String(result.counts.products + result.counts.workshops + result.counts.issues),
      // عند الفشل لا نخزّن: نريد إعادة المحاولة فور إصلاح المفتاح
      'Cache-Control': degraded ? 'no-store' : 'public, max-age=0, s-maxage=600',
      'CDN-Cache-Control': degraded ? 'no-store' : `max-age=${TTL_SECONDS}`,
      'X-Cache': purgeValid ? 'PURGE' : 'MISS',
    };

    const response = new Response(result.xml, { headers });

    if (!degraded && !purgeValid) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
