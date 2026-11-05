# تشخيص بوت تلجرام

> البوت يعمل على **Cloudflare Worker** خارج هذا المستودع:
> `https://capkit-telegram-bot.mohammed-hamdan0.workers.dev`
> الموقع يتصل به في ثلاثة مواضع: `/webhook` (تلجرام)، `/api/telegram/link-token`، `/api/telegram/unlink`.

---

## ما تحقّقت منه فعلياً

| الفحص | النتيجة |
|---|---|
| `GET /` · `GET /health` · `GET /webhook` | **404** — لا توجد صفحات عامة (طبيعي لـWorker يعمل بـPOST) |
| `POST /webhook` بلا سر | **403 Unauthorized** |
| `POST /webhook` بسر غير صحيح | **403 Unauthorized** |

**الاستنتاج:** الـWorker **حيّ ومنشور**، والمسار `/webhook` موجود، لكنه يرفض أي تحديث لا يحمل
`X-Telegram-Bot-Api-Secret-Token` المطابق. أي أن الصمت سببه على الأرجح **عدم تطابق السر**
بين Telegram والـWorker، وليس توقف البوت.

---

## الخطوة 1 — شغّل التشخيص

```bash
node scripts/check-telegram.mjs <BOT_TOKEN> [SECRET_TOKEN]
```

- `BOT_TOKEN` من **@BotFather** → `/mybots` → API Token.
- `SECRET_TOKEN` هو قيمة `WEBHOOK_SECRET` في متغيرات الـWorker (اختياري لكنه الأهم هنا).

سيطبع السكربت: صلاحية التوكن، الـURL المسجّل، عدد التحديثات المعلّقة، آخر خطأ، ثم اختباراً مباشراً
للـWorker، وأخيراً أمر `setWebhook` الجاهز.

---

## الخطوة 2 — اقرأ التشخيص وطبّق المقابل

| ما يظهر | المعنى | الإصلاح |
|---|---|---|
| `URL المسجّل: (لا يوجد)` | لا webhook | `setWebhook` بالرابط أعلاه + `secret_token` |
| `آخر خطأ: 403` | السر لا يطابق | أعد `setWebhook` بنفس `WEBHOOK_SECRET`، أو حدّث المتغير في الـWorker |
| `آخر خطأ: 401` | الـWorker يحمل توكن بوت خاطئ | `wrangler secret put TELEGRAM_BOT_TOKEN` |
| `آخر خطأ: 404` | مسار خاطئ | تأكد أن المسار `/webhook` |
| `آخر خطأ: timeout` | الـWorker يتعطل أو بطيء | `npx wrangler tail` لرؤية الأخطاء |
| لا أخطاء لكن البوت صامت | الخلل في منطق الـWorker | راجع سجلات `wrangler tail` أثناء إرسال `/start` |

### أوامر جاهزة

```bash
# إعادة تسجيل الـwebhook (استبدل <TOKEN> و<SECRET>)
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://capkit-telegram-bot.mohammed-hamdan0.workers.dev/webhook" \
  -d "secret_token=<SECRET>"

# قراءة الحالة
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# حذف الـwebhook (للتجربة المحلية)
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"
```

### متغيرات الـWorker المتوقعة

| المتغير | الاستخدام |
|---|---|
| `TELEGRAM_BOT_TOKEN` | توكن البوت — إن تغيّر، أعد النشر |
| `WEBHOOK_SECRET` | السر المطابق لـ`secret_token` |
| `SUPABASE_URL` | مشروع قاعدة البيانات |
| `SUPABASE_SERVICE_ROLE_KEY` | لتحديث `profiles.telegram_chat_id` بعد `/start` |

```bash
npx wrangler secret put WEBHOOK_SECRET
npx wrangler deploy
npx wrangler tail        # لمشاهدة الطلبات والأخطاء لحظياً
```

---

## الخطوة 3 — لماذا يهمّ هذا الموقع أيضاً

زر «ربط الحساب» في لوحة التحكم يستدعي `/api/telegram/link-token` ثم يفتح
`https://t.me/CapKitMarketBot?start=<token>`. إن كان الـWorker يرفض الطلبات أو لا يعمل،
فسيفشل الربط أيضاً ويظهر `alert` بخطأ.

بعد إصلاح الـwebhook، اختبر المسار كاملاً: لوحة التحكم → الإعدادات → «ربط الحساب» →
يجب أن يفتح تلجرام على البوت ويُرسل `/start <token>` ثم يظهر الحساب مربوطاً خلال ثوانٍ.

---

## ملاحظة معمارية

منطق البوت **ليس في هذا المستودع**، فلا أستطيع تعديله من هنا. بعد تشغيل السكربت وإرسال ناتجه
أستطيع تحديد السطر المسؤول بالضبط إن كان الخلل في الـWorker (مثلاً: مقارنة السر، أو التحقق من
`auth.uid()` داخل `link-token`).
