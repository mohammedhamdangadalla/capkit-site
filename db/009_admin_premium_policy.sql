-- ═══════════════════════════════════════════════════════════════════════
-- 009 — التأكد من سياسة الأدمن على profiles (تحديث is_premium وغيره)
-- ═══════════════════════════════════════════════════════════════════════
-- سبب الملف: زر «تفعيل البريميوم» يرسل UPDATE على profiles.is_premium.
-- إن فشل الطلب بسبب RLS سيظهر 42501 في الكونسول.
-- هذا الملف يعيد إنشاء السياسة بشكل صريح، ويطبع تشخيصاً.
-- آمن للتشغيل أكثر من مرة.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) الدالة (SECURITY DEFINER حتى لا تدور في سياسة profiles نفسها)
create or replace function public.ck_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.ck_is_admin() from public;
grant execute on function public.ck_is_admin() to authenticated;

-- 2) سياسة واحدة شاملة (SELECT/INSERT/UPDATE/DELETE) للأدمن
drop policy if exists admin_manage_profiles on public.profiles;
create policy admin_manage_profiles
  on public.profiles
  for all
  to authenticated
  using (public.ck_is_admin())
  with check (public.ck_is_admin());

-- 3) صلاحيات الأعمدة (الجدول كان محجوباً عن anon فقط، لا عن authenticated)
grant select, insert, update, delete on public.profiles to authenticated;

notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════
-- تشخيص — شغّل هذه الاستعلامات منفصلة والصق الناتج إن استمر الخطأ:
--
-- (أ) هل أنت أدمن من منظور القاعدة؟
--   select auth.uid() as my_id, public.ck_is_admin() as is_admin;
--
-- (ب) ما السياسات الموجودة فعلاً على profiles؟
--   select polname, polcmd, polroles::text
--     from pg_policy where polrelid = 'public.profiles'::regclass;
--
-- (ج) هل العمود موجود؟
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_name = 'profiles' and column_name = 'is_premium';
--
-- (د) اختبار تحديث مباشر (غيّر المعرف إلى معرفك):
--   update public.profiles set is_premium = true where id = auth.uid();
--   select id, role, is_premium from public.profiles where id = auth.uid();
-- ═══════════════════════════════════════════════════════════════════════
