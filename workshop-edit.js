// ═══ Workshop Edit Page ═══

let currentUser = null;
let currentProfile = null;
let currentWorkshop = null;
let logoFile = null;
let coverFile = null;
let existingLogoUrl = '';
let existingCoverUrl = '';

// ═══ Init ═══
async function initEditPage() {
  if (!window.supabaseClient) {
    showState('loading');
    return;
  }

  // 1) تسجيل الدخول
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  currentUser = session?.user || null;

  if (!currentUser) {
    showState('notLogged');
    return;
  }

  // 2) البروفايل
  const { data: profile } = await window.supabaseClient
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', currentUser.id)
    .single();

  currentProfile = profile;

  // 3) التحقق من الدور
  if (!profile || (profile.role !== 'vendor' && profile.role !== 'admin')) {
    showState('notVendor');
    return;
  }

  // 4) تحميل الأنواع + المحافظات (بالتوازي)
  await Promise.all([
    loadWorkshopTypes(),
    loadGovernorates()
  ]);

  // 5) جلب ورشة المستخدم
  const { data: workshop } = await window.supabaseClient
    .from('workshops')
    .select('*')
    .eq('owner_id', currentUser.id)
    .maybeSingle();

  currentWorkshop = workshop;

  // 6) عرض الفورم
  showState('form');
  fillForm(workshop);

  // 7) العدّاد للأوصاف
  const descInput = document.getElementById('descInput');
  descInput.addEventListener('input', () => {
    document.getElementById('descCount').textContent = descInput.value.length;
  });

  // 8) تنظيف slug تلقائي
  const slugInput = document.getElementById('slugInput');
  slugInput.addEventListener('input', () => {
    slugInput.value = slugInput.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-');
  });
}

// ═══ Load Workshop Types (from categories) ═══
async function loadWorkshopTypes() {
  const select = document.getElementById('typeInput');
  
  try {
    // التصنيفات الرئيسية فقط (parent_id = null)
    const { data, error } = await window.supabaseClient
      .from('categories')
      .select('id, name_ar, parent_id, icon, sort_order')
      .is('parent_id', null)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      select.innerHTML = '<option value="">لا توجد تصنيفات</option>';
      return;
    }

    select.innerHTML = '<option value="">اختر النوع...</option>';
    data.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.name_ar;
      opt.textContent = `${cat.icon || '📂'} ${cat.name_ar}`;
      select.appendChild(opt);
    });

    console.log('✅ Workshop types loaded:', data.length);

  } catch (err) {
    console.warn('Workshop types error:', err);
    select.innerHTML = '<option value="">خطأ في تحميل الأنواع</option>';
  }
}

// ═══ Load Governorates ═══
async function loadGovernorates() {
  const select = document.getElementById('govInput');

  try {
    const { data, error } = await window.supabaseClient
      .from('governorates')
      .select('id, name_ar, region')
      .order('id');

    if (error) throw error;

    if (!data || data.length === 0) {
      select.innerHTML = '<option value="">لا توجد محافظات</option>';
      return;
    }

    const REGION_META = {
      'greater-cairo': { name: 'القاهرة الكبرى', icon: '🏙️' },
      'alexandria-delta': { name: 'الإسكندرية والدلتا', icon: '🌊' },
      'canal': { name: 'القناة', icon: '🚢' },
      'upper-egypt': { name: 'الوجه القبلي', icon: '🏜️' },
      'coasts': { name: 'السواحل والصحراء', icon: '🏝️' }
    };

    // تجميع حسب المنطقة
    const byRegion = {};
    data.forEach(gov => {
      const key = gov.region || 'other';
      if (!byRegion[key]) byRegion[key] = [];
      byRegion[key].push(gov);
    });

    select.innerHTML = '<option value="">اختر المحافظة...</option>';

    Object.keys(byRegion).forEach(regionKey => {
      const meta = REGION_META[regionKey] || { name: regionKey, icon: '📍' };
      const optgroup = document.createElement('optgroup');
      optgroup.label = `${meta.icon} ${meta.name}`;

      byRegion[regionKey].forEach(gov => {
        const opt = document.createElement('option');
        opt.value = gov.id;
        opt.textContent = gov.name_ar;
        optgroup.appendChild(opt);
      });

      select.appendChild(optgroup);
    });

    console.log('✅ Governorates loaded:', data.length);

  } catch (err) {
    console.warn('Governorates error:', err);
    select.innerHTML = '<option value="">خطأ في تحميل المحافظات</option>';
  }
}

