// ═══ Dashboard — Logic (v6 - Ultimate & Full) ═══

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
let chatSubscription = null;
let currentChatOrderId = null;
let notifSubscription = null;

// ═══ Init Dashboard ═══
async function initDashboard() {
  if (!window.supabaseClient) return window.location.href = 'auth.html';
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session?.user) return window.location.href = 'auth.html';

  currentUser = session.user;
  const { data: profile } = await window.supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
  
  currentProfile = profile || { full_name: session.user.email?.split('@')[0] || 'مستخدم', role: 'buyer', email: session.user.email };

  renderUserInfo();
  loadProfileForm();
  await loadStats();
  await loadMyProducts();
  await loadMyServices();
  await loadSellerAlerts(); // تنبيهات المحتوى المعلق
  await initNotifications(); // الإشعارات
  
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('dashboardPage').style.display = 'block';

  ensureCategoriesLoaded();
  handleUrlTab();
}

function renderUserInfo() {
  const meta = ROLE_META[currentProfile.role] || ROLE_META.buyer;
  document.getElementById('dashAvatar').textContent = meta.icon;
  document.getElementById('dashUserName').textContent = currentProfile.full_name || 'مستخدم';
  document.getElementById('dashUserEmail').textContent = currentUser.email || '';
  document.getElementById('dashUserRole').textContent = meta.name;
  updateRoleUI();
}

// ═══ Categories ═══
async function ensureCategoriesLoaded() {
  if (categoriesLoaded) return true;
  const select = document.getElementById('pCategory');
  if (!select) return false;

  try {
    const { data, error } = await window.supabaseClient.from('categories').select('id, name_ar, parent_id, sort_order').order('sort_order');
    if (error) throw error;
    if (data && data.length > 0) {
      const mainCats = data.filter(c => !c.parent_id);
      fillCategorySelect(select, mainCats.map(c => ({ id: c.id, name: c.name_ar })));
      categoriesLoaded = true; return true;
    }
    throw new Error('Empty categories');
  } catch (err) {
    try {
      const res = await fetch('categories.json');
      const json = await res.json();
      fillCategorySelect(select, json.categories.map(c => ({ id: c.id, name: c.name })));
      categoriesLoaded = true; return true;
    } catch (jsonErr) { return false; }
  }
}

function fillCategorySelect(select, categories) {
  while (select.options.length > 1) select.remove(1);
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id; opt.textContent = cat.name;
    opt.style.color = '#f5f0e8'; opt.style.background = '#181818';
    select.appendChild(opt);
  });
  select.style.color = 'var(--text-primary)';
}

// ═══ Stats ═══
async function loadStats() {
  try {
    const { count: productsCount } = await window.supabaseClient.from('products').select('*', { count: 'exact', head: true }).eq('seller_id', currentUser.id);
    document.getElementById('statProducts').textContent = productsCount || 0;

    let servicesCount = 0;
    const { data: freelancer } = await window.supabaseClient.from('freelancers').select('id').eq('user_id', currentUser.id).maybeSingle();
    if (freelancer?.id) {
      const { count } = await window.supabaseClient.from('services').select('*', { count: 'exact', head: true }).eq('freelancer_id', freelancer.id);
      servicesCount = count || 0;
    }
    document.getElementById('statServices').textContent = servicesCount;

    const { count: viewsCount } = await window.supabaseClient.from('profile_views').select('*', { count: 'exact', head: true }).eq('profile_id', currentUser.id);
    document.getElementById('statViews').textContent = viewsCount || 0;

    const { data: ratings } = await window.supabaseClient.from('ratings').select('rating').eq('workshop_id', currentUser.id);
    if (ratings && ratings.length > 0) {
      const avg = (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1);
      document.getElementById('statRating').textContent = avg;
    } else {
      document.getElementById('statRating').textContent = '—';
    }
  } catch (err) { console.warn('Stats error:', err); }
}

