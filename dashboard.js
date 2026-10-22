// ═══ Dashboard — Logic (v3 - Fixed) ═══

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
  await loadSellerAlerts();
  await handleUrlTab();

  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('dashboardPage').style.display = 'block';

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

// ═══ Ensure Categories Loaded ═══
async function ensureCategoriesLoaded() {
  if (categoriesLoaded) return true;

  const select = document.getElementById('pCategory');
  if (!select) return false;

  try {
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
    console.warn('⚠️ Supabase categories failed:', err.message);

    try {
      const res = await fetch('categories.json');
      const json = await res.json();
      const mainCats = json.categories || [];

      fillCategorySelect(select, mainCats.map(c => ({ id: c.id, name: c.name })));
      categoriesLoaded = true;
      console.log('📁 Categories from JSON:', mainCats.length);
      return true;

    } catch (jsonErr) {
      console.error('❌ Both failed:', jsonErr);
      return false;
    }
  }
}

function fillCategorySelect(select, categories) {
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

  select.style.color = 'var(--text-primary)';
}

// ═══ Load Stats ═══
async function loadStats() {
  try {
    const { count: productsCount } = await window.supabaseClient
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', currentUser.id);

    document.getElementById('statProducts').textContent = productsCount || 0;

    let servicesCount = 0;
    const { data: freelancer } = await window.supabaseClient
      .from('freelancers')
      .select('id')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (freelancer?.id) {
      const { count } = await window.supabaseClient
        .from('services')
        .select('*', { count: 'exact', head: true })
        .eq('freelancer_id', freelancer.id);

      servicesCount = count || 0;
    }

    document.getElementById('statServices').textContent = servicesCount;

    const { count: viewsCount } = await window.supabaseClient
      .from('profile_views')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', currentUser.id);

    document.getElementById('statViews').textContent = viewsCount || 0;

    const { data: ratings } = await window.supabaseClient
      .from('ratings')
      .select('rating')
      .eq('workshop_id', currentUser.id);

    if (ratings && ratings.length > 0) {
      const avg = (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1);
      document.getElementById('statRating').textContent = avg;
    } else {
      document.getElementById('statRating').textContent = '—';
    }

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
    .eq('seller_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) return;

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
        <h4>${escapeHtml(product.title || 'بدون اسم')}</h4>
        <div class="my-product-price">${product.price || 0} ${product.currency || 'EGP'}</div>
        <div class="my-product-status status-${product.status}">
          ${getStatusLabel(product.status)}
        </div>
        <div class="my-product-actions">
          <button class="btn-card-edit" onclick="editProduct('${product.id}')">✏️ تعديل</button>
          <button class="btn-card-delete" onclick="deleteProduct('${product.id}')">🗑️ حذف</button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  container.appendChild(grid);
}
// ═══ Load Profile Form ═══
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

// ═══════════════════════════════════════════════
// PRODUCT MODAL
// ═══════════════════════════════════════════════

window.openProductModal = async function() {
  const modal = document.getElementById('productModal');
  modal.classList.add('active');
  hideModalMessage();

  const loaded = await ensureCategoriesLoaded();
  if (!loaded) {
    showModalMessage('⚠️ تعذّر تحميل التصنيفات. جرب تحدّث الصفحة.');
  }
};

window.closeProductModal = function() {
  const modal = document.getElementById('productModal');
  if (modal) modal.classList.remove('active');

  const el = (id) => document.getElementById(id);
  if (el('pName')) el('pName').value = '';
  if (el('pDescription')) el('pDescription').value = '';
  if (el('pPrice')) el('pPrice').value = '';
  if (el('pCategory')) el('pCategory').value = '';
  if (el('pImages')) el('pImages').value = '';
  if (el('pStock')) el('pStock').value = '1';

  // إعادة تعيين نوع البائع
  const sellerInput = document.querySelector('input[name="sellerType"][value="individual"]');
  if (sellerInput) sellerInput.checked = true;

  // إعادة تعيين الزر
  const btn = document.getElementById('saveProductBtn');
  if (btn) {
    btn.textContent = '💾 حفظ المنتج';
    btn.removeAttribute('data-edit-id');
  }

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

// ═══ Save / Update Product ═══
window.saveProduct = async function() {
  const btn = document.getElementById('saveProductBtn');
  const editId = btn.getAttribute('data-edit-id');
  console.log('💾 saveProduct. editId:', editId);

  const name = document.getElementById('pName').value.trim();
  const description = document.getElementById('pDescription').value.trim();
  const price = parseFloat(document.getElementById('pPrice').value) || 0;
  const currency = document.getElementById('pCurrency').value;
  const categoryId = document.getElementById('pCategory').value;
  const stock = parseInt(document.getElementById('pStock').value) || 1;
  const imageInput = document.getElementById('pImages');

  if (!name || name.length < 3) return showModalMessage('اسم المنتج قصير جداً');
  if (!description || description.length < 20) return showModalMessage('الوصف قصير جداً');
  if (!categoryId) return showModalMessage('اختر التصنيف');

  btn.disabled = true;
  btn.textContent = '⏳ جارٍ الحفظ...';
  hideModalMessage();

  try {
        // ═══ رفع صور جديدة ═══
    let imageUrls = [];

    // في التعديل: نجيب الصور القديمة
    if (editId) {
      const { data: oldProduct } = await window.supabaseClient
        .from('products')
        .select('images')
        .eq('id', editId)
        .single();
      
      imageUrls = oldProduct?.images || [];
    }

    // ═══ رفع الصور الجديدة ═══
    if (imageInput.files && imageInput.files.length > 0) {
      const maxImages = navigator.userAgent.includes('Brave') ? 2 : 4;
const files = Array.from(imageInput.files).slice(0, maxImages);
console.log('📤 Uploading', files.length, 'images (max:', maxImages, ')...');
      console.log('📤 Uploading', files.length, 'images...');

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // ═══ تحقق من الحجم (2 MB) ═══
        if (file.size > 2 * 1024 * 1024) {
          console.warn('⚠️ Image too large, skipping:', file.name);
          continue;
        }

        const ext = file.name.split('.').pop().toLowerCase();
        const fileName = `${currentUser.id}/${Date.now()}-${i}.${ext}`;

        const { error: uploadError } = await window.supabaseClient.storage
          .from('product-images')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });

        // ═══ لو فشلت صورة، نكمل بدونها ═══
        if (uploadError) {
          console.warn('⚠️ Upload failed, skipping:', uploadError.message);
          continue;
        }

        const { data: { publicUrl } } = window.supabaseClient.storage
          .from('product-images')
          .getPublicUrl(fileName);

        imageUrls.push(publicUrl);
      }
      
      console.log('✅ Images uploaded:', imageUrls.length);
    }

    const sellerTypeInput = document.querySelector('input[name="sellerType"]:checked');
    const sellerType = sellerTypeInput ? sellerTypeInput.value : 'individual';

    const productData = {
      category_id: parseInt(categoryId),
      title: name,
      description: description,
      price: price,
      currency: currency,
      stock: stock,
      images: imageUrls,
      seller_type: sellerType,
       seller_id: currentUser.id, 
      moderation_status: 'pending_review'
    };

    if (sellerType === 'workshop') {
      const workshop = await ensureWorkshop();
      productData.workshop_id = workshop.id;
    }

    // ═══ INSERT أو UPDATE ═══
    let result;
    if (editId) {
      console.log('🔄 UPDATE:', editId);
      result = await window.supabaseClient
        .from('products')
        .update(productData)
        .eq('id', editId)
        .select();
    } else {
      console.log('➕ INSERT');
      productData.status = 'published';
      productData.published_at = new Date().toISOString();
      
      result = await window.supabaseClient
        .from('products')
        .insert(productData)
        .select();
    }

    if (result.error) throw new Error(result.error.message);
    if (!result.data || result.data.length === 0) throw new Error('لم يتم الحفظ');

    showModalMessage(
      editId ? '✅ تم تحديث المنتج!' : '✅ تم حفظ المنتج!',
      'success'
    );

    setTimeout(async () => {
      closeProductModal();
      await loadMyProducts();
      await loadStats();
    }, 1000);

  } catch (err) {
    console.error('❌', err);
    showModalMessage('❌ ' + (err.message || 'فشل الحفظ'));
  } finally {
    btn.disabled = false;
    btn.textContent = editId ? '💾 تحديث المنتج' : '💾 حفظ المنتج';
  }
};
// ═══════════════════════════════════════════════
// SERVICE MODAL — Open/Close/Messages
// ═══════════════════════════════════════════════

