// ═══ Auth — Smart Cards + Google + Passkeys + Rate Limiting ═══

let agreed = false;
let activeCard = null;
let selectedRole = null;
let pendingEmailForResend = null;

// ═══ Rate Limiting ═══
const RATE_KEY = 'auth_rate_limit';
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 دقيقة

function checkRateLimit() {
  try {
    const stored = JSON.parse(localStorage.getItem(RATE_KEY) || '[]');
    const now = Date.now();
    const recent = stored.filter(t => now - t < WINDOW_MS);
    if (recent.length >= MAX_ATTEMPTS) {
      const waitMs = WINDOW_MS - (now - recent[0]);
      const waitMin = Math.ceil(waitMs / 60000);
      return { allowed: false, waitMin };
    }
    return { allowed: true };
  } catch {
    return { allowed: true };
  }
}

function recordAttempt() {
  try {
    const stored = JSON.parse(localStorage.getItem(RATE_KEY) || '[]');
    const now = Date.now();
    const recent = stored.filter(t => now - t < WINDOW_MS);
    recent.push(now);
    localStorage.setItem(RATE_KEY, JSON.stringify(recent));
  } catch {}
}

// ═══ Logging ═══
async function logAuthEvent(data) {
  try {
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    await window.supabaseClient
      .from('auth_events')
      .insert({
        user_id: user?.id || null,
        email: data.email || null,
        event_type: data.event_type,
        provider: data.provider || 'email',
        user_agent: navigator.userAgent?.substring(0, 200) || 'unknown',
        metadata: data.metadata || null
      });
  } catch (e) {
    console.warn('Log failed:', e);
  }
}

