-- ═══════════════════════════════════════════════════════════════════════
-- 012 — إدراج «الكتاب التفاعلي» كمنتج رقمي مجاني
-- ═══════════════════════════════════════════════════════════════════════
-- التصنيف: 11 = خدمات رقمية (digital)
-- السعر: 0 (مجاني) — الرابط داخل الوصف وفي حقل specs
-- البائع: أول حساب بدور admin، وإلا أقدم حساب
--
-- التشغيل: Supabase → SQL Editor → الصق ثم Run.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.products (
  category_id,
  title,
  slug,
  description,
  price,
  currency,
  negotiable,
  images,
  specs,
  status,
  moderation_status,
  stock,
  seller_type,
  seller_id,
  published_at,
  is_featured,
  is_hero
)
select
  11,
  'الكتاب التفاعلي: الليزر والراوتر والطباعة ثلاثية الأبعاد',
  'interactive-book',
  'كتاب ويب تفاعلي مجاني: خمس حاسبات تحسب إعدادات ليزر CO2 والراوتر CNC والطباعة ثلاثية الأبعاد، وكل رقم يظهر معادلته. يعمل على الموبايل وبلا إنترنت. افتحه من: https://capkitco.com/book.html',
  0,
  'EGP',
  false,
  array['https://capkitco.com/book-cover.svg'],
  '{"format":"web","access":"free","url":"https://capkitco.com/book.html","language":"ar","offline":true}'::jsonb,
  'published',
  'approved',
  9999,
  'individual',
  coalesce(
    (select id from public.profiles where role = 'admin' order by created_at asc limit 1),
    (select id from public.profiles order by created_at asc limit 1)
  ),
  now(),
  true,
  false
where not exists (
  select 1 from public.products where slug = 'interactive-book'
);

-- تحقق:
--   select id, title, slug, price, status, category_id from public.products
--    where slug = 'interactive-book';

notify pgrst, 'reload schema';