window.openServiceModal = async function() {
  const modal = document.getElementById('serviceModal');
  modal.classList.add('active');
  hideServiceModalMessage();
  await ensureCategoriesLoaded();
};

window.closeServiceModal = function() {
  const modal = document.getElementById('serviceModal');
  if (modal) modal.classList.remove('active');

  // إعادة تعيين الحقول
  const el = (id) => document.getElementById(id);
  if (el('sName')) el('sName').value = '';
  if (el('sDescription')) el('sDescription').value = '';
  if (el('sPriceStart')) el('sPriceStart').value = '';
  if (el('sPriceEnd')) el('sPriceEnd').value = '';
  if (el('sCategory')) el('sCategory').value = '';

  const negInput = document.querySelector('input[name="sNegotiable"][value="true"]');
  if (negInput) negInput.checked = true;

  const btn = document.getElementById('saveServiceBtn');
  if (btn) {
    btn.textContent = '💾 حفظ الخدمة';
    btn.removeAttribute('data-edit-id');
  }

  hideServiceModalMessage();
};

function showServiceModalMessage(text, type = 'error') {
  const msg = document.getElementById('serviceModalMsg');
  if (!msg) return;
  msg.textContent = text;
  msg.className = 'modal-message ' + type;
}

function hideServiceModalMessage() {
  const msg = document.getElementById('serviceModalMsg');
  if (!msg) return;
  msg.className = 'modal-message';
  msg.textContent = '';
}