// ═══ Message Helpers ═══
function showMessage(text, type = 'error') {
  const msg = document.getElementById('authMsg');
  if (!msg) return;
  msg.textContent = text;
  msg.className = 'auth-msg ' + type;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideMessage() {
  const msg = document.getElementById('authMsg');
  if (!msg) return;
  msg.className = 'auth-msg';
  msg.textContent = '';
}

// ═══ Terms Unlock ═══
window.handleTermsChange = function(checkbox) {
  agreed = checkbox.checked;
  const termsBox = document.getElementById('termsBox');
  const cards = document.querySelectorAll('.smart-card');

  if (agreed) {
    cards.forEach(c => c.classList.remove('locked'));
    document.querySelectorAll('.smart-card-state-icon').forEach(icon => {
      const card = icon.closest('.smart-card');
      icon.textContent = card.classList.contains('google-card') ? '→' : '↓';
    });
    termsBox.classList.add('checked');
    hideMessage();
  } else {
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

// ═══ Toggle Card ═══
window.toggleCard = function(name) {
  if (!agreed) {
    handleLockedClick(name);
    return;
  }
  const card = document.querySelector(`[data-card="${name}"]`);
  if (!card) return;
  document.querySelectorAll('.smart-card').forEach(c => {
    if (c !== card) c.classList.remove('active');
  });
  card.classList.toggle('active');
  activeCard = card.classList.contains('active') ? name : null;
  if (activeCard) {
    setTimeout(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 200);
  }
};

function handleLockedClick(name) {
  const card = document.querySelector(`[data-card="${name}"]`);
  if (card) {
    card.classList.add('shake');
    setTimeout(() => card.classList.remove('shake'), 500);
  }
  const termsBox = document.getElementById('termsBox');
  termsBox.style.borderColor = '#ef4444';
  termsBox.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.15)';
  setTimeout(() => {
    termsBox.style.borderColor = '';
    termsBox.style.boxShadow = '';
  }, 2000);
  showMessage('⚠️ لازم توافق على الشروط والأحكام الأول', 'error');
  setTimeout(() => {
    termsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
  setTimeout(() => hideMessage(), 4000);
}

// ═══ Role ═══
window.selectRole = function(el, role) {
  document.querySelectorAll('.role-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedRole = role;
  localStorage.setItem('pending_role', role);
  hideMessage();
};

// ═══ Toggle Password ═══
window.togglePassword = function(id) {
  const input = document.getElementById(id);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
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
  localStorage.setItem('terms_agreed_at', new Date().toISOString());
  localStorage.setItem('pending_role', selectedRole || 'buyer');

  const card = document.querySelector('[data-card="google"]');
  const header = card.querySelector('.smart-card-header');
  const icon = card.querySelector('.smart-card-state-icon');

  header.style.pointerEvents = 'none';
  icon.textContent = '⏳';
  showMessage('⏳ جارٍ التوجيه إلى Google...', 'success');

  try {
    await logAuthEvent({
      event_type: 'oauth_signin_start',
      provider: 'google'
    });

    const { error } = await window.supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/dashboard.html',
       //____ queryParams: { access_type: 'offline', prompt: 'consent' }__// ✅ تم حذف queryParams: { access_type: 'offline', prompt: 'consent' }
        // حتى لا يطلب الموافقة في كل مرة__
      }
    });

    if (error) throw error;
  } catch (err) {
    console.error('Google error:', err);
    showMessage('❌ فشل الاتصال بـ Google');
    header.style.pointerEvents = '';
    icon.textContent = '→';
  }
};

// ═══════════════════════════════════════════════
// ═══ Register ═══
// ═══════════════════════════════════════════════
const registerBtn = document.getElementById('registerBtn');
if (registerBtn) {
  registerBtn.addEventListener('click', async () => {
    if (!agreed) return handleLockedClick('register');

    const rl = checkRateLimit();
    if (!rl.allowed) {
      return showMessage(`⏳ حاولت كتير — انتظر ${rl.waitMin} دقيقة`);
    }

    const btn = registerBtn;
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;

    if (!selectedRole) return showMessage('اختر نوع الحساب أولاً');
    if (!fullName || fullName.length < 3) return showMessage('الاسم قصير جداً');
    if (!email || !email.includes('@')) return showMessage('البريد الإلكتروني غير صحيح');
    if (!phone || phone.length < 10) return showMessage('رقم الواتساب غير صحيح');
    if (!password || password.length < 8) return showMessage('كلمة المرور يجب أن تكون 8 أحرف');

    btn.disabled = true;
    btn.textContent = 'جارٍ الإنشاء...';
    hideMessage();

    try {
      const { data, error } = await window.supabaseClient.auth.signUp({
        email, password,
        options: {
          data: { full_name: fullName, phone, role: selectedRole }
        }
      });

      if (error) throw error;
      recordAttempt();

      if (data.user) {
        await window.supabaseClient
          .from('profiles')
          .insert({
            id: data.user.id,
            full_name: fullName,
            phone: phone,
            role: selectedRole
          })
          .then(({ error: pe }) => { if (pe) console.warn('Profile error:', pe); });

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
        } catch (e) {}

        await logAuthEvent({
          email, event_type: 'signup',
          provider: 'email',
          metadata: { role: selectedRole }
        });

        // Show success screen
        pendingEmailForResend = email;
        showSuccessScreen(email);
      }

    } catch (err) {
      console.error(err);
      let errorMsg = err.message || 'حدث خطأ';
      if (errorMsg.includes('already registered')) {
        errorMsg = 'البريد الإلكتروني مسجّل بالفعل';
      } else if (errorMsg.includes('Password')) {
        errorMsg = 'كلمة المرور ضعيفة';
      }
      showMessage('❌ ' + errorMsg);
      btn.disabled = false;
      btn.textContent = 'إنشاء الحساب';
    }
  });
}

// ═══════════════════════════════════════════════
// ═══ Success Screen ═══
// ═══════════════════════════════════════════════
function showSuccessScreen(email) {
  document.getElementById('mainView').style.display = 'none';
  document.getElementById('successView').classList.add('active');
  document.getElementById('successEmail').textContent = email;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const resendBtn = document.getElementById('resendBtn');
if (resendBtn) {
  resendBtn.addEventListener('click', async () => {
    if (!pendingEmailForResend) return;
    resendBtn.disabled = true;
    resendBtn.textContent = '⏳ جارٍ الإرسال...';

    try {
      const { error } = await window.supabaseClient.auth.resend({
        type: 'signup',
        email: pendingEmailForResend,
        options: { emailRedirectTo: window.location.origin + '/dashboard.html' }
      });
      if (error) throw error;
      resendBtn.textContent = '✅ تم الإرسال';
      setTimeout(() => {
        resendBtn.disabled = false;
        resendBtn.textContent = '📩 إعادة إرسال الرابط';
      }, 4000);
    } catch (err) {
      resendBtn.disabled = false;
      resendBtn.textContent = '❌ فشل — حاول تاني';
      setTimeout(() => {
        resendBtn.textContent = '📩 إعادة إرسال الرابط';
      }, 2500);
    }
  });
}

const backToAuthBtn = document.getElementById('backToAuthBtn');
if (backToAuthBtn) {
  backToAuthBtn.addEventListener('click', () => {
    document.getElementById('successView').classList.remove('active');
    document.getElementById('mainView').style.display = 'block';
    pendingEmailForResend = null;
  });
}

// ═══════════════════════════════════════════════
// ═══ Login ═══
// ═══════════════════════════════════════════════
const loginBtn = document.getElementById('loginBtn');
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    if (!agreed) return handleLockedClick('login');

    const rl = checkRateLimit();
    if (!rl.allowed) {
      return showMessage(`⏳ حاولت كتير — انتظر ${rl.waitMin} دقيقة`);
    }

    const btn = loginBtn;
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) return showMessage('املأ كل الحقول');

    btn.disabled = true;
    btn.textContent = 'جارٍ الدخول...';
    hideMessage();

    try {
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data.user && !data.user.email_confirmed_at) {
        showMessage('⚠️ لازم تأكد بريدك الأول — شوف الإيميل', 'error');
        await window.supabaseClient.auth.signOut();
        btn.disabled = false;
        btn.textContent = '🔐 دخول';
        return;
      }

      recordAttempt();
      await logAuthEvent({ email, event_type: 'login', provider: 'email' });

      showMessage('✅ تم الدخول! جارٍ التوجيه...', 'success');
      setTimeout(() => { window.location.href = '/'; }, 1200);

    } catch (err) {
      console.error(err);
      recordAttempt();
      await logAuthEvent({ email, event_type: 'login_failed', provider: 'email' });

      let errorMsg = 'بيانات الدخول غير صحيحة';
      if (err.message?.includes('Email not confirmed')) {
        errorMsg = '⚠️ لازم تأكد بريدك الأول';
      }
      showMessage('❌ ' + errorMsg);
      btn.disabled = false;
      btn.textContent = '🔐 دخول';
    }
  });
}

