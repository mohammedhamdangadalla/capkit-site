// ═══ Auth — Supabase ═══

let selectedRole = null;

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
  });
});

// ═══ Message Helpers ═══
function showMessage(text, type = 'error') {
  const msg = document.getElementById('authMsg');
  msg.textContent = text;
  msg.className = 'auth-msg ' + type;
}

function hideMessage() {
  const msg = document.getElementById('authMsg');
  msg.className = 'auth-msg';
  msg.textContent = '';
}

// ═══ Register ═══
document.getElementById('registerBtn').addEventListener('click', async () => {
  const btn = document.getElementById('registerBtn');
  
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
    }
    
    showMessage('✅ تم إنشاء حسابك! جارٍ التوجيه...', 'success');
    
    setTimeout(() => {
      window.location.href = '/';
    }, 2500);
    
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

// ═══ Login ═══
document.getElementById('loginBtn').addEventListener('click', async () => {
  const btn = document.getElementById('loginBtn');
  
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
    
    showMessage('✅ تم تسجيل الدخول! جارٍ التوجيه...', 'success');
    
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
    
  } catch (err) {
    console.error(err);
    showMessage('❌ بيانات الدخول غير صحيحة');
  } finally {
    btn.disabled = false;
    btn.textContent = 'دخول';
  }
});
