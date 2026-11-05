/**
 * prerender.mjs — توليد صفحات ثابتة (HTML كامل) للمنتجات والخدمات والورش
 * -----------------------------------------------------------------------------
 * لماذا: صفحات product.html?id=... تُبنى بالكامل بـJS من Supabase، فيرى جوجل
 * هيكلاً فارغاً، وواتساب/فيسبوك لا يقرأان بياناتها إطلاقاً (لا تنفّذ JS).
 *
 * ما ينتجه لكل عنصر:
 *   product/{slug}/index.html          ← عنوان، وصف، canonical، OG، Product schema
 *   service/{slug}/index.html          ← Service schema
 *   workshop/{slug}/index.html         ← LocalBusiness schema
 *   prerender-manifest.json            ← يُستخدم في sitemap.xml
 *
 * الصفحة المولّدة تحتوي:
 *   1) <head> كامل من السيرفر (يعمل مع أي زاحف أو بوت مشاركة)
 *   2) محتوى نصي ثابت داخل نفس عناصر القالب (#productTitle ...) للزوار بلا JS
 *   3) window.__PRERENDER__ — بيانات جاهزة تُغني الصفحة عن طلب Supabase عند التحميل
 *
 * التشغيل:  node scripts/prerender.mjs
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://capkitco.com';
const BRAND = 'Capkitco';
const BRAND_ALT = 'CapKit Souq';
const LOGO = `${SITE}/icon-512.png`;
const GENERATED = new Date().toISOString();

// ─────────────────────────────── أدوات مساعدة ───────────────────────────────

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const trunc = (s = '', n = 158) => {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
};

/** يضيف/يستبدل خاصية style لعنصر معرّف بـid */
function setStyle(html, id, style) {
  return html.replace(new RegExp(`<([a-z0-9]+)([^>]*\\bid="${id}"[^>]*)>`, 'i'), (m, tag, attrs) => {
    const cleaned = attrs.replace(/\sstyle="[^"]*"/i, '');
    return `<${tag}${cleaned} style="${style}">`;
  });
}

/** يستبدل المحتوى الداخلي لعنصر مع التحقق من التداخل بنفس الوسم */
function replaceInnerById(html, tag, id, inner) {
  const openRe = new RegExp(`<${tag}\\b[^>]*\\bid="${id}"[^>]*>`, 'i');
  const m = openRe.exec(html);
  if (!m) return html;

  const start = m.index + m[0].length;
  const openTok = `<${tag}`;
  const closeTok = `</${tag}>`;
  let depth = 1;
  let i = start;

  while (depth > 0) {
    const o = html.indexOf(openTok, i);
    const c = html.indexOf(closeTok, i);
    if (c === -1) return html;
    if (o !== -1 && o < c) {
      depth++;
      i = o + openTok.length;
    } else {
      depth--;
      // نُبقي وسم الإغلاق الخاص بالعنصر نفسه (c) ونستبدل ما بينهما فقط
      if (depth === 0) return html.slice(0, start) + inner + html.slice(c);
      i = c + closeTok.length;
    }
  }
  return html;
}

/** يزيل وسوم المشاركة والـSEO القديمة من القالب قبل الحقن */
function stripHead(html) {
  return html
    .replace(/<!-- SEO-META:START[\s\S]*?SEO-META:END -->\s*/g, '')
    .replace(/[ \t]*<!--\s*═══ Open Graph ═══\s*-->\s*/g, '')
    .replace(/[ \t]*<!-- Twitter Card -->\s*/g, '')
    .replace(/[ \t]*<meta\s+property="og:[^"]*"[^>]*>\s*/g, '')
    .replace(/[ \t]*<meta\s+name="twitter:[^"]*"[^>]*>\s*/g, '')
    // قوالب الصفحات تحمل noindex احتياطياً؛ لو بقي مع index من السيرفر
    // يطبّق جوجل الأكثر تقييداً فتفشل الفهرسة
    .replace(/[ \t]*<meta\s+name="robots"[^>]*>\s*/g, '');
}

const orgNode = {
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: BRAND,
  alternateName: BRAND_ALT,
  url: `${SITE}/`,
  logo: { '@type': 'ImageObject', url: LOGO, width: 512, height: 512 },
  email: 'hello@capkitco.com',
  areaServed: { '@type': 'Place', name: 'الوطن العربي' },
};

