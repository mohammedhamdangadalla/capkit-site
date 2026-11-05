/**
 * seo-head.mjs — حقن طبقة الـSEO الثابتة في كل صفحات HTML
 * ------------------------------------------------------------------
 * ما يضيفه لكل صفحة:
 *   - <link rel="canonical"> (ذاتي، مطلق)
 *   - Open Graph + Twitter Card (للصفحات التي لا تملكها أصلاً)
 *   - JSON-LD: Organization + WebSite + WebPage
 *   - <meta name="robots" content="noindex, follow"> للصفحات الخاصة
 *
 * آمن للتشغيل أكثر من مرة: الكتلة محصورة بين SEO-META:START/END
 * وتُستبدل بالكامل بدل أن تتكرر.
 *
 * التشغيل:  node scripts/seo-head.mjs
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SITE = 'https://capkitco.com';
/** الاسم الرسمي للكيان (قرار المالك) — «CapKit Co.» يبقى علامة فرعية لخط الإصدارات الفاخرة */
const BRAND = 'Capkitco';
const BRAND_ALT = 'CapKit Souq';
const LOGO = `${SITE}/icon-512.png`;
const EMAIL = 'hello@capkitco.com';
const WHATSAPP = '+201116549311';

/** صفحات ديناميكية: المحتوى يُبنى من Supabase حسب ?id= — تُدار وسومها من JS حالياً */
const DYNAMIC = new Set(['product.html', 'service.html', 'workshop.html', 'workshop-edit.html', 'user.html']);

/** صفحات خاصة/أدوات: تُفهرس كـnoindex بدل حجبها في robots.txt */
const NOINDEX = new Set([
  'admin.html',
  'dashboard.html',
  'auth.html',
  'reset-password.html',
  'workshop-edit.html',
  'user.html',
  'search.html',
]);

const START = '<!-- SEO-META:START -->';
const END = '<!-- SEO-META:END -->';

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function pageUrl(file) {
  return file === 'index.html' ? `${SITE}/` : `${SITE}/${file}`;
}

function readTitle(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : BRAND;
}

function readDescription(html) {
  const m = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

function jsonLd(html, file, url, title, description) {
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#organization`,
      name: BRAND,
      alternateName: BRAND_ALT,
      url: `${SITE}/`,
      logo: { '@type': 'ImageObject', url: LOGO, width: 512, height: 512 },
      description:
        'منصة عربية تجمع الورش والحرفيين والمهندسين والفنيين ومقدمي الخدمات، مع تواصل مباشر بلا وسطاء.',
      email: EMAIL,
      areaServed: { '@type': 'Place', name: 'الوطن العربي' },
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        telephone: WHATSAPP,
        email: EMAIL,
        availableLanguage: ['ar'],
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: `${SITE}/`,
      name: BRAND,
      alternateName: BRAND_ALT,
      inLanguage: 'ar',
      publisher: { '@id': `${SITE}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/search.html?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ];

  if (!DYNAMIC.has(file)) {
    graph.push({
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: title,
      description: description || undefined,
      inLanguage: 'ar',
      isPartOf: { '@id': `${SITE}/#website` },
      about: { '@id': `${SITE}/#organization` },
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

function buildBlock(html, file) {
  const title = readTitle(html);
  const description = readDescription(html);
  const url = pageUrl(file);
  const isDynamic = DYNAMIC.has(file);
  const noindex = NOINDEX.has(file);

  const lines = [START];

  // canonical: الصفحات الديناميكية تُترك بلا canonical ثابت لأن ?id= يمثّل محتوى مختلفاً
  // (canonical ثابت هنا سيجمّع كل المنتجات في صفحة واحدة) — يُحل مع الـprerender.
  if (!isDynamic) lines.push(`<link rel="canonical" href="${esc(url)}">`);
  else lines.push('<!-- canonical: يُولَّد عبر الـprerender، انظر SEO.md (مشكلة 2) -->');

  if (!isDynamic) {
    lines.push(
      '<meta property="og:type" content="website">',
      `<meta property="og:site_name" content="${esc(BRAND)}">`,
      '<meta property="og:locale" content="ar_AR">',
      `<meta property="og:title" content="${esc(title)}">`,
      description ? `<meta property="og:description" content="${esc(description)}">` : '',
      `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:image" content="${esc(LOGO)}">`,
      '<meta property="og:image:width" content="512">',
      '<meta property="og:image:height" content="512">',
      `<meta property="og:image:alt" content="${esc(`شعار ${BRAND}`)}">`,
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${esc(title)}">`,
      description ? `<meta name="twitter:description" content="${esc(description)}">` : '',
      `<meta name="twitter:image" content="${esc(LOGO)}">`,
    );
  }

  if (noindex) lines.push('<meta name="robots" content="noindex, follow">');

  lines.push(
    `<script type="application/ld+json">\n${jsonLd(html, file, url, title, description)}\n</script>`,
    END,
  );

  return lines.filter(Boolean).join('\n');
}

function stripExisting(html) {
  const re = new RegExp(`\\n?[ \\t]*${START}[\\s\\S]*?${END}[ \\t]*\\n?`, 'g');
  return html.replace(re, '\n');
}

const files = (await readdir(ROOT)).filter((f) => f.endsWith('.html')).sort();
const report = [];

for (const file of files) {
  const path = join(ROOT, file);
  const original = await readFile(path, 'utf8');

  if (!/<\/head>/i.test(original)) {
    report.push({ file, status: 'SKIP (no </head>)' });
    continue;
  }

  const cleaned = stripExisting(original);
  const block = buildBlock(cleaned, file);
  const updated = cleaned.replace(/<\/head>/i, `${block}\n</head>`);

  if (updated === original) {
    report.push({ file, status: 'unchanged' });
    continue;
  }

  await writeFile(path, updated, 'utf8');
  const flags = [
    DYNAMIC.has(file) ? 'dynamic' : 'canonical',
    NOINDEX.has(file) ? 'noindex' : 'index',
    'og',
    'json-ld',
  ];
  report.push({ file, status: `updated (${flags.join(', ')})` });
}

const width = Math.max(...report.map((r) => r.file.length));
for (const r of report) console.log(`${r.file.padEnd(width)}  ${r.status}`);
console.log(`\n${report.filter((r) => r.status.startsWith('updated')).length}/${report.length} صفحة تم تحديثها.`);
