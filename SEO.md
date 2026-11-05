# طبقة الـSEO الأساسية — CapKit Souq

> الحالة: منجزة على `Capkitco-Current` (المشكلة 1 من تقرير التقييم).
> الملفات المضافة: `robots.txt`، `sitemap.xml`، `scripts/seo-head.mjs`، `scripts/gen-sitemap.mjs`، وهذا الملف.

---

## 1. ما تم تنفيذه

### أ) Canonical + Open Graph + Twitter Card
حُقنت في **14 صفحة ثابتة** كتلة موحّدة بين `<!-- SEO-META:START -->` و `<!-- SEO-META:END -->`:

| الوسم | القيمة |
|---|---|
| `rel="canonical"` | رابط مطلق ذاتي لكل صفحة (`https://capkitco.com/about.html` …) |
| `og:type/site_name/locale/title/description/url/image` | مشتقة تلقائياً من `<title>` و`<meta name="description">` الموجودين |
| `twitter:card/title/description/image` | `summary_large_image` |

قبل التعديل: **0 canonical** و**0 وسم OG** في كل الصفحات عدا منتج/خدمة.

### ب) JSON-LD (Organization + WebSite + WebPage)
كتلة واحدة في كل صفحة تربط الكيانين بـ`@id` ثابت:

- `Organization` → `https://capkitco.com/#organization` (الاسم، الشعار، البريد، واتساب، `areaServed`)
- `WebSite` → `https://capkitco.com/#website` مع `SearchAction` على `search.html?q=` (متوافق فعلياً: `search.js` يقرأ `q`)
- `WebPage` لكل صفحة ثابتة، مرتبطة بـ`isPartOf` و`about`

**توحيد العلامة:** الموقع يخلط بين «CapKit Souq» (الرئيسية) و«CapKit Co.» (باقي الصفحات). عُرّف الكيان الواحد باسم `CapKit Souq` و`alternateName: CapKit Co.` بدل إنشاء كيانين متنافسين. **قرار نهائي يحتاج موافقتك** على الاسم المعتمد.

### ج) noindex للصفحات الخاصة
`admin` · `dashboard` · `auth` · `reset-password` · `workshop-edit` · `user` · `search`
تحمل الآن `<meta name="robots" content="noindex, follow">`.
**لماذا لا تُحجب في robots.txt؟** لأن الحجب يمنع جوجل من قراءة الـnoindex، فتبقى الصفحة في الفهرس كرابط عارٍ. القاعدة: `noindex` للفهرسة، `Disallow` للزحف فقط.

### د) robots.txt و sitemap.xml
- `robots.txt`: `Allow: /` + `Sitemap:` — لا حجب، لتصل إشارة noindex.
- `sitemap.xml`: **16 رابطاً** = 7 صفحات ثابتة + 9 صفحات محتوى حقيقية منشورة (6 منتجات، 1 خدمة، 2 ورش) تُجلب من Supabase.

---

## 2. إعادة التوليد

```bash
node scripts/seo-head.mjs     # يعيد حقن الكتلة في كل الصفحات (idempotent)
node scripts/gen-sitemap.mjs  # يحدّث sitemap.xml من الصفحات الثابتة + Supabase
```

- `seo-head.mjs` آمن للتشغيل المتكرر: يستبدل الكتلة ولا يكررها.
- `gen-sitemap.mjs` يقرأ بيانات الاعتماد من `supabase-config.js` أو من `SUPABASE_URL` / `SUPABASE_KEY`. إذا فشل جدول واحد يكمل الباقي، وإذا انقطعت الشبكة يولّد الصفحات الثابتة فقط.

> **مهم:** شغّل `gen-sitemap.mjs` قبل كل نشر. أي منتج/ورشة جديدة لن تدخل الخريطة تلقائياً على الاستضافة الساكنة.

---

## 3. لماذا 14 صفحة وليس 17؟

Sp3 صفحات ديناميكية (`product.html` · `service.html` · `workshop.html`) تعرض محتوى مختلفاً حسب `?id=`.
وضع `canonical` ثابت فيها يعني إعلان أن **كل المنتجات صفحة واحدة** → تجميع الكل في نتيجة واحدة وفقدان الفهرسة.

لذلك تُركت بلا canonical ثابت عن قصد، وأصبحت تحصل عليه من الصفحات المولّدة (القسم 6).

---

## 4. خطوات يدوية لا يقوم بها الكود

1. **Google Search Console**: أضف النطاق (Domain property عبر DNS) وأرسل `https://capkitco.com/sitemap.xml`.
2. **توحيد النطاق**: إعادة توجيه 301 من `www.capkitco.com` إلى `capkitco.com` على مستوى الاستضافة:
   - Netlify: أضف `_redirects` بالسطر `https://www.capkitco.com/*  https://capkitco.com/:splat  301!`
   - Cloudflare Pages: Rules → Redirect Rules (لا تُكتب في `_headers`).
3. **صورة مشاركة حقيقية**: الحالية `icon-512.png` (مربعة 512). الأفضل `og-image` بأبعاد 1200×630 تحمل الشعار والنص، ثم تحديث `og:image` في `seo-head.mjs`.
4. ~~تأكيد العلامة~~ — تم: الاسم الرسمي **Capkitco** والاسم البديل **CapKit Souq** (و«CapKit Co.» يبقى علامة خط الإصدارات الفاخرة).

---

## 5. التحقق بعد النشر

```bash
curl -sI https://capkitco.com/robots.txt        # 200 + text/plain
curl -s  https://capkitco.com/sitemap.xml       # 200 + XML صالح
```
- فاحص النتائج الغنية: <https://search.google.com/test/rich-results> — الصق رابط الرئيسية.
- فاحص المشاركة: <https://developers.facebook.com/tools/debug/> — يجب أن يظهر العنوان والوصف (كانا غائبين تماماً).