// ═══════════════════════════════════════════════
// SERVICES — Load / Delete / Edit / Save
// ═══════════════════════════════════════════════

async function loadMyServices() {
  const container = document.getElementById('myServicesList');
  if (!container) return;

  const { data: freelancer } = await window.supabaseClient
    .from('freelancers')
    .select('id')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (!freelancer?.id) {
    console.log('ℹ️ No freelancer profile');
    return;
  }

  const { data, error } = await window.supabaseClient
    .from('services')
    .select('*')
    .eq('freelancer_id', freelancer.id)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) return;

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
        <div class="my-product-actions">
          <button class="btn-card-edit" onclick="editService('${service.id}')">✏️ تعديل</button>
          <button class="btn-card-delete" onclick="deleteService('${service.id}')">🗑️ حذف</button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// ═══ Delete Service ═══
window.deleteService = async function(id) {
  console.log('🗑️ Delete:', id);

  if (!confirm('هل أنت متأكد من حذف هذه الخدمة؟\nلا يمكن التراجع.')) return;

  try {
    const { data, error } = await window.supabaseClient
      .from('services')
      .delete()
      .eq('id', id)
      .select();

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('لم يتم الحذف');

    console.log('✅ Deleted');
    await loadMyServices();
    await loadStats();

  } catch (err) {
    console.error('❌', err);
    alert('❌ فشل الحذف: ' + err.message);
  }
};

