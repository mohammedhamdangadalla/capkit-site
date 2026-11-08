-- ═══════════════════════════════════════════════════════════════════════
-- 007 — المجلة الهندسية (CapKit Magazine) — المخطط الأساسي
-- ═══════════════════════════════════════════════════════════════════════
-- ملاحظة: دالة الأدمن في مشروعك اسمها ck_is_admin() وليس is_admin()
-- (بعد معالجة الخطأ 42725). هذا الملف يعيد تعريفها بأمان إن لم تكن موجودة،
-- فلا يعتمد على ترتيب تنفيذ الهجرات.
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════ 0) ضمان وجود دالة الأدمن ═══════════════════

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


-- ═══════════════════ 1) الجداول ═══════════════════

create table if not exists public.issues (
  id            uuid primary key default gen_random_uuid(),
  issue_number  integer not null unique,
  title         text not null,
  publish_date  date,
  cover_image   text,
  description   text,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.articles (
  id                       uuid primary key default gen_random_uuid(),
  issue_id                 uuid not null references public.issues(id) on delete cascade,
  title                    text not null,
  summary                  text,
  content_html             text,
  technical_details_html   text,
  citations                text,
  category                 text,
  order_index              integer not null default 0,
  created_at               timestamptz not null default now()
);

create table if not exists public.article_comments (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid not null references public.articles(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  comment_text text not null check (char_length(btrim(comment_text)) between 1 and 2000),
  created_at   timestamptz not null default now(),
  is_approved  boolean not null default false
);

create index if not exists issues_published_idx
  on public.issues (publish_date desc) where is_published = true;

create index if not exists articles_issue_order_idx
  on public.articles (issue_id, order_index);

create index if not exists comments_article_idx
  on public.article_comments (article_id, created_at desc);


-- ═══════════════════ 2) تفعيل RLS ═══════════════════

alter table public.issues          enable row level security;
alter table public.articles        enable row level security;
alter table public.article_comments enable row level security;


-- ═══════════════════ 3) صلاحيات الجداول الأساسية ═══════════════════
-- (RLS تحدّد الصفوف؛ هذه الصلاحيات تحدّد العمليات المتاحة للأدوار)

grant select on public.issues, public.articles, public.article_comments to anon, authenticated;
grant insert, update, delete on public.issues, public.articles to authenticated;
grant insert, update, delete on public.article_comments to authenticated;


-- ═══════════════════ 4) الأعداد (issues) ═══════════════════

-- القراءة العامة: الأعداد المنشورة فقط
drop policy if exists issues_public_read on public.issues;
create policy issues_public_read
  on public.issues for select
  to anon, authenticated
  using (is_published = true);

-- الأدمن: كل شيء
drop policy if exists issues_admin_all on public.issues;
create policy issues_admin_all
  on public.issues for all
  to authenticated
  using (public.ck_is_admin())
  with check (public.ck_is_admin());


-- ═══════════════════ 5) المقالات (articles) ═══════════════════

-- القراءة العامة: مقالات عدد منشور فقط
drop policy if exists articles_public_read on public.articles;
create policy articles_public_read
  on public.articles for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.issues i
      where i.id = articles.issue_id and i.is_published = true
    )
  );

drop policy if exists articles_admin_all on public.articles;
create policy articles_admin_all
  on public.articles for all
  to authenticated
  using (public.ck_is_admin())
  with check (public.ck_is_admin());


-- ═══════════════════ 6) التعليقات (article_comments) ═══════════════════

-- القراءة العامة: المعتمدة فقط
drop policy if exists comments_public_read on public.article_comments;
create policy comments_public_read
  on public.article_comments for select
  to anon, authenticated
  using (is_approved = true);

-- صاحب التعليق يرى تعليقه حتى قبل الاعتماد
drop policy if exists comments_own_read on public.article_comments;
create policy comments_own_read
  on public.article_comments for select
  to authenticated
  using (user_id = auth.uid());

-- الإدراج: للمسجلين فقط، ولا يستطيع أحد انتحال هوية غيره
drop policy if exists comments_authenticated_insert on public.article_comments;
create policy comments_authenticated_insert
  on public.article_comments for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and is_approved = false
    and exists (
      select 1 from public.articles a
      join public.issues i on i.id = a.issue_id
      where a.id = article_comments.article_id and i.is_published = true
    )
  );

drop policy if exists comments_admin_all on public.article_comments;
create policy comments_admin_all
  on public.article_comments for all
  to authenticated
  using (public.ck_is_admin())
  with check (public.ck_is_admin());


notify pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════
-- تحقق بعد التنفيذ:
--
--   select tablename, policyname from pg_policies
--    where tablename in ('issues','articles','article_comments') order by 1,2;
--
--   insert into public.issues (issue_number, title, publish_date, description, is_published)
--   values (1, 'العدد الأول', current_date, 'تجربة', false);
-- ═══════════════════════════════════════════════════════════════════════
