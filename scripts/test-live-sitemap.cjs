// اختبار محلي للـWorker: نحقن كاش وهمياً ونشغّل fetch الحقيقي
globalThis.caches = {
  default: {
    _store: new Map(),
    async match(req) { return this._store.get(req.url) || null; },
    async put(req, res) { this._store.set(req.url, res); },
    async delete(req) { this._store.delete(req.url); },
  },
};

const cfg = require('fs').readFileSync('supabase-config.js', 'utf8');
const url = cfg.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)[1];
const key = cfg.match(/SUPABASE_KEY\s*=\s*['"]([^'"]+)['"]/)[1];

(async () => {
  const mod = await import('../worker/live-sitemap.js');
  const env = { SUPABASE_URL: url, SUPABASE_SERVICE_KEY: key, PURGE_SECRET: 'test' };
  const ctx = { waitUntil() {} };

  const r1 = await mod.default.fetch(new Request('https://capkitco.com/sitemap.xml'), env, ctx);
  const xml = await r1.text();
  console.log('HTTP', r1.status, '| type:', r1.headers.get('content-type'), '| cache:', r1.headers.get('x-cache'));
  console.log('عدد <url>:', (xml.match(/<url>/g) || []).length);
  console.log('حجم:', (Buffer.byteLength(xml) / 1024).toFixed(1), 'KB');

  require('fs').writeFileSync('.sitemap-test.xml', xml);

  const r2 = await mod.default.fetch(new Request('https://capkitco.com/sitemap.xml'), env, ctx);
  console.log('الطلب الثاني (كاش):', r2.headers.get('x-cache'));

  const r3 = await mod.default.fetch(new Request('https://capkitco.com/sitemap.xml?purge=test'), env, ctx);
  console.log('بعد purge:', r3.headers.get('x-cache'));
})();
