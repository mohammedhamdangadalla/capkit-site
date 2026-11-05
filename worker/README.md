# مراجعة Worker بوت تلجرام (V7) — تشخيص وإصلاح

> الكود المنشور مطابق للكود الذي أرسلته. تحققت من ذلك بفحص المسارات:
> `link-token → 401` · `notify → 401` · `/webhook → 403` · `/health → 404`.

---

## 1. سبب الصمت — الاستنتاج من الأدلة

في لقطة شاشة Cloudflare: **Requests/sec = 0** و**Error rate = 0%**.

هذا يستبعد فرضية «السر غير مطابق»: لو كانت تلجرام ترسل فعلاً لرأينا طلبات
ونسبة أخطاء 100% (كل تحديث يُرد بـ403). صفر طلبات يعني أن **تلجرام لا تتصل بالـWorker أصلاً**.

| الفرضية | الدليل المؤيد | الدليل المنافي |
|---|---|---|
| **لا يوجد webhook مسجّل** (أو يشير لعنوان آخر) | 0 req/s · 0% errors · البوت صامت تماماً | — |
| السر غير مطابق | الكود يرد 403 | كان سيظهر trafic وأخطاء |
| توكن البوت خاطئ داخل الـWorker | `sendTelegram` يفشل بصمت | كان سيظهر trafic |

**الأرجح: لا يوجد webhook.** وتلجرام لا «تكتشف» البوت تلقائياً — يجب تسجيل العنوان مرة واحدة.

---

## 2. الإصلاح الفوري (أمر واحد)

```bash
# 1) اقرأ الحالة الحالية
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# 2) إن كان url فارغاً — سجّل الـwebhook مع السر
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://capkit-telegram-bot.mohammed-hamdan0.workers.dev/webhook" \
  -d "secret_token=<WEBHOOK_SECRET>"

# 3) تأكيد
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

`WEBHOOK_SECRET` هو نفس القيمة التي ضبطتها في Cloudflare
(سجل النشر يُظهر تحديثها مرتين قبل 10 أيام). لا يمكن قراءتها من اللوحة بعد الحفظ —
إن نسيتها، عيّن قيمة جديدة في الـWorker ثم أعد `setWebhook` بها.

أو استخدم السكربت الجاهز الذي يفحص كل شيء ويطبع الأمر:

```bash
node scripts/check-telegram.mjs <TOKEN> <WEBHOOK_SECRET>
```

**بعد التسجيل:** أرسل `/start` للبوت — يجب أن يرد فوراً برسالة الترحيب.

---

## 3. مراجعة الكود — 6 مشاكل حقيقية

### أ) الفشل الصامت في الإرسال (الأخطر تشخيصياً)

```js
const res = await fetch(...sendMessage...);
return res.ok;          // النتيجة تُهمَل عند كل المستدعين
```

إن كان `TELEGRAM_BOT_TOKEN` خاطئاً أو الاسم مستخدماً، ترى صمتاً تاماً بلا أي أثر.
**الإصلاح:**

```js
async function sendTelegram(chatId, text, botToken, inlineKeyboard = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (inlineKeyboard) body.reply_markup = { inline_keyboard: inlineKeyboard };

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error('Telegram send failed', res.status, detail.slice(0, 300));
  }
  return res.ok;
}
```

### ب) لا يوجد فحص صحة

أضف قبل `return jsonResponse({ error: 'Not Found' }, 404);`:

```js
if (url.pathname === '/health' && request.method === 'GET') {
  return jsonResponse({
    ok: true,
    version: 'v7',
    hasBotToken: Boolean(env.TELEGRAM_BOT_TOKEN),
    hasWebhookSecret: Boolean(env.WEBHOOK_SECRET),
    hasSupabase: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY),
    secretMatches: Boolean(env.WEBHOOK_SECRET),
  });
}
```

يفيدك لاحقاً: `curl .../health` يكشف نقص متغير بيئة في ثانية، بلا كشف أي سر.

### ج) CORS يحجب التطوير المحلي

```js
'Access-Control-Allow-Origin': 'https://capkitco.com',
```

أي اختبار من `localhost:5173` لزر «ربط الحساب» سيفشل بخطأ CORS. **الإصلاح:**

```js
const ALLOWED = new Set(['https://capkitco.com', 'https://www.capkitco.com']);
const origin = request.headers.get('Origin') || '';
const allowOrigin = ALLOWED.has(origin) ? origin : 'https://capkitco.com';
```

### د) ثغرة في كود الاستعادة (OTP) — الأخطر أمنياً

`/api/auth/verify-otp` يقبل محاولات غير محدودة على كود من 6 أرقام صالح 10 دقائق.
مهاجم يستطيع تجربة مليون احتمال — عملياً 500 ألف محاولة كافية لاختراق أي كود.

**الإصلاح يحتاج عموداً:**

```sql
alter table public.verification_codes
  add column if not exists attempts int not null default 0;

create index if not exists verification_codes_user_purpose_idx
  on public.verification_codes (user_id, purpose, created_at desc);
```

ثم في `verify-otp`:

```js
// بعد جلب الكود الصالح
if (validCodes.length && validCodes[0].attempts >= 5) {
  return jsonResponse({ error: 'تم تجاوز عدد المحاولات. اطلب كوداً جديداً.' }, 429);
}
// عند الفشل: زد العدّاد على أحدث كود للمستخدم
```

والأفضل: احذف الكود بعد 5 محاولات فاشلة.

### هـ) لا يوجد تقييد على `request-otp`

أي شخص يعرف بريد مستخدم يستطيع إغراقه برسائل تلجرام. **الإصلاح:** امنع إصدار كود جديد
إن وُجد كود لم يُستخدم أُنشئ قبل أقل من 60 ثانية.

### و) `reset-password` بلا سياسة كلمة مرور

```js
const { session_token, new_password } = await request.json();
```

أضف:

```js
if (!new_password || new_password.length < 8) {
  return jsonResponse({ error: 'كلمة المرور قصيرة (8 أحرف على الأقل)' }, 400);
}
```

---

## 4. متغيرات البيئة المطلوبة

| المتغير | الاستخدام | إن غاب |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | إرسال الرسائل | صمت تام (sendMessage يفشل) |
| `WEBHOOK_SECRET` | التحقق من تحديثات تلجرام | **كل تحديث يُرد 403** |
| `SUPABASE_URL` | قاعدة البيانات | فشل الربط والإشعارات |
| `SUPABASE_SERVICE_KEY` | تجاوز RLS | كل كتابة تفشل بصمت |
| `NOTIFY_SECRET` | حماية `/notify` و`/broadcast` | يرجع للاعتماد على `WEBHOOK_SECRET` |
| `OTP_SALT` | تعمية الأكواد | — |

```bash
npx wrangler secret put WEBHOOK_SECRET
npx wrangler deploy
npx wrangler tail      # راقب الطلبات أثناء إرسال /start
```

---

## 5. ملاحظة على المستودع

كود الـWorker **ليس داخل هذا المشروع**، فأي إصلاح في `worker.js` يبقى في Cloudflare.
أنصح بإضافته للمستودع في `worker/telegram-bot.js` + `wrangler.toml`، حتى تصبح التغييرات
قابلة للمراجعة والنشر الآلي بدل التعديل اليدوي في اللوحة.
