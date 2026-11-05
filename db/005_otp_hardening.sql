-- ═══════════════════════════════════════════════════════════════════════
-- 005 — تحصين أكواد الاستعادة (OTP)
-- ═══════════════════════════════════════════════════════════════════════
-- السبب: نقطة /api/auth/verify-otp في الـWorker لا تحدّ عدد المحاولات.
-- كود من 6 أرقام صالح 10 دقائق = قابل للتخمين الآلي بلا هذا الحد.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.verification_codes
  add column if not exists attempts int not null default 0;

create index if not exists verification_codes_user_purpose_idx
  on public.verification_codes (user_id, purpose, created_at desc);

-- (اختياري) منع تراكم الأكواد: علّم القديمة كمستهلكة عند إصدار كود جديد
-- نفّذها من الـWorker بعد إنشاء الكود الجديد:
--
--   update public.verification_codes
--      set consumed_at = now()
--    where user_id = $1
--      and purpose = 'password_reset'
--      and consumed_at is null
--      and id <> $2;

-- تحقق:
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'verification_codes';
