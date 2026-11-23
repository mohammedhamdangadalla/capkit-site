-- ═══════════════════════════════════════════════════════════════════════
-- 014 — عدّاد مشاهدات المجلة (قراءة عامة مجمّعة)
-- ═══════════════════════════════════════════════════════════════════════
-- analytics_events محمي بـRLS (قراءة للمشرف فقط)، وهذه الدالة تعيد
-- أعداداً مجمّعة فقط — بلا أي بيانات شخصية — لتُعرض على بطاقات المجلة.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.issue_views()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', coalesce((
      select count(*) from public.analytics_events where event_type = 'issue_view'
    ), 0),
    'issues', coalesce((
      select jsonb_object_agg(target_slug, c)
      from (
        select target_slug, count(*) c
        from public.analytics_events
        where event_type = 'issue_view' and target_slug is not null
        group by target_slug
      ) t
    ), '{}'::jsonb)
  );
$$;

grant execute on function public.issue_views() to anon, authenticated;

notify pgrst, 'reload schema';

-- تحقق:
--   select public.issue_views();
