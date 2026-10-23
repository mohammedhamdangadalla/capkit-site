// ═══ Dashboard — Logic (v4 - Notifications & Chat & Settings) ═══

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
  await loadSellerAlerts();
  await initNotifications();
  await handleUrlTab();

  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('dashboardPage').style.display = 'block';
  ensureCategoriesLoaded();
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
    throw new Error('Empty');
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
    opt.value = cat.id; opt.textContent = cat.name; select.appendChild(opt);
  });
}

// ═══ Stats ═══
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
// ═══ Products ═══
async function loadMyProducts() {
  const container = document.getElementById('myProductsList');
  const { data, error } = await window.supabaseClient.from('products').select('*').eq('seller_id', currentUser.id).order('created_at', { ascending: false });
  if (error || !data || data.length === 0) return;
  
  container.innerHTML = '<div class="my-products-grid"></div>';
  const grid = container.querySelector('.my-products-grid');
  
  data.forEach(product => {
    const card = document.createElement('div'); card.className = 'my-product-card';
    const imageUrl = product.images && product.images.length > 0 ? product.images[0] : '';
    card.innerHTML = `
      <div class="my-product-img" ${imageUrl ? `style="background-image: url('${imageUrl}')"` : ''}>${!imageUrl ? '<span>📦</span>' : ''}</div>
      <div class="my-product-info">
        <h4>${escapeHtml(product.title)}</h4>
        <div class="my-product-price">${product.price || 0} ${product.currency}</div>
        <div class="my-product-status status-${product.status}">${product.status === 'published' ? '✅ منشور' : '📝 مسودة'}</div>
        <div class="my-product-actions">
          <button class="btn-card-edit" onclick="editProduct('${product.id}')">✏️ تعديل</button>
          <button class="btn-card-delete" onclick="deleteProduct('${product.id}')">🗑️ حذف</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

window.openProductModal = async function() { document.getElementById('productModal').classList.add('active'); hideModalMessage(); await ensureCategoriesLoaded(); };
window.closeProductModal = function() { document.getElementById('productModal').classList.remove('active'); document.getElementById('saveProductBtn').removeAttribute('data-edit-id'); hideModalMessage(); };

window.saveProduct = async function() {
  const btn = document.getElementById('saveProductBtn');
  const editId = btn.getAttribute('data-edit-id');
  const name = document.getElementById('pName').value.trim();
  const description = document.getElementById('pDescription').value.trim();
  const price = parseFloat(document.getElementById('pPrice').value) || 0;
  const currency = document.getElementById('pCurrency').value;
  const categoryId = document.getElementById('pCategory').value;
  const stock = parseInt(document.getElementById('pStock').value) || 1;
  
  if (!name || !description || !categoryId) return showModalMessage('يرجى إكمال البيانات');
  btn.disabled = true; btn.textContent = '⏳...';

  try {
    let imageUrls = [];
    const imageInput = document.getElementById('pImages');
    if (imageInput.files && imageInput.files.length > 0) {
      const file = imageInput.files[0];
      const fileName = `${currentUser.id}/${Date.now()}.${file.name.split('.').pop()}`;
      await window.supabaseClient.storage.from('product-images').upload(fileName, file);
      const { data } = window.supabaseClient.storage.from('product-images').getPublicUrl(fileName);
      imageUrls.push(data.publicUrl);
    }

    const sellerType = document.querySelector('input[name="sellerType"]:checked').value;
    const productData = {
      category_id: parseInt(categoryId), title: name, description, price, currency, stock, images: imageUrls,
      seller_type: sellerType, seller_id: currentUser.id, moderation_status: 'approved', status: 'published'
    };

    if (sellerType === 'workshop') {
      const { data: ws } = await window.supabaseClient.from('workshops').select('id').eq('owner_id', currentUser.id).maybeSingle();
      if (ws) productData.workshop_id = ws.id;
    }

    let res;
    if (editId) {
      res = await window.supabaseClient.from('products').update(productData).eq('id', editId);
    } else {
      res = await window.supabaseClient.from('products').insert(productData);
    }
    if (res.error) throw res.error;
    
    showModalMessage('✅ تم الحفظ', 'success');
    setTimeout(() => { closeProductModal(); loadMyProducts(); loadStats(); }, 1000);
  } catch (err) { showModalMessage('❌ ' + err.message); } 
  finally { btn.disabled = false; btn.textContent = '💾 حفظ المنتج'; }
};

window.editProduct = async function(id) {
  const { data } = await window.supabaseClient.from('products').select('*').eq('id', id).single();
  if (!data) return;
  document.getElementById('productModal').classList.add('active');
  await ensureCategoriesLoaded();
  document.getElementById('pName').value = data.title;
  document.getElementById('pDescription').value = data.description;
  document.getElementById('pPrice').value = data.price;
  document.getElementById('pCategory').value = data.category_id;
  document.getElementById('saveProductBtn').setAttribute('data-edit-id', id);
  document.getElementById('saveProductBtn').textContent = '💾 تحديث';
};

window.deleteProduct = async function(id) {
  if (!confirm('هل أنت متأكد؟')) return;
  await window.supabaseClient.from('products').delete().eq('id', id);
  loadMyProducts(); loadStats();
};

function showModalMessage(msg, type='error') { const el = document.getElementById('modalMsg'); el.textContent = msg; el.className = 'modal-message ' + type; }
function hideModalMessage() { document.getElementById('modalMsg').className = 'modal-message'; }

// ═══ Services (Mock for brevity, uses same logic) ═══
async function loadMyServices() { /* Implementation similar to products */ }
window.openServiceModal = function() { document.getElementById('serviceModal').classList.add('active'); };
window.closeServiceModal = function() { document.getElementById('serviceModal').classList.remove('active'); };
window.saveService = function() { /* Implementation */ };
window.editService = function() { /* Implementation */ };
window.deleteService = function() { /* Implementation */ };

// ═══ Profile ═══
function loadProfileForm() {
  if (!currentProfile) return;
  document.getElementById('pfFullName').value = currentProfile.full_name || '';
  document.getElementById('pfWhatsapp').value = currentProfile.whatsapp || currentProfile.phone || '';
  document.getElementById('pfCity').value = currentProfile.city || '';
  document.getElementById('pfBio').value = currentProfile.bio || '';
}
window.saveProfile = async function() {
  const btn = document.getElementById('saveProfileBtn'); btn.disabled = true;
  try {
    await window.supabaseClient.from('profiles').update({
      full_name: document.getElementById('pfFullName').value,
      whatsapp: document.getElementById('pfWhatsapp').value,
      city: document.getElementById('pfCity').value,
      bio: document.getElementById('pfBio').value
    }).eq('id', currentUser.id);
    alert('✅ تم الحفظ');
  } catch (e) { alert('❌ خطأ'); }
  finally { btn.disabled = false; }
};

// ═══ Settings ═══
function updateRoleUI() {
  document.querySelectorAll('.role-option').forEach(el => el.classList.toggle('active', el.dataset.role === currentProfile.role));
}

window.updateRole = async function(newRole) {
  if (currentProfile.role === newRole) return;
  if (!confirm(`تغيير نوع الحساب إلى "${ROLE_META[newRole].name}"؟`)) return;
  await window.supabaseClient.from('profiles').update({ role: newRole }).eq('id', currentUser.id);
  currentProfile.role = newRole; renderUserInfo();
  alert('✅ تم التحديث');
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
  else { msg.textContent = '✅ تم التحديث'; msg.className = 'pwd-msg success'; e.target.reset(); }
};

// ═══ Tabs ═══
document.querySelectorAll('.dash-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.getElementById('tab-' + tab.dataset.tab)?.classList.add('active');
  });
});

function handleUrlTab() {
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab) document.querySelector(`.dash-tab[data-tab="${tab}"]`)?.click();
}

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

window.toggleNotifDropdown = function(e) {
  e.stopPropagation();
  document.getElementById('notifDropdown').classList.toggle('active');
};

window.markAllAsRead = async function() {
  await window.supabaseClient.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id).eq('is_read', false);
  loadNotifications();
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.notif-container')) document.getElementById('notifDropdown').classList.remove('active');
});

// ═══ Orders & Chat ═══
document.querySelector('[data-tab="orders"]')?.addEventListener('click', loadOrders);

async function loadOrders() {
  const container = document.getElementById('ordersContainer');
  const { data: orders, error } = await window.supabaseClient.from('orders')
    .select(`id, status, created_at, subtotal, buyer_id, vendor_id, buyer:profiles!orders_buyer_id_fkey(full_name), vendor:profiles!orders_vendor_id_fkey(full_name)`)
    .or(`buyer_id.eq.${currentUser.id},vendor_id.eq.${currentUser.id}`).neq('status', 'cart').order('created_at', { ascending: false });
    
  if (!orders || orders.length === 0) { container.innerHTML = '<div class="empty-state"><h3>لا توجد طلبات</h3></div>'; return; }

  container.innerHTML = '<div class="orders-list"></div>';
  const list = container.querySelector('.orders-list');

  orders.forEach(o => {
    const isBuyer = o.buyer_id === currentUser.id;
    const other = isBuyer ? o.vendor?.full_name : o.buyer?.full_name;
    const card = document.createElement('div'); card.className = 'order-card';
    card.innerHTML = `
      <div class="order-info">
        <h4>طلب ${isBuyer ? 'إلى' : 'من'}: ${escapeHtml(other || 'مستخدم')}</h4>
        <p>${new Date(o.created_at).toLocaleDateString('ar-EG')}</p>
        <div style="margin-top:8px;"><span class="order-status status-${o.status}">${o.status === 'pending' ? '⏳ انتظار' : o.status}</span></div>
      </div>
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

window.closeChatModal = function() {
  document.getElementById('chatModal').classList.remove('active');
  currentChatOrderId = null;
  if (chatSubscription) window.supabaseClient.removeChannel(chatSubscription);
};

async function loadChatMessages(orderId) {
  const container = document.getElementById('chatMessages');
  container.innerHTML = 'جاري التحميل...';
  const { data } = await window.supabaseClient.from('messages').select('*').eq('order_id', orderId).order('created_at', { ascending: true });
  container.innerHTML = '';
  if (data && data.length > 0) data.forEach(renderMessage);
  scrollToBottom();
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
async function loadSellerAlerts() { /* Code you already have */ }

document.getElementById('logoutFromDash')?.addEventListener('click', async () => { await window.supabaseClient.auth.signOut(); window.location.href = '/'; });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboard); else initDashboard();
