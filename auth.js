// ═══ Auth — Supabase (with Google OAuth) ═══

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

// ═══ Tabs Switching ═══
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    const view = tab.dataset.view;
    document.getElementById('registerView').style.display = view === 'register' ? 'block' : 'none';
    document.getElementById('loginView').style.display = view === 'login' ? 'block' : 'none';
    hideMessage();
  });
});

// ═══ Role Selection ═══
document.querySelectorAll('.role-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.role-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    selectedRole = opt.dataset.role;
    // حفظ الدور مؤقتاً لاستخدامه لو المستخدم اختار Google
    localStorage.setItem('pending_role', selectedRole);
  });
});

// ═══════════════════════════════════════════════
// ═══ Google Sign In ═══
// ═══════════════════════════════════════════════
window.signInWithGoogle = async function() {
  const btn = document.getElementById('googleBtn');

  if (!window.supabaseClient) {
    showMessage('❌ لم يتم تحميل الاتصال بالسيرفر، أعد تحميل الصفحة');
    return;
  }

  // لو المستخدم اختار دور، نحفظه
  if (selectedRole) {
    localStorage.setItem('pending_role', selectedRole);
  }

  btn.disabled = true;
  btn.classList.add('loading');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
    <span>جارٍ التوجيه...</span>
  `;

  try {
    const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
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

    // Supabase سيعمل redirect تلقائياً
    console.log('✅ Redirecting to Google...');

  } catch (err) {
    console.error('Google sign in error:', err);
    showMessage('❌ فشل الاتصال بـ Google، حاول تاني');
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.innerHTML = originalHTML;
  }
};

// ═══════════════════════════════════════════════
// ═══ Handle OAuth Callback (بعد ما يرجع من Google) ═══
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
    // إنشاء profile جديد
    const pendingRole = localStorage.getItem('pending_role') || 'buyer';
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
    } else {
      console.log('✅ Profile created with role:', pendingRole);
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

  // امسح pending_role
  localStorage.removeItem('pending_role');

  // توجيه
  window.location.href = '/dashboard.html';
}

// ═══════════════════════════════════════════════
// ═══ Register (Email/Password) ═══
// ═══════════════════════════════════════════════
const registerBtn = document.getElementById('registerBtn');
if (registerBtn) {
  registerBtn.addEventListener('click', async () => {
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
    
    const agreed = document.getElementById('agreeTerms')?.checked;
    if (!agreed) return showMessage('يجب الموافقة على الميثاق والشروط للمتابعة');
    
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
      
      // إنشاء profile
      if (data.user) {
        const { error: profileError } = await window.supabaseClient
          .from('profiles')
          .insert({
            id: data.user.id,
            full_name: fullName,
            phone: phone,
            role: selectedRole
          });
        
        if (profileError) console.error('Profile error:', profileError);

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
        } catch (acceptErr) {
          console.warn('Acceptance log failed:', acceptErr);
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

// ═══ Login (Email/Password) ═══
const loginBtn = document.getElementById('loginBtn');
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
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
        btn.textContent = 'دخول';
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
      btn.textContent = 'دخول';
    }
  });
}

// ═══════════════════════════════════════════════
// ═══ Auto-Check on Load (OAuth Callback) ═══
// ═══════════════════════════════════════════════
window.addEventListener('load', async () => {
  if (!window.supabaseClient) return;

  // فحص لو رجع من OAuth
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
      // لو إحنا في صفحة auth ولسه في pending_role → معناها Google
      const pendingRole = localStorage.getItem('pending_role');
      const isOAuth = session.user.app_metadata?.provider === 'google';
      
      if (isOAuth && pendingRole !== null) {
        await handleOAuthCallback();
      }
    }
  });
}
