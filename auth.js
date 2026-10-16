// ═══ Auth — Smart Cards with Google OAuth ═══

let agreed = false;
let activeCard = null;
let selectedRole = null;

// ═══ Message Helpers ═══
function showMessage(text, type = 'error') {
  const msg = document.getElementById('authMsg');
  msg.textContent = text;
  msg.className = 'auth-msg ' + type;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideMessage() {
  const msg = document.getElementById('authMsg');
  msg.className = 'auth-msg';
  msg.textContent = '';
}

// ═══════════════════════════════════════════════
// ═══ Smart Cards — Unlock Mechanism ═══
// ═══════════════════════════════════════════════
window.handleTermsChange = function(checkbox) {
  agreed = checkbox.checked;
  const termsBox = document.getElementById('termsBox');
  const cards = document.querySelectorAll('.smart-card');

  if (agreed) {
    // Unlock all cards
    cards.forEach(c => c.classList.remove('locked'));
    document.querySelectorAll('.smart-card-state-icon').forEach(icon => {
      const card = icon.closest('.smart-card');
      icon.textContent = card.classList.contains('google-card') ? '→' : '↓';
    });
    termsBox.classList.add('checked');
    hideMessage();
  } else {
    // Lock all cards + close any active
    cards.forEach(c => {
      c.classList.add('locked');
      c.classList.remove('active');
    });
    document.querySelectorAll('.smart-card-state-icon').forEach(icon => {
      icon.textContent = '🔒';
    });
    termsBox.classList.remove('checked');
    activeCard = null;
  }
};

// ═══ Toggle Card (Accordion) ═══
window.toggleCard = function(name) {
  if (!agreed) {
    handleLockedClick(name);
    return;
  }

  const card = document.querySelector(`[data-card="${name}"]`);
  if (!card) return;

  // Close others
  document.querySelectorAll('.smart-card').forEach(c => {
    if (c !== card) c.classList.remove('active');
  });

  // Toggle current
  card.classList.toggle('active');
  activeCard = card.classList.contains('active') ? name : null;

  // Scroll into view
  if (activeCard) {
    setTimeout(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 200);
  }
};

// ═══ Locked Click (shake + focus checkbox) ═══
function handleLockedClick(name) {
  const card = document.querySelector(`[data-card="${name}"]`);
  if (card) {
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 500);
  }

  const checkbox = document.getElementById('agreeTerms');
  const termsBox = document.getElementById('termsBox');
  
  // Highlight the checkbox
  termsBox.style.borderColor = '#ef4444';
  termsBox.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.15)';
  setTimeout(() => {
    termsBox.style.borderColor = '';
    termsBox.style.boxShadow = '';
  }, 2000);

  showMessage('⚠️ لازم توافق على الشروط والأحكام الأول عشان تفتح الخيارات', 'error');
  checkbox.focus();

  setTimeout(() => {
    termsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);

  setTimeout(() => hideMessage(), 4000);
}

// ═══════════════════════════════════════════════
// ═══ Role Selection ═══
// ═══════════════════════════════════════════════
window.selectRole = function(el, role) {
  document.querySelectorAll('.role-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedRole = role;
  localStorage.setItem('pending_role', role);
  hideMessage();
};

// ═══════════════════════════════════════════════
// ═══ Toggle Password Visibility ═══
// ═══════════════════════════════════════════════
window.togglePassword = function(id) {
  const input = document.getElementById(id);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  
  // Change icon
  const btn = input.parentElement.querySelector('.pass-toggle');
  if (btn) btn.textContent = isPassword ? '🙈' : '👁️';
};

// ═══════════════════════════════════════════════
// ═══ Google Sign In ═══
// ═══════════════════════════════════════════════
window.handleGoogleClick = async function() {
  if (!agreed) {
    handleLockedClick('google');
    return;
  }

  if (!window.supabaseClient) {
    showMessage('❌ لم يتم تحميل الاتصال، أعد تحميل الصفحة');
    return;
  }

  // نحفظ الموافقة
  localStorage.setItem('terms_agreed_at', new Date().toISOString());

  // لو المستخدم اختار role، نحفظه
  if (selectedRole) {
    localStorage.setItem('pending_role', selectedRole);
  } else {
    localStorage.setItem('pending_role', 'user');
  }

  const card = document.querySelector('[data-card="google"]');
  const header = card.querySelector('.smart-card-header');
  const icon = card.querySelector('.smart-card-state-icon');
  const originalIcon = icon.textContent;

  header.style.pointerEvents = 'none';
  icon.textContent = '⏳';
  showMessage('⏳ جارٍ التوجيه إلى Google...', 'success');

  try {
    const { error } = await window.supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/dashboard.html',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });

    if (error) throw error;

    console.log('✅ Redirecting to Google...');

  } catch (err) {
    console.error('Google error:', err);
    showMessage('❌ فشل الاتصال بـ Google، حاول تاني');
    header.style.pointerEvents = '';
    icon.textContent = originalIcon;
  }
};

// ═══════════════════════════════════════════════
// ═══ Register (Email/Password) ═══
// ═══════════════════════════════════════════════
const registerBtn = document.getElementById('registerBtn');
if (registerBtn) {
  registerBtn.addEventListener('click', async () => {
    if (!agreed) {
      handleLockedClick('register');
      return;
    }

    const btn = registerBtn;
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;

    // Validation
    if (!selectedRole) return showMessage('اختر نوع الحساب أولاً');
    if (!fullName || fullName.length < 3) return showMessage('الاسم قصير جداً');
    if (!email || !email.includes('@')) return showMessage('البريد الإلكتروني غير صحيح');
    if (!phone || phone.length < 10) return showMessage('رقم الواتساب غير صحيح');
    if (!password || password.length < 8) return showMessage('كلمة المرور يجب أن تكون 8 أحرف على الأقل');

    btn.disabled = true;
    btn.textContent = 'جارٍ الإنشاء...';
    hideMessage();

    try {
      const { data, error } = await window.supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone,
            role: selectedRole
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        // إنشاء profile
        const { error: profileError } = await window.supabaseClient
          .from('profiles')
          .insert({
            id: data.user.id,
            full_name: fullName,
            phone: phone,
            role: selectedRole
          });

        if (profileError) console.error('Profile error:', profileError);

        // تسجيل الموافقة
        try {
          await window.supabaseClient
            .from('acceptances')
            .insert({
              user_id: data.user.id,
              doc_type: 'terms+privacy+manifesto',
              doc_version: '1.0',
              ip_address: 'client',
              user_agent: navigator.userAgent?.substring(0, 200) || 'unknown'
            });
        } catch (e) {
          console.warn('Acceptance log failed:', e);
        }
      }

      showMessage('✅ تم إنشاء حسابك! تحقق من بريدك الإلكتروني لتأكيد الحساب', 'success');

      setTimeout(() => {
        window.location.href = '/';
      }, 4000);

    } catch (err) {
      console.error(err);
      let errorMsg = err.message || 'حدث خطأ، حاول مرة أخرى';

      if (errorMsg.includes('already registered')) {
        errorMsg = 'البريد الإلكتروني مسجّل بالفعل';
      } else if (errorMsg.includes('Password')) {
        errorMsg = 'كلمة المرور ضعيفة';
      }

      showMessage('❌ ' + errorMsg);
    } finally {
      btn.disabled = false;
      btn.textContent = 'إنشاء الحساب';
    }
  });
}

