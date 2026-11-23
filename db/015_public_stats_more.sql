-- ═══════════════════════════════════════════════════════════════════════
-- 015 — توسيع public_stats: أرقام المنصة الحيّة للعرض العام
-- ═══════════════════════════════════════════════════════════════════════
-- كل القيم مجمّعة (count) بلا أي صفوف أو بيانات شخصية.
-- تُستخدم في شريط الأرقام بالصفحة الرئيسية.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.public_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'signups_today',   (select count(*) from public.auth_events where created_at >= current_date),
    'profiles_total',  (select count(*) from public.profiles),
    'workshops_total', (select count(*) from public.workshops where status = 'active'),
    'products_total',  (select count(*) from public.products where status = 'published'),
    'issues_total',    (select count(*) from public.issues where is_published = true),
    'articles_total',  (select count(*) from public.articles),
    'visits_today',    (select count(*) from public.analytics_events
                          where created_at >= current_date
                            and event_type in ('magazine_view', 'issue_view', 'article_view')),
    'visits_total',    (select count(*) from public.analytics_events
                          where event_type in ('magazine_view', 'issue_view', 'article_view')),
    'reads_total',     (select count(*) from public.analytics_events where event_type = 'issue_view')
  );
$$;

revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;

notify pgrst, 'reload schema';

-- تحقق:
--   select public.public_stats();