// ═══ Fill Form ═══
function fillForm(workshop) {
  if (workshop) {
    // وضع التعديل
    document.getElementById('formIcon').textContent = '✏️';
    document.getElementById('formTitle').textContent = 'تعديل الورشة';
    document.getElementById('formSubtitle').textContent = 'عدّل بيانات ورشتك واحفظ التغييرات';
    document.getElementById('submitBtn').innerHTML = '💾 حفظ التعديلات';

    document.getElementById('nameInput').value = workshop.name || '';
    document.getElementById('slugInput').value = workshop.slug || '';
    document.getElementById('descInput').value = workshop.description || '';
    document.getElementById('descCount').textContent = (workshop.description || '').length;
    document.getElementById('typeInput').value = workshop.workshop_type || '';
    document.getElementById('yearInput').value = workshop.year_founded || '';
    document.getElementById('govInput').value = workshop.governorate_id || '';
    document.getElementById('whatsappInput').value = workshop.whatsapp || '';
    document.getElementById('phoneInput').value = workshop.phone || '';
    document.getElementById('instagramInput').value = workshop.instagram || '';
    document.getElementById('statusInput').value = workshop.status || 'active';

    if (workshop.cover_url) {
      existingCoverUrl = workshop.cover_url;
      setImagePreview('cover', workshop.cover_url);
    }
    if (workshop.logo_url) {
      existingLogoUrl = workshop.logo_url;
      setImagePreview('logo', workshop.logo_url);
    }
  } else {
    // وضع الإنشاء
    document.getElementById('formIcon').textContent = '🏭';
    document.getElementById('formTitle').textContent = 'إنشاء ورشة جديدة';
    document.getElementById('formSubtitle').textContent = 'املأ بيانات ورشتك وابدأ في استقبال الطلبات';
    document.getElementById('submitBtn').innerHTML = '✨ إنشاء الورشة';

    // slug افتراضي
    const randomSlug = 'w-' + Date.now().toString(36);
    document.getElementById('slugInput').value = randomSlug;
  }
}

// ═══ Image Helpers ═══
function setImagePreview(type, url) {
  const preview = document.getElementById(type + 'Preview');
  const removeBtn = document.getElementById(type + 'RemoveBtn');
  preview.innerHTML = `<img src="${url}" alt="${type}">`;
  removeBtn.style.display = 'inline-flex';
}

function clearImagePreview(type) {
  const preview = document.getElementById(type + 'Preview');
  const removeBtn = document.getElementById(type + 'RemoveBtn');
  preview.innerHTML = type === 'cover' ? '<span>🖼️</span>' : '<span>🏭</span>';
  removeBtn.style.display = 'none';
}

window.handleImageSelect = function(event, type) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showAlert('❌ الصورة كبيرة جداً (الحد 5 MB)', 'error');
    return;
  }

  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    showAlert('❌ نوع الصورة غير مدعوم (JPG, PNG, WebP فقط)', 'error');
    return;
  }

  if (type === 'cover') coverFile = file;
  else logoFile = file;

  const reader = new FileReader();
  reader.onload = (e) => setImagePreview(type, e.target.result);
  reader.readAsDataURL(file);
};

window.removeImage = function(type) {
  if (type === 'cover') {
    coverFile = null;
    existingCoverUrl = '';
  } else {
    logoFile = null;
    existingLogoUrl = '';
  }
  clearImagePreview(type);

  document.querySelectorAll('input[type="file"]').forEach(inp => {
    if (inp.getAttribute('onchange')?.includes(type)) {
      inp.value = '';
    }
  });
};

