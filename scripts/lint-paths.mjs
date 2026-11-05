/**
 * lint-paths.mjs — يمنع تكرار أخطاء المسارات النسبية
 * ------------------------------------------------------------------
 * الصفحات المولّدة تعيش في مجلدات فرعية (/product/{slug}/…) فأي مسار نسبي
 * في HTML أو في روابط تبنيها JS يُنتج 404. هذا الفحص يفشل قبل الرفع.
 *
 * التشغيل:  node scripts/lint-paths.mjs
 * يخرج بكود 1 عند وجود مخالفة (مناسب لـ CI أو pre-push hook).
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** مسارات تُولَّد آلياً — تُفحص أيضاً لأنها ما يُنشر فعلياً */
const GENERATED_DIRS = ['product', 'service', 'workshop', 'u'];

const isAbsoluteRef = (v) =>
  !v ||
  v.startsWith('#') ||
  v.startsWith('/') ||
  v.startsWith('//') ||
  /^(https?:|mailto:|tel:|data:|javascript:|blob:|\$\{)/i.test(v);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const problems = [];

/* ═══ 1) ملفات HTML: وسوم src/href نسبية ═══ */
const htmlFiles = (await walk(ROOT)).filter((f) => extname(f) === '.html');

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const rel = file.slice(ROOT.length + 1);

  // الصفحات الجذرية (بدون مجلد) تعمل بمسارات نسبية، والفولّد يجعلها جذرية.
  // نفحص فقط الصفحات التي تعيش داخل مجلد فرعي.
  const inSubdir = rel.includes('\\') || rel.includes('/');
  if (!inSubdir) continue;

  for (const m of html.matchAll(/\s(src|href)="([^"]*)"/g)) {
    if (!isAbsoluteRef(m[2])) problems.push(`${rel}  سمة ${m[1]} نسبية: ${m[2]}`);
  }
}

/* ═══ 2) ملفات JS: تنقّلات نسبية وروابط داخل قوالب ═══ */
const jsFiles = (await walk(ROOT)).filter((f) => extname(f) === '.js');

const NAV_RE = /(?:location\.href|location\.replace|location\.assign|window\.open)\s*[=(]\s*([`'"])((?:\.{0,2}\/)?[a-z0-9_-]+\.html[^`'"]*)\1/gi;
const HREF_RE = /href="((?:\.{0,2}\/)?[a-z0-9_-]+\.html[^"]*)"/gi;
const SRC_RE = /src="((?:\.{0,2}\/)?[a-z0-9_-]+\.(?:js|css|png|jpe?g|webp|json))"/gi;

for (const file of jsFiles) {
  const rel = file.slice(ROOT.length + 1);
  const code = await readFile(file, 'utf8');

  for (const m of code.matchAll(NAV_RE)) {
    if (!isAbsoluteRef(m[2])) problems.push(`${rel}  تنقّل نسبي: ${m[2]}`);
  }
  // نستثني أسطر محدّدات CSS (querySelector) لأنها ليست روابط تنقّل
  for (const [i, line] of code.split("\n").entries()) {
    if (line.includes("querySelector")) continue;
    for (const m of line.matchAll(HREF_RE)) {
      if (!isAbsoluteRef(m[1])) problems.push(`${rel}:${i + 1}  href نسبي في قالب JS: ${m[1]}`);
    }
    for (const m of line.matchAll(SRC_RE)) {
      if (!isAbsoluteRef(m[1])) problems.push(`${rel}:${i + 1}  src نسبي في قالب JS: ${m[1]}`);
    }
  }
}

/* ═══ 3) الصفحات المولّدة موجودة؟ ═══ */
const manifestPath = join(ROOT, 'prerender-manifest.json');
try {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const page of manifest.pages) {
    const target = join(ROOT, page.file);
    const exists = await stat(target).then(() => true).catch(() => false);
    if (!exists) problems.push(`prerender-manifest  يشير لملف غير موجود: ${page.file}`);
  }
} catch {
  // لا مانيفست بعد — ليس خطأ
}

/* ═══ النتيجة ═══ */
if (problems.length) {
  console.error(`✖ ${problems.length} مخالفة:\n`);
  for (const p of problems) console.error('  ' + p);
  process.exitCode = 1;
} else {
  console.log(`✔ لا مسارات نسبية — فُحص ${htmlFiles.length} ملف HTML و${jsFiles.length} ملف JS.`);
}