const siteNode = {
  '@type': 'WebSite',
  '@id': `${SITE}/#website`,
  url: `${SITE}/`,
  name: BRAND,
  alternateName: BRAND_ALT,
  inLanguage: 'ar',
  publisher: { '@id': `${SITE}/#organization` },
};

function breadcrumb(url, name) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name, item: url },
    ],
  };
}

/** يبني كتلة <head> كاملة للصفحة المولّدة */
function buildHead({ title, description, url, image, ogType = 'website', graph }) {
  return `<!-- SEO-META:START -->
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="${esc(ogType)}">
<meta property="og:site_name" content="${esc(BRAND)}">
<meta property="og:locale" content="ar_AR">
<meta property="og:title" id="ogTitle" content="${esc(title)}">
<meta property="og:description" id="ogDescription" content="${esc(description)}">
<meta property="og:image" id="ogImage" content="${esc(image)}">
<meta property="og:url" id="ogUrl" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" id="twitterTitle" content="${esc(title)}">
<meta name="twitter:description" id="twitterDescription" content="${esc(description)}">
<meta name="twitter:image" id="twitterImage" content="${esc(image)}">
<script type="application/ld+json">
${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)}
</script>
<!-- SEO-META:END -->`;
}

/** يحقن الحمولة (بيانات جاهزة) + كتلة الـhead في القالب */
function assemble(template, head, payload, title) {
  let html = stripHead(template);
  if (title) html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  html = html.replace(/<\/head>/i, `${head}\n</head>`);

  // الحمولة تُنفَّذ أثناء تحليل الصفحة، قبل أي حدث DOMContentLoaded
  const payloadTag = `<script>window.__PRERENDER__ = ${JSON.stringify(payload).replace(/</g, '\\u003c')};</script>`;
  html = html.replace(/<body([^>]*)>/i, `<body$1>\n${payloadTag}`);
  return html;
}

// ─────────────────────────────── Supabase ───────────────────────────────

async function creds() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_KEY };
  }
  const cfg = await readFile(join(ROOT, 'supabase-config.js'), 'utf8');
  return {
    url: cfg.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)[1],
    key: cfg.match(/SUPABASE_KEY\s*=\s*['"]([^'"]+)['"]/)[1],
  };
}

