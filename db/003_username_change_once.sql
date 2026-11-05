-- ═══════════════════════════════════════════════════════════════════════
-- 003 — قاعدة "تغيير الاسم مرة واحدة" + كشف حالة الاسم للواجهة
-- ═══════════════════════════════════════════════════════════════════════
-- الفرض يجب أن يكون في قاعدة البيانات لا في الواجهة: أي عميل يستطيع
-- إرسال UPDATE مباشر عبر PostgREST، فالتحقق في JS وحده قابل للتجاوز.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) الـtrigger: يمنع التغيير الثاني ويسجّل وقت الأول تلقائياً
create or replace function public.enforce_username_change_once()
returns trigger
language plpgsql
as $$
begin
  if new.username is distinct from old.username then
    if old.username_changed_at is not null then
      raise exception 'username_already_changed'
        using hint = 'اسم المستخدم يمكن تغييره مرة واحدة فقط.';
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_username_change_once on public.profiles;
create trigger trg_username_change_once
  before update of username on public.profiles
  for each row execute function public.enforce_username_change_once();

-- 2) إتاحة username_changed_at للواجهة عبر العرض (لتعطيل الحقل مسبقاً)
drop view if exists public.public_profiles;

create view public.public_profiles as
select
  id, username, full_name, avatar_url, bio, role, city,
  governorate_id, verified, social_links, whatsapp,
  profile_public, username_changed_at,
  followers_count, views_count, created_at, updated_at
from public.profiles
where username is not null;

revoke all on public.public_profiles from public;
grant select on public.public_profiles to anon, authenticated;

notify pgrst, 'reload schema';

-- تحقق:
--   select username, username_changed_at, profile_public
--   from public.public_profiles limit 5;