---

## 6. المرحلة 2 — Prerender صفحات المنتجات والخدمات والورش

### ما كان الخطأ
`product.html?id=...` تُبنى بالكامل من Supabase بعد تحميل الصفحة. النتيجة:
- جوجل يرى هيكلاً فارغاً (`<h1>—</h1>`) ويقرر لاحقاً — أو لا يقرر — متى يعيد الزحف بعد التنفيذ.
- واتساب/فيسبوك **لا ينفّذان JS إطلاقاً**، فكان كل رابط منتج يُشارَك بمعاينة «المنتج — CapKit Co.» وصورة الشعار.
- لا يوجد رابط داخلي في HTML المصدر يقود إلى أي منتج.

### ما تم بناؤه
`scripts/prerender.mjs` يقرأ المحتوى المنشور من Supabase ويولّد صفحة HTML كاملة لكل عنصر:

```
/product/{slug}/index.html      6 صفحات
/service/{slug}/index.html      1 صفحة
/workshop/{slug}/index.html     2 صفحة
prerender-manifest.json         فهرس المولّد (يغذّي sitemap.xml)
```

كل صفحة تحتوي:

| العنصر | التفصيل |
|---|---|
| `<head>` من السيرفر | `title` + `description` + `canonical` + OG + Twitter + `robots: index` |
| JSON-LD | `Product`/`Service`/`LocalBusiness` + `BreadcrumbList` + `Organization` + `WebSite` |
| محتوى نصي ثابت | العنوان، السعر، الوصف، البائع تُكتب داخل نفس عناصر القالب — تُقرأ بلا JS |
| `window.__PRERENDER__` | بيانات الصفحة مضمّنة، فتُلغى رحلة Supabase عند التحميل (LCP أسرع) |

### الهايدريشن
`product.js` و`service.js` و`workshop.js` تتحقق أولاً من `window.__PRERENDER__`:
- موجودة → ترسم فوراً بلا شبكة.
- غائبة → السلوك القديم (`?id=` + استعلام Supabase) كما هو، فلا كسر للروابط القديمة.

### الروابط النظيفة
`links.js` (ملف مشترك جديد) يبني الروابط بنفس قاعدة المولّد:
- إن وُجد `slug` في قاعدة البيانات → يُستخدم كما هو.
- وإلا → `p-XXXXXXXX` / `s-XXXXXXXX` / `w-XXXXXXXX` من أول 8 أحرف من الـUUID.

> **لماذا `p-` وليست كلمة عربية؟** عمود `slug` في جدول `products` **فارغ لكل المنتجات** حالياً. المولّد يدعم الـslug تلقائياً بمجرد تعبئته (عبر لوحة التحكم أو SQL)، وساعتها تتغير الروابط إلى `/product/جدارية-معدنية/` أو أي صيغة تختارها. الورش لديها slug فعلي (`w-mvbhhcmv`) ويُستخدم.

حُدّثت روابط البطاقات في: `homepage-loader.js` · `search.js` · `user.js` · `workshop.js` · `admin.js` · `product.js` · `service.js`.

### المسارات داخل الصفحات المولّدة

الصفحة تعيش في `/product/{slug}/`، فأي مسار نسبي (`product.js`، `styles.css`) يُطلب من المجلد الفرعي ويفشل بـ404. لذلك:

- `absolutize()` في المولّد يحوّل كل `src`/`href` نسبي إلى جذري (`/product.js`) في كل الصفحات المولّدة (منتجات، خدمات، ورش، بطاقات).
- لا يلمس محتوى `<script>` حتى لا يُفسد JSON المضمّن، ويتجاهل `#` و`https:` و`mailto:` و`data:`.
- أُصلحت أيضاً الروابط التي تُبنى وقت التشغيل: `footer.js` وروابط البائع في `product.js`/`service.js` وتحويلات الدخول في `comment.js`/`rating.js`/`likes.js` — لأنها كانت ستُكسر على الصفحات المولّدة رغم سلامة HTML.

### التشغيل (قبل كل نشر)
```bash
node scripts/prerender.mjs    # يولّد الصفحات + المانيفست
node scripts/gen-sitemap.mjs  # يقرأ المانيفست ويحدّث الخريطة
```

المولّد ينظّف مجلدات `product/` و`service/` و`workshop/` قبل كل تشغيل، فلا تبقى صفحات لمنتجات محذوفة.

### الحدود المعروفة
| الحد | الأثر | الحل اللاحق |
|---|---|---|
| الروابط القديمة `product.html?id=` ما زالت قابلة للفهرسة | ازدواج محتمل مع الصفحة المولّدة | إضافة `canonical` ديناميكي أو حجبها عند الحاجة |
| نص الصفحة يُعاد بناؤه بـJS عند التحميل | وميض بسيط محتمل | تحويل الكروت إلى Web Components أو تركها كما هي |
| إضافة منتج جديد لا تظهر حتى إعادة التوليد | صفحة 404 مؤقتة | ربط `prerender` بـCI أو نشر مجدول |

---

## 7. ما تبقّى (مؤجل بقرار)

| البند | السبب |
|---|---|
| `hreflang` | لا توجد نسخة إنجليزية فعلية؛ زر «EN» لا يغيّر اللغة |
| BreadcrumbList في الصفحات الثابتة | أُضيف في الصفحات المولّدة فقط؛ الصفحات المسطّحة لا تحتاجه |
| صور المشاركة 1200×630 | حالياً `icon-512.png` المربّع |

