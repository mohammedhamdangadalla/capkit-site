/**
 * check-telegram.mjs — تشخيص بوت تلجرام في 10 ثوانٍ
 * ------------------------------------------------------------------
 * التشغيل:
 *   node scripts/check-telegram.mjs <BOT_TOKEN> [SECRET_TOKEN]
 *
 * SECRET_TOKEN اختياري: السر الذي يتحقق منه الـWorker في ترويسة
 * X-Telegram-Bot-Api-Secret-Token. إن مررته سيفحص أيضاً أن الـWorker
 * يقبله فعلاً.
 */

const TOKEN = process.argv[2];
const SECRET = process.argv[3] || '';
const WORKER = 'https://capkit-telegram-bot.mohammed-hamdan0.workers.dev';
const WEBHOOK_PATH = '/webhook';

if (!TOKEN) {
  console.error(`
الاستخدام: node scripts/check-telegram.mjs <BOT_TOKEN> [SECRET_TOKEN]

احصل على التوكن من @BotFather → /mybots → API Token.
`);
  process.exit(1);
}

const api = (method, params = {}) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

const pad = (s, n = 22) => String(s).padEnd(n);

console.log('\n═══ 1) صلاحية التوكن ═══');
const me = await api('getMe');
if (!me.body.ok) {
  console.log(`✖ التوكن غير صالح (HTTP ${me.status}): ${me.body.description || 'unknown'}`);
  console.log('  → اطلب توكن جديداً من @BotFather.');
  process.exit(1);
}
console.log(`✔ البوت: @${me.body.result.username} (${me.body.result.first_name})`);

console.log('\n═══ 2) حالة الـWebhook ═══');
const info = await api('getWebhookInfo');
if (!info.body.ok) {
  console.log('✖ تعذّر قراءة حالة الـwebhook:', info.body.description);
  process.exit(1);
}

const w = info.body.result;
const expected = WORKER + WEBHOOK_PATH;

console.log(`${pad('URL المسجّل:')}${w.url || '(لا يوجد)'}`);
console.log(`${pad('URL المتوقع:')}${expected}`);
console.log(`${pad('تحديثات معلّقة:')}${w.pending_update_count ?? 0}`);
if (w.last_error_message) {
  console.log(`${pad('آخر خطأ:')}${w.last_error_message}`);
  console.log(`${pad('وقت آخر خطأ:')}${new Date(w.last_error_date * 1000).toISOString()}`);
}
if (w.max_connections) console.log(`${pad('max_connections:')}${w.max_connections}`);

console.log('\n═══ 3) التشخيص ═══');
const problems = [];

if (!w.url) problems.push('لا يوجد webhook مسجّل إطلاقاً — البوت لا يستقبل أي تحديث.');
else if (w.url !== expected) problems.push(`الـwebhook يشير إلى عنوان مختلف: ${w.url}`);

if (w.last_error_message) {
  const m = w.last_error_message.toLowerCase();
  if (m.includes('401') || m.includes('unauthorized')) {
    problems.push('تلجرام استلم 401 من الـWorker — غالباً التوكن داخل الـWorker قديم/خاطئ.');
  } else if (m.includes('403') || m.includes('forbidden')) {
    problems.push(
      'تلجرام استلم 403 من الـWorker — السر (secret token) غير مطابق. ' +
        'الـWorker يرفض أي تحديث لا يحمل X-Telegram-Bot-Api-Secret-Token الصحيح.',
    );
  } else if (m.includes('404')) {
    problems.push('مسار الـwebhook غير موجود على الـWorker (404) — تحقق من اسم المسار.');
  } else if (m.includes('timeout') || m.includes('failed to connect')) {
    problems.push('الـWorker لا يستجيب في الوقت المحدد — تحقق من نشر الـWorker وقيوده.');
  } else {
    problems.push(`خطأ من الـWorker: ${w.last_error_message}`);
  }
}

console.log(problems.length ? problems.map((p) => '✖ ' + p).join('\n') : '✔ لا مشاكل ظاهرة في إعداد الـwebhook.');

console.log('\n═══ 4) اختبار مباشر للـWorker ═══');
const health = await fetch(WORKER + '/health').catch(() => null);
if (health) {
  console.log(`${pad('/health:')}HTTP ${health.status} ${health.status === 404 ? '(غير مضاف بعد — انظر worker/README.md)' : ''}`);
}

const test = await fetch(expected, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(SECRET ? { 'X-Telegram-Bot-Api-Secret-Token': SECRET } : {}),
  },
  body: JSON.stringify({ update_id: 1, message: { message_id: 1, date: 0, text: '/start', chat: { id: 1 }, from: { id: 1 } } }),
});
const testBody = await test.text();
console.log(`HTTP ${test.status} — ${testBody.slice(0, 160).replace(/\n/g, ' ')}`);

if (test.status === 403) {
  console.log('→ الـWorker يرفض الطلب: إما أن السر غير صحيح، أو أنك لم تمرره في الأمر.');
  console.log('   جرّب: node scripts/check-telegram.mjs <TOKEN> <SECRET>');
} else if (test.status === 200) {
  console.log('→ الـWorker قبل الطلب. إن ظل البوت صامتاً فالخلل داخل منطق الـWorker (راجع wrangler tail).');
}

console.log('\n═══ 5) الإصلاح المقترح ═══');
console.log('أعد تسجيل الـwebhook بالسر نفسه المضبوط في متغيرات الـWorker:');
console.log(`  curl "https://api.telegram.org/bot${TOKEN.slice(0, 6)}…/setWebhook" \\`);
console.log(`    -d "url=${expected}" \\`);
console.log(`    -d "secret_token=<SECRET>"`);
console.log('\nوتأكد أن متغير WEBHOOK_SECRET في الـWorker يحمل نفس القيمة.');
