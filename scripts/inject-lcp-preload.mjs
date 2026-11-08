// ═══════════════════════════════════════════════════════════════════════
// inject-lcp-preload — يحقن preload لصورة LCP في index.html
// ═══════════════════════════════════════════════════════════════════════
// لماذا: صورة أول منتج تُطلب حالياً بعد (SDK → REST → ثم الصورة) أي ~3-4 ثوانٍ
// على 4G بطيء. بحقن preload في HTML تصبح قابلة للاكتشاف من أول بايت.
//
// التشغيل: node scripts/inject-lcp-preload.mjs
// (يُفضّل تشغيله مع prerender + gen-sitemap قبل كل نشر)
// ═══════════════════════════════════════════════════════════════════════

import fs from 'node:fs';

const START = '<!-- LCP-PRELOAD:START -->';
const END = '<!-- LCP-PRELOAD:END -->';
const WIDTHS = [400, 500, 700, 1000];
const SIZES = '(max-width: 640px) 45vw, 300px';

const cfg = fs.readFileSync('supabase-config.js', 'utf8');
const SUPABASE_URL = cfg.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)[1];
const KEY = cfg.match(/SUPABASE_KEY\s*=\s*['"]([^'"]+)['"]/)[1];

/** نفس منطق optimizeImage في links.js */
function optimizeImage(url, width, quality = 72) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!/\.supabase\.co$/.test(u.hostname)) return url;
    const marker = '/storage/v1/object/public/';
    if (!u.pathname.includes(marker)) return url;
    u.pathname = u.pathname.replace(marker, '/storage/v1/render/image/public/');
    u.searchParams.set('width', String(width));
    u.searchParams.set('quality', String(quality));
    u.searchParams.set('format', 'webp');
    return u.toString();
  } catch {
    return url;
  }
}

async function firstProductWithImage() {
  const queries = [
    'products?select=id,title,images&status=eq.published&is_featured=eq.true&order=created_at.desc&limit=1',
    'products?select=id,title,images&status=eq.published&order=created_at.desc&limit=5',
  ];

  for (const q of queries) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) continue;
    const rows = await res.json();
    const hit = rows.find((p) => Array.isArray(p.images) && p.images[0]);
    if (hit) return hit;
  }
  return null;
}

const product = await firstProductWithImage();
const html = fs.readFileSync('index.html', 'utf8');

if (!html.includes(START) || !html.includes(END)) {
  console.error('✖ علامات LCP-PRELOAD غير موجودة في index.html');
  process.exit(1);
}

let tag = '';
if (product) {
  const src = product.images[0];
  const srcset = WIDTHS.map((w) => `${optimizeImage(src, w)} ${w}w`).join(', ');
  tag =
    `<link rel="preload" as="image" imagesrcset="${srcset}" imagesizes="${SIZES}" ` +
    `href="${optimizeImage(src, 700)}">`;
  tag += `\n<!-- ${product.title} -->`;
  console.log(`✔ LCP: ${product.title}`);
} else {
  console.log('⚠ لا يوجد منتج بصورة — لن يُحقن preload');
}

const re = new RegExp(`${START}[\\s\\S]*?${END}`);
const updated = html.replace(re, `${START}\n${tag}\n${END}`);
fs.writeFileSync('index.html', updated);

console.log(tag ? '✔ حُقن preload في index.html' : '— لا تغيير');
