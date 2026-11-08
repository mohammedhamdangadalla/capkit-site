// ═══ محرر المساحة الاحترافية ═══
// متاح فقط لأصحاب is_premium = true (يُتحقق عبر RPC ck_is_premium).

(function () {
  'use strict';

  const state = { user: null, space: null, products: [], editing: null, username: null };
  const client = () => window.supabaseClient;

  const $ = (id) => document.getElementById(id);

  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function toast(message, kind) {
    let el = document.getElementById('spToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'spToast';
      el.className = 'sp-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'sp-toast show' + (kind === 'error' ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function explain(err) {
    const m = String(err?.message || err || '');
    if (/42P01|does not exist/i.test(m)) return 'جداول المساحات غير موجودة — نفّذ db/008_premium_spaces.sql.';
    if (/42501|permission denied|policy/i.test(m)) return 'لا تملك صلاحية — تأكد من تفعيل البريميوم.';
    if (/duplicate|23505/i.test(m)) return 'لديك مساحة بالفعل.';
    return m || 'حدث خطأ';
  }

  function gate(html) {
    $('gateState').innerHTML = html;
    $('gateState').style.display = 'block';
    $('editorWrap').style.display = 'none';
  }

  /* ─────────── التهيئة ─────────── */

  async function init() {
    if (!client()) return gate('<div class="icon">⚠️</div><h2>تعذّر تحميل النظام</h2>');

    const { data: { session } } = await client().auth.getSession();
    if (!session) {
      location.href = '/auth.html?next=' + encodeURIComponent(location.pathname);
      return;
    }
    state.user = session.user;

    const { data: premium, error: pErr } = await client().rpc('ck_is_premium');
    if (pErr) return gate('<div class="icon">⚠️</div><h2>' + esc(explain(pErr)) + '</h2>');

    if (!premium) {
      return gate(`
        <div class="icon">🔒</div>
        <h2>هذه المساحة للمشتركين الاحترافيين</h2>
        <p style="max-width:46ch;margin:0 auto 18px;">المساحة الاحترافية تمنحك متجراً مصغّراً باسمك وشعارك ومنتجاتك، برابط قابل للمشاركة.</p>
        <a class="sp-btn gold" href="/contact.html">تواصل لتفعيل البريميوم</a>
      `);
    }

    const { data: prof } = await client()
      .from('public_profiles')
      .select('username')
      .eq('id', state.user.id)
      .maybeSingle();
    state.username = prof?.username || null;

    const { data: space } = await client()
      .from('premium_spaces')
      .select('*')
      .eq('user_id', state.user.id)
      .maybeSingle();

    state.space = space || null;
    fillForm();
    $('gateState').style.display = 'none';
    $('editorWrap').style.display = 'block';

    if (state.space) {
      await loadProducts();
      if (state.username) {
        const btn = $('viewSpaceBtn');
        btn.href = `/space.html?username=${encodeURIComponent(state.username)}`;
        btn.hidden = false;
      }
    } else {
      $('productsList').innerHTML = '<p style="color:var(--sp-muted); font-size:.88rem;">احفظ بيانات المساحة أولاً، ثم أضف منتجاتك.</p>';
    }
  }

  /* ─────────── بيانات المساحة ─────────── */

  function fillForm() {
    const s = state.space || {};
    $('spName').value = s.store_name || '';
    $('spTagline').value = s.tagline || '';
    $('spAbout').value = s.about_text || '';
    $('spLogo').value = s.logo_url || '';
    $('spCover').value = s.cover_url || '';
    $('spPhone').value = s.contact_phone || '';
    $('spWhatsapp').value = s.contact_whatsapp || '';
    $('spActive').checked = s.is_active !== false;
  }

  async function saveSpace() {
    const btn = $('saveSpaceBtn');
    const payload = {
      user_id: state.user.id,
      store_name: $('spName').value.trim(),
      tagline: $('spTagline').value.trim() || null,
      about_text: $('spAbout').value.trim() || null,
      logo_url: $('spLogo').value.trim() || null,
      cover_url: $('spCover').value.trim() || null,
      contact_phone: $('spPhone').value.trim() || null,
      contact_whatsapp: $('spWhatsapp').value.trim() || null,
      is_active: $('spActive').checked,
    };

    if (payload.store_name.length < 2) return toast('الاسم التجاري مطلوب', 'error');
    if (!payload.contact_whatsapp) return toast('رقم الواتساب مطلوب', 'error');

    btn.disabled = true;
    try {
      const q = state.space
        ? client().from('premium_spaces').update(payload).eq('id', state.space.id).select().single()
        : client().from('premium_spaces').insert(payload).select().single();

      const { data, error } = await q;
      if (error) throw error;

      state.space = data;
      toast('تم حفظ المساحة');
      if (state.username) {
        const btnView = $('viewSpaceBtn');
        btnView.href = `/space.html?username=${encodeURIComponent(state.username)}`;
        btnView.hidden = false;
      }
      await loadProducts();
    } catch (err) {
      toast(explain(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* ─────────── المنتجات ─────────── */

  async function loadProducts() {
    if (!state.space) return;
    const { data, error } = await client()
      .from('premium_products')
      .select('*')
      .eq('space_id', state.space.id)
      .order('created_at', { ascending: false });

    if (error) {
      $('productsList').innerHTML = '<p style="color:#fca5a5;">' + esc(explain(error)) + '</p>';
      return;
    }
    state.products = data || [];
    renderProducts();
  }

  function renderProducts() {
    const list = $('productsList');
    $('productsCount').textContent = state.products.length ? `${state.products.length} منتج` : '';

    if (!state.products.length) {
      list.innerHTML = '<p style="color:var(--sp-muted); font-size:.88rem;">لا منتجات بعد.</p>';
      return;
    }

    list.innerHTML = state.products.map((p) => `
      <div class="sp-list-item">
        ${p.image_url
          ? `<img src="${esc(p.image_url)}" alt="">`
          : '<div class="ph">📦</div>'}
        <div class="info">
          <strong>${esc(p.title)}</strong>
          <span>${p.price != null ? esc(p.price) + ' جنيه' : 'بلا سعر'}</span>
        </div>
        <button class="sp-btn ghost" style="padding:6px 12px;font-size:.78rem;" onclick="SpaceEditor.openProduct('${p.id}')">تعديل</button>
        <button class="sp-btn ghost" style="padding:6px 12px;font-size:.78rem;color:#fca5a5;" onclick="SpaceEditor.deleteProduct('${p.id}')">حذف</button>
      </div>`).join('');
  }

  /* ─────────── مودال المنتج ─────────── */

  function addSpecRow(key, value) {
    const row = document.createElement('div');
    row.className = 'sp-spec-row';
    row.innerHTML = `
      <input class="spec-key" placeholder="المواصفة (مثال: المادة)" value="${esc(key || '')}">
      <input class="spec-value" placeholder="القيمة (مثال: نحاس)" value="${esc(value || '')}">
      <button type="button" title="حذف">✕</button>`;
    row.querySelector('button').addEventListener('click', () => row.remove());
    $('specsRows').appendChild(row);
  }

  function openProduct(id) {
    if (!state.space) return toast('احفظ بيانات المساحة أولاً', 'error');
    state.editing = id ? state.products.find((p) => p.id === id) : null;
    const p = state.editing || {};

    $('productModalTitle').textContent = id ? 'تعديل المنتج' : 'منتج جديد';
    $('ppTitle').value = p.title || '';
    $('ppPrice').value = p.price ?? '';
    $('ppDesc').value = p.description || '';
    $('ppImage').value = p.image_url || '';
    $('specsRows').innerHTML = '';

    const specs = p.specs_jsonb && typeof p.specs_jsonb === 'object' ? p.specs_jsonb : {};
    const entries = Object.entries(specs);
    if (entries.length) entries.forEach(([k, v]) => addSpecRow(k, v));
    else { addSpecRow(); addSpecRow(); }

    $('productModal').classList.add('open');
  }

  function closeProduct() {
    $('productModal').classList.remove('open');
  }

  async function saveProduct() {
    if (!state.space) return toast('لا توجد مساحة', 'error');
    const btn = $('saveProductBtn');

    const specs = {};
    document.querySelectorAll('#specsRows .sp-spec-row').forEach((row) => {
      const k = row.querySelector('.spec-key').value.trim();
      const v = row.querySelector('.spec-value').value.trim();
      if (k && v) specs[k] = v;
    });

    const payload = {
      space_id: state.space.id,
      title: $('ppTitle').value.trim(),
      description: $('ppDesc').value.trim() || null,
      price: $('ppPrice').value === '' ? null : Number($('ppPrice').value),
      image_url: $('ppImage').value.trim() || null,
      specs_jsonb: specs,
    };

    if (payload.title.length < 2) return toast('اسم المنتج مطلوب', 'error');

    btn.disabled = true;
    try {
      const q = state.editing
        ? client().from('premium_products').update(payload).eq('id', state.editing.id)
        : client().from('premium_products').insert(payload);
      const { error } = await q;
      if (error) throw error;
      closeProduct();
      toast(state.editing ? 'تم تحديث المنتج' : 'تمت إضافة المنتج');
      await loadProducts();
    } catch (err) {
      toast(explain(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteProduct(id) {
    if (!confirm('حذف هذا المنتج نهائياً؟')) return;
    try {
      const { error } = await client().from('premium_products').delete().eq('id', id);
      if (error) throw error;
      toast('تم حذف المنتج');
      await loadProducts();
    } catch (err) {
      toast(explain(err), 'error');
    }
  }

  /* ─────────── التصدير ─────────── */

  window.SpaceEditor = { openProduct, closeProduct, saveProduct, deleteProduct, addSpecRow };

  document.addEventListener('DOMContentLoaded', () => {
    $('saveSpaceBtn')?.addEventListener('click', saveSpace);
    $('productModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'productModal') closeProduct();
    });
    init();
  });
})();