const C = await creds();
const rest = async (path) => {
  const res = await fetch(`${C.url}/rest/v1/${path}`, {
    headers: { apikey: C.key, Authorization: `Bearer ${C.key}` },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  return res.json();
};

// ─────────────────────────────── البيانات ───────────────────────────────

const [products, services, workshops, govRows] = await Promise.all([
  rest('products?select=*&status=eq.published&order=created_at.desc'),
  rest('services?select=*&status=eq.published&order=created_at.desc'),
  rest('workshops?select=*&status=eq.active&order=created_at.desc'),
  rest('governorates?select=id,name_ar').catch(() => []),
]);

const govName = new Map(govRows.map((g) => [String(g.id), g.name_ar]));
const workshopName = new Map(workshops.map((w) => [w.id, w.name]));

/** slug من قاعدة البيانات إن وُجد، وإلا معرّف ثابت قصير */
function slugOf(item, prefix) {
  const s = String(item.slug || '').trim();
  if (s && /^[a-zA-Z0-9_-]+$/.test(s)) return s;
  return `${prefix}-${String(item.id).replace(/-/g, '').slice(0, 8)}`;
}

// ─────────────────────────────── المنتجات ───────────────────────────────

// تنظيف المخرجات القديمة حتى لا تبقى صفحات لمنتجات محذوفة أو معاد تسميتها
for (const dir of ['product', 'service', 'workshop', 'u']) {
  await rm(join(ROOT, dir), { recursive: true, force: true });
}

const productTemplate = await readFile(join(ROOT, 'product.html'), 'utf8');
const productPages = [];

for (const p of products) {
  const slug = slugOf(p, 'p');
  const url = `${SITE}/product/${slug}/`;
  const sellerName = p.workshop_id ? workshopName.get(p.workshop_id) || 'ورشة' : 'بائع حر';
  const images = (p.images || []).filter(Boolean);
  const image = images[0] || LOGO;
  const description = trunc(p.description || `${p.title} — منتج من ${BRAND}`);
  const title = `${p.title} — ${BRAND}`;
  const price = Number(p.price) || 0;
  const currency = p.currency || 'EGP';

  const productNode = {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: p.title,
    description: p.description || p.title,
    url,
    image: images.length ? images : [image],
    sku: p.serial_number || p.id,
    category: 'منتجات يدوية',
    brand: { '@type': 'Brand', name: p.is_capkit_original ? 'CapKit Co.' : BRAND },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: currency,
      price,
      availability: 'https://schema.org/InStock',
      seller: { '@type': p.workshop_id ? 'Organization' : 'Person', name: sellerName },
    },
  };

  if (p.rating_count > 0) {
    productNode.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(p.rating_avg) || 0,
      reviewCount: Number(p.rating_count),
    };
  }

  const head = buildHead({
    title,
    description,
    url,
    image,
    ogType: 'product',
    graph: [orgNode, siteNode, breadcrumb(url, p.title), productNode],
  });

  const seller = {
    name: sellerName,
    type: p.workshop_id ? 'workshop' : 'individual',
    id: p.workshop_id || p.seller_id || null,
    whatsapp: null,
  };

  const payload = {
    type: 'product',
    url,
    slug,
    data: p,
    seller,
  };

  let html = assemble(productTemplate, head, payload, title);

  // محتوى ثابت للزوار بلا JS وزواحف لا تنفّذ السكربتات
  html = setStyle(html, 'loadingState', 'display: none;');
  html = setStyle(html, 'productContent', 'display: block;');
  html = replaceInnerById(html, 'h1', 'productTitle', esc(p.title));
  html = replaceInnerById(html, 'div', 'productPrice', `<span>${price}</span><small>${esc(currency)}</small>`);
  html = replaceInnerById(html, 'div', 'productDescription', esc(p.description || 'لا يوجد وصف'));

  const badges = [
    p.is_capkit_original ? '<span class="badge-tag original">✨ أصلي</span>' : '',
    `<span class="badge-tag ${p.seller_type === 'workshop' ? 'workshop' : 'individual'}">${
      p.seller_type === 'workshop' ? '🏭 ورشة' : '👤 بائع حر'
    }</span>`,
    p.serial_number ? `<span class="badge-tag original">N° ${esc(p.serial_number)}</span>` : '',
  ]
    .filter(Boolean)
    .join('');
  html = replaceInnerById(html, 'div', 'productBadges', badges);

  html = replaceInnerById(
    html,
    'div',
    'galleryMain',
    images.length
      ? `<img src="${esc(image)}" alt="${esc(p.title)}" width="800" height="800" loading="eager" decoding="async">`
      : '<span class="placeholder-icon">📦</span>',
  );
  html = replaceInnerById(html, 'div', 'galleryThumbs', '');
  html = replaceInnerById(
    html,
    'div',
    'sellerBox',
    `<div class="seller-avatar">${p.workshop_id ? '🏭' : '👤'}</div>
      <div class="seller-info"><h4>${esc(sellerName)}</h4><p>موثّق على ${esc(BRAND)}</p></div>`,
  );

  const outPath = join(ROOT, 'product', slug, 'index.html');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');

  productPages.push({ url, file: `product/${slug}/index.html`, type: 'product', id: p.id, slug, lastmod: p.created_at });
}

// ─────────────────────────────── الخدمات ───────────────────────────────

const serviceTemplate = await readFile(join(ROOT, 'service.html'), 'utf8');
const servicePages = [];