// ═══ Products ═══
async function loadMyProducts() {
  const container = document.getElementById('myProductsList');
  if (!container) return;

  const { data, error } = await window.supabaseClient.from('products').select('*').eq('seller_id', currentUser.id).order('created_at', { ascending: false });
  if (error || !data || data.length === 0) return;

  container.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'my-products-grid';

  data.forEach(product => {
    const card = document.createElement('div'); card.className = 'my-product-card';
    const imageUrl = product.images && product.images.length > 0 ? product.images[0] : '';
    card.innerHTML = `
      <div class="my-product-img" ${imageUrl ? `style="background-image: url('${imageUrl}')"` : ''}>
        ${!imageUrl ? '<span>📦</span>' : ''}
      </div>
      <div class="my-product-info">
        <h4>${escapeHtml(product.title || 'بدون اسم')}</h4>
        <div class="my-product-price">${product.price || 0} ${product.currency || 'EGP'}</div>
        <div class="my-product-status status-${product.status}">${getStatusLabel(product.status)}</div>
        <div class="my-product-actions">
          <button class="btn-card-edit" onclick="editProduct('${product.id}')">✏️ تعديل</button>
          <button class="btn-card-delete" onclick="deleteProduct('${product.id}')">🗑️ حذف</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
  container.appendChild(grid);
}

window.openProductModal = async function() {
  document.getElementById('productModal').classList.add('active');
  hideModalMessage();
  await ensureCategoriesLoaded();
};

window.closeProductModal = function() {
  document.getElementById('productModal').classList.remove('active');
  const el = (id) => document.getElementById(id);
  if (el('pName')) el('pName').value = '';
  if (el('pDescription')) el('pDescription').value = '';
  if (el('pPrice')) el('pPrice').value = '';
  if (el('pCategory')) el('pCategory').value = '';
  if (el('pImages')) el('pImages').value = '';
  if (el('pStock')) el('pStock').value = '1';
  const sellerInput = document.querySelector('input[name="sellerType"][value="individual"]');
  if (sellerInput) sellerInput.checked = true;
  const btn = document.getElementById('saveProductBtn');
  if (btn) { btn.textContent = '💾 حفظ المنتج'; btn.removeAttribute('data-edit-id'); btn.removeAttribute('data-old-status'); }
  hideModalMessage();
};

function showModalMessage(text, type = 'error') {
  const msg = document.getElementById('modalMsg');
  if (msg) { msg.textContent = text; msg.className = 'modal-message ' + type; }
}
function hideModalMessage() {
  const msg = document.getElementById('modalMsg');
  if (msg) { msg.className = 'modal-message'; msg.textContent = ''; }
}

window.saveProduct = async function() {
  const btn = document.getElementById('saveProductBtn');
  const editId = btn.getAttribute('data-edit-id');
  const oldStatus = btn.getAttribute('data-old-status');
  
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

  btn.disabled = true; btn.textContent = '⏳ جارٍ الحفظ...'; hideModalMessage();

  try {
    let imageUrls = [];
    if (editId) {
      const { data: oldProduct } = await window.supabaseClient.from('products').select('images').eq('id', editId).single();
      imageUrls = oldProduct?.images || [];
    }

    if (imageInput.files && imageInput.files.length > 0) {
      const maxImages = navigator.userAgent.includes('Brave') ? 2 : 4;
      const files = Array.from(imageInput.files).slice(0, maxImages);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 2 * 1024 * 1024) continue;
        const ext = file.name.split('.').pop().toLowerCase();
        const fileName = `${currentUser.id}/${Date.now()}-${i}.${ext}`;
        const { error: uploadError } = await window.supabaseClient.storage.from('product-images').upload(fileName, file, { cacheControl: '3600', upsert: false });
        if (!uploadError) {
          const { data: { publicUrl } } = window.supabaseClient.storage.from('product-images').getPublicUrl(fileName);
          imageUrls.push(publicUrl);
        }
      }
    }

    const sellerType = document.querySelector('input[name="sellerType"]:checked')?.value || 'individual';
    const productData = {
      category_id: parseInt(categoryId), title: name, description: description, price: price, currency: currency, stock: stock, images: imageUrls,
      seller_type: sellerType, seller_id: currentUser.id
    };

    if (sellerType === 'workshop') {
      const { data: ws } = await window.supabaseClient.from('workshops').select('id').eq('owner_id', currentUser.id).maybeSingle();
      if (ws) productData.workshop_id = ws.id;
    }

    let result;
    if (editId) {
      if (oldStatus === 'suspended' || oldStatus === 'changes_requested') {
        productData.moderation_status = 'pending_review';
      } else {
        productData.moderation_status = oldStatus || 'approved';
      }
      result = await window.supabaseClient.from('products').update(productData).eq('id', editId).select();
    } else {
      productData.status = 'published';
      productData.moderation_status = 'approved';
      productData.published_at = new Date().toISOString();
      result = await window.supabaseClient.from('products').insert(productData).select();
    }

    if (result.error) throw new Error(result.error.message);
    if (!result.data || result.data.length === 0) throw new Error('لم يتم الحفظ');

    showModalMessage(editId ? '✅ تم تحديث المنتج!' : '✅ تم حفظ المنتج!', 'success');
    setTimeout(async () => { closeProductModal(); await loadMyProducts(); await loadStats(); }, 1000);

  } catch (err) { showModalMessage('❌ ' + (err.message || 'فشل الحفظ')); } 
  finally { btn.disabled = false; btn.textContent = editId ? '💾 تحديث المنتج' : '💾 حفظ المنتج'; }
};

window.editProduct = async function(id) {
  try {
    const { data, error } = await window.supabaseClient.from('products').select('*').eq('id', id).single();
    if (error || !data) return alert('❌ فشل تحميل المنتج');

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

      const catSelect = el('pCategory');
      if (catSelect && data.category_id) {
        const trySet = (n = 0) => {
          const found = Array.from(catSelect.options).some(o => o.value == data.category_id);
          if (found) catSelect.value = data.category_id;
          else if (n < 10) setTimeout(() => trySet(n + 1), 200);
        };
        trySet();
      }

      if (data.seller_type) {
        const sellerInput = document.querySelector(`input[name="sellerType"][value="${data.seller_type}"]`);
        if (sellerInput) sellerInput.checked = true;
      }

      const btn = document.getElementById('saveProductBtn');
      btn.textContent = '💾 تحديث المنتج';
      btn.setAttribute('data-edit-id', id);
      btn.setAttribute('data-old-status', data.moderation_status);
    }, 400);
  } catch (err) { alert('❌ ' + err.message); }
};

window.deleteProduct = async function(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المنتج؟\nلا يمكن التراجع.')) return;
  try {
    await window.supabaseClient.from('products').delete().eq('id', id);
    await loadMyProducts(); await loadStats();
  } catch (err) { alert('❌ فشل الحذف: ' + err.message); }
};

// ═══ Services (Mock) ═══
async function loadMyServices() { /* ... */ }
window.openServiceModal = function() { document.getElementById('serviceModal').classList.add('active'); };
window.closeServiceModal = function() { document.getElementById('serviceModal').classList.remove('active'); };
window.saveService = function() { alert('سيتم تفعيلها قريباً'); };

// ═══ Profile ═══
function loadProfileForm() {
  if (!currentProfile) return;
  const el = (id) => document.getElementById(id);
  if (el('pfFullName')) el('pfFullName').value = currentProfile.full_name || '';
  if (el('pfWhatsapp')) el('pfWhatsapp').value = currentProfile.whatsapp || currentProfile.phone || '';
  if (el('pfCity')) el('pfCity').value = currentProfile.city || '';
  if (el('pfBio')) { el('pfBio').value = currentProfile.bio || ''; updateBioCounter(); }
}

function updateBioCounter() {
  const bio = document.getElementById('pfBio');
  const counter = document.getElementById('bioCount');
  if (bio && counter) counter.textContent = bio.value.length;
}

window.saveProfile = async function() {
  const btn = document.getElementById('saveProfileBtn');
  const msg = document.getElementById('profileMsg');
  const fullName = document.getElementById('pfFullName')?.value.trim();
  const whatsapp = document.getElementById('pfWhatsapp')?.value.trim();
  const city = document.getElementById('pfCity')?.value.trim();
  const bio = document.getElementById('pfBio')?.value.trim();

  if (!fullName || fullName.length < 3) return showMsg(msg, 'الاسم قصير جداً', 'error');
  if (!whatsapp || whatsapp.replace(/\D/g, '').length < 10) return showMsg(msg, 'رقم الواتساب غير صحيح', 'error');

  btn.disabled = true; btn.textContent = '⏳ جارٍ الحفظ...'; msg.className = 'modal-message';

  try {
    const { error } = await window.supabaseClient.from('profiles').update({
      full_name: fullName, whatsapp: whatsapp, phone: whatsapp, city: city || null, bio: bio || null, updated_at: new Date().toISOString()
    }).eq('id', currentUser.id);
    if (error) throw error;

    currentProfile.full_name = fullName; currentProfile.whatsapp = whatsapp; currentProfile.phone = whatsapp; currentProfile.city = city; currentProfile.bio = bio;
    renderUserInfo();
    showMsg(msg, '✅ تم حفظ التغييرات بنجاح!', 'success');
  } catch (err) { showMsg(msg, '❌ ' + (err.message || 'فشل الحفظ'), 'error'); }
  finally { btn.disabled = false; btn.textContent = '💾 حفظ التغييرات'; }
};

function showMsg(el, text, type) { el.textContent = text; el.className = 'modal-message ' + type; }
function getStatusLabel(status) { const labels = { draft: '📝 مسودة', published: '✅ منشور', sold: '💰 مبيع', archived: '📦 مؤرشف' }; return labels[status] || '📝 مسودة'; }

// ═══ الإعدادات ═══
function updateRoleUI() {
  document.querySelectorAll('.role-option').forEach(el => el.classList.toggle('active', el.dataset.role === currentProfile.role));
}

window.updateRole = async function(newRole) {
  if (currentProfile.role === newRole) return;
  if (!confirm(`هل تريد التبديل إلى دور "${ROLE_META[newRole].name}"؟`)) return;
  const { error } = await window.supabaseClient.from('profiles').update({ role: newRole }).eq('id', currentUser.id);
  if (error) return alert('فشل: ' + error.message);
  currentProfile.role = newRole; renderUserInfo(); alert('✅ تم التبديل بنجاح');
};

window.changePassword = async function(e) {
  e.preventDefault();
  const newPwd = document.getElementById('pwdNew').value;
  const msg = document.getElementById('pwdMsg');
  if (newPwd !== document.getElementById('pwdConfirm').value) {
    msg.textContent = '⚠️ غير متطابقتين'; msg.className = 'pwd-msg error'; return;
  }
  const { error } = await window.supabaseClient.auth.updateUser({ password: newPwd });
  if (error) { msg.textContent = '❌ ' + error.message; msg.className = 'pwd-msg error'; } 
  else { msg.textContent = '✅ تم تحديث كلمة المرور'; msg.className = 'pwd-msg success'; e.target.reset(); }
};

// ═══ Notifications ═══
async function initNotifications() {
  await loadNotifications();
  if (notifSubscription) window.supabaseClient.removeChannel(notifSubscription);
  notifSubscription = window.supabaseClient.channel(`notifs_${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` }, () => loadNotifications())
    .subscribe();
}

async function loadNotifications() {
  const { data } = await window.supabaseClient.from('notifications').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(10);
  const badge = document.getElementById('notifBadge');
  const list = document.getElementById('notifList');
  if (!data || data.length === 0) { badge.style.display = 'none'; list.innerHTML = '<div class="notif-empty">لا توجد إشعارات</div>'; return; }
  const unread = data.filter(n => !n.is_read).length;
  if (unread > 0) { badge.style.display = 'flex'; badge.textContent = unread > 9 ? '9+' : unread; } else { badge.style.display = 'none'; }
  
  list.innerHTML = '';
  data.forEach(n => {
    const a = document.createElement('a'); a.className = `notif-item ${n.is_read ? '' : 'unread'}`; a.href = n.link || '#';
    a.onclick = async (e) => { if (!n.link) e.preventDefault(); await window.supabaseClient.from('notifications').update({ is_read: true }).eq('id', n.id); loadNotifications(); };
    a.innerHTML = `<h4>${n.title}</h4><p>${n.body}</p><span class="time">${new Date(n.created_at).toLocaleTimeString('ar-EG')}</span>`;
    list.appendChild(a);
  });
}

window.toggleNotifDropdown = function(e) { e.stopPropagation(); document.getElementById('notifDropdown').classList.toggle('active'); };
window.markAllAsRead = async function() { await window.supabaseClient.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id).eq('is_read', false); loadNotifications(); };
document.addEventListener('click', (e) => { if (!e.target.closest('.notif-container')) document.getElementById('notifDropdown').classList.remove('active'); });

// ═══ تنبيهات المحتوى المعلق ═══
async function loadSellerAlerts() {
    const container = document.getElementById('sellerAlertsContainer');
    if (!container || !currentUser) return;
    container.innerHTML = ''; container.style.display = 'none'; let alertsHtml = '';

    try {
        const { data: products } = await window.supabaseClient.from('products').select('id, title, moderation_status, suspension_reason, recommendation').eq('seller_id', currentUser.id).in('moderation_status', ['suspended', 'pending_review']);
        let services = [];
        const { data: freelancer } = await window.supabaseClient.from('freelancers').select('id').eq('user_id', currentUser.id).maybeSingle();
        if (freelancer?.id) {
            const { data: srv } = await window.supabaseClient.from('services').select('id, title, moderation_status, suspension_reason, recommendation').eq('freelancer_id', freelancer.id).in('moderation_status', ['suspended', 'pending_review']);
            services = srv || [];
        }
        if (products && products.length > 0) products.forEach(prod => { alertsHtml += buildAlertHtml('product', prod); });
        if (services.length > 0) services.forEach(serv => { alertsHtml += buildAlertHtml('service', serv); });

        if (alertsHtml) { container.innerHTML = alertsHtml; container.style.display = 'block'; }
    } catch (err) { console.error('Error loading seller alerts:', err); }
}

function buildAlertHtml(type, item) {
    const isSuspended = item.moderation_status === 'suspended';
    const statusText = isSuspended ? '⛔ تم تعليق المحتوى' : '⏳ المحتوى قيد المراجعة';
    const color = isSuspended ? '#ef4444' : '#f59e0b';
    const bgColor = isSuspended ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)';
    const typeLabel = type === 'product' ? 'المنتج' : 'الخدمة';
    const editFunction = type === 'product' ? 'editProduct' : 'editService';

    return `
        <div style="background: ${bgColor}; border: 1px solid ${color}; border-radius: 10px; padding: 15px; margin-bottom: 10px; direction: rtl; text-align: right;">
            <div style="color: ${color}; font-weight: bold; margin-bottom: 8px; font-size: 1.1rem;">${statusText} (${typeLabel}): ${escapeHtml(item.title)}</div>
            ${item.suspension_reason ? `<div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 8px;"><strong>السبب:</strong> ${escapeHtml(item.suspension_reason)}</div>` : ''}
            ${item.recommendation ? `<div style="color: #86efac; font-size: 0.9rem; margin-bottom: 12px; background: rgba(34, 197, 94, 0.1); padding: 10px; border-radius: 6px;"><strong>💡 توصية للتحسين:</strong> ${escapeHtml(item.recommendation)}</div>` : ''}
            <button onclick="${editFunction}('${item.id}')" style="background: var(--gold); color: var(--obsidian); padding: 8px 16px; border-radius: 6px; border: none; font-weight: bold; font-size: 0.85rem; cursor: pointer; font-family: 'Tajawal', sans-serif;">✏️ تعديل ${typeLabel} وإعادة إرساله</button>
        </div>
    `;
}

// ═══ الطلبات والمحادثة ═══
async function loadOrders() {
  const container = document.getElementById('ordersContainer');
  if (!container) return;
  const { data: orders } = await window.supabaseClient.from('orders')
    .select(`id, status, created_at, buyer_id, vendor_id, buyer:profiles!orders_buyer_id_fkey(full_name), vendor:profiles!orders_vendor_id_fkey(full_name)`)
    .or(`buyer_id.eq.${currentUser.id},vendor_id.eq.${currentUser.id}`).neq('status', 'cart').order('created_at', { ascending: false });
    
  if (!orders || orders.length === 0) { container.innerHTML = '<div class="empty-state"><h3>لا توجد طلبات</h3></div>'; return; }

  container.innerHTML = '<div class="orders-list"></div>';
  const list = container.querySelector('.orders-list');
  orders.forEach(o => {
    const isBuyer = o.buyer_id === currentUser.id;
    const other = isBuyer ? o.vendor?.full_name : o.buyer?.full_name;
    const card = document.createElement('div'); card.className = 'order-card';
    card.innerHTML = `
      <div class="order-info"><h4>طلب ${isBuyer ? 'إلى' : 'من'}: ${escapeHtml(other || 'مستخدم')}</h4><p>${new Date(o.created_at).toLocaleDateString('ar-EG')}</p><div style="margin-top:8px;"><span class="order-status status-${o.status}">${o.status === 'pending' ? '⏳ انتظار' : o.status}</span></div></div>
      <div class="order-actions"><button class="btn-action btn-outline" data-action="chat">💬 محادثة</button></div>`;
    card.querySelector('[data-action="chat"]').onclick = () => openChatModal(o.id, other || 'مستخدم');
    list.appendChild(card);
  });
}

window.openChatModal = async function(orderId, name) {
  currentChatOrderId = orderId;
  document.getElementById('chatModal').classList.add('active');
  document.querySelector('#chatModal .modal-header h2').textContent = `💬 محادثة مع ${name}`;
  await loadChatMessages(orderId);
  if (chatSubscription) window.supabaseClient.removeChannel(chatSubscription);
  chatSubscription = window.supabaseClient.channel(`chat_${orderId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` }, payload => {
        if (payload.new.from_user_id !== currentUser.id) { renderMessage(payload.new); scrollToBottom(); }
    }).subscribe();
};

window.closeChatModal = function() { document.getElementById('chatModal').classList.remove('active'); currentChatOrderId = null; if (chatSubscription) window.supabaseClient.removeChannel(chatSubscription); };

async function loadChatMessages(orderId) {
  const container = document.getElementById('chatMessages'); container.innerHTML = 'جاري التحميل...';
  const { data } = await window.supabaseClient.from('messages').select('*').eq('order_id', orderId).order('created_at', { ascending: true });
  container.innerHTML = ''; if (data && data.length > 0) data.forEach(renderMessage); scrollToBottom();
}

function renderMessage(msg) {
  const container = document.getElementById('chatMessages');
  if (document.querySelector(`[data-msg-id="${msg.id}"]`)) return;
  const isMe = msg.from_user_id === currentUser.id;
  const div = document.createElement('div'); div.className = `msg-bubble ${isMe ? 'msg-sent' : 'msg-received'}`;
  div.dataset.msgId = msg.id; div.textContent = msg.content; container.appendChild(div);
}

window.sendChatMessage = async function() {
  const input = document.getElementById('chatInput'); const content = input.value.trim();
  if (!content || !currentChatOrderId) return;
  input.value = '';
  const { data: o } = await window.supabaseClient.from('orders').select('buyer_id, vendor_id').eq('id', currentChatOrderId).single();
  const toId = o.buyer_id === currentUser.id ? o.vendor_id : o.buyer_id;
  const { data: newMsg } = await window.supabaseClient.from('messages').insert({ order_id: currentChatOrderId, from_user_id: currentUser.id, to_user_id: toId, content }).select().single();
  if (newMsg) { renderMessage(newMsg); scrollToBottom(); }
};

function scrollToBottom() { const c = document.getElementById('chatMessages'); if (c) c.scrollTop = c.scrollHeight; }

// ═══ Helpers ═══
function escapeHtml(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// ═══ Tabs ═══
document.querySelectorAll('.dash-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.getElementById('tab-' + tab.dataset.tab)?.classList.add('active');
    if (tab.dataset.tab === 'orders') loadOrders();
  });
});

function handleUrlTab() {
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab) document.querySelector(`.dash-tab[data-tab="${tab}"]`)?.click();
}

document.getElementById('logoutFromDash')?.addEventListener('click', async () => { await window.supabaseClient.auth.signOut(); window.location.href = '/'; });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboard); else initDashboard();