// ═══ Edit Service ═══
window.editService = async function(id) {
  console.log('✏️ Edit:', id);

  try {
    const { data, error } = await window.supabaseClient
      .from('services')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      alert('❌ فشل تحميل الخدمة');
      return;
    }

    // فتح الـ Modal
    document.getElementById('serviceModal').classList.add('active');
    hideServiceModalMessage();
    await ensureCategoriesLoaded();

    setTimeout(() => {
      const el = (id) => document.getElementById(id);

      el('sName').value = data.title || '';
      el('sDescription').value = data.description || '';
      el('sPriceStart').value = data.price_start || '';
      el('sPriceEnd').value = data.price_end || '';
      el('sCurrency').value = data.currency || 'EGP';
      el('sType').value = data.service_type || 'repair';

      const catSelect = el('sCategory');
      if (catSelect && data.category_id) {
        const trySet = (n = 0) => {
          const found = Array.from(catSelect.options).some(o => o.value == data.category_id);
          if (found) catSelect.value = data.category_id;
          else if (n < 10) setTimeout(() => trySet(n + 1), 200);
        };
        trySet();
      }

      const negVal = data.negotiable ? 'true' : 'false';
      const negInput = document.querySelector(`input[name="sNegotiable"][value="${negVal}"]`);
      if (negInput) negInput.checked = true;

      const btn = document.getElementById('saveServiceBtn');
      btn.textContent = '💾 تحديث الخدمة';
      btn.setAttribute('data-edit-id', id);

      console.log('✅ Edit mode:', id);
    }, 400);

  } catch (err) {
    console.error(err);
    alert('❌ ' + err.message);
  }
};

