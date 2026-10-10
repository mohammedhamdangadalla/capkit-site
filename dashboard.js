// ═══ Dashboard — Logic (v2) ═══

const ROLE_META = {
  vendor: { name: 'بائع / ورشة', icon: '🛒' },
  service: { name: 'مقدّم خدمة', icon: '🔧' },
  freelancer: { name: 'صنايعي / مقاول / عامل', icon: '🔨' },
  buyer: { name: 'مشتري', icon: '👤' },
  admin: { name: 'مدير', icon: '⭐' }
};

let currentUser = null;
let currentProfile = null;
let categoriesLoaded = false;

// ═══ Init Dashboard ═══
async function initDashboard() {
  if (!window.supabaseClient) {
    window.location.href = 'auth.html';
    return;
  }

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session?.user) {
    window.location.href = 'auth.html';
    return;
  }

  currentUser = session.user;

  const { data: profile } = await window.supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  currentProfile = profile || {
    full_name: session.user.email?.split('@')[0] || 'مستخدم',
    role: 'buyer',
    email: session.user.email
  };

  renderUserInfo();
  await loadStats();
  await loadMyProducts();
  await handleUrlTab();

  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('dashboardPage').style.display = 'block';

  // ✅ حمّل التصنيفات في الخلفية (بدون انتظار)
  ensureCategoriesLoaded();
}

// ═══ Render User Info ═══
function renderUserInfo() {
  const meta = ROLE_META[currentProfile.role] || ROLE_META.buyer;
  document.getElementById('dashAvatar').textContent = meta.icon;
  document.getElementById('dashUserName').textContent = currentProfile.full_name || 'مستخدم';
  document.getElementById('dashUserEmail').textContent = currentUser.email || '';
  document.getElementById('dashUserRole').textContent = meta.name;
}

// ═══ Load Categories (once) ═══
async function ensureCategoriesLoaded() {
  if (categoriesLoaded) return true;

  const select = document.getElementById('pCategory');
  if (!select) return false;

  try {
    // 1. جرب Supabase
    const { data, error } = await window.supabaseClient
      .from('categories')
      .select('id, name_ar, parent_id, sort_order')
      .order('sort_order');

    if (error) throw error;

    if (data && data.length > 0) {
      const mainCats = data.filter(c => !c.parent_id);
      fillCategorySelect(select, mainCats.map(c => ({ id: c.id, name: c.name_ar })));
      categoriesLoaded = true;
      console.log('✅ Categories loaded from Supabase:', mainCats.length);
      return true;
    }

    throw new Error('Empty categories from Supabase');

  } catch (err) {
    console.warn('⚠️ Supabase categories failed, trying JSON:', err.message);

    // 2. Fallback — JSON محلي
    try {
      const res = await fetch('categories.json');
      const json = await res.json();
      const mainCats = json.categories || [];

      fillCategorySelect(select, mainCats.map(c => ({ id: c.id, name: c.name })));
      categoriesLoaded = true;
      console.log('📁 Categories from JSON fallback:', mainCats.length);
      return true;

    } catch (jsonErr) {
      console.error('❌ Both Supabase and JSON failed:', jsonErr);
      return false;
    }
  }
}

function fillCategorySelect(select, categories) {
  // احذف كل الخيارات ما عدا الـ placeholder
  while (select.options.length > 1) {
    select.remove(1);
  }

  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    select.appendChild(opt);
  });
}

// ═══ Load Stats ═══
async function loadStats() {
  try {
    const { count: productsCount } = await window.supabaseClient
      .from('products')
      .select('*', { count: 'exact', head: true });

    document.getElementById('statProducts').textContent = productsCount || 0;
    document.getElementById('statServices').textContent = '0';
    document.getElementById('statViews').textContent = '0';
    document.getElementById('statRating').textContent = '—';
  } catch (err) {
    console.warn('Stats error:', err);
  }
}

