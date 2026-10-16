// ═══ Reset Password ═══

function showMsg(text, type = 'error') {
  const msg = document.getElementById('rpMsg');
  msg.textContent = text;
  msg.className = 'rp-msg ' + type;
}

function hideMsg() {
  const msg = document.getElementById('rpMsg');
  msg.className = 'rp-msg';
  msg.textContent = '';
}

// ═══ Detect Recovery Mode ═══
window.addEventListener('load', async () => {
  if (!window.supabaseClient) return;

  // Supabase sets this after recovery link
  const hash = window.location.hash;
  const isRecovery = hash.includes('type=recovery') || hash.includes('access_token');

  // Also listen for PASSWORD_RECOVERY event
  window.supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      showUpdateForm();
    }
  });

  if (isRecovery) {
    // Check if we have a valid session
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session) {
      showUpdateForm();
    }
  }
});

function showUpdateForm() {
  document.getElementById('requestForm').style.display = 'none';
  document.getElementById('updateForm').style.display = 'block';
  document.getElementById('rpTitle').textContent = 'كلمة مرور جديدة';
  document.getElementById('rpDesc').textContent = 'أدخل كلمة المرور الجديدة';
}

// ═══ Send Reset Email ═══
document.getElementById('rpSendBtn').addEventListener('click', async () => {
  const btn = document.getElementById('rpSendBtn');
  const email = document.getElementById('rpEmail').value.trim();

  if (!email || !email.includes('@')) {
    return showMsg('أدخل بريد إلكتروني صحيح');
  }

  btn.disabled = true;
  btn.textContent = '⏳ جارٍ الإرسال...';
  hideMsg();

  try {
    const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });

    if (error) throw error;

    showMsg('✅ تم إرسال رابط إعادة التعيين — تحقق من بريدك', 'success');
    btn.textContent = '✅ تم الإرسال';
    document.getElementById('rpEmail').value = '';

    // Log event
    await logAuthEvent({
      email,
      event_type: 'password_reset_request',
      provider: 'email'
    });

  } catch (err) {
    console.error('Reset error:', err);
    showMsg('❌ فشل الإرسال — تأكد من البريد');
    btn.disabled = false;
    btn.textContent = 'إرسال رابط الإعادة';
  }
});

// ═══ Update Password ═══
document.getElementById('rpUpdateBtn').addEventListener('click', async () => {
  const btn = document.getElementById('rpUpdateBtn');
  const newPass = document.getElementById('rpNewPass').value;
  const confirmPass = document.getElementById('rpConfirmPass').value;

  if (!newPass || newPass.length < 8) {
    return showMsg('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  }

  if (newPass !== confirmPass) {
    return showMsg('كلمتا المرور غير متطابقتين');
  }

  btn.disabled = true;
  btn.textContent = '⏳ جارٍ الحفظ...';
  hideMsg();

  try {
    const { error } = await window.supabaseClient.auth.updateUser({
      password: newPass
    });

    if (error) throw error;

    showMsg('✅ تم تحديث كلمة المرور — جارٍ التوجيه...', 'success');

    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 1500);

  } catch (err) {
    console.error('Update error:', err);
    showMsg('❌ فشل التحديث — حاول مرة أخرى');
    btn.disabled = false;
    btn.textContent = 'حفظ كلمة المرور الجديدة';
  }
});

// ═══ Log Helper ═══
async function logAuthEvent(data) {
  try {
    await window.supabaseClient
      .from('auth_events')
      .insert({
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
