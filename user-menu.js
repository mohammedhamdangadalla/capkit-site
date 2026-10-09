// ═══ User Menu — Navbar Auth State ═══

async function initUserMenu() {
  if (!window.supabaseClient) {
    console.warn('⚠️ Supabase not ready');
    return;
  }

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  
  const navActions = document.querySelector('.nav-actions');
  if (!navActions) return;

  // احذف الأزرار القديمة
  const oldJoin = navActions.querySelector('a[href="auth.html"]');
  const oldLogin = navActions.querySelector('.btn-ghost');
  
  if (session?.user) {
    // ✅ المستخدم مسجل دخول
    const { data: profile } = await window.supabaseClient
      .from('profiles')
      .select('full_name, role')
      .eq('id', session.user.id)
      .single();
    
    const userName = profile?.full_name || session.user.email?.split('@')[0] || 'حسابي';
    const roleIcon = getRoleIcon(profile?.role);
    
    // احذف الأزرار القديمة
    if (oldJoin) oldJoin.remove();
    if (oldLogin) oldLogin.remove();
    
    // أضف قائمة المستخدم
    const userMenu = document.createElement('div');
    userMenu.className = 'user-menu';
    userMenu.innerHTML = `
      <button class="user-btn" id="userBtn">
        <span class="user-avatar">${roleIcon}</span>
        <span class="user-name hide-mobile">${userName}</span>
        <span class="user-caret">▾</span>
      </button>
      <div class="user-dropdown" id="userDropdown">
        <a href="dashboard.html" class="user-dropdown-item">
          <span>📊</span>
          <span>لوحة التحكم</span>
        </a>
        <a href="dashboard.html?tab=profile" class="user-dropdown-item">
          <span>👤</span>
          <span>ملفي الشخصي</span>
        </a>
        <a href="dashboard.html?tab=products" class="user-dropdown-item">
          <span>📦</span>
          <span>منتجاتي</span>
        </a>
        <div class="user-dropdown-divider"></div>
        <button class="user-dropdown-item user-logout" id="logoutBtn">
          <span>🚪</span>
          <span>خروج</span>
        </button>
      </div>
    `;
    navActions.insertBefore(userMenu, navActions.firstChild);
    
    // ربط الأزرار
    document.getElementById('userBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('userDropdown').classList.toggle('active');
    });
    
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await window.supabaseClient.auth.signOut();
      window.location.href = '/';
    });
    
    // اقفل عند الضغط بره
    document.addEventListener('click', () => {
      document.getElementById('userDropdown')?.classList.remove('active');
    });
    
  } else {
    // ❌ المستخدم مش مسجل دخول
    // نترك الأزرار زي ما هي
  }
}

function getRoleIcon(role) {
  switch(role) {
    case 'vendor': return '🛒';
    case 'service': return '🔧';
    case 'freelancer': return '🔨';
    case 'admin': return '⭐';
    default: return '👤';
  }
}

// تشغيل عند جاهزية DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUserMenu);
} else {
  initUserMenu();
}
