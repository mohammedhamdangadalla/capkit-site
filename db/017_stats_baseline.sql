-- ═══════════════════════════════════════════════════════════════════════
-- 017 — خط أساس تاريخي لأرقام المنصة (لا نتجاهل الأثر السابق)
-- ═══════════════════════════════════════════════════════════════════════
-- الفكرة:
--   الإجمالي = خط الأساس (لقطة من GA4 قبل تشغيل التتبّع)
--            + الأحداث المسجّلة بعد لحظة الأساس (بلا تداخل)
--
-- لماذا لا يحدث احتساب مزدوج؟
--   الأحداث المسجّلة قبل baseline_at محسوبة أصلاً داخل الأساس،
--   فلا نضيف منها شيئاً — نضيف فقط ما جاء بعد اللقطة.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.stats_baseline (
  id                int primary key default 1 check (id = 1),
  activity_baseline bigint not null default 0,
  visits_baseline   bigint not null default 0,
  reads_baseline    bigint not null default 0,
  baseline_at       timestamptz not null default now(),
  note              text,
  updated_at        timestamptz not null default now()
);

-- لقطة 2026-11-23 من GA4 (عدد الأحداث 907 · المشاهدات 315)
insert into public.stats_baseline (id, activity_baseline, visits_baseline, reads_baseline, baseline_at, note)
values (1, 907, 315, 0, now(), 'GA4 snapshot 2026-11-23')
on conflict (id) do nothing;

alter table public.stats_baseline enable row level security;
-- لا قراءة عامة للجدول؛ يُقرأ عبر public_stats فقط.

create or replace function public.public_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with b as (
    select activity_baseline, visits_baseline, reads_baseline, baseline_at
    from public.stats_baseline where id = 1
  )
  select jsonb_build_object(
    'signups_today',   (select count(*) from public.auth_events where created_at >= current_date),
    'profiles_total',  (select count(*) from public.profiles),
    'workshops_total', (select count(*) from public.workshops where status = 'active'),
    'products_total',  (select count(*) from public.products where status = 'published'),
    'issues_total',    (select count(*) from public.issues where is_published = true),
    'articles_total',  (select count(*) from public.articles),
    'reads_total',     coalesce((select reads_baseline from b), 0)
                       + (select count(*) from public.analytics_events, b
                          where analytics_events.created_at > b.baseline_at
                            and analytics_events.event_type = 'issue_view'),
    'activity_today',  (select count(*) from public.analytics_events where created_at >= current_date),
    'visits_today',    (select count(*) from public.analytics_events
                          where created_at >= current_date
                            and event_type in ('magazine_view', 'issue_view', 'article_view')),
    -- الإجماليات = الأساس + ما بعد اللقطة
    'activity_total',  coalesce((select activity_baseline from b), 0)
                       + (select count(*) from public.analytics_events, b
                          where analytics_events.created_at > b.baseline_at),
    'visits_total',    coalesce((select visits_baseline from b), 0)
                       + (select count(*) from public.analytics_events, b
                          where analytics_events.created_at > b.baseline_at
                            and analytics_events.event_type in ('magazine_view', 'issue_view', 'article_view')),
    'baseline_at',     (select baseline_at from b)
  );
$$;

revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;

notify pgrst, 'reload schema';

-- ═══ تحديث الأساس لاحقاً (إن أردت ترحيل لقطة أحدث) ═══
-- update public.stats_baseline
--    set activity_baseline = 1500,
--        visits_baseline   = 600,
--        reads_baseline    = 0,
--        baseline_at       = now(),
--        note              = 'لقطة محدثة',
--        updated_at        = now()
--  where id = 1;

-- تحقق:
--   select public.public_stats();
