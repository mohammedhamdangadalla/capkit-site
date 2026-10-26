// ═══ User Menu — Navbar Auth State (Updated & Fixed) ═══

let isMenuLoading = false; // ✅ القفل لمنع التكرار

async function initUserMenu() {
  if (isMenuLoading) return; // إذا كانت الدالة تعمل، اخرج فوراً
  if (!window.supabaseClient) {
    console.warn('⚠️ Supabase not ready');
    return;
  }

  isMenuLoading = true; // تفعيل القفل

  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return;

    // 1. مسح أي قائمة قديمة تماماً (باستخدام querySelectorAll للاحتياط)
    document.querySelectorAll('.user-menu').forEach(el => el.remove());

    // 2. مسح أزرار الزوار القديمة
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
      
      if (oldJoin) oldJoin.remove();
      if (oldLogin) oldLogin.remove();
      
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
            <span>📊</span> <span>لوحة التحكم</span>
          </a>
          <a href="dashboard.html?tab=profile" class="user-dropdown-item">
            <span>👤</span> <span>ملفي الشخصي</span>
          </a>
          <a href="dashboard.html?tab=products" class="user-dropdown-item">
            <span>📦</span> <span>منتجاتي</span>
          </a>
          <div class="user-dropdown-divider"></div>
          <button class="user-dropdown-item user-logout" id="logoutBtn">
            <span>🚪</span> <span>خروج</span>
          </button>
        </div>
      `;
      navActions.insertBefore(userMenu, navActions.firstChild);
      
      // ربط الأزرار
      document.getElementById('userBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('userDropdown').classList.toggle('active');
      });
      
      // ✅ رسالة الوداع عند الخروج
      document.getElementById('logoutBtn').addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;
        await window.supabaseClient.auth.signOut();
        alert('ننتظر عودتك قريباً! 👋');
        window.location.href = '/';
      });
      
      // اقفل عند الضغط بره
      document.addEventListener('click', () => {
        document.getElementById('userDropdown')?.classList.remove('active');
      });
      
    } else {
      // ❌ المستخدم مش مسجل دخول
      if (!oldJoin) {
        const joinBtn = document.createElement('a');
        joinBtn.href = 'auth.html';
        joinBtn.className = 'btn-primary';
        joinBtn.textContent = 'انضم';
        navActions.insertBefore(joinBtn, navActions.firstChild);
      }
      if (!oldLogin) {
        const loginBtn = document.createElement('a');
        loginBtn.href = 'auth.html';
        loginBtn.className = 'btn-ghost';
        loginBtn.textContent = 'دخول';
        navActions.insertBefore(loginBtn, navActions.firstChild);
      }
    }
  } catch (err) {
    console.error('Menu Init Error:', err);
  } finally {
    isMenuLoading = false; // ✅ فك القفل في النهاية (حتى لو حدث خطأ)
  }
}

function getRoleIcon(role) {
  switch(role) {
    case 'vendor': return '🛒';
    case 'service': return '🔧';
    case 'freelancer': return '💼';
    case 'admin': return '⭐';
    default: return '👤';
  }
}

// ═══ الاستماع لتغييرات الجلسة ═══
if (window.supabaseClient) {
  window.supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      initUserMenu();
    }
  });
}

// تشغيل عند جاهزية DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUserMenu);
} else {
  initUserMenu();
}
