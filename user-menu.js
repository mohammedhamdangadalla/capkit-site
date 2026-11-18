// ═══ User Menu — Navbar Auth State (Updated & Fixed) ═══

let isMenuLoading = false; // ✅ القفل لمنع التكرار


// ═══ القائمة المنسدلة: تُنقل إلى body حتى لا يقصّها الهيدر على الهاتف ═══
function positionUserDropdown() {
  const dd = document.getElementById('userDropdown');
  const btn = document.getElementById('userBtn');
  if (!dd || !btn || !dd.classList.contains('active')) return;

  const r = btn.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(280, vw - 20);

  dd.style.position = 'fixed';
  dd.style.width = width + 'px';
  dd.style.minWidth = '0';
  dd.style.right = 'auto';
  dd.style.left = Math.min(Math.max(10, r.right - width), vw - width - 10) + 'px';
  dd.style.top = Math.round(r.bottom + 8) + 'px';
  dd.style.maxHeight = Math.max(160, vh - r.bottom - 24) + 'px';
  dd.style.overflowY = 'auto';
  dd.style.zIndex = '9999';
}

function toggleUserDropdown() {
  const dd = document.getElementById('userDropdown');
  if (!dd) return;

  const willOpen = !dd.classList.contains('active');
  if (willOpen) {
    // انقله خارج الهيدر (overflow / backdrop-filter يقصّانه)
    if (dd.parentElement !== document.body) document.body.appendChild(dd);
    dd.classList.add('active');
    positionUserDropdown();
  } else {
    closeUserDropdown();
  }
}

function closeUserDropdown() {
  const dd = document.getElementById('userDropdown');
  if (dd) dd.classList.remove('active');
}

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
          <a href="/space-editor.html" class="user-dropdown-item">
            <span>🪄</span> <span>مساحتي الاحترافية</span>
          </a>
          <a href="/user.html?id=${session.user.id}" class="user-dropdown-item">
            <span>🪪</span> <span>بطاقتي</span>
          </a>
          <a href="/dashboard.html" class="user-dropdown-item">
            <span>📊</span> <span>لوحة التحكم</span>
          </a>
          <a href="/dashboard.html?tab=profile" class="user-dropdown-item">
            <span>👤</span> <span>ملفي الشخصي</span>
          </a>
          <a href="/dashboard.html?tab=products" class="user-dropdown-item">
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
        toggleUserDropdown();
      });

      // أغلق بمفتاح Escape وأعد التموضع عند تغيّر المقاس
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') closeUserDropdown();
      });
      window.addEventListener('resize', () => positionUserDropdown());
      window.addEventListener('scroll', () => closeUserDropdown(), { passive: true });
      
      // ✅ رسالة الوداع عند الخروج
      document.getElementById('logoutBtn').addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;
        await window.supabaseClient.auth.signOut();
        alert('ننتظر عودتك قريباً! 👋');
        window.location.href = '/';
      });
      
      // اقفل عند الضغط بره
      document.addEventListener('click', (ev) => {
        const dd = document.getElementById('userDropdown');
        if (dd && !dd.contains(ev.target)) dd.classList.remove('active');
      });
      document.getElementById('userDropdown').addEventListener('click', (ev) => ev.stopPropagation());
      
    } else {
      // ❌ المستخدم مش مسجل دخول
      if (!oldJoin) {
        const joinBtn = document.createElement('a');
        joinBtn.href = '/auth.html';
        joinBtn.className = 'btn-primary';
        joinBtn.textContent = 'انضم';
        navActions.insertBefore(joinBtn, navActions.firstChild);
      }
      if (!oldLogin) {
        const loginBtn = document.createElement('a');
        loginBtn.href = '/auth.html';
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
