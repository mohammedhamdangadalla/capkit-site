-- ═══════════════════════════════════════════════════════════════════════
-- 010 — Bucket رفع صور المساحات الاحترافية (premium-assets)
-- ═══════════════════════════════════════════════════════════════════════
-- الفكرة: كل مستخدم يرفع داخل مجلده: premium-assets/{auth.uid()}/...
-- القراءة العامة مفتوحة (الصور تُعرض للزوار)، والكتابة للمالك فقط.
-- ═══════════════════════════════════════════════════════════════════════

-- 1) الباكت (3MB، صور فقط)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'premium-assets',
  'premium-assets',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) قراءة عامة
drop policy if exists "premium_assets_public_read" on storage.objects;
create policy "premium_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'premium-assets');

-- 3) رفع: في مجلد المستخدم فقط
drop policy if exists "premium_assets_owner_insert" on storage.objects;
create policy "premium_assets_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'premium-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 4) تعديل (upsert/استبدال)
drop policy if exists "premium_assets_owner_update" on storage.objects;
create policy "premium_assets_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'premium-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 5) حذف
drop policy if exists "premium_assets_owner_delete" on storage.objects;
create policy "premium_assets_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'premium-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════
-- تحقق:
--   select id, public, file_size_limit from storage.buckets where id = 'premium-assets';
--   select polname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects' and polname like 'premium_assets%';
-- ═══════════════════════════════════════════════════════════════════════
