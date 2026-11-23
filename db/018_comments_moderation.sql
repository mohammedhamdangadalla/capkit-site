-- ═══════════════════════════════════════════════════════════════════════
-- 018 — اعتماد تعليقات المقالات + نشر تلقائي لتعليقات المشرف
-- ═══════════════════════════════════════════════════════════════════════
-- سبب المشكلة: سياسة الإدراج تفرض is_approved = false، والصفحة تعرض
-- المعتمد فقط. فيبقى تعليق المشرف مخفياً حتى يُعتمد يدوياً.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) اعتماد كل التعليقات المعلّقة الحالية (كانت محجوبة بلا واجهة مراجعة)
update public.article_comments
   set is_approved = true
 where is_approved = false;

-- 2) نشر تلقائي لتعليقات المشرفين
--    (trigger بعد الإدراج، لأن سياسة INSERT ترفض is_approved = true في WITH CHECK)
create or replace function public.auto_approve_admin_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.ck_is_admin() then
    update public.article_comments
       set is_approved = true
     where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_approve_admin_comment on public.article_comments;

create trigger trg_auto_approve_admin_comment
after insert on public.article_comments
for each row execute function public.auto_approve_admin_comment();

-- 3) فهرس للمراجعة السريعة
create index if not exists comments_pending_idx
  on public.article_comments (created_at desc)
  where is_approved = false;

notify pgrst, 'reload schema';

-- تحقق:
--   select count(*) from public.article_comments where is_approved = false;
--   select id, left(comment_text, 40), is_approved from public.article_comments order by created_at desc limit 5;