// ═══════════════════════════════════════════════
// ═══ Passkeys (WebAuthn) ═══
// ═══════════════════════════════════════════════
function checkPasskeySupport() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

const biometricBtn = document.getElementById('biometricBtn');
if (biometricBtn) {
  if (checkPasskeySupport()) {
    biometricBtn.classList.remove('hidden');
  }
}

window.signInWithPasskey = async function() {
  if (!checkPasskeySupport()) {
    return showMessage('❌ الجهاز لا يدعم البصمة');
  }

  const btn = document.getElementById('biometricBtn');
  btn.disabled = true;
  hideMessage();

  try {
    const { data, error } = await window.supabaseClient.auth.signInWithPasskey();
    if (error) throw error;

    await logAuthEvent({ event_type: 'login', provider: 'passkey' });
    showMessage('✅ تم الدخول! جارٍ التوجيه...', 'success');
    setTimeout(() => { window.location.href = '/'; }, 1200);

  } catch (err) {
    console.error('Passkey error:', err);
    const msg = err.message || '';
    if (msg.includes('not found') || msg.includes('no passkey')) {
      showMessage('❌ لا توجد بصمة مسجلة — سجل دخول أولاً ثم أضف بصمة من الإعدادات');
    } else if (msg.toLowerCase().includes('cancel')) {
      showMessage('تم إلغاء الدخول بالبصمة');
    } else {
      showMessage('❌ فشل الدخول بالبصمة');
    }
    btn.disabled = false;
  }
};

// ═══════════════════════════════════════════════
// ═══ Redirect if Already Logged In ═══
// ═══════════════════════════════════════════════
async function checkAlreadyLoggedIn() {
  if (!window.supabaseClient) return false;

  // Skip if OAuth callback
  const hash = window.location.hash;
  const search = window.location.search;
  if (hash.includes('access_token') || search.includes('code=')) return false;

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (session?.user) {
    window.location.href = '/dashboard.html';
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════
// ═══ OAuth Callback Handler ═══
// ═══════════════════════════════════════════════
async function handleOAuthCallback() {
  if (!window.supabaseClient) return;

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session?.user) return;

  const user = session.user;

  const { data: profile } = await window.supabaseClient
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    const pendingRole = localStorage.getItem('pending_role') || 'buyer';
    const meta = user.user_metadata || {};

    await window.supabaseClient
      .from('profiles')
      .insert({
        id: user.id,
        full_name: meta.full_name || meta.name || user.email?.split('@')[0] || 'مستخدم',
        phone: meta.phone || null,
        role: pendingRole,
        avatar_url: meta.avatar_url || meta.picture || null
      })
      .then(({ error }) => { if (error) console.warn('Profile error:', error); });

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
    } catch (e) {}

    await logAuthEvent({
      email: user.email,
      event_type: 'signup',
      provider: 'google',
      metadata: { role: pendingRole }
    });
  } else {
    await logAuthEvent({
      email: user.email,
      event_type: 'login',
      provider: 'google'
    });
  }

  localStorage.removeItem('pending_role');
  localStorage.removeItem('terms_agreed_at');

  window.location.href = '/dashboard.html';
}

// ═══ Init ═══
window.addEventListener('load', async () => {
  if (!window.supabaseClient) return;

  const hash = window.location.hash;
  const search = window.location.search;

  if (hash.includes('access_token') || search.includes('code=')) {
    await handleOAuthCallback();
    return;
  }

  await checkAlreadyLoggedIn();
});
