// ═══ Dashboard — Logic ═══

const ROLE_META = {
  vendor: { name: 'بائع / ورشة', icon: '🛒' },
  service: { name: 'مقدّم خدمة', icon: '🔧' },
  freelancer: { name: 'صنايعي / مقاول / عامل', icon: '🔨' },
  buyer: { name: 'مشتري', icon: '👤' },
  admin: { name: 'مدير', icon: '⭐' }
};

let currentUser = null;
let currentProfile = null;

// ═══ Init Dashboard ═══
async function initDashboard() {
  if (!window.supabaseClient) {
    window.location.href = 'auth.html';
    return;
  }

  // جلب المستخدم
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  
  if (!session?.user) {
    window.location.href = 'auth.html';
    return;
  }

  currentUser = session.user;

  // جلب Profile
  const { data: profile, error } = await window.supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error('Profile error:', error);
  }

  currentProfile = profile || {
    full_name: session.user.email?.split('@')[0] || 'مستخدم',
    role: 'buyer',
    email: session.user.email
  };

  // عرض البيانات
  renderUserInfo();
  await loadStats();
  await handleUrlTab();

  // إخفاء Loading، عرض Dashboard
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('dashboardPage').style.display = 'block';
}

// ═══ Render User Info ═══
function renderUserInfo() {
  const meta = ROLE_META[currentProfile.role] || ROLE_META.buyer;
  
  document.getElementById('dashAvatar').textContent = meta.icon;
  document.getElementById('dashUserName').textContent = currentProfile.full_name || 'مستخدم';
  document.getElementById('dashUserEmail').textContent = currentUser.email || '';
  document.getElementById('dashUserRole').textContent = meta.name;
}

// ═══ Load Stats ═══
async function loadStats() {
  try {
    // عدد المنتجات
    const { count: productsCount } = await window.supabaseClient
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('workshop_id', currentUser.id);
    
    // عدد الخدمات
    const { count: servicesCount } = await window.supabaseClient
      .from('services')
      .select('*', { count: 'exact', head: true });
    
    document.getElementById('statProducts').textContent = productsCount || 0;
    document.getElementById('statServices').textContent = servicesCount || 0;
    document.getElementById('statViews').textContent = '0';
    document.getElementById('statRating').textContent = '—';
    
  } catch (err) {
    console.warn('Stats error:', err);
  }
}

// ═══ Tabs Switching ═══
document.querySelectorAll('.dash-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    
    // تحديث الأزرار
    document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // تحديث المحتوى
    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.getElementById('tab-' + tabName)?.classList.add('active');
    
    // تحديث URL
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    window.history.replaceState({}, '', url);
  });
});

// ═══ Handle URL Tab ═══
function handleUrlTab() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  
  if (tab) {
    const tabBtn = document.querySelector(`.dash-tab[data-tab="${tab}"]`);
    if (tabBtn) tabBtn.click();
  }
}

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
