// ═══════════════════════════════════════════════════════════════════════
// capkit-co.js — قطع Cap Kit Co. الحقيقية + نموذج إضافة للمشرف
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var client = function () { return window.supabaseClient; };

  var CATEGORY_METALS = 1;   // معادن وحدادة
  var BUCKET = 'product-images';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function priceText(p) {
    return Number(p.price) > 0
      ? p.price + ' ' + (p.currency || 'EGP')
      : 'السعر عند الطلب';
  }

  function productUrl(p) {
    if (window.itemUrl) return itemUrl('product', p);
    return '/product.html?id=' + p.id;
  }

  /* ═══ بطاقة قطعة ═══ */
  function cardHtml(p) {
    var img = p.images && p.images[0];
    var src = img
      ? (window.optimizeImage ? optimizeImage(img, 700) : img)
      : '';

    return '<a class="digital-card" href="' + productUrl(p) + '">' +
      '<div class="digital-tag">CAP KIT CO. — ' + esc((p.serial_number || 'EDITION').slice(0, 18)) + '</div>' +
      (src ? '<img src="' + esc(src) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async" style="width:100%;height:190px;object-fit:cover;border-radius:10px;margin:0 0 14px;">' : '') +
      '<h3 class="digital-title">' + esc(p.title) + '</h3>' +
      '<p class="digital-desc">' + esc(String(p.description || '').slice(0, 150)) + '</p>' +
      '<div class="digital-action">' +
        '<span class="digital-price">' + esc(priceText(p)) + '</span>' +
        '<span class="btn-reserve">عرض القطعة ←</span>' +
      '</div>' +
    '</a>';
  }

  /* ═══ تحميل القطع ═══ */
  async function loadProducts() {
    var grid = $('coGrid');
    if (!grid) return;

    try {
      var res = await client()
        .from('products')
        .select('id, title, slug, description, price, currency, images, serial_number, is_capkit_original, status')
        .eq('is_capkit_original', true)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(12);

      if (res.error) throw res.error;
      var rows = res.data || [];

      if (!rows.length) {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#9a9384; padding:20px;">لا توجد قطع منشورة بعد. أضف أول قطعة من النموذج أدناه.</div>';
        return;
      }

      grid.innerHTML = rows.map(cardHtml).join('');
    } catch (err) {
      console.error('[capkit-co] load failed:', err);
      grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#9a9384;">تعذّر تحميل القطع.</div>';
    }
  }

  /* ═══ نموذج المشرف ═══ */
  function setMsg(text, ok) {
    var el = $('coMsg');
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? '#7fd4a3' : '#e08b84';
  }

  async function checkAdmin() {
    try {
      var { data, error } = await client().rpc('ck_is_admin');
      if (error) return false;
      return Boolean(data);
    } catch (e) {
      return false;
    }
  }

  async function compressImage(file, maxSize) {
    if (!file.type.startsWith('image/')) throw new Error('الملف ليس صورة');
    var bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (e) {
      throw new Error('صيغة الصورة غير مدعومة');
    }
    var scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    var w = Math.max(1, Math.round(bitmap.width * scale));
    var h = Math.max(1, Math.round(bitmap.height * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close && bitmap.close();
    return await new Promise(function (resolve) {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
  }

  function parseSpecs(text) {
    var out = {};
    String(text || '').split('\n').forEach(function (line) {
      var i = line.indexOf(':');
      if (i > 0) {
        var k = line.slice(0, i).trim();
        var v = line.slice(i + 1).trim();
        if (k && v) out[k] = v;
      }
    });
    return out;
  }

  async function submit(e) {
    e.preventDefault();

    var title = ($('coTitle').value || '').trim();
    var desc = ($('coDesc').value || '').trim();
    var price = Number($('coPrice').value) || 0;
    var currency = ($('coCurrency').value || 'EGP').trim();
    var serial = ($('coSerial').value || '').trim();
    var imageUrl = ($('coImage').value || '').trim();
    var file = $('coImageFile') && $('coImageFile').files && $('coImageFile').files[0];
    var specs = parseSpecs($('coSpecs').value);
    var btn = $('coSave');

    if (title.length < 3) return setMsg('العنوان قصير جداً', false);
    if (desc.length < 10) return setMsg('اكتب وصفاً أوضح', false);

    btn.disabled = true;
    setMsg('جارٍ الحفظ…', true);

    try {
      var userRes = await client().auth.getUser();
      var user = userRes.data && userRes.data.user;
      if (!user) throw new Error('سجّل الدخول مرة أخرى');

      if (file) {
        setMsg('جارٍ رفع الصورة…', true);
        var blob = await compressImage(file, 1400);
        var path = user.id + '/co-' + Date.now() + '.jpg';
        var up = await client().storage.from(BUCKET).upload(path, blob, {
          contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
        });
        if (up.error) throw up.error;
        var pub = client().storage.from(BUCKET).getPublicUrl(path);
        imageUrl = pub.data.publicUrl;
      }

      var payload = {
        category_id: CATEGORY_METALS,
        title: title,
        description: desc,
        price: price,
        currency: currency,
        negotiable: false,
        images: imageUrl ? [imageUrl] : [],
        specs: specs,
        serial_number: serial || null,
        is_capkit_original: true,
        status: 'published',
        moderation_status: 'approved',
        seller_type: 'individual',
        seller_id: user.id,
        published_at: new Date().toISOString(),
      };

      var ins = await client().from('products').insert(payload).select('id').single();
      if (ins.error) throw ins.error;

      setMsg('✅ أُضيفت القطعة — تظهر الآن في الأعلى', true);
      $('coForm').reset();
      await loadProducts();
    } catch (err) {
      console.error('[capkit-co] save failed:', err);
      var m = String(err && err.message || '');
      if (/row-level security|permission/i.test(m)) {
        setMsg('لا تملك صلاحية الإضافة — تأكد أنك مشرف.', false);
      } else {
        setMsg(m || 'فشل الحفظ', false);
      }
    } finally {
      btn.disabled = false;
    }
  }

  /* ═══ التشغيل ═══ */
  async function init() {
    if (!client()) {
      console.warn('[capkit-co] Supabase غير محمّل');
      return;
    }

    await loadProducts();

    var isAdmin = await checkAdmin();
    var adminBox = $('coAdmin');
    if (isAdmin && adminBox) {
      adminBox.style.display = 'block';
      $('coForm').addEventListener('submit', submit);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