// ═══════════════════════════════════════════════
// ═══ Login (Email/Password) ═══
// ═══════════════════════════════════════════════
const loginBtn = document.getElementById('loginBtn');
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    if (!agreed) {
      handleLockedClick('login');
      return;
    }

    const btn = loginBtn;
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) return showMessage('املأ كل الحقول');

    btn.disabled = true;
    btn.textContent = 'جارٍ الدخول...';
    hideMessage();

    try {
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // فحص تأكيد الإيميل
      if (data.user && !data.user.email_confirmed_at) {
        showMessage('⚠️ لازم تأكد بريدك الإلكتروني الأول — شوف الإيميل اللي وصلك', 'error');
        await window.supabaseClient.auth.signOut();
        btn.disabled = false;
        btn.textContent = '🔐 دخول';
        return;
      }

      showMessage('✅ تم تسجيل الدخول! جارٍ التوجيه...', 'success');

      setTimeout(() => {
        window.location.href = '/';
      }, 1500);

    } catch (err) {
      console.error(err);
      let errorMsg = 'بيانات الدخول غير صحيحة';

      if (err.message?.includes('Email not confirmed')) {
        errorMsg = '⚠️ لازم تأكد بريدك الإلكتروني الأول';
      }

      showMessage('❌ ' + errorMsg);
      btn.disabled = false;
      btn.textContent = '🔐 دخول';
    }
  });
}

// ═══════════════════════════════════════════════
// ═══ Handle OAuth Callback ═══
// ═══════════════════════════════════════════════
async function handleOAuthCallback() {
  if (!window.supabaseClient) return;

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session?.user) return;

  const user = session.user;

  // هل عنده profile؟
  const { data: profile } = await window.supabaseClient
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    const pendingRole = localStorage.getItem('pending_role') || 'user';
    const meta = user.user_metadata || {};

    const { error: createErr } = await window.supabaseClient
      .from('profiles')
      .insert({
        id: user.id,
        full_name: meta.full_name || meta.name || user.email?.split('@')[0] || 'مستخدم',
        phone: meta.phone || null,
        role: pendingRole,
        avatar_url: meta.avatar_url || meta.picture || null
      });

    if (createErr) {
      console.warn('Profile create error:', createErr);
    }

    // تسجيل الموافقة
    try {
      await window.supabaseClient
        .from('acceptances')
        .insert({
          user_id: user.id,
          doc_type: 'terms+privacy+manifesto',
          doc_version: '1.0',
          ip_address: 'oauth',
          user_agent: navigator.userAgent?.substring(0, 200) || 'unknown'
        });
    } catch (e) {
      console.warn('Acceptance log failed:', e);
    }
  }

  // امسح البيانات المؤقتة
  localStorage.removeItem('pending_role');
  localStorage.removeItem('terms_agreed_at');

  window.location.href = '/dashboard.html';
}

// ═══ Auto-Check on Load ═══
window.addEventListener('load', async () => {
  if (!window.supabaseClient) return;

  const hash = window.location.hash;
  const search = window.location.search;

  if (hash.includes('access_token') || search.includes('code=')) {
    await handleOAuthCallback();
  }
});

// ═══ Auth State Listener ═══
if (window.supabaseClient) {
  window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      const pendingRole = localStorage.getItem('pending_role');
      const isOAuth = session.user.app_metadata?.provider === 'google';

      if (isOAuth && pendingRole !== null) {
        await handleOAuthCallback();
      }
    }
  });
}
