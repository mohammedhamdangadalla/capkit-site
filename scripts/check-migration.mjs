/**
 * check-migration.mjs — يتحقق من نجاح هجرة بطاقة التعريف
 * التشغيل: node scripts/check-migration.mjs
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = await readFile(join(ROOT, 'supabase-config.js'), 'utf8');
const URL_ = cfg.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)[1];
const KEY = cfg.match(/SUPABASE_KEY\s*=\s*['"]([^'"]+)['"]/)[1];

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
  }
}

const get = (path) => fetch(`${URL_}${path}`, { headers: H });

await check('عمود social_links موجود', async () => {
  const r = await get('/rest/v1/public_profiles?select=social_links&limit=1');
  if (!r.ok) throw new Error((await r.json()).message || `HTTP ${r.status}`);
  return 'مقروء من العرض العام';
});

await check('عمود profile_public + username_changed_at', async () => {
  const r = await get('/rest/v1/profiles?select=profile_public,username_changed_at&limit=1');
  if (r.status === 200) return 'مقروء (anon ما زال يصل للجدول — الهجرة غير كاملة)';
  const body = await r.json();
  const msg = String(body.message || '');
  if (/permission denied|42501/i.test(msg)) return 'الجدول محجوب عن anon كما هو مطلوب';
  throw new Error(msg || `HTTP ${r.status}`);
});

await check('العرض public_profiles يعمل', async () => {
  const r = await get('/rest/v1/public_profiles?select=id,username,full_name&limit=100');
  if (!r.ok) throw new Error((await r.json()).message || `HTTP ${r.status}`);
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('العرض فارغ — لا أسماء مستخدمين');
  return `${rows.length} ملف عام`;
});

await check('حجب anon عن جدول profiles', async () => {
  const r = await get('/rest/v1/profiles?select=email&limit=1');
  if (r.status === 200) throw new Error('ما زال الزائر يقرأ email — الحجب لم يُطبَّق');
  const body = await r.json().catch(() => ({}));
  return `محجوب (${body.code || r.status})`;
});

await check('bucket avatars موجود', async () => {
  // لا نستخدم /storage/v1/bucket/{id}: هذه البيانات لا يقرأها anon فيرد 404 مضلّلة.
  // الحيلة: طلب كائن عام غير موجود — الباكت الموجود يرد NoSuchKey، والمفقود NoSuchBucket.
  const r = await fetch(`${URL_}/storage/v1/object/public/avatars/__healthcheck__.jpg`);
  const body = await r.json().catch(() => ({}));
  if (body.code === 'NoSuchBucket' || /bucket not found/i.test(body.message || '')) {
    throw new Error('Bucket not found');
  }
  return 'موجود (public read يعمل)';
});

const pad = Math.max(...results.map((r) => r.name.length));
console.log('');
for (const r of results) {
  console.log(`${r.ok ? '✔' : '✖'}  ${r.name.padEnd(pad)}  ${r.detail}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} فحص ناجح${failed ? ` — ${failed} يحتاج تدخلاً` : ''}`);
process.exitCode = failed ? 1 : 0;
