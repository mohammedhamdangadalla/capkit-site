// ═══ روابط نظيفة للصفحات المولّدة مسبقاً ═══
// القاعدة نفسها في scripts/prerender.mjs — عند تعديلها عدّل الاثنين معاً.
// المنتجات في قاعدة البيانات قد لا تملك slug بعد، لذلك نولّد معرّفاً قصيراً ثابتاً
// بنفس الصيغة التي يستخدمها المولّد: p-xxxxxxxx (أول 8 أحرف من الـUUID).
(function () {
  const PREFIX = { product: 'p', service: 's', workshop: 'w' };

  function itemUrl(type, item) {
    if (!item || !item.id) return '/';
    const prefix = PREFIX[type] || 'p';
    const fromDb = String(item.slug || '').trim();
    const slug = /^[a-zA-Z0-9_-]+$/.test(fromDb)
      ? fromDb
      : `${prefix}-${String(item.id).replace(/-/g, '').slice(0, 8)}`;
    return `/${type}/${slug}/`;
  }

  function itemUrlAbsolute(type, item) {
    return `https://capkitco.com${itemUrl(type, item)}`;
  }

  /**
   * يطبّع رقم واتساب إلى الصيغة الدولية.
   * الأرقام المخزّنة محلياً مثل 01116549311 تنتج رابطاً غير صالح،
   * فيفتح واتساب الشاشة الرئيسية بدل المحادثة.
   */
  function normalizeWhatsApp(value) {
    let d = String(value || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '20' + d.slice(1);
    else if (/^1\d{9}$/.test(d)) d = '20' + d; // موبايل مصري بلا صفر
    return d.length >= 8 && d.length <= 15 ? d : '';
  }

  window.normalizeWhatsApp = normalizeWhatsApp;

  /**
   * يمرّر صور Supabase Storage عبر نقطة التحويل (WebP + تصغير + ضغط).
   * الصورة نفسها: 263KB JPEG → 113KB WebP بعرض 600، بلا رفع أي ملف.
   * يتجاهل الروابط غير التابعة لـStorage أو المحوّلة مسبقاً.
   */
  function optimizeImage(url, width, quality) {
    if (!url) return url;
    try {
      const u = new URL(url, location.origin);
      if (!/\.supabase\.co$/.test(u.hostname)) return url;
      const marker = '/storage/v1/object/public/';
      if (!u.pathname.includes(marker)) return url;
      u.pathname = u.pathname.replace(marker, '/storage/v1/render/image/public/');
      u.searchParams.set('width', String(width || 700));
      u.searchParams.set('quality', String(quality || 72));
      u.searchParams.set('format', 'webp');
      return u.toString();
    } catch {
      return url;
    }
  }

  window.optimizeImage = optimizeImage;
  window.itemUrl = itemUrl;
  window.itemUrlAbsolute = itemUrlAbsolute;
})();
