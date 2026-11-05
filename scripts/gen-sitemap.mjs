/**
 * gen-sitemap.mjs — توليد sitemap.xml
 * ------------------------------------------------------------------
 * يبني خريطة الموقع من مصدرين:
 *   1) الصفحات الثابتة القابلة للفهرسة (قائمة STATIC أدناه)
 *   2) المنتجات/الخدمات/الورش المنشورة من Supabase (تخطي تلقائي عند انقطاع الشبكة)
 *
 * التشغيل:  node scripts/gen-sitemap.mjs
 * متغيرات اختيارية: SUPABASE_URL / SUPABASE_KEY (وإلا تُقرأ من supabase-config.js)
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://capkitco.com';

/** الصفحات الثابتة القابلة للفهرسة فقط (تُستبعد صفحات noindex والخاصة) */
const STATIC = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/capkit-co.html', changefreq: 'weekly', priority: '0.9' },
  { path: '/about.html', changefreq: 'monthly', priority: '0.6' },
  { path: '/manifesto.html', changefreq: 'yearly', priority: '0.5' },
  { path: '/contact.html', changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms.html', changefreq: 'yearly', priority: '0.3' },
];

const today = new Date().toISOString().slice(0, 10);

async function creds() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_KEY };
  }
  try {
    const cfg = await readFile(join(ROOT, 'supabase-config.js'), 'utf8');
    const url = cfg.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const key = cfg.match(/SUPABASE_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];
    return url && key ? { url, key } : null;
  } catch {
    return null;
  }
}

async function fetchRows(base, table, query) {
  const res = await fetch(`${base.url}/rest/v1/${table}?${query}`, {
    headers: { apikey: base.key, Authorization: `Bearer ${base.key}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} — ${(await res.text()).slice(0, 120)}`);
  return res.json();
}

/** كل جدول على حدة: فشل جدول لا يُسقط الباقي */
async function tryRows(base, table, query, label) {
  try {
    const rows = await fetchRows(base, table, query);
    console.log(`  ✔ ${label}: ${rows.length}`);
    return rows;
  } catch (err) {
    console.warn(`  ⚠ ${label}: ${err.message}`);
    return [];
  }
}

const dynamic = [];

// 1) المصدر المفضّل: الصفحات المولّدة مسبقاً (روابط نظيفة بلا ?id=)
try {
  const manifest = JSON.parse(await readFile(join(ROOT, 'prerender-manifest.json'), 'utf8'));
  for (const p of manifest.pages) {
    dynamic.push({
      path: p.url.replace(SITE, ''),
      lastmod: p.lastmod,
      changefreq: p.type === 'product' ? 'weekly' : 'monthly',
      priority: p.type === 'workshop' ? '0.6' : '0.7',
    });
  }
  console.log(`✔ prerender-manifest: ${dynamic.length} صفحة مولّدة.`);
} catch {
  // 2) احتياطي: استعلام مباشر من Supabase بروابط ?id= القديمة
  console.warn('⚠ لا يوجد prerender-manifest.json — شغّل scripts/prerender.mjs أولاً. استخدام روابط ?id= مؤقتاً.');
  const base = await creds();

  if (!base) {
    console.warn('⚠ لا توجد بيانات اعتماد Supabase — صفحات ثابتة فقط.');
  } else {
    console.log('Supabase:');
    const [products, services, workshops] = await Promise.all([
      tryRows(base, 'products', 'select=id,created_at&status=eq.published&limit=5000', 'products'),
      tryRows(base, 'services', 'select=id,created_at&status=eq.published&limit=5000', 'services'),
      tryRows(base, 'workshops', 'select=id,created_at&status=eq.active&limit=2000', 'workshops'),
    ]);

    for (const p of products) dynamic.push({ path: `/product.html?id=${p.id}`, lastmod: p.created_at, changefreq: 'weekly', priority: '0.7' });
    for (const s of services) dynamic.push({ path: `/service.html?id=${s.id}`, lastmod: s.created_at, changefreq: 'weekly', priority: '0.7' });
    for (const w of workshops) dynamic.push({ path: `/workshop.html?id=${w.id}`, lastmod: w.created_at, changefreq: 'monthly', priority: '0.6' });
  }
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const entries = [...STATIC.map((s) => ({ ...s, lastmod: today })), ...dynamic];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) => `  <url>
    <loc>${esc(SITE + e.path)}</loc>
    <lastmod>${(e.lastmod || today).slice(0, 10)}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`;

await writeFile(join(ROOT, 'sitemap.xml'), xml, 'utf8');
console.log(`✔ sitemap.xml: ${entries.length} رابط (${STATIC.length} ثابت + ${dynamic.length} ديناميكي).`);
