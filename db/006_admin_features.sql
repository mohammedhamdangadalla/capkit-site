-- ═══════════════════════════════════════════════════════════════════════
-- 006 (v2) — توسيع لوحة الإدارة: مستخدمون · ورش · منتجات · هيرو
-- ═══════════════════════════════════════════════════════════════════════
-- سبب إعادة الإصدار: الخطأ 42725 «function public.is_admin() is not unique»
-- يعني أن مشروعك يحتوي أكثر من تعريف لدالة باسم is_admin (overloads)،
-- فصار استدعاء is_admin() بلا وسائط غامضاً لـ Postgres.
--
-- الحل: لا نلمس الدوال الموجودة (قد تعتمد عليها سياسات أخرى)،
-- بل ننشئ دالة باسم فريد ck_is_admin() ونستخدمها في سياساتنا.
--
-- لمعرفة التعريفات الموجودة لديك (اختياري، شغّله منفصلاً للفهم فقط):
--   select p.oid::regprocedure as signature
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'is_admin';
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════ 1) الأعمدة الجديدة ═══════════════════

alter table public.products
  add column if not exists is_featured boolean not null default false;

alter table public.products
  add column if not exists is_hero boolean not null default false;

create index if not exists products_featured_idx
  on public.products (created_at desc) where is_featured = true;

create index if not exists products_hero_idx
  on public.products (created_at desc) where is_hero = true;


-- ═══════════════════ 2) دالة صلاحية الأدمن (اسم فريد) ═══════════════════

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


-- ═══════════════════ 3) سياسات RLS ═══════════════════

drop policy if exists admin_manage_profiles on public.profiles;
create policy admin_manage_profiles
  on public.profiles for all to authenticated
  using (public.ck_is_admin())
  with check (public.ck_is_admin());

drop policy if exists admin_manage_workshops on public.workshops;
create policy admin_manage_workshops
  on public.workshops for all to authenticated
  using (public.ck_is_admin())
  with check (public.ck_is_admin());

drop policy if exists admin_manage_products on public.products;
create policy admin_manage_products
  on public.products for all to authenticated
  using (public.ck_is_admin())
  with check (public.ck_is_admin());


-- ═══════════════════ 4) حماية آخر أدمن ═══════════════════

create or replace function public.guard_admin_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin' and new.role <> 'admin' then
    if (select count(*) from public.profiles where role = 'admin' and id <> old.id) = 0 then
      raise exception 'لا يمكن إزالة دور الأدمن عن الحساب الأخير';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_admin_role on public.profiles;
create trigger trg_guard_admin_role
  before update of role on public.profiles
  for each row execute function public.guard_admin_role();


notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════
-- تحقق بعد التنفيذ:
--
--   select public.ck_is_admin();   -- يجب أن يرجع true لحسابك الأدمن
--
--   select column_name, data_type
--     from information_schema.columns
--    where table_name = 'products' and column_name in ('is_featured','is_hero');
--
--   select polname, polcmd from pg_policy
--    where polrelid in ('public.profiles'::regclass,'public.workshops'::regclass,'public.products'::regclass);
-- ═══════════════════════════════════════════════════════════════════════