// ═══ Load My Products ═══
async function loadMyProducts() {
  const container = document.getElementById('myProductsList');
  if (!container) return;

  const { data, error } = await window.supabaseClient
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Products error:', error);
    return;
  }

  if (!data || data.length === 0) {
    return; // Empty state already showing
  }

  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'my-products-grid';

  data.forEach(product => {
    const card = document.createElement('div');
    card.className = 'my-product-card';

    const imageUrl = product.images && product.images.length > 0
      ? product.images[0]
      : '';

    card.innerHTML = `
      <div class="my-product-img" ${imageUrl ? `style="background-image: url('${imageUrl}')"` : ''}>
        ${!imageUrl ? '<span>📦</span>' : ''}
      </div>
      <div class="my-product-info">
        <h4>${product.title || 'بدون اسم'}</h4>
        <div class="my-product-price">${product.price || 0} ${product.currency || 'EGP'}</div>
        <div class="my-product-status status-${product.status}">
          ${getStatusLabel(product.status)}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  container.appendChild(grid);
}

function getStatusLabel(status) {
  const labels = {
    draft: '📝 مسودة',
    published: '✅ منشور',
    sold: '💰 مبيع',
    archived: '📦 مؤرشف'
  };
  return labels[status] || '📝 مسودة';
}

// ═══ Tabs ═══
document.querySelectorAll('.dash-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.getElementById('tab-' + tabName)?.classList.add('active');

    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    window.history.replaceState({}, '', url);
  });
});

function handleUrlTab() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  if (tab) {
    const tabBtn = document.querySelector(`.dash-tab[data-tab="${tab}"]`);
    if (tabBtn) tabBtn.click();
  }
}

// ═══ Modal: Open / Close ═══
window.openProductModal = async function() {
  const modal = document.getElementById('productModal');
  modal.classList.add('active');
  hideModalMessage();

  // ✅ حمّل التصنيفات لو لسه ما اتحملتش
  const loaded = await ensureCategoriesLoaded();
  if (!loaded) {
    showModalMessage('⚠️ تعذّر تحميل التصنيفات. جرب تحدّث الصفحة.');
  }
};

window.closeProductModal = function() {
  document.getElementById('productModal').classList.remove('active');
  document.getElementById('pName').value = '';
  document.getElementById('pDescription').value = '';
  document.getElementById('pPrice').value = '';
  document.getElementById('pCategory').value = '';
  document.getElementById('pImages').value = '';
  document.getElementById('pStock').value = '1';
  hideModalMessage();
};

function showModalMessage(text, type = 'error') {
  const msg = document.getElementById('modalMsg');
  if (!msg) return;
  msg.textContent = text;
  msg.className = 'modal-message ' + type;
}

function hideModalMessage() {
  const msg = document.getElementById('modalMsg');
  if (!msg) return;
  msg.className = 'modal-message';
  msg.textContent = '';
}

// ═══ Save Product ═══
window.saveProduct = async function() {
  const btn = document.getElementById('saveProductBtn');

  const name = document.getElementById('pName').value.trim();
  const description = document.getElementById('pDescription').value.trim();
  const price = parseFloat(document.getElementById('pPrice').value) || 0;
  const currency = document.getElementById('pCurrency').value;
  const categoryId = document.getElementById('pCategory').value;
  const stock = parseInt(document.getElementById('pStock').value) || 1;
  const imageInput = document.getElementById('pImages');

  // Validation
  if (!name || name.length < 3) return showModalMessage('اسم المنتج قصير جداً');
  if (!description || description.length < 20) return showModalMessage('الوصف قصير جداً (20 حرف على الأقل)');
  if (!categoryId) return showModalMessage('اختر التصنيف');

  btn.disabled = true;
  btn.textContent = '⏳ جارٍ الحفظ...';
  hideModalMessage();

  try {
    // 1. رفع الصور
    const imageUrls = [];

    if (imageInput.files && imageInput.files.length > 0) {
      const files = Array.from(imageInput.files).slice(0, 4);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop().toLowerCase();
        const fileName = `${currentUser.id}/${Date.now()}-${i}.${ext}`;

        const { error: uploadError } = await window.supabaseClient.storage
          .from('product-images')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error('فشل رفع الصورة: ' + uploadError.message);
        }

        const { data: { publicUrl } } = window.supabaseClient.storage
          .from('product-images')
          .getPublicUrl(fileName);

        imageUrls.push(publicUrl);
      }
    }

    // 2. حفظ المنتج في DB
    const { error: dbError } = await window.supabaseClient
      .from('products')
      .insert({
        workshop_id: currentUser.id,
        category_id: parseInt(categoryId),
        title: name,
        description: description,
        price: price,
        currency: currency,
        stock: stock,
        images: imageUrls,
        status: 'published',
        published_at: new Date().toISOString()
      });

    if (dbError) {
      console.error('DB error:', dbError);
      throw new Error('فشل حفظ المنتج: ' + dbError.message);
    }

    showModalMessage('✅ تم حفظ المنتج بنجاح!', 'success');

    setTimeout(() => {
      closeProductModal();
      loadMyProducts();
      loadStats();
    }, 1500);

  } catch (err) {
    console.error(err);
    showModalMessage('❌ ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 حفظ المنتج';
  }
};

// ═══ Logout ═══
document.addEventListener('click', async (e) => {
  if (e.target.closest('#logoutFromDash')) {
    await window.supabaseClient.auth.signOut();
    window.location.href = '/';
  }
});

// ═══ Start ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