for (const s of services) {
  const slug = slugOf(s, 's');
  const url = `${SITE}/service/${slug}/`;
  const images = (s.images || []).filter(Boolean);
  const image = images[0] || LOGO;
  const description = trunc(s.description || `${s.title} — خدمة على ${BRAND}`);
  const title = `${s.title} — ${BRAND}`;
  const priceStart = Number(s.price_start) || 0;

  const serviceNode = {
    '@type': 'Service',
    '@id': `${url}#service`,
    name: s.title,
    description: s.description || s.title,
    url,
    image,
    serviceType: s.service_type || 'خدمة',
    provider: { '@id': `${SITE}/#organization` },
    areaServed: { '@type': 'Place', name: 'الوطن العربي' },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: s.currency || 'EGP',
      price: priceStart,
      availability: 'https://schema.org/InStock',
    },
  };

  if (s.rating_count > 0) {
    serviceNode.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(s.rating_avg) || 0,
      reviewCount: Number(s.rating_count),
    };
  }

  const head = buildHead({
    title,
    description,
    url,
    image,
    ogType: 'website',
    graph: [orgNode, siteNode, breadcrumb(url, s.title), serviceNode],
  });

  let html = assemble(
    serviceTemplate,
    head,
    {
      type: 'service',
      url,
      slug,
      data: s,
      seller: { name: s.workshop_id ? workshopName.get(s.workshop_id) || 'ورشة' : 'مقدم خدمة' },
    },
    title,
  );

  html = setStyle(html, 'loadingState', 'display: none;');
  html = setStyle(html, 'serviceContent', 'display: block;');
  html = replaceInnerById(html, 'h1', 'serviceTitle', esc(s.title));
  html = replaceInnerById(
    html,
    'div',
    'servicePrice',
    `<span>${priceStart ? 'يبدأ من ' + priceStart : 'اتصل للسعر'}</span><small>${esc(s.currency || 'EGP')}</small>`,
  );
  html = replaceInnerById(html, 'div', 'serviceDescription', esc(s.description || 'لا يوجد وصف'));
  html = replaceInnerById(html, 'span', 'serviceTypeBadge', esc(s.service_type || 'خدمة'));

  const outPath = join(ROOT, 'service', slug, 'index.html');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');

  servicePages.push({ url, file: `service/${slug}/index.html`, type: 'service', id: s.id, slug, lastmod: s.created_at });
}

// ─────────────────────────────── الورش ───────────────────────────────

const workshopTemplate = await readFile(join(ROOT, 'workshop.html'), 'utf8');
const workshopPages = [];

for (const w of workshops) {
  const slug = slugOf(w, 'w');
  const url = `${SITE}/workshop/${slug}/`;
  const image = w.cover_url || w.logo_url || LOGO;
  const city = govName.get(String(w.governorate_id)) || '';
  const description = trunc(w.description || `${w.name} — ${w.workshop_type || 'ورشة'} على ${BRAND}`);
  const title = `${w.name} — ${BRAND}`;

  const businessNode = {
    '@type': 'LocalBusiness',
    '@id': `${url}#business`,
    name: w.name,
    description: w.description || w.name,
    url,
    image,
    telephone: w.whatsapp || w.phone || undefined,
    sameAs: w.instagram ? [w.instagram] : undefined,
    address: { '@type': 'PostalAddress', addressLocality: city || undefined, addressCountry: 'EG' },
    areaServed: city ? { '@type': 'Place', name: city } : undefined,
  };

  if (w.rating_count > 0) {
    businessNode.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(w.rating_avg) || 0,
      reviewCount: Number(w.rating_count),
    };
  }

  const head = buildHead({
    title,
    description,
    url,
    image,
    ogType: 'business.business',
    graph: [orgNode, siteNode, breadcrumb(url, w.name), businessNode],
  });

  let html = assemble(workshopTemplate, head, { type: 'workshop', url, slug, data: w }, title);

  html = setStyle(html, 'loadingState', 'display: none;');
  html = setStyle(html, 'workshopContent', 'display: block;');
  html = replaceInnerById(html, 'div', 'workshopName', esc(w.name));
  html = replaceInnerById(html, 'div', 'workshopMeta', esc([w.workshop_type, city].filter(Boolean).join(' · ')));
  html = replaceInnerById(html, 'div', 'workshopDescription', esc(w.description || '—'));

  const outPath = join(ROOT, 'workshop', slug, 'index.html');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');

  workshopPages.push({ url, file: `workshop/${slug}/index.html`, type: 'workshop', id: w.id, slug, lastmod: w.created_at });
}

// ─────────────────────────────── الحصيلة ───────────────────────────────

// ─────────────────────────────── البطاقات العامة ───────────────────────────────
// تُقرأ من public_profiles لأن anon لا يصل إلى جدول profiles بعد تقييد الصلاحيات.
// تشغيل تجريبي لكل الملفات (لا للنشر): node scripts/prerender.mjs --all-profiles

