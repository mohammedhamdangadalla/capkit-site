-- ═══════════════════════════════════════════════════════════════════════
-- 004 — إحصاءات عامة + سجل أحداث بدون كشف الجدول
-- ═══════════════════════════════════════════════════════════════════════
-- المشكلة: الصفحة الرئيسية تقرأ جدول auth_events مباشرة بمفتاح anon،
-- والجدول غير ممنوح لـanon → 401 في الكونسول بعد تسجيل الخروج.
--
-- الحل: دالتان SECURITY DEFINER:
--   1) public_stats()      → أعداد مجمّعة فقط (بلا صفوف) للعرض العام
--   2) log_auth_event(...) → تسجيل حدث دخول/خروج بلا منح INSERT كامل لـanon
-- ═══════════════════════════════════════════════════════════════════════

-- 1) إحصاءات مجمّعة
create or replace function public.public_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'signups_today',  (select count(*) from public.auth_events where created_at >= current_date),
    'profiles_total', (select count(*) from public.profiles)
  );
$$;

revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;

-- 2) تسجيل حدث بلا منح الكتابة الكاملة
--    auth.uid() قد تكون null (تسجيل جديد/زائر) — نقبلها.
create or replace function public.log_auth_event(
  p_event_type text,
  p_provider   text default 'email',
  p_user_agent text default null,
  p_metadata   jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- حماية من الحشو: نرفض الأحداث المجهولة الهوية لأكثر من 30 حدثاً/دقيقة لكل IP غير متاح،
  -- فنكتفي بحد أقصى بسيط على الحجم.
  if p_event_type is null or length(p_event_type) > 40 then
    return;
  end if;

  insert into public.auth_events (user_id, email, event_type, provider, user_agent, metadata)
  values (auth.uid(), null, p_event_type, p_provider, left(p_user_agent, 200), p_metadata);
end;
$$;

revoke all on function public.log_auth_event(text, text, text, jsonb) from public;
grant execute on function public.log_auth_event(text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

-- تحقق:
--   select public.public_stats();
--   select public.log_auth_event('test', 'email', 'sql-editor', '{}'::jsonb);
