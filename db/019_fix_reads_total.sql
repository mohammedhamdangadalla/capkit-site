-- ═══════════════════════════════════════════════════════════════════════
-- 019 — تصحيح قراءة المجلة (توحيد العدّاد مع بطاقات الأعداد)
-- ═══════════════════════════════════════════════════════════════════════
-- المشكلة: reads_total كانت تُحسب بعد baseline_at فقط، فتُظهر 0
-- بينما بطاقات المجلة (issue_views) تعرض العدد الكلي (7، 13…).
-- الحل: reads_total = خط أساس القراءات + كل أحداث فتح العدد.
-- الإجماليات الأخرى (activity/visits) تبقى كما هي لتفادي الاحتساب المزدوج.
-- ═══════════════════════════════════════════════════════════════════════

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

    -- القراءات: كل الأحداث (مطابقة لبطاقات المجلة) + خط أساس اختياري
    'reads_total',     coalesce((select reads_baseline from b), 0)
                       + (select count(*) from public.analytics_events where event_type = 'issue_view'),

    'activity_today',  (select count(*) from public.analytics_events where created_at >= current_date),
    'visits_today',    (select count(*) from public.analytics_events
                          where created_at >= current_date
                            and event_type in ('magazine_view', 'issue_view', 'article_view')),

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

-- تحقق: يجب أن يتساوى reads_total مع مجموع بطاقات المجلة
--   select public.public_stats() -> 'reads_total';
--   select public.issue_views();