const ALL_PROFILES = process.argv.includes('--all-profiles');
const cardTemplate = await readFile(join(ROOT, 'card.html'), 'utf8');
const profilePages = [];

const ROLE_LABELS = {
  vendor: 'ورشة / تاجر',
  freelancer: 'مهندس / فني',
  buyer: 'عضو',
  admin: 'إدارة Capkitco',
};

const SOCIAL_MAP = [
  { key: 'instagram', label: 'إنستجرام', icon: '📸', base: 'https://instagram.com/' },
  { key: 'facebook', label: 'فيسبوك', icon: '📘', base: 'https://facebook.com/' },
  { key: 'linkedin', label: 'لينكد إن', icon: '💼', base: 'https://linkedin.com/in/' },
  { key: 'x', label: 'X', icon: '✖️', base: 'https://x.com/' },
  { key: 'twitter', label: 'تويتر', icon: '✖️', base: 'https://x.com/' },
  { key: 'tiktok', label: 'تيك توك', icon: '🎵', base: 'https://tiktok.com/@' },
  { key: 'youtube', label: 'يوتيوب', icon: '▶️', base: 'https://youtube.com/@' },
  { key: 'github', label: 'GitHub', icon: '🐙', base: 'https://github.com/' },
  { key: 'behance', label: 'بيهانس', icon: '🎨', base: 'https://behance.net/' },
];

