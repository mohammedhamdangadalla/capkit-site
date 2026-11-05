-- ═══════════════════════════════════════════════════════════════════════
-- 002 — إضافة profile_public إلى العرض العام
-- ═══════════════════════════════════════════════════════════════════════
-- السبب: prerender يقرأ بـanon key، وهو محجوب عن جدول profiles،
-- فيحتاج معرفة أي بطاقة منشورة من العرض نفسه.
--
-- لماذا drop + create بدل create or replace؟
-- لأن إضافة عمود في وسط الـview ممنوعة في Postgres (تُغيّر ترتيب الأعمدة).
--
-- نفّذ الملف كاملاً في SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════

drop view if exists public.public_profiles;

create view public.public_profiles as
select
  id, username, full_name, avatar_url, bio, role, city,
  governorate_id, verified, social_links, whatsapp,
  profile_public, followers_count, views_count, created_at, updated_at
from public.profiles
where username is not null;

revoke all on public.public_profiles from public;
grant select on public.public_profiles to anon, authenticated;

notify pgrst, 'reload schema';

-- تحقق:
--   select count(*) filter (where profile_public) as منشورة,
--          count(*)                              as الكل
--   from public.public_profiles;
