/**
 * fetch_workshops_for_social.mjs — أحدث الورش لنشرها على فيسبوك
 * ------------------------------------------------------------------
 * التشغيل:
 *   node scripts/fetch_workshops_for_social.mjs
 *   node scripts/fetch_workshops_for_social.mjs --limit=10
 *   node scripts/fetch_workshops_for_social.mjs --caption   // نص منشور جاهز
 *   node scripts/fetch_workshops_for_social.mjs --json      // للاستخدام البرمجي
 *
 * يقرأ بيانات الاعتماد من supabase-config.js (نفس طريقة بقية السكربتات).
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://capkitco.com';

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 8) : 8;
const AS_JSON = args.includes('--json');
const AS_CAPTION = args.includes('--caption');
const WITH_PRODUCTS = !args.includes('--no-products');

/* ─────────── بيانات الاعتماد ─────────── */
const cfg = await readFile(join(ROOT, 'supabase-config.js'), 'utf8');
const URL_ = cfg.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1];
const KEY = cfg.match(/SUPABASE_KEY\s*=\s*['"]([^'"]+)['"]/)?.[1];

if (!URL_ || !KEY) {
  console.error('✖ تعذّر قراءة SUPABASE_URL أو SUPABASE_KEY من supabase-config.js');
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function get(path) {
  const res = await fetch(`${URL_}${path}`, { headers: H });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

/* ─────────── الجلب ─────────── */
const [workshops, governorates] = await Promise.all([
  get(
    '/rest/v1/workshops?select=id,name,slug,workshop_type,governorate_id,verified_badge,created_at,logo_url,cover_url' +
      `&status=eq.active&order=created_at.desc&limit=${LIMIT}`,
  ),
  get('/rest/v1/governorates?select=id,name_ar').catch(() => []),
]);

const govName = new Map(governorates.map((g) => [String(g.id), g.name_ar]));

// عدد المنتجات المنشورة لكل ورشة (اختياري)
const productCounts = new Map();
if (WITH_PRODUCTS && workshops.length) {
  try {
    const rows = await get('/rest/v1/products?select=workshop_id&status=eq.published');
    for (const r of rows) {
      if (!r.workshop_id) continue;
      productCounts.set(r.workshop_id, (productCounts.get(r.workshop_id) || 0) + 1);
    }
  } catch {
    /* تجاهل — العدد ليس جوهرياً */
  }
}

const profileUrl = (w) =>
  /^[a-zA-Z0-9_-]+$/.test(String(w.slug || ''))
    ? `${SITE}/workshop/${w.slug}/`
    : `${SITE}/workshop.html?id=${w.id}`;

/** صياغة عدد بالعربية: 1 → ورشة واحدة، 2 → ورشتان، 3–10 → ورش، 11+ → ورشة */
function countWorkshops(n) {
  if (n === 1) return 'ورشة واحدة';
  if (n === 2) return 'ورشتان';
  if (n >= 3 && n <= 10) return `${n} ورش`;
  return `${n} ورشة`;
}

function countProducts(n) {
  if (n === 1) return 'منتج واحد معروض';
  if (n === 2) return 'منتجان معروضان';
  if (n >= 3 && n <= 10) return `${n} منتجات معروضة`;
  return `${n} منتجاً معروضاً`;
}

/** عنوان المنشور بصيغة صحيحة حسب العدد */
function workshopsHeadline(n) {
  if (n === 1) return 'ورشة واحدة تستحق أن تعرفها هذا الأسبوع';
  if (n === 2) return 'ورشتان تستحقان أن تعرفاهما هذا الأسبوع';
  return `${countWorkshops(n)} تستحق أن تعرفها هذا الأسبوع`;
}

const daysAgo = (iso) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return 'اليوم';
  if (d === 1) return 'أمس';
  if (d < 7) return `قبل ${d} أيام`;
  if (d < 30) return `قبل ${Math.floor(d / 7)} أسابيع`;
  return `قبل ${Math.floor(d / 30)} شهر`;
};

const items = workshops.map((w) => ({
  name: w.name,
  type: w.workshop_type || 'ورشة',
  city: govName.get(String(w.governorate_id)) || 'غير محددة',
  verified: Boolean(w.verified_badge),
  products: productCounts.get(w.id) || 0,
  joined: daysAgo(w.created_at),
  url: profileUrl(w),
}));

if (AS_JSON) {
  console.log(JSON.stringify(items, null, 2));
  process.exit(0);
}

if (!items.length) {
  console.log('لا توجد ورش منشورة حالياً (status = active).');
  process.exit(0);
}

/* ─────────── نص منشور جاهز ─────────── */
if (AS_CAPTION) {
  const top = items.slice(0, 3);
  const lines = [
    `${workshopsHeadline(top.length)} 👇`,
    '',
    ...top.map(
      (w, i) =>
        `${i + 1}) ${w.name} — ${w.type} في ${w.city}\n   ${w.products ? `${countProducts(w.products)} · ` : ''}${w.verified ? 'موثّقة ✓' : 'على Capkitco'}`,
    ),
    '',
    'كل ورشة لها صفحة كاملة بالصور والمنتجات ورقم تواصل مباشر، بلا وسطاء.',
    'الرابط في أول تعليق.',
    '',
    '#Capkitco #ورش #صناعة_عربية #مصر #صنايعي #حرفيين',
  ];
  console.log(lines.join('\n'));
  process.exit(0);
}

/* ─────────── جدول للعرض ─────────── */
console.log(`\nأحدث ${countWorkshops(items.length)} على Capkitco:\n`);

const nameWidth = Math.max(...items.map((i) => i.name.length), 10);
console.log('  #  ' + 'الورشة'.padEnd(nameWidth) + '  التخصص'.padEnd(18) + 'المحافظة'.padEnd(16) + 'منتجات  الحالة');
console.log('  ' + '─'.repeat(nameWidth + 58));

items.forEach((w, i) => {
  console.log(
    `  ${String(i + 1).padEnd(2)} ${w.name.padEnd(nameWidth)}  ${w.type.slice(0, 16).padEnd(18)}` +
      `${w.city.slice(0, 14).padEnd(16)}${String(w.products).padEnd(8)}${w.verified ? 'موثّقة ✓' : '—'}`,
  );
});

console.log('\nروابط الملفات:');
items.forEach((w) => console.log(`  • ${w.name}: ${w.url}`));

console.log('\nلنص منشور جاهز: node scripts/fetch_workshops_for_social.mjs --caption');