function safeHttp(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** يحوّل رقماً محلياً (010...) إلى صيغة دولية لواتساب — مصر افتراضياً */
function normalizeWhatsapp(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '20' + d.slice(1);
  return d.length >= 8 ? d : '';
}

function socialHref(base, value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  const direct = safeHttp(raw);
  if (direct) return direct;
  const handle = raw.replace(/^@+/, '').replace(/[^\w.\-]/g, '');
  return handle ? base + encodeURIComponent(handle) : null;
}

let sourceProfiles = [];
try {
  const rows = await rest('public_profiles?select=*&order=updated_at.desc');
  // قبل تنفيذ db/002 لا يوجد عمود profile_public؛ نتعامل معه بحذر
  sourceProfiles = ALL_PROFILES ? rows : rows.filter((p) => p.profile_public === true);

  if (rows.length && !('profile_public' in rows[0])) {
    console.warn('⚠ عمود profile_public غير موجود في العرض — نفّذ db/002_view_add_public_flag.sql');
  }
  if (ALL_PROFILES) console.warn('⚠ وضع --all-profiles: تُولَّد بطاقات كل الملفات حتى غير المنشورة (للاختبار فقط).');
} catch (err) {
  console.warn(`⚠ تعذّر تحميل البطاقات: ${err.message}`);
}

if (ALL_PROFILES && sourceProfiles.length === 0) {
  try {
    sourceProfiles = await rest('public_profiles?select=*&order=updated_at.desc');
  } catch { /* تجاهل */ }
}

for (const p of sourceProfiles) {
  const username = String(p.username || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(username)) continue;

  const url = `${SITE}/u/${username}/`;
  const name = p.full_name || username;
  const roleLabel = ROLE_LABELS[p.role] || '';
  const title = roleLabel ? `${name} — ${roleLabel} — ${BRAND}` : `${name} — ${BRAND}`;
  const description = trunc(
    p.bio || `${name}${roleLabel ? ` — ${roleLabel}` : ''} على ${BRAND}. بطاقة تعريف للتواصل المباشر.`,
  );
  const image = safeHttp(p.avatar_url) || LOGO;

  const sameAs = [];
  if (p.social_links && typeof p.social_links === 'object') {
    for (const network of SOCIAL_MAP) {
      const href = socialHref(network.base, p.social_links[network.key]);
      if (href) sameAs.push(href);
    }
  }

  const personNode = {
    '@type': 'Person',
    '@id': `${url}#person`,
    name,
    alternateName: username,
    url,
    image,
    jobTitle: roleLabel || undefined,
    address: p.city ? { '@type': 'PostalAddress', addressLocality: p.city, addressCountry: 'EG' } : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  };

  const profileNode = {
    '@type': 'ProfilePage',
    '@id': `${url}#profilepage`,
    url,
    name: title,
    description,
    inLanguage: 'ar',
    isPartOf: { '@id': `${SITE}/#website` },
    about: { '@id': `${SITE}/#organization` },
    mainEntity: personNode,
  };

  const head = buildHead({
    title,
    description,
    url,
    image,
    ogType: 'profile',
    graph: [orgNode, siteNode, breadcrumb(url, name), profileNode],
  });

  let html = assemble(cardTemplate, head, { type: 'profile', url, username, data: p }, title);

  // ── محتوى ثابت للزوار بلا JS وللزاحف ──
  html = setStyle(html, 'cardLoading', 'display: none;');
  html = setStyle(html, 'cardContent', 'display: block;');
  html = replaceInnerById(
    html,
    'div',
    'cardAvatar',
    safeHttp(p.avatar_url)
      ? `<img src="${esc(image)}" alt="${esc(name)}" width="116" height="116" loading="eager" decoding="async">`
      : `<span id="cardInitial">${esc((name || '•').trim().charAt(0))}</span>`,
  );
  html = replaceInnerById(html, 'h1', 'cardName', esc(name));

  const roleInner = esc(roleLabel);
  html = replaceInnerById(html, 'p', 'cardRole', roleInner);
  html = html.replace(/<p class="role" id="cardRole">\s*<\/p>/, '<p class="role" id="cardRole" hidden></p>');

  const metaInner = [
    p.city ? `📍 ${esc(p.city)}` : '',
    p.verified ? '<span class="verified">✓ موثّق</span>' : '',
  ]
    .filter(Boolean)
    .join('<span>·</span>');
  html = replaceInnerById(html, 'p', 'cardMeta', metaInner);
  html = html.replace(/<p class="meta" id="cardMeta">\s*<\/p>/, '<p class="meta" id="cardMeta" hidden></p>');

  if (p.bio && p.bio.trim()) {
    html = html.replace(/<p class="bio" id="cardBio" hidden>/, '<p class="bio" id="cardBio">');
    html = replaceInnerById(html, 'p', 'cardBio', esc(p.bio.trim()));
  }

  const socialsInner = SOCIAL_MAP.map((network) => {
    const href = socialHref(network.base, p.social_links?.[network.key]);
    if (!href) return '';
    return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow"><span aria-hidden="true">${network.icon}</span><span>${esc(network.label)}</span></a>`;
  })
    .filter(Boolean)
    .join('');
  html = replaceInnerById(html, 'div', 'cardSocials', socialsInner);
  if (!socialsInner) html = setStyle(html, 'cardSocials', 'display: none;');

  const digits = normalizeWhatsapp(p.whatsapp);
  const whatsappInner = digits.length >= 8
    ? `<a class="btn btn-primary" id="cardWhatsapp" href="https://wa.me/${digits}" target="_blank" rel="noopener noreferrer"><span>💬</span><span>تواصل عبر واتساب</span></a>`
    : '';

  html = replaceInnerById(
    html,
    'div',
    'cardActions',
    `${whatsappInner}
      <button class="btn btn-gold" id="cardShare" type="button"><span>↗</span><span>شارك البطاقة</span></button>
      <a class="btn btn-ghost" href="/auth.html">أنشئ بطاقتك مجاناً</a>`,
  );

  const outPath = join(ROOT, 'u', username, 'index.html');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');

  profilePages.push({ url, file: `u/${username}/index.html`, type: 'profile', id: p.id, slug: username, lastmod: p.updated_at });
}

// ─────────────────────────────── الحصيلة ───────────────────────────────

const pages = [...productPages, ...servicePages, ...workshopPages, ...profilePages];
const manifest = {
  generatedAt: GENERATED,
  counts: {
    product: productPages.length,
    service: servicePages.length,
    workshop: workshopPages.length,
    profile: profilePages.length,
  },
  pages,
};

await writeFile(join(ROOT, 'prerender-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

console.log(`تم توليد ${pages.length} صفحة ثابتة:`);
console.log(`  منتجات:  ${productPages.length}`);
console.log(`  خدمات:   ${servicePages.length}`);
console.log(`  ورش:     ${workshopPages.length}`);
console.log(`  بطاقات:  ${profilePages.length}`);
console.log('\nأمثلة:');
for (const page of pages.slice(0, 4)) console.log(`  ${page.url}`);
