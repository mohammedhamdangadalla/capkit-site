# live-sitemap — خريطة موقع حيّة

> Worker مستقل يخدم `https://capkitco.com/sitemap.xml` من قاعدة البيانات مباشرة،
> فيظهر أي منتج/ورشة/عدد/مقال جديد في الخريطة خلال دقائق بلا إعادة نشر.

---

## 1. ما يفعله

| المصدر | الرابط الناتج |
|---|---|
| الصفحات الثابتة | `/` · `/magazine.html` · `/capkit-co.html` · `/about.html` … |
| `products` (published) | `/product/{slug}/` أو `p-{id8}` |
| `workshops` (active) | `/workshop/{slug}/` أو `w-{id8}` |
| `issues` (published) | `/issue/{nn}/` |
| `articles` (لأعداد منشورة فقط) | `/issue/{nn}/{order}-{id8}/` |

**الترتيب والأولوية:** الرئيسية 1.0 يومي · العدد 0.8 · المقال/المنتج 0.7 · الورشة 0.6 · القانونية 0.3.

---

## 2. الكاش

- المدة: **600 ثانية (10 دقائق)** عبر Cache API.
- الترويسة: `Cache-Control: public, max-age=600, s-maxage=600`.
- مؤشر التشخيص: `X-Cache: HIT | MISS`.
- **إبطال فوري** عند نشر شيء مهم:

```bash
curl "https://capkitco.com/sitemap.xml?purge=<PURGE_SECRET>"
```

> ملاحظة: الإبطال يمسح كاش الـWorker فقط. كاش Cloudflare الطرفي (CDN) قد يحتفظ بالنسخة حتى 10 دقائق أيضاً — يمكنك عمل Purge للرابط من لوحة Cloudflare عند الحاجة الفورية.

---

## 3. النشر

```bash
# من جذر المشروع
npx wrangler deploy --config worker/wrangler.live-sitemap.toml
```

اضبط الأسرار مرة واحدة:

```bash
npx wrangler secret put SUPABASE_SERVICE_KEY --config worker/wrangler.live-sitemap.toml
npx wrangler secret put PURGE_SECRET        --config worker/wrangler.live-sitemap.toml
```

`SUPABASE_URL` موجودة في `[vars]` داخل ملف الإعداد.

**لماذا service_role؟** الخريطة تقرأ كل المنتجات والورش المنشورة، وبعض الجداول قد تكون RLS مقيّدة أمام anon. المفتاح لا يغادر الـWorker أبداً (لا يُرسَل للمتصفح).

---

## 4. الربط بالدومين

الملف يحتوي مسبقاً:

```toml
routes = [
  { pattern = "capkitco.com/sitemap.xml", zone_name = "capkitco.com" }
]
```

شرط العمل: أن يكون `capkitco.com` **نطاقاً مُداراً في نفس حساب Cloudflare** (طلبات الـDNS تمر عبره). عندها يتقدّم مسار الـWorker على الملف الثابت `/sitemap.xml` الموجود في المستودع.

**بديل بدون Route:** استخدم Custom Domain على `sitemap.capkitco.com`، ثم اجعل `/sitemap.xml` في الموقع يعيد التوجيه إليه. غير مفضّل لأنه يضيف قفزة.

**مهم:** لا تحذف `sitemap.xml` الثابت من المستودع — يبقى شبكة أمان إن تعطّل الـWorker أو تجاوز الحد المجاني.

---

## 5. التحقق

```bash
curl -sI https://capkitco.com/sitemap.xml | findstr /i "content-type x-cache"
curl -s  https://capkitco.com/sitemap.xml | findstr "<url>"
```

المتوقع:

```
Content-Type: application/xml; charset=utf-8
X-Cache: MISS     ← أول طلب
X-Cache: HIT      ← خلال 10 دقائق
```

ثم:

1. أضف منتجاً جديداً → `curl "…/sitemap.xml?purge=…"` → تحقق من ظهور رابط المنتج.
2. Search Console → Sitemaps → أعد إرسال `sitemap.xml` (مرة واحدة بعد التفعيل).
3. الصق الرابط في أي فاحص XML للتأكد من الصلاحية.

**اختبار محلي كامل** (بلا نشر):

```bash
node scripts/test-live-sitemap.cjs
```

يشغّل الـWorker بكاش وهمي، يتحقق من XML، ويطبع عدد الروابط وحالة الكاش.

---

## 6. حدود معروفة

| الحالة | السلوك |
|---|---|
| تعطّل Supabase كلياً | تُعاد خريطة الصفحات الثابتة فقط (لا 500) حتى لا تُسقط الخريطة من الفهرس |
| منتج جديد | يظهر خلال 10 دقائق أو فوراً بـ`purge` |
| منتج محذوف/مسودة | يختفي عند البناء التالي للكاش |
| مقالات أعداد غير منشورة | لا تُدرج إطلاقاً (الفلترة في الـWorker) |

---

## 7. لماذا لا نستخدم Google Indexing API؟

الـIndexing API مخصّص رسمياً لـ`JobPosting` و`BroadcastEvent` فقط، واستخدامه لأنواع أخرى يخالف الإرشادات. الطريق الصحيح:

1. **خريطة موقع حيّة** (هذا الـWorker) — الاكتشاف.
2. **روابط داخلية** من صفحات ذات سلطة — الزحف.
3. **`lastmod` صادق** — إعادة الزحف للمحتوى المتغيّر.

هذا الثلاثي يحقق الأثر نفسه بلا مخاطرة.
