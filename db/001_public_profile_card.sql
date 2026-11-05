-- ═══════════════════════════════════════════════════════════════════════
-- 001 — بطاقة التعريف العامة (Public Profile Card)  [نسخة مصححة v2]
-- ═══════════════════════════════════════════════════════════════════════
-- سبب إعادة الكتابة: النسخة الأولى لم تُنفَّذ فعلياً على قاعدة الإنتاج
-- (تحققنا: لا social_links ولا public_profiles ولا bucket avatars).
--
-- التغييرات في هذه النسخة:
--   1) profile_public أصبح افتراضياً false (قرار الخصوصية)
--   2) username_changed_at لتنفيذ قاعدة "تغيير الاسم مرة واحدة"
--   3) منع anon من قراءة جدول profiles مباشرة (حقول PII)
--   4) لا يوجد begin/commit — كل قسم يُنفَّذ ويُلتزم على حدة،
--      حتى يظهر لك أي قسم يفشل بدقة بدل تراجع صامت.
--
-- الصق الملف كاملاً في Supabase → SQL Editor → Run.
-- آمن للتشغيل أكثر من مرة.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════ 1) الحقول الجديدة ═══════════════════

alter table public.profiles
  add column if not exists social_links jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists profile_public boolean not null default false;

alter table public.profiles
  add column if not exists username_changed_at timestamptz;

-- في حال وُجدت النسخة الأولى بقيمة افتراضية true
alter table public.profiles
  alter column profile_public set default false;

update public.profiles
  set profile_public = false
  where profile_public = true
    and username_changed_at is null;   -- لم يوافق أحد على النشر بعد

alter table public.profiles
  drop constraint if exists profiles_social_links_object;
alter table public.profiles
  add constraint profiles_social_links_object
  check (jsonb_typeof(social_links) = 'object');


-- ═══════════════════ 2) أسماء المستخدمين ═══════════════════

update public.profiles
set username = 'u_' || substr(replace(id::text, '-', ''), 1, 8)
where username is null or btrim(username) = '';

update public.profiles
set username = lower(regexp_replace(username, '[^a-zA-Z0-9_]+', '_', 'g'))
where username <> lower(regexp_replace(username, '[^a-zA-Z0-9_]+', '_', 'g'));

update public.profiles
set username = substr(username, 1, 30)
where length(username) > 30;

update public.profiles
set username = 'u_' || substr(replace(id::text, '-', ''), 1, 8)
where length(username) < 3;

do $$
declare
  r record;
begin
  for r in
    select id, username,
           row_number() over (partition by username order by created_at, id) as rn
    from public.profiles
  loop
    if r.rn > 1 then
      update public.profiles
      set username = r.username || '_' || substr(replace(r.id::text, '-', ''), 1, 4)
      where id = r.id;
    end if;
  end loop;
end $$;

alter table public.profiles
  alter column username set not null;

alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[a-z0-9_]{3,30}$');

alter table public.profiles
  drop constraint if exists profiles_username_reserved;
alter table public.profiles
  add constraint profiles_username_reserved
  check (username not in (
    'u', 'admin', 'administrator', 'api', 'www', 'capkit', 'capkitco',
    'product', 'products', 'service', 'services', 'workshop', 'workshops',
    'search', 'dashboard', 'auth', 'login', 'signup', 'settings', 'help',
    'support', 'about', 'contact', 'terms', 'privacy', 'manifesto', 'user'
  ));

create unique index if not exists profiles_username_unique_idx
  on public.profiles (username);

create or replace function public.ensure_profile_username()
returns trigger
language plpgsql
as $$
begin
  if new.username is null or btrim(new.username) = '' then
    new.username := 'u_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_username on public.profiles;
create trigger trg_profiles_username
  before insert on public.profiles
  for each row execute function public.ensure_profile_username();


-- ═══════════════════ 3) عرض عام بلا بيانات حساسة ═══════════════════
-- يعرض كل الملفات (حتى لا تنكسر صفحة user.html) لكن بلا:
-- email · phone · telegram_chat_id · telegram_username
-- whatsapp يبقى لأنه وسيلة التواصل المقصودة في البطاقة.

create or replace view public.public_profiles as
select
  id, username, full_name, avatar_url, bio, role, city,
  governorate_id, verified, social_links, whatsapp,
  followers_count, views_count, created_at, updated_at
from public.profiles
where username is not null;

revoke all on public.public_profiles from public;
grant select on public.public_profiles to anon, authenticated;


-- ═══════════════════ 4) منع anon من الجدول مباشرة ═══════════════════
-- الزائر يقرأ من العرض فقط. المتسجل (authenticated) كما هو دون تغيير.

revoke select on public.profiles from anon;


-- ═══════════════════ 5) التخزين: bucket avatars ═══════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- ═══════════════════ 6) تحديث كاش PostgREST فوراً ═══════════════════
-- بدونه قد يظل «social_links does not exist» رغم نجاح الهجرة.

notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════
-- تحقق سريع (شغّل بعد التنفيذ):
--
--   select count(*) filter (where username is null) as بلا_اسم,
--          count(*) filter (where profile_public)   as عام,
--          count(*) filter (where avatar_url is not null) as بصور
--   from public.profiles;
--
--   select count(*) from public.public_profiles;
--   select id, public, file_size_limit from storage.buckets where id = 'avatars';
-- ═══════════════════════════════════════════════════════════════════════