// ═══ Save / Update Service ═══
window.saveService = async function() {
  const btn = document.getElementById('saveServiceBtn');
  const editId = btn.getAttribute('data-edit-id');
  console.log('💾 saveService. editId:', editId);

  const name = document.getElementById('sName').value.trim();
  const description = document.getElementById('sDescription').value.trim();
  const priceStart = parseFloat(document.getElementById('sPriceStart').value) || 0;
  const priceEnd = parseFloat(document.getElementById('sPriceEnd').value) || null;
  const currency = document.getElementById('sCurrency').value;
  const type = document.getElementById('sType').value;
  const categoryId = document.getElementById('sCategory').value;
  const negotiableInput = document.querySelector('input[name="sNegotiable"]:checked');
  const negotiable = negotiableInput ? negotiableInput.value === 'true' : true;

  if (!name || name.length < 3) return showServiceModalMessage('اسم الخدمة قصير جداً');
  if (!description || description.length < 20) return showServiceModalMessage('الوصف قصير جداً');
  if (!categoryId) return showServiceModalMessage('اختر التصنيف');

  btn.disabled = true;
  btn.textContent = '⏳ جارٍ الحفظ...';
  hideServiceModalMessage();

  try {
    let freelancerId = null;
    const { data: existing } = await window.supabaseClient
      .from('freelancers')
      .select('id')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (existing?.id) {
      freelancerId = existing.id;
    } else {
      const { data: newFL, error: flErr } = await window.supabaseClient
        .from('freelancers')
        .insert({
          user_id: currentUser.id,
          type: 'craftsman',
          skill_level: 'skilled',
          status: 'active',
          experience_years: 0
        })
        .select()
        .single();

      if (flErr) throw new Error('فشل إنشاء ملف الصانع');
      freelancerId = newFL.id;
    }

    const serviceData = {
      freelancer_id: freelancerId,
      category_id: parseInt(categoryId),
      title: name,
      description: description,
      price_start: priceStart,
      price_end: priceEnd,
      currency: currency,
      negotiable: negotiable,
      service_type: type,
      status: 'published',
      moderation_status: 'pending_review',
    };

    let result;
    if (editId) {
      console.log('🔄 UPDATE:', editId);
      result = await window.supabaseClient
        .from('services')
        .update(serviceData)
        .eq('id', editId)
        .select();
    } else {
      console.log('➕ INSERT');
      result = await window.supabaseClient
        .from('services')
        .insert(serviceData)
        .select();
    }

    console.log('Result:', result);

    if (result.error) throw new Error(result.error.message);
    if (!result.data || result.data.length === 0) throw new Error('لم يتم الحفظ');

    showServiceModalMessage(
      editId ? '✅ تم التحديث!' : '✅ تم الحفظ!',
      'success'
    );

    setTimeout(async () => {
      closeServiceModal();
      await loadMyServices();
      await loadStats();
    }, 800);

  } catch (err) {
    console.error('❌', err);
    showServiceModalMessage('❌ ' + (err.message || 'فشل الحفظ'));
  } finally {
    btn.disabled = false;
    btn.textContent = editId ? '💾 تحديث الخدمة' : '💾 حفظ الخدمة';
  }
};
// ═══ Delete Product ═══
window.deleteProduct = async function(id) {
  console.log('🗑️ Delete product:', id);

  if (!confirm('هل أنت متأكد من حذف هذا المنتج؟\nلا يمكن التراجع.')) return;

  try {
    const { data, error } = await window.supabaseClient
      .from('products')
      .delete()
      .eq('id', id)
      .select();

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('لم يتم الحذف');

    console.log('✅ Product deleted');
    await loadMyProducts();
    await loadStats();

  } catch (err) {
    console.error('❌', err);
    alert('❌ فشل الحذف: ' + err.message);
  }
};
// ═══ Edit Product ═══
window.editProduct = async function(id) {
  console.log('✏️ Edit product:', id);

  try {
    const { data, error } = await window.supabaseClient
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      alert('❌ فشل تحميل المنتج');
      return;
    }

    // فتح الـ Modal
    document.getElementById('productModal').classList.add('active');
    hideModalMessage();
    await ensureCategoriesLoaded();

    setTimeout(() => {
      const el = (id) => document.getElementById(id);

      el('pName').value = data.title || '';
      el('pDescription').value = data.description || '';
      el('pPrice').value = data.price || '';
      el('pCurrency').value = data.currency || 'EGP';
      el('pStock').value = data.stock || 1;

      // التصنيف
      const catSelect = el('pCategory');
      if (catSelect && data.category_id) {
        const trySet = (n = 0) => {
          const found = Array.from(catSelect.options).some(o => o.value == data.category_id);
          if (found) catSelect.value = data.category_id;
          else if (n < 10) setTimeout(() => trySet(n + 1), 200);
        };
        trySet();
      }

      // نوع البائع
      if (data.seller_type) {
        const sellerInput = document.querySelector(`input[name="sellerType"][value="${data.seller_type}"]`);
        if (sellerInput) sellerInput.checked = true;
      }

      // تحويل الزر
      const btn = document.getElementById('saveProductBtn');
      btn.textContent = '💾 تحديث المنتج';
      btn.setAttribute('data-edit-id', id);

      console.log('✅ Edit mode product:', id);
    }, 400);

  } catch (err) {
    console.error(err);
    alert('❌ ' + err.message);
  }
};
// ═══ Ensure Workshop ═══
async function ensureWorkshop() {
  const { data: existing } = await window.supabaseClient
    .from('workshops')
    .select('id, name')
    .eq('owner_id', currentUser.id)
    .maybeSingle();

  if (existing) return existing;

  const userName = currentProfile.full_name || 'ورشة';
  const workshopSlug = 'w-' + currentUser.id.slice(0, 8);

  const { data: created, error } = await window.supabaseClient
    .from('workshops')
    .insert({
      owner_id: currentUser.id,
      name: userName,
      slug: workshopSlug,
      description: 'ورشة ' + userName,
      workshop_type: 'product',
      status: 'active'
    })
    .select()
    .single();

  if (error) throw new Error('فشل إنشاء الورشة: ' + error.message);
  return created;
}

// ═══ Helpers ═══
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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
// ═══════════════════════════════════════════════════════════
// ═══ نظام تنبيهات المحتوى المعلق للبائع (Moderation Alerts) ═══
// ═══════════════════════════════════════════════════════════

