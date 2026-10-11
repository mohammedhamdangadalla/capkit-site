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
  loadProfileForm();
   await loadStats();
  await loadMyProducts();
  await loadMyServices();
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
    opt.style.color = '#f5f0e8';
    opt.style.background = '#181818';
    select.appendChild(opt);
  });

  // Force refresh
  select.style.color = 'var(--text-primary)';
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
// ═══ Load Profile Data into Form ═══
function loadProfileForm() {
  if (!currentProfile) return;

  const el = (id) => document.getElementById(id);

  if (el('pfFullName')) el('pfFullName').value = currentProfile.full_name || '';
  if (el('pfWhatsapp')) el('pfWhatsapp').value = currentProfile.whatsapp || currentProfile.phone || '';
  if (el('pfCity')) el('pfCity').value = currentProfile.city || '';
  if (el('pfBio')) {
    el('pfBio').value = currentProfile.bio || '';
    updateBioCounter();
  }
}

function updateBioCounter() {
  const bio = document.getElementById('pfBio');
  const counter = document.getElementById('bioCount');
  if (bio && counter) {
    counter.textContent = bio.value.length;
  }
}

// ═══ Save Profile ═══
window.saveProfile = async function() {
  const btn = document.getElementById('saveProfileBtn');
  const msg = document.getElementById('profileMsg');
  
  const fullName = document.getElementById('pfFullName')?.value.trim();
  const whatsapp = document.getElementById('pfWhatsapp')?.value.trim();
  const city = document.getElementById('pfCity')?.value.trim();
  const bio = document.getElementById('pfBio')?.value.trim();

  // Validation
  if (!fullName || fullName.length < 3) {
    msg.textContent = 'الاسم قصير جداً';
    msg.className = 'modal-message error';
    return;
  }

  if (!whatsapp || whatsapp.replace(/\D/g, '').length < 10) {
    msg.textContent = 'رقم الواتساب غير صحيح';
    msg.className = 'modal-message error';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ جارٍ الحفظ...';
  msg.className = 'modal-message';

  try {
    const { error } = await window.supabaseClient
      .from('profiles')
      .update({
        full_name: fullName,
        whatsapp: whatsapp,
        phone: whatsapp,
        city: city || null,
        bio: bio || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentUser.id);

    if (error) throw error;

    // تحديث البيانات المحلية
    currentProfile.full_name = fullName;
    currentProfile.whatsapp = whatsapp;
    currentProfile.phone = whatsapp;
    currentProfile.city = city;
    currentProfile.bio = bio;

    renderUserInfo();

    msg.textContent = '✅ تم حفظ التغييرات بنجاح!';
    msg.className = 'modal-message success';

    setTimeout(() => {
      msg.className = 'modal-message';
    }, 3000);

  } catch (err) {
    console.error('Save profile error:', err);
    msg.textContent = '❌ ' + (err.message || 'فشل الحفظ');
    msg.className = 'modal-message error';
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 حفظ التغييرات';
  }
};

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

    // 2. تحديد نوع البائع
const sellerTypeInput = document.querySelector('input[name="sellerType"]:checked');
const sellerType = sellerTypeInput ? sellerTypeInput.value : 'individual';

let productData = {
  category_id: parseInt(categoryId),
  title: name,
  description: description,
  price: price,
  currency: currency,
  stock: stock,
  images: imageUrls,
  status: 'published',
  published_at: new Date().toISOString(),
  seller_type: sellerType
};

if (sellerType === 'workshop') {
  // أنشئ / استخدم ورشة
  const workshop = await ensureWorkshop();
  productData.workshop_id = workshop.id;
  productData.seller_id = currentUser.id;
} else {
  // بائع حر — بس seller_id
  productData.seller_id = currentUser.id;
}

// 3. حفظ المنتج في DB
const { error: dbError } = await window.supabaseClient
  .from('products')
  .insert(productData);
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
// ═══ Load My Services ═══
async function loadMyServices() {
  const container = document.getElementById('myServicesList');
  if (!container) return;

  const { data, error } = await window.supabaseClient
    .from('services')
    .select('*')
    .eq('freelancer_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Services error:', error);
    return;
  }

  if (!data || data.length === 0) return;

  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'my-products-grid';

  data.forEach(service => {
    const card = document.createElement('div');
    card.className = 'my-product-card';

    const priceText = service.price_start
      ? `${service.price_start}${service.price_end ? ' - ' + service.price_end : '+'} ${service.currency}`
      : 'اتصل للسعر';

    card.innerHTML = `
      <div class="my-product-img" style="background: linear-gradient(135deg, rgba(59,130,246,0.15), transparent);">
        <span>🔧</span>
      </div>
      <div class="my-product-info">
        <h4>${escapeHtml(service.title)}</h4>
        <div class="my-product-price">${priceText}</div>
        <div class="my-product-status status-${service.status}">
          ${service.status === 'published' ? '✅ منشور' : '📝 مسودة'}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// ═══ Open / Close Service Modal ═══
window.openServiceModal = async function() {
  const modal = document.getElementById('serviceModal');
  modal.classList.add('active');
  hideServiceModalMessage();
  await ensureCategoriesLoaded();
};

window.closeServiceModal = function() {
  document.getElementById('serviceModal').classList.remove('active');
  document.getElementById('sName').value = '';
  document.getElementById('sDescription').value = '';
  document.getElementById('sPriceStart').value = '';
  document.getElementById('sPriceEnd').value = '';
  document.getElementById('sCategory').value = '';
  document.querySelector('input[name="sNegotiable"][value="true"]').checked = true;
  hideServiceModalMessage();
};

function showServiceModalMessage(text, type = 'error') {
  const msg = document.getElementById('serviceModalMsg');
  msg.textContent = text;
  msg.className = 'modal-message ' + type;
}

function hideServiceModalMessage() {
  const msg = document.getElementById('serviceModalMsg');
  msg.className = 'modal-message';
  msg.textContent = '';
}

// ═══ Save Service ═══
window.saveService = async function() {
  const btn = document.getElementById('saveServiceBtn');
  
  const name = document.getElementById('sName').value.trim();
  const description = document.getElementById('sDescription').value.trim();
  const priceStart = parseFloat(document.getElementById('sPriceStart').value) || 0;
  const priceEnd = parseFloat(document.getElementById('sPriceEnd').value) || null;
  const currency = document.getElementById('sCurrency').value;
  const type = document.getElementById('sType').value;
  const categoryId = document.getElementById('sCategory').value;
  const negotiableInput = document.querySelector('input[name="sNegotiable"]:checked');
  const negotiable = negotiableInput ? negotiableInput.value === 'true' : true;

  // Validation
  if (!name || name.length < 3) return showServiceModalMessage('اسم الخدمة قصير جداً');
  if (!description || description.length < 20) return showServiceModalMessage('الوصف قصير جداً (20 حرف على الأقل)');
  if (!categoryId) return showServiceModalMessage('اختر التصنيف');

  btn.disabled = true;
  btn.textContent = '⏳ جارٍ الحفظ...';
  hideServiceModalMessage();

  try {
    const { error } = await window.supabaseClient
      .from('services')
      .insert({
        freelancer_id: currentUser.id,
        category_id: parseInt(categoryId),
        title: name,
        description: description,
        price_start: priceStart,
        price_end: priceEnd,
        currency: currency,
        negotiable: negotiable,
        service_type: type,
        status: 'published'
      });

    if (error) throw error;

    showServiceModalMessage('✅ تم حفظ الخدمة بنجاح!', 'success');

    setTimeout(() => {
      closeServiceModal();
      loadMyServices();
    }, 1500);

  } catch (err) {
    console.error('Save service error:', err);
    showServiceModalMessage('❌ ' + (err.message || 'فشل الحفظ'));
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 حفظ الخدمة';
  }
};

// ═══ Logout ═══
document.addEventListener('click', async (e) => {
  if (e.target.closest('#logoutFromDash')) {
    await window.supabaseClient.auth.signOut();
    window.location.href = '/';
  }
});
// ═══ Bio Counter Listener ═══
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'pfBio') {
    updateBioCounter();
  }
});

// ═══ Start ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
