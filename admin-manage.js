// ═══ Admin Panels — Users · Workshops · Products · Hero ═══
// يعمل بعد admin.js: يستمع لحدث admin:ready ويبني الأقسام عند فتح كل تبويب.

(function () {
  'use strict';

  const state = {
    ready: false,
    users: [],
    workshops: [],
    products: [],
    governorates: new Map(),
    categories: [],
    workshopNames: new Map(),
    loaded: { users: false, workshops: false, products: false, hero: false },
  };

  const ROLE_LABELS = { buyer: 'مشتري', vendor: 'بائع / ورشة', freelancer: 'مهندس / فني', admin: 'أدمن' };
  const MAX_HERO = 4;

  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  };

  const client = () => window.supabaseClient;

  function toast(message, kind) {
    let el = document.getElementById('adminToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'adminToast';
      el.className = 'admin-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'admin-toast show' + (kind === 'error' ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /** رسالة خطأ مفهومة بدل رمز Postgres */
  function explainError(err) {
    const msg = String(err?.message || err || '');
    if (/42501|permission denied|policy/i.test(msg)) {
      return 'لا تملك صلاحية هذه العملية — نفّذ db/006_admin_features.sql أولاً.';
    }
    if (/42P01|does not exist/i.test(msg)) return 'عمود أو جدول ناقص — نفّذ db/006_admin_features.sql.';
    if (/guard_admin_role|آخر أدمن/i.test(msg)) return 'لا يمكن إزالة دور الأدمن عن الحساب الأخير.';
    return msg || 'حدث خطأ غير متوقع';
  }

  async function updateRow(table, id, patch) {
    const { error } = await client().from(table).update(patch).eq('id', id);
    if (error) throw error;
  }

  function emptyState(text) {
    return `<div class="state-message"><div class="state-icon">📭</div><div class="state-title">${esc(text)}</div></div>`;
  }

  /* ═══════════════ المستخدمون ═══════════════ */

  async function loadUsers(force) {
    if (state.loaded.users && !force) return;
    const wrap = document.getElementById('usersTableWrap');
    try {
      const { data, error } = await client()
        .from('profiles')
        .select('id, username, full_name, email, role, verified, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      state.users = data || [];
      state.loaded.users = true;
      renderUsers();
    } catch (err) {
      wrap.innerHTML = emptyState(explainError(err));
    }
  }

  function renderUsers() {
    const wrap = document.getElementById('usersTableWrap');
    const q = (document.getElementById('userSearch')?.value || '').trim().toLowerCase();
    const rows = state.users.filter(
      (u) => !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q),
    );

    document.getElementById('usersCount').textContent = `${rows.length} من ${state.users.length}`;

    if (!rows.length) {
      wrap.innerHTML = emptyState('لا نتائج');
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead><tr>
          <th>الاسم</th><th>البريد</th><th>الدور</th><th>الانضمام</th><th>التوثيق</th><th></th>
        </tr></thead>
        <tbody>
          ${rows.map((u) => `
            <tr>
              <td><strong>${esc(u.full_name || u.username || '—')}</strong>
                  <div class="admin-cell-muted">@${esc(u.username || '—')}</div></td>
              <td class="admin-cell-muted" dir="ltr">${esc(u.email || '—')}</td>
              <td>
                <select class="admin-select" onchange="AdminPanels.changeRole('${u.id}', this.value, this)">
                  ${Object.entries(ROLE_LABELS).map(([v, l]) =>
                    `<option value="${v}" ${u.role === v ? 'selected' : ''}>${l}</option>`).join('')}
                </select>
              </td>
              <td class="admin-cell-muted">${fmtDate(u.created_at)}</td>
              <td>${u.verified
                ? '<span class="pill pill-ok">✓ موثّق</span>'
                : '<span class="pill pill-off">غير موثّق</span>'}</td>
              <td><button class="admin-mini ${u.verified ? '' : 'gold'}"
                    onclick="AdminPanels.toggleUserVerify('${u.id}', ${u.verified ? 'true' : 'false'}, this)">
                    ${u.verified ? 'إلغاء التوثيق' : 'توثيق'}
                  </button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  async function toggleUserVerify(id, current, btn) {
    btn.disabled = true;
    try {
      await updateRow('profiles', id, { verified: !current });
      const u = state.users.find((x) => x.id === id);
      if (u) u.verified = !current;
      renderUsers();
      toast(!current ? 'تم توثيق المستخدم' : 'تم إلغاء التوثيق');
    } catch (err) {
      toast(explainError(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function changeRole(id, role, el) {
    const u = state.users.find((x) => x.id === id);
    const previous = u?.role;
    el.disabled = true;
    try {
      await updateRow('profiles', id, { role });
      if (u) u.role = role;
      toast(`تم تغيير الدور إلى «${ROLE_LABELS[role] || role}»`);
    } catch (err) {
      toast(explainError(err), 'error');
      if (u && previous) el.value = previous;
    } finally {
      el.disabled = false;
    }
  }

  /* ═══════════════ الورش ═══════════════ */

  async function loadWorkshops(force) {
    if (state.loaded.workshops && !force) return;
    const wrap = document.getElementById('workshopsTableWrap');
    try {
      const [ws, gov] = await Promise.all([
        client().from('workshops')
          .select('id, name, slug, workshop_type, governorate_id, verified_badge, status, created_at')
          .order('created_at', { ascending: false }).limit(500),
        client().from('governorates').select('id, name_ar'),
      ]);
      if (ws.error) throw ws.error;
      state.workshops = ws.data || [];
      state.governorates = new Map((gov.data || []).map((g) => [String(g.id), g.name_ar]));
      state.loaded.workshops = true;
      renderWorkshops();
    } catch (err) {
      wrap.innerHTML = emptyState(explainError(err));
    }
  }

  function renderWorkshops() {
    const wrap = document.getElementById('workshopsTableWrap');
    const q = (document.getElementById('workshopSearch')?.value || '').trim().toLowerCase();
    const rows = state.workshops.filter(
      (w) => !q || (w.name || '').toLowerCase().includes(q) || (w.workshop_type || '').toLowerCase().includes(q),
    );

    document.getElementById('workshopsCount').textContent = `${rows.length} من ${state.workshops.length}`;

    if (!rows.length) {
      wrap.innerHTML = emptyState('لا توجد ورش');
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>الورشة</th><th>التخصص</th><th>المحافظة</th><th>الحالة</th><th>التوثيق</th><th></th></tr></thead>
        <tbody>
          ${rows.map((w) => {
            const city = state.governorates.get(String(w.governorate_id)) || '—';
            const url = /^[a-zA-Z0-9_-]+$/.test(w.slug || '')
              ? `/workshop/${w.slug}/`
              : `/workshop.html?id=${w.id}`;
            return `<tr>
              <td><strong>${esc(w.name)}</strong></td>
              <td class="admin-cell-muted">${esc(w.workshop_type || '—')}</td>
              <td class="admin-cell-muted">${esc(city)}</td>
              <td>${w.status === 'active'
                ? '<span class="pill pill-ok">نشطة</span>'
                : `<span class="pill pill-off">${esc(w.status || '—')}</span>`}</td>
              <td>${w.verified_badge
                ? '<span class="pill pill-gold">✓ موثّقة</span>'
                : '<span class="pill pill-off">غير موثّقة</span>'}</td>
              <td style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="admin-mini ${w.verified_badge ? '' : 'gold'}"
                  onclick="AdminPanels.toggleWorkshopVerify('${w.id}', ${w.verified_badge ? 'true' : 'false'}, this)">
                  ${w.verified_badge ? 'إلغاء' : 'توثيق'}
                </button>
                <a class="admin-mini" href="${url}" target="_blank" rel="noopener">عرض الملف ↗</a>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  async function toggleWorkshopVerify(id, current, btn) {
    btn.disabled = true;
    try {
      await updateRow('workshops', id, { verified_badge: !current });
      const w = state.workshops.find((x) => x.id === id);
      if (w) w.verified_badge = !current;
      renderWorkshops();
      toast(!current ? 'تم توثيق الورشة' : 'تم إلغاء توثيق الورشة');
    } catch (err) {
      toast(explainError(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* ═══════════════ المنتجات ═══════════════ */

  async function loadProducts(force) {
    if (state.loaded.products && !force) return;
    const wrap = document.getElementById('productsTableWrap');
    try {
      const { data, error } = await client()
        .from('products')
        .select('id, title, price, currency, status, is_featured, is_hero, workshop_id, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      state.products = data || [];

      if (!state.loaded.workshops) {
        const { data: ws } = await client().from('workshops').select('id, name').limit(500);
        state.workshopNames = new Map((ws || []).map((w) => [w.id, w.name]));
      }

      state.loaded.products = true;
      renderProducts();
      renderHero();
    } catch (err) {
      wrap.innerHTML = emptyState(explainError(err));
    }
  }

  function renderProducts() {
    const wrap = document.getElementById('productsTableWrap');
    const q = (document.getElementById('productSearch')?.value || '').trim().toLowerCase();
    const rows = state.products.filter((p) => !q || (p.title || '').toLowerCase().includes(q));

    document.getElementById('productsCount').textContent = `${rows.length} من ${state.products.length}`;

    if (!rows.length) {
      wrap.innerHTML = emptyState('لا توجد منتجات');
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>المنتج</th><th>الورشة</th><th>السعر</th><th>الحالة</th><th>مميز</th><th></th></tr></thead>
        <tbody>
          ${rows.map((p) => `
            <tr>
              <td><strong>${esc(p.title)}</strong><div class="admin-cell-muted">${fmtDate(p.created_at)}</div></td>
              <td class="admin-cell-muted">${esc(state.workshopNames.get(p.workshop_id) || '—')}</td>
              <td>${esc(p.price)} <span class="admin-cell-muted">${esc(p.currency || 'EGP')}</span></td>
              <td>${p.status === 'published'
                ? '<span class="pill pill-ok">منشور</span>'
                : `<span class="pill pill-off">${esc(p.status || '—')}</span>`}</td>
              <td>${p.is_featured
                ? '<span class="pill pill-gold">مميز</span>'
                : '<span class="pill pill-off">عادي</span>'}</td>
              <td style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="admin-mini ${p.is_featured ? '' : 'gold'}"
                  onclick="AdminPanels.toggleFeatured('${p.id}', ${p.is_featured ? 'true' : 'false'}, this)">
                  ${p.is_featured ? 'إلغاء التمييز' : 'تمييز'}
                </button>
                <a class="admin-mini" href="/product.html?id=${p.id}" target="_blank" rel="noopener">عرض ↗</a>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  async function toggleFeatured(id, current, btn) {
    btn.disabled = true;
    try {
      await updateRow('products', id, { is_featured: !current });
      const p = state.products.find((x) => x.id === id);
      if (p) p.is_featured = !current;
      renderProducts();
      toast(!current ? 'أصبح المنتج مميزاً' : 'أُلغي تمييز المنتج');
    } catch (err) {
      toast(explainError(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* ═══════════════ الهيرو ═══════════════ */

  function renderHero() {
    const wrap = document.getElementById('heroTableWrap');
    if (!wrap) return;

    const published = state.products.filter((p) => p.status === 'published');
    const selected = published.filter((p) => p.is_hero);
    document.getElementById('heroCount').textContent = `${selected.length} / ${MAX_HERO} مختارة`;

    if (!published.length) {
      wrap.innerHTML = emptyState('لا توجد منتجات منشورة');
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>المنتج</th><th>الورشة</th><th>السعر</th><th>في الهيرو</th><th></th></tr></thead>
        <tbody>
          ${published.map((p) => `
            <tr>
              <td><strong>${esc(p.title)}</strong></td>
              <td class="admin-cell-muted">${esc(state.workshopNames.get(p.workshop_id) || '—')}</td>
              <td>${esc(p.price)} <span class="admin-cell-muted">${esc(p.currency || 'EGP')}</span></td>
              <td>${p.is_hero ? '<span class="pill pill-gold">ظاهر</span>' : '<span class="pill pill-off">—</span>'}</td>
              <td><button class="admin-mini ${p.is_hero ? '' : 'gold'}"
                    onclick="AdminPanels.toggleHero('${p.id}', ${p.is_hero ? 'true' : 'false'}, this)">
                    ${p.is_hero ? 'إزالة من الهيرو' : 'إضافة للهيرو'}
                  </button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  async function toggleHero(id, current, btn) {
    const selected = state.products.filter((p) => p.status === 'published' && p.is_hero);
    if (!current && selected.length >= MAX_HERO) {
      toast(`الحد الأقصى ${MAX_HERO} منتجات — أزل واحداً أولاً`, 'error');
      return;
    }
    btn.disabled = true;
    try {
      await updateRow('products', id, { is_hero: !current });
      const p = state.products.find((x) => x.id === id);
      if (p) p.is_hero = !current;
      renderHero();
      renderProducts();
      toast(!current ? 'أُضيف إلى الهيرو' : 'أُزيل من الهيرو');
    } catch (err) {
      toast(explainError(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* ═══════════════ منتج جديد ═══════════════ */

  async function openProductModal() {
    // إن لم تُفتح صفحة الورش بعد، نجلبها هنا حتى لا يظهر «لا توجد ورش» خطأً
    if (!state.workshops.length) {
      const { data } = await client().from('workshops').select('id, name').order('created_at', { ascending: false }).limit(500);
      state.workshops = data || [];
    }

    const select = document.getElementById('npWorkshop');
    select.innerHTML = state.workshops.length
      ? state.workshops.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')
      : '<option value="">— لا توجد ورش —</option>';

    // التصنيفات: تُجلب مرة واحدة
    if (!state.categories.length) {
      const { data } = await client()
        .from('categories')
        .select('id, name_ar, type')
        .in('type', ['product', 'all'])
        .order('sort_order', { ascending: true })
        .limit(200);
      state.categories = data || [];
    }
    const catSelect = document.getElementById('npCategory');
    catSelect.innerHTML = '<option value="">— بلا تصنيف —</option>' +
      state.categories.map((c) => `<option value="${c.id}">${esc(c.name_ar)}</option>`).join('');

    document.getElementById('npTitle').value = '';
    document.getElementById('npDesc').value = '';
    document.getElementById('npPrice').value = '';
    document.getElementById('npImage').value = '';
    document.getElementById('productModal').classList.add('open');
  }

  function closeProductModal() {
    document.getElementById('productModal').classList.remove('open');
  }

  async function saveProduct() {
    const btn = document.getElementById('npSave');
    const title = document.getElementById('npTitle').value.trim();
    const description = document.getElementById('npDesc').value.trim();
    const price = Number(document.getElementById('npPrice').value);
    const workshopId = document.getElementById('npWorkshop').value;
    const image = document.getElementById('npImage').value.trim();
    const categoryId = document.getElementById('npCategory').value;

    if (title.length < 3) return toast('اسم المنتج قصير جداً', 'error');
    if (!Number.isFinite(price) || price < 0) return toast('السعر غير صالح', 'error');
    if (!workshopId) return toast('اختر الورشة', 'error');

    btn.disabled = true;
    try {
      const payload = {
        title,
        description: description || null,
        price,
        currency: 'EGP',
        status: 'published',
        workshop_id: workshopId,
        seller_type: 'workshop',
        images: image ? [image] : [],
        ...(categoryId ? { category_id: Number(categoryId) } : {}),
      };
      const { error } = await client().from('products').insert(payload);
      if (error) throw error;

      closeProductModal();
      toast('تم إنشاء المنتج ونشره');
      await loadProducts(true);
      await loadWorkshops(true);
    } catch (err) {
      toast(explainError(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* ═══════════════ التهيئة ═══════════════ */

  const loaders = {
    users: loadUsers,
    workshops: loadWorkshops,
    products: loadProducts,
    hero: async () => {
      if (!state.loaded.products) await loadProducts();
      else renderHero();
    },
  };

  window.AdminPanels = {
    onTab(tab) {
      if (!state.ready) return;
      window.dispatchEvent(new CustomEvent('admin:tab', { detail: { tab } }));
      loaders[tab]?.();
    },
    toggleUserVerify,
    changeRole,
    toggleWorkshopVerify,
    toggleFeatured,
    toggleHero,
    openProductModal,
    closeProductModal,
    saveProduct,
  };

  window.addEventListener('admin:ready', () => {
    state.ready = true;
    const search = (id, fn) => document.getElementById(id)?.addEventListener('input', fn);
    search('userSearch', renderUsers);
    search('workshopSearch', renderWorkshops);
    search('productSearch', renderProducts);
    document.getElementById('productModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'productModal') closeProductModal();
    });
  });
})();