// ═══ Upload Image ═══
async function uploadImage(file, type) {
  const ext = file.name.split('.').pop().toLowerCase();
  const timestamp = Date.now();
  const path = `${currentUser.id}/${type}-${timestamp}.${ext}`;

  const { error } = await window.supabaseClient.storage
    .from('workshop-images')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) throw error;

  const { data: urlData } = window.supabaseClient.storage
    .from('workshop-images')
    .getPublicUrl(path);

  return urlData.publicUrl;
}

// ═══ Handle Submit ═══
window.handleSubmit = async function(event) {
  event.preventDefault();

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.innerHTML = '⏳ جارٍ الحفظ...';
  hideAlert();

  try {
    // Validation
    const name = document.getElementById('nameInput').value.trim();
    if (name.length < 2) throw new Error('اسم الورشة قصير جداً');

    const whatsapp = document.getElementById('whatsappInput').value.trim().replace(/\D/g, '');
    if (!whatsapp || whatsapp.length < 10) {
      throw new Error('رقم WhatsApp غير صحيح');
    }

    const slug = document.getElementById('slugInput').value.trim();
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      throw new Error('الرابط الودّي غير صحيح (حروف إنجليزية فقط)');
    }

    // رفع الصور
    let coverUrl = existingCoverUrl;
    let logoUrl = existingLogoUrl;

    if (coverFile) {
      btn.innerHTML = '⏳ رفع صورة الغلاف...';
      coverUrl = await uploadImage(coverFile, 'cover');
    }

    if (logoFile) {
      btn.innerHTML = '⏳ رفع الشعار...';
      logoUrl = await uploadImage(logoFile, 'logo');
    }

    // البيانات
    const workshopData = {
      owner_id: currentUser.id,
      name: name,
      slug: slug,
      description: document.getElementById('descInput').value.trim() || null,
      workshop_type: document.getElementById('typeInput').value || null,
      year_founded: parseInt(document.getElementById('yearInput').value) || null,
      governorate_id: parseInt(document.getElementById('govInput').value) || null,
      whatsapp: whatsapp,
      phone: document.getElementById('phoneInput').value.trim().replace(/\D/g, '') || null,
      instagram: document.getElementById('instagramInput').value.trim().replace('@', '') || null,
      status: document.getElementById('statusInput').value,
      cover_url: coverUrl || null,
      logo_url: logoUrl || null,
      updated_at: new Date().toISOString()
    };

    btn.innerHTML = '⏳ حفظ البيانات...';

    let result;
    if (currentWorkshop) {
      result = await window.supabaseClient
        .from('workshops')
        .update(workshopData)
        .eq('id', currentWorkshop.id)
        .select()
        .single();
    } else {
      result = await window.supabaseClient
        .from('workshops')
        .insert(workshopData)
        .select()
        .single();
    }

    if (result.error) throw result.error;

    currentWorkshop = result.data;

    showAlert('✅ تم الحفظ بنجاح! جارٍ التحويل...', 'success');

    setTimeout(() => {
      window.location.href = `workshop.html?id=${result.data.id}`;
    }, 1500);

  } catch (err) {
    console.error('Submit error:', err);

    if (err.message?.includes('duplicate') || err.code === '23505') {
      showAlert('❌ الرابط الودّي مستخدم بالفعل، جرب واحد تاني', 'error');
    } else {
      showAlert('❌ ' + (err.message || 'فشل الحفظ، حاول تاني'), 'error');
    }

    btn.disabled = false;
    btn.innerHTML = currentWorkshop ? '💾 حفظ التعديلات' : '✨ إنشاء الورشة';
  }
};

// ═══ Alert ═══
function showAlert(msg, type) {
  const box = document.getElementById('alertBox');
  box.textContent = msg;
  box.className = 'alert-msg ' + type;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideAlert() {
  const box = document.getElementById('alertBox');
  box.className = 'alert-msg';
  box.textContent = '';
}

// ═══ State ═══
function showState(state) {
  ['loadingState', 'notLoggedState', 'notVendorState', 'formState'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });

  const map = {
    'loading': 'loadingState',
    'notLogged': 'notLoggedState',
    'notVendor': 'notVendorState',
    'form': 'formState'
  };

  document.getElementById(map[state]).style.display = 'block';
}

// ═══ Start ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEditPage);
} else {
  initEditPage();
}