async function loadSellerAlerts() {
    const container = document.getElementById('sellerAlertsContainer');
    if (!container || !currentUser) return;

    // تفريغ الحاوية في كل مرة يتم التحديث
    container.innerHTML = '';
    container.style.display = 'none';
    let alertsHtml = '';

    try {
        // 1. جلب المنتجات المعلقة أو التي تحتاج مراجعة
        const { data: products } = await window.supabaseClient
            .from('products')
            .select('id, title, moderation_status, suspension_reason, recommendation')
            .eq('seller_id', currentUser.id)
            .in('moderation_status', ['suspended', 'pending_review']);

        // 2. جلب الخدمات المعلقة أو التي تحتاج مراجعة
        let services = [];
        const { data: freelancer } = await window.supabaseClient
            .from('freelancers')
            .select('id')
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (freelancer?.id) {
            const { data: srv } = await window.supabaseClient
                .from('services')
                .select('id, title, moderation_status, suspension_reason, recommendation')
                .eq('freelancer_id', freelancer.id)
                .in('moderation_status', ['suspended', 'pending_review']);
            services = srv || [];
        }

        // 3. بناء التنبيهات للمنتجات
        if (products && products.length > 0) {
            products.forEach(prod => {
                alertsHtml += buildAlertHtml('product', prod);
            });
        }

        // 4. بناء التنبيهات للخدمات
        if (services.length > 0) {
            services.forEach(serv => {
                alertsHtml += buildAlertHtml('service', serv);
            });
        }

        // 5. عرض التنبيهات إذا وجدت
        if (alertsHtml) {
            container.innerHTML = alertsHtml;
            container.style.display = 'block';
        }

    } catch (err) {
        console.error('Error loading seller alerts:', err);
    }
}

// دالة مساعدة لإنشاء شكل التنبيه (HTML)
function buildAlertHtml(type, item) {
    const isSuspended = item.moderation_status === 'suspended';
    const statusText = isSuspended ? '⛔ تم تعليق المحتوى' : '⏳ المحتوى قيد المراجعة';
    const color = isSuspended ? '#ef4444' : '#f59e0b';
    const bgColor = isSuspended ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
    const typeLabel = type === 'product' ? 'المنتج' : 'الخدمة';
    // استدعاء دالة التعديل المناسبة
    const editFunction = type === 'product' ? 'editProduct' : 'editService';

    return `
        <div style="background: ${bgColor}; border: 1px solid ${color}; border-radius: 10px; padding: 15px; margin-bottom: 10px; direction: rtl; text-align: right;">
            <div style="color: ${color}; font-weight: bold; margin-bottom: 8px; font-size: 1.1rem;">
                ${statusText} (${typeLabel}): ${escapeHtml(item.title)}
            </div>
            
            ${item.suspension_reason ? `
            <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 8px;">
                <strong>السبب:</strong> ${escapeHtml(item.suspension_reason)}
            </div>` : ''}
            
            ${item.recommendation ? `
            <div style="color: #86efac; font-size: 0.9rem; margin-bottom: 12px; background: rgba(34, 197, 94, 0.1); padding: 10px; border-radius: 6px;">
                <strong>💡 توصية للتحسين:</strong> ${escapeHtml(item.recommendation)}
            </div>` : ''}
            
            <button onclick="${editFunction}('${item.id}')" style="background: var(--gold); color: var(--obsidian); padding: 8px 16px; border-radius: 6px; border: none; font-weight: bold; font-size: 0.85rem; cursor: pointer; font-family: 'Tajawal', sans-serif; transition: all 0.3s;">
                ✏️ تعديل ${typeLabel} وإعادة إرساله
            </button>
        </div>
    `;
}
// ==========================================
// كود ربط تليجرام - CapKit (نسخة التحديث التلقائي)
// ==========================================
const TG_WORKER_URL = "https://capkit-telegram-bot.mohammed-hamdan0.workers.dev"; 

// متغير لحفظ حالة الفحص التلقائي
let pollingInterval = null;

