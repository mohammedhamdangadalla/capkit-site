/**
 * serve.mjs — سيرفر تطوير محلي بلا أي مكتبات خارجية
 * ------------------------------------------------------------------
 * لماذا: فتح الملفات بـ file:// يعطّل fetch (CORS) وService Worker،
 * فلا تعمل Supabase ولا البطاقة.
 *
 * التشغيل:  node scripts/serve.mjs [port]
 * ثم افتح:  http://localhost:5173/
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);

    // منع الخروج من جذر المشروع
    const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(ROOT, safe);

    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }

    if (!info?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<meta charset="utf-8"><body style="font-family:system-ui;padding:40px;direction:rtl">
         <h1>404</h1><p>لا يوجد ملف بهذا المسار: <code>${pathname}</code></p>
         <p><a href="/">الرئيسية</a></p></body>`,
      );
      console.log(`404  ${pathname}`);
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store', // تطوير: لا كاش
    });
    res.end(body);
    console.log(`200  ${pathname}`);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`خطأ في السيرفر: ${err.message}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Capkitco dev server`);
  console.log(`  → http://localhost:${PORT}/`);
  console.log(`\n  صفحات للاختبار:`);
  console.log(`     /                       الرئيسية`);
  console.log(`     /user.html?id=<UUID>    ملفك الشخصي (يظهر زر "تعديل البطاقة")`);
  console.log(`     /card.html?u=<username> معاينة البطاقة`);
  console.log(`\n  Ctrl+C للإيقاف\n`);
});
