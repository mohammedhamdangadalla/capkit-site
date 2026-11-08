-- ═══════════════════════════════════════════════════════════════════════
-- 008 — المساحات الاحترافية (Premium Micro-sites)
-- ═══════════════════════════════════════════════════════════════════════
-- النموذج: مستخدم بريميوم واحد ← مساحة واحدة ← منتجات غير محدودة.
-- سبب الفصل عن جداول products/workshops: المساحة متجر مصغّر مستقل بهويته
-- وسعره ومواصفاته، ولا يجب أن يختلط بكتالوج السوق العام.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════ 1) الحقول والجداول ═══════════════════

alter table public.profiles
  add column if not exists is_premium boolean not null default false;

create table if not exists public.premium_spaces (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users(id) on delete cascade,
  store_name        text not null,
  tagline           text,
  about_text        text,
  logo_url          text,
  cover_url         text,
  contact_phone     text,
  contact_whatsapp  text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.premium_products (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.premium_spaces(id) on delete cascade,
  title        text not null,
  description  text,
  price        numeric(12, 2),
  image_url    text,
  specs_jsonb  jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists premium_products_space_idx
  on public.premium_products (space_id, created_at desc);

create index if not exists premium_spaces_active_idx
  on public.premium_spaces (is_active) where is_active = true;


-- ═══════════════════ 2) تحديث updated_at تلقائياً ═══════════════════

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_premium_spaces_touch on public.premium_spaces;
create trigger trg_premium_spaces_touch
  before update on public.premium_spaces
  for each row execute function public.touch_updated_at();


-- ═══════════════════ 3) هل المستخدم بريميوم؟ ═══════════════════
-- SECURITY DEFINER: لا نعتمد على سياسة قراءة profiles داخل السياسة نفسها.

create or replace function public.ck_is_premium()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_premium from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.ck_is_premium() from public;
grant execute on function public.ck_is_premium() to authenticated;


-- ═══════════════════ 4) صلاحيات الجداول ═══════════════════

grant select on public.premium_spaces, public.premium_products to anon, authenticated;
grant insert, update, delete on public.premium_spaces, public.premium_products to authenticated;


-- ═══════════════════ 5) RLS: المساحات ═══════════════════

alter table public.premium_spaces enable row level security;

-- العامة: المساحات النشطة فقط
drop policy if exists spaces_public_read on public.premium_spaces;
create policy spaces_public_read
  on public.premium_spaces for select
  to anon, authenticated
  using (is_active = true);

-- المالك: مساحته حتى لو كانت غير نشطة
drop policy if exists spaces_owner_read on public.premium_spaces;
create policy spaces_owner_read
  on public.premium_spaces for select
  to authenticated
  using (user_id = auth.uid());

-- المالك: الإنشاء (بشرط البريميوم)
drop policy if exists spaces_owner_insert on public.premium_spaces;
create policy spaces_owner_insert
  on public.premium_spaces for insert
  to authenticated
  with check (user_id = auth.uid() and public.ck_is_premium());

-- المالك: التعديل
drop policy if exists spaces_owner_update on public.premium_spaces;
create policy spaces_owner_update
  on public.premium_spaces for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.ck_is_premium());

-- المالك: الحذف
drop policy if exists spaces_owner_delete on public.premium_spaces;
create policy spaces_owner_delete
  on public.premium_spaces for delete
  to authenticated
  using (user_id = auth.uid());

-- الأدمن: كل شيء
drop policy if exists spaces_admin_all on public.premium_spaces;
create policy spaces_admin_all
  on public.premium_spaces for all
  to authenticated
  using (public.ck_is_admin())
  with check (public.ck_is_admin());


-- ═══════════════════ 6) RLS: منتجات المساحة ═══════════════════

alter table public.premium_products enable row level security;

-- العامة: منتجات مساحة نشطة
drop policy if exists pproducts_public_read on public.premium_products;
create policy pproducts_public_read
  on public.premium_products for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.premium_spaces s
      where s.id = premium_products.space_id and s.is_active = true
    )
  );

-- المالك: قراءة منتجاته (حتى غير النشطة)
drop policy if exists pproducts_owner_read on public.premium_products;
create policy pproducts_owner_read
  on public.premium_products for select
  to authenticated
  using (
    exists (
      select 1 from public.premium_spaces s
      where s.id = premium_products.space_id and s.user_id = auth.uid()
    )
  );

-- المالك: الإضافة
drop policy if exists pproducts_owner_insert on public.premium_products;
create policy pproducts_owner_insert
  on public.premium_products for insert
  to authenticated
  with check (
    public.ck_is_premium()
    and exists (
      select 1 from public.premium_spaces s
      where s.id = premium_products.space_id and s.user_id = auth.uid()
    )
  );

-- المالك: التعديل والحذف
drop policy if exists pproducts_owner_update on public.premium_products;
create policy pproducts_owner_update
  on public.premium_products for update
  to authenticated
  using (
    exists (
      select 1 from public.premium_spaces s
      where s.id = premium_products.space_id and s.user_id = auth.uid()
    )
  );

drop policy if exists pproducts_owner_delete on public.premium_products;
create policy pproducts_owner_delete
  on public.premium_products for delete
  to authenticated
  using (
    exists (
      select 1 from public.premium_spaces s
      where s.id = premium_products.space_id and s.user_id = auth.uid()
    )
  );

-- الأدمن
drop policy if exists pproducts_admin_all on public.premium_products;
create policy pproducts_admin_all
  on public.premium_products for all
  to authenticated
  using (public.ck_is_admin())
  with check (public.ck_is_admin());


notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════
-- تحقق بعد التنفيذ:
--
--   select column_name from information_schema.columns
--    where table_name = 'profiles' and column_name = 'is_premium';
--
--   select count(*) from pg_policies
--    where tablename in ('premium_spaces','premium_products');
-- ═══════════════════════════════════════════════════════════════════════
