-- ═══════════════════════════════════════════════════════════════════════
-- 011 — Bucket أغلفة المجلة (magazine-assets)
-- ═══════════════════════════════════════════════════════════════════════
-- القراءة عامة (الأغلفة تظهر للزوار)، والكتابة للمشرفين فقط.
-- المسار: magazine-assets/covers/issue-{timestamp}.jpg
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'magazine-assets',
  'magazine-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- قراءة عامة
drop policy if exists "magazine_assets_public_read" on storage.objects;
create policy "magazine_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'magazine-assets');

-- رفع: للمشرف فقط
drop policy if exists "magazine_assets_admin_insert" on storage.objects;
create policy "magazine_assets_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'magazine-assets' and (select public.ck_is_admin()));

-- تعديل/استبدال
drop policy if exists "magazine_assets_admin_update" on storage.objects;
create policy "magazine_assets_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'magazine-assets' and (select public.ck_is_admin()));

-- حذف
drop policy if exists "magazine_assets_admin_delete" on storage.objects;
create policy "magazine_assets_admin_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'magazine-assets' and (select public.ck_is_admin()));

notify pgrst, 'reload schema';

-- تحقق:
--   select id, public, file_size_limit from storage.buckets where id = 'magazine-assets';
--   select polname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects' and polname like 'magazine_assets%';

-- ═══════════════════════════════════════════════════════════════════════
-- امتداد: رفع صور المنتجات من لوحة التحكم (bucket product-images)
-- ═══════════════════════════════════════════════════════════════════════
-- الباكت موجود مسبقاً. نضيف صلاحية للمشرف فقط، دون المساس بسياسات البائعين.

drop policy if exists "product_images_admin_insert" on storage.objects;
create policy "product_images_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.ck_is_admin()));

drop policy if exists "product_images_admin_update" on storage.objects;
create policy "product_images_admin_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.ck_is_admin()));

notify pgrst, 'reload schema';
