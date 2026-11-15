-- ═══════════════════════════════════════════════════════════════════════
-- 013 — تحليلات المجلة (زيارات + تحميلات + استخدام الكتاب)
-- ═══════════════════════════════════════════════════════════════════════
-- المبدأ: الكتابة عبر دالة SECURITY DEFINER فقط (لا صلاحية إدراج مباشرة)،
--         والقراءة للمشرف فقط عبر دالة إحصاءات.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.analytics_events (
  id          bigserial primary key,
  event_type  text not null,
  target_type text,
  target_id   text,
  target_slug text,
  path        text,
  referrer    text,
  session_id  text,
  created_at  timestamptz not null default now()
);

create index if not exists analytics_events_type_time_idx
  on public.analytics_events (event_type, created_at desc);

create index if not exists analytics_events_target_time_idx
  on public.analytics_events (target_slug, created_at desc);

alter table public.analytics_events enable row level security;

-- لا سياسة إدراج/قراءة للعامة: كل شيء عبر الدوال.
drop policy if exists "analytics_admin_read" on public.analytics_events;
create policy "analytics_admin_read"
  on public.analytics_events for select
  to authenticated
  using (public.ck_is_admin());

-- ═══ تسجيل حدث (من المتصفح) ═══
create or replace function public.log_analytics_event(
  p_event       text,
  p_target_type text default null,
  p_target_id   text default null,
  p_target_slug text default null,
  p_path        text default null,
  p_referrer    text default null,
  p_session     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event is null or btrim(p_event) = '' then
    return;
  end if;

  insert into public.analytics_events
    (event_type, target_type, target_id, target_slug, path, referrer, session_id)
  values (
    left(btrim(p_event), 40),
    left(p_target_type, 30),
    left(p_target_id, 60),
    left(p_target_slug, 80),
    left(p_path, 300),
    left(p_referrer, 300),
    left(p_session, 64)
  );
end;
$$;

grant execute on function public.log_analytics_event(text, text, text, text, text, text, text)
  to anon, authenticated;

-- ═══ إحصاءات للمشرف ═══
create or replace function public.magazine_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_today bigint;
  v_7     bigint;
  v_30    bigint;
  v_last  timestamptz;
  v_by_type    jsonb;
  v_by_type_30 jsonb;
  v_top        jsonb;
  v_daily      jsonb;
begin
  if not public.ck_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select
    count(*),
    count(*) filter (where created_at >= current_date),
    count(*) filter (where created_at > now() - interval '7 days'),
    count(*) filter (where created_at > now() - interval '30 days'),
    max(created_at)
  into v_total, v_today, v_7, v_30, v_last
  from public.analytics_events;

  select coalesce(jsonb_object_agg(event_type, c), '{}'::jsonb)
  into v_by_type
  from (
    select event_type, count(*) c
    from public.analytics_events
    group by event_type
  ) t;

  select coalesce(jsonb_object_agg(event_type, c), '{}'::jsonb)
  into v_by_type_30
  from (
    select event_type, count(*) c
    from public.analytics_events
    where created_at > now() - interval '30 days'
    group by event_type
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('slug', target_slug, 'views', c) order by c desc), '[]'::jsonb)
  into v_top
  from (
    select target_slug, count(*) c
    from public.analytics_events
    where event_type = 'issue_view' and target_slug is not null
    group by target_slug
    order by c desc
    limit 10
  ) t;

  select coalesce(jsonb_agg(jsonb_build_object('day', d, 'views', c) order by d), '[]'::jsonb)
  into v_daily
  from (
    select to_char(created_at::date, 'YYYY-MM-DD') d, count(*) c
    from public.analytics_events
    where created_at > now() - interval '30 days'
      and event_type in ('magazine_view', 'issue_view', 'article_view')
    group by 1
  ) t;

  return jsonb_build_object(
    'total', v_total,
    'today', v_today,
    'last7', v_7,
    'last30', v_30,
    'last_event_at', v_last,
    'by_type', v_by_type,
    'by_type_30', v_by_type_30,
    'top_issues', v_top,
    'daily', v_daily
  );
end;
$$;

grant execute on function public.magazine_stats() to authenticated;

notify pgrst, 'reload schema';

-- تحقق:
--   select public.magazine_stats();
--   select event_type, count(*) from public.analytics_events group by 1 order by 2 desc;