async function checkTelegramStatus() {
    if (typeof supabaseClient === 'undefined') return false;

    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) return false;

        const { data: profile } = await supabaseClient.from('profiles').select('telegram_chat_id, telegram_username').eq('id', user.id).single();
        
        const unlinkedView = document.getElementById('telegram-unlinked-view');
        const linkedView = document.getElementById('telegram-linked-view');
        const tgUsername = document.getElementById('tg-username');

        if (profile && profile.telegram_chat_id) {
            if(unlinkedView) unlinkedView.style.display = 'none';
            if(linkedView) linkedView.style.display = 'block';
            if(tgUsername) tgUsername.textContent = profile.telegram_username ? `@${profile.telegram_username}` : profile.telegram_chat_id;
            return true; // الحساب مربوط
        } else {
            if(unlinkedView) unlinkedView.style.display = 'block';
            if(linkedView) linkedView.style.display = 'none';
            return false; // الحساب غير مربوط
        }
    } catch (err) {
        console.error("Error checking telegram status:", err);
        return false;
    }
}

// تشغيل الفحص أول مرة عند تحميل الصفحة
checkTelegramStatus();

const btnLink = document.getElementById('btn-link-telegram');
if (btnLink) {
    btnLink.addEventListener('click', async () => {
        if (typeof supabaseClient === 'undefined') {
            alert('خطأ في تحميل النظام. يرجى تحديث الصفحة.');
            return;
        }

        try {
            btnLink.textContent = 'جاري التحضير...';
            btnLink.disabled = true;

            const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
            
            if (sessionError || !session) {
                alert('انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.');
                window.location.href = 'auth.html';
                return;
            }
            
            const response = await fetch(`${TG_WORKER_URL}/api/telegram/link-token`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            
            const data = await response.json();
            
            if (response.ok && data.token) {
                // فتح تليجرام
                window.open(`https://t.me/CapKitMarketBot?start=${data.token}`, '_blank');
                
                // تغيير حالة الزر
                btnLink.textContent = 'بانتظار الربط...';
                
                // بدء الفحص التلقائي كل 3 ثواني (لمدة دقيقتين كحد أقصى)
                let attempts = 0;
                if(pollingInterval) clearInterval(pollingInterval);
                
                pollingInterval = setInterval(async () => {
                    attempts++;
                    const isLinked = await checkTelegramStatus();
                    
                    // إذا تم الربط، أوقف الفحص وأعد الزر لحالته الطبيعية
                    if (isLinked) {
                        clearInterval(pollingInterval);
                        btnLink.textContent = '🔗 ربط الحساب الآن';
                        btnLink.disabled = false;
                    } 
                    // إذا مرت دقيقتان ولم يتم الربط، أوقف الفحص
                    else if (attempts >= 40) {
                        clearInterval(pollingInterval);
                        btnLink.textContent = '🔗 ربط الحساب الآن';
                        btnLink.disabled = false;
                    }
                }, 3000);

            } else {
                alert(`خطأ: ${data.details || data.error || 'غير معروف'}`);
                btnLink.textContent = '🔗 ربط الحساب الآن';
                btnLink.disabled = false;
            }
        } catch (err) {
            console.error("Fetch Error:", err);
            alert('حدث خطأ في الاتصال بالخادم. تأكد من اتصالك بالإنترنت.');
            btnLink.textContent = '🔗 ربط الحساب الآن';
            btnLink.disabled = false;
        }
    });
}

// 🌟 الخدعة السحرية: عندما يعود المستخدم من تليجرام إلى المتصفح، يتم الفحص فوراً
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        checkTelegramStatus().then(isLinked => {
            // إذا كان مربوطاً، نوقف المؤقت ونعيد الزر لحالته
            if (isLinked && pollingInterval) {
                clearInterval(pollingInterval);
                if (btnLink) {
                    btnLink.textContent = '🔗 ربط الحساب الآن';
                    btnLink.disabled = false;
                }
            }
        });
    }
});
