// ═══ تعديل بطاقة التعريف ═══
// يظهر زر "تعديل البطاقة" لصاحب الحساب فقط عند فتح ملفه الشخصي.
// الصورة تُقصّ وتُضغط في المتصفح قبل الرفع (512×512 JPEG) — لا مكتبات خارجية.
//
// يعتمد على:
//   - حدث profile:loaded من user.js
//   - جدول profiles (تحديث) + bucket avatars + سياسة المالك
//   - trigger username_change_once على مستوى قاعدة البيانات

(function () {
  'use strict';

  const SOCIAL_FIELDS = [
    { key: 'instagram', label: 'إنستجرام', placeholder: '@username أو رابط كامل' },
    { key: 'facebook', label: 'فيسبوك', placeholder: 'اسم الصفحة أو رابط' },
    { key: 'linkedin', label: 'لينكد إن', placeholder: 'linkedin.com/in/...' },
    { key: 'x', label: 'X (تويتر)', placeholder: '@username' },
  ];

  const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
  const RESERVED = new Set([
    'u', 'admin', 'administrator', 'api', 'www', 'capkit', 'capkitco',
    'product', 'products', 'service', 'services', 'workshop', 'workshops',
    'search', 'dashboard', 'auth', 'login', 'signup', 'settings', 'help',
    'support', 'about', 'contact', 'terms', 'privacy', 'manifesto', 'user',
  ]);

  const AVATAR_SIZE = 512;
  const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

  let user = null;
  let profile = null;
  let dialog = null;
  let pendingFile = null;
  let previewUrl = null;
  let onSaved = null;

  // ───────────── أدوات ─────────────

  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  function toast(message, kind) {
    let el = document.getElementById('cardToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cardToast';
      el.className = 'card-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.dataset.kind = kind || 'ok';
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /** قص مربّع من مركز الصورة + ضغط JPEG */
  async function compressImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('الملف ليس صورة');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('حجم الصورة أكبر من 2 ميجابايت');

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('صيغة الصورة غير مدعومة في هذا المتصفح');
    }

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');

    const scale = Math.max(AVATAR_SIZE / bitmap.width, AVATAR_SIZE / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (AVATAR_SIZE - w) / 2, (AVATAR_SIZE - h) / 2, w, h);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('تعذّر ضغط الصورة');
    return blob;
  }

  async function uploadAvatar(blob) {
    const client = window.supabaseClient;
    const path = `${user.id}/avatar.jpg`;

    const { error } = await client.storage.from('avatars').upload(path, blob, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '31536000',
    });
    if (error) throw new Error(`فشل رفع الصورة: ${error.message}`);

    const { data } = client.storage.from('avatars').getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  }

  // ───────────── الواجهة ─────────────

  function injectStyles() {
    if (document.getElementById('cardEditStyles')) return;
    const style = document.createElement('style');
    style.id = 'cardEditStyles';
    style.textContent = `
      .btn-edit-card {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 10px 18px; border-radius: 10px; cursor: pointer;
        font-family: inherit; font-size: 0.88rem; font-weight: 700;
        color: var(--gold, #c9a961); background: rgba(201,169,97,0.12);
        border: 1px solid rgba(201,169,97,0.4); transition: background .2s;
      }
      .btn-edit-card:hover { background: rgba(201,169,97,0.2); }

      .card-modal-overlay {
        position: fixed; inset: 0; z-index: 3000;
        background: rgba(0,0,0,0.72); backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px; opacity: 0; pointer-events: none; transition: opacity .2s;
      }
      .card-modal-overlay.open { opacity: 1; pointer-events: auto; }

      .card-modal {
        width: 100%; max-width: 520px; max-height: 92vh; overflow-y: auto;
        background: #15151a; color: #f2efe9;
        border: 1px solid rgba(255,255,255,.1); border-radius: 18px;
        padding: 22px; font-family: 'Tajawal', system-ui, sans-serif;
        text-align: right;
      }
      .card-modal h3 { font-family: 'Amiri', serif; font-size: 1.3rem; margin-bottom: 4px; }
      .card-modal .hint { color: #9d9a94; font-size: .8rem; margin-bottom: 18px; display: block; }

      .card-field { margin-bottom: 16px; }
      .card-field label { display: block; font-size: .82rem; margin-bottom: 6px; color: #cfcbc4; }
      .card-field input[type="text"], .card-field textarea {
        width: 100%; padding: 10px 12px; border-radius: 9px;
        border: 1px solid rgba(255,255,255,.12); background: #0f0f13; color: #f2efe9;
        font-family: inherit; font-size: .9rem;
      }
      .card-field input:focus, .card-field textarea:focus {
        outline: none; border-color: #c9a961;
      }
      .card-field input:disabled { opacity: .55; cursor: not-allowed; }
      .card-field .field-note { font-size: .74rem; color: #9d9a94; margin-top: 5px; }

      .card-avatar-row { display: flex; align-items: center; gap: 14px; }
      .card-avatar-preview {
        width: 72px; height: 72px; border-radius: 50%; flex-shrink: 0;
        display: grid; place-items: center; overflow: hidden;
        background: linear-gradient(140deg, #c9a961, #8f7440); color: #151006;
        font-family: 'Amiri', serif; font-size: 1.6rem;
      }
      .card-avatar-preview img { width: 100%; height: 100%; object-fit: cover; }

      .card-upload-label {
        display: inline-block; padding: 8px 14px; border-radius: 9px; cursor: pointer;
        border: 1px dashed rgba(201,169,97,.5); color: #c9a961; font-size: .82rem;
      }
      .card-upload-label input { display: none; }

      .card-toggle { display: flex; align-items: flex-start; gap: 10px; }
      .card-toggle input { margin-top: 3px; accent-color: #c9a961; }
      .card-toggle span { font-size: .86rem; color: #cfcbc4; line-height: 1.6; }

      .card-url-preview {
        padding: 8px 12px; border-radius: 8px; background: #0f0f13;
        border: 1px solid rgba(255,255,255,.08);
        font-size: .8rem; color: #9d9a94; direction: ltr; text-align: left;
        overflow-wrap: anywhere;
      }

      .card-modal-actions { display: flex; gap: 10px; margin-top: 20px; }
      .card-modal-actions button {
        flex: 1; padding: 12px; border-radius: 10px; cursor: pointer;
        font-family: inherit; font-weight: 700; font-size: .9rem; border: 1px solid transparent;
      }
      .card-save { background: #c9a961; color: #151006; }
      .card-save:disabled { opacity: .6; cursor: wait; }
      .card-cancel { background: transparent; color: #cfcbc4; border-color: rgba(255,255,255,.14); }

      .card-toast {
        position: fixed; bottom: 24px; left: 50%; transform: translate(-50%, 20px);
        background: #1d1d24; color: #f2efe9; border: 1px solid rgba(255,255,255,.12);
        padding: 12px 18px; border-radius: 10px; font-size: .86rem; z-index: 3100;
        opacity: 0; transition: opacity .2s, transform .2s; max-width: 90vw; text-align: center;
      }
      .card-toast.show { opacity: 1; transform: translate(-50%, 0); }
      .card-toast[data-kind="error"] { border-color: #ef4444; color: #fca5a5; }
    `;
    document.head.appendChild(style);
  }

  function buildDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'card-modal-overlay';
    overlay.id = 'cardEditOverlay';
    overlay.innerHTML = `
      <div class="card-modal" role="dialog" aria-modal="true" aria-labelledby="cardEditTitle">
        <h3 id="cardEditTitle">تعديل البطاقة</h3>
        <span class="hint">تظهر هذه البيانات في بطاقتك القابلة للمشاركة.</span>

        <div class="card-field">
          <label>الصورة الشخصية</label>
          <div class="card-avatar-row">
            <div class="card-avatar-preview" id="cardAvatarPreview">•</div>
            <div>
              <label class="card-upload-label">
                اختيار صورة
                <input type="file" id="cardAvatarInput" accept="image/*">
              </label>
              <div class="field-note">تُقصّ مربعة 512×512 وتُضغط تلقائياً قبل الرفع.</div>
            </div>
          </div>
        </div>

        <div class="card-field">
          <label for="cardUsername">اسم المستخدم (رابط البطاقة)</label>
          <input type="text" id="cardUsername" dir="ltr" autocomplete="off" spellcheck="false">
          <div class="field-note" id="cardUsernameNote">حروف إنجليزية صغيرة وأرقام و _ فقط.</div>
          <div class="card-url-preview" id="cardUrlPreview">https://capkitco.com/u/…</div>
        </div>

        <div class="card-field">
          <label for="cardBioInput">نبذة مختصرة</label>
          <textarea id="cardBioInput" rows="3" maxlength="160"></textarea>
        </div>

        ${SOCIAL_FIELDS.map(
          (f) => `
          <div class="card-field">
            <label for="social_${f.key}">${esc(f.label)}</label>
            <input type="text" id="social_${f.key}" dir="ltr" placeholder="${esc(f.placeholder)}">
          </div>`,
        ).join('')}

        <div class="card-field">
          <label class="card-toggle">
            <input type="checkbox" id="cardPublic">
            <span>نشر البطاقة العامة — تظهر على <span dir="ltr">/u/${'{'}username${'}'}</span> ويمكن مشاركتها. عند الإيقاف تبقى صفحتك داخل المنصة لكن بلا بطاقة عامة.</span>
          </label>
        </div>

        <div class="card-modal-actions">
          <button type="button" class="card-cancel" id="cardCancel">إلغاء</button>
          <button type="button" class="card-save" id="cardSave">حفظ التعديلات</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function fillForm() {
    const links = profile.social_links && typeof profile.social_links === 'object' ? profile.social_links : {};

    document.getElementById('cardUsername').value = profile.username || '';
    document.getElementById('cardBioInput').value = profile.bio || '';
    document.getElementById('cardPublic').checked = profile.profile_public === true;

    for (const f of SOCIAL_FIELDS) {
      document.getElementById(`social_${f.key}`).value = links[f.key] || '';
    }

    const usernameInput = document.getElementById('cardUsername');
    const note = document.getElementById('cardUsernameNote');

    if (profile.username_changed_at) {
      usernameInput.disabled = true;
      note.textContent = 'تم تغيير اسم المستخدم مرة واحدة بالفعل — لا يمكن تغييره مجدداً.';
    } else {
      usernameInput.disabled = false;
      note.textContent = 'حروف إنجليزية صغيرة وأرقام و _ فقط. يمكن تغييره مرة واحدة.';
    }

    updatePreview();
    updateAvatarPreview(profile.avatar_url, profile.full_name || profile.username);
  }

  function updateAvatarPreview(url, name) {
    const box = document.getElementById('cardAvatarPreview');
    if (url) {
      box.innerHTML = `<img src="${esc(url)}" alt="">`;
    } else {
      box.textContent = (name || '•').trim().charAt(0);
    }
  }

  function updatePreview() {
    const input = document.getElementById('cardUsername');
    const value = input.value.trim().toLowerCase();
    const el = document.getElementById('cardUrlPreview');

    if (!value) {
      el.textContent = 'https://capkitco.com/u/…';
      return;
    }
    el.textContent = `https://capkitco.com/u/${value}/`;
  }

  function validate() {
    const input = document.getElementById('cardUsername');
    const username = input.value.trim().toLowerCase();

    if (!USERNAME_RE.test(username)) {
      throw new Error('اسم المستخدم: 3–30 حرفاً، حروف إنجليزية صغيرة أو أرقام أو _ فقط.');
    }
    if (RESERVED.has(username)) {
      throw new Error('اسم المستخدم محجوز، اختر اسماً آخر.');
    }
    if (username !== profile.username && profile.username_changed_at) {
      throw new Error('اسم المستخدم يمكن تغييره مرة واحدة فقط.');
    }
    return username;
  }

  async function save() {
    const btn = document.getElementById('cardSave');
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = 'جارٍ الحفظ…';

    try {
      const client = window.supabaseClient;
      const username = validate();

      const socials = {};
      for (const f of SOCIAL_FIELDS) {
        const value = document.getElementById(`social_${f.key}`).value.trim();
        if (value) socials[f.key] = value.slice(0, 160);
      }

      const patch = {
        social_links: socials,
        bio: document.getElementById('cardBioInput').value.trim().slice(0, 160) || null,
        profile_public: document.getElementById('cardPublic').checked,
      };

      if (username !== profile.username) patch.username = username;

      if (pendingFile) {
        btn.textContent = 'جارٍ ضغط الصورة…';
        const blob = await compressImage(pendingFile);
        btn.textContent = 'جارٍ رفع الصورة…';
        patch.avatar_url = await uploadAvatar(blob);
      }

      const { data, error } = await client
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select('username, avatar_url, bio, social_links, profile_public, username_changed_at')
        .single();

      if (error) {
        if (error.code === '23505') throw new Error('اسم المستخدم محجوز، جرّب اسماً آخر.');
        if (/username_already_changed/.test(error.message)) {
          throw new Error('اسم المستخدم يمكن تغييره مرة واحدة فقط.');
        }
        throw new Error(error.message);
      }

      profile = { ...profile, ...data };
      pendingFile = null;
      if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }

      updateAvatarPreview(profile.avatar_url, profile.full_name);
      fillForm();

      toast('تم حفظ البطاقة بنجاح');
      if (typeof onSaved === 'function') onSaved(profile);
      closeDialog();
    } catch (err) {
      toast(err.message || 'تعذّر الحفظ', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = buildDialog();
    wireEvents();
    return dialog;
  }

  function openDialog() {
    ensureDialog();
    fillForm();
    dialog.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDialog() {
    if (!dialog) return;
    dialog.classList.remove('open');
    document.body.style.overflow = '';
  }

  function wireEvents() {
    const overlay = document.getElementById('cardEditOverlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog();
    });
    document.getElementById('cardCancel').addEventListener('click', closeDialog);
    document.getElementById('cardSave').addEventListener('click', save);
    document.getElementById('cardUsername').addEventListener('input', updatePreview);

    document.getElementById('cardAvatarInput').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      pendingFile = file;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      document.getElementById('cardAvatarPreview').innerHTML = `<img src="${previewUrl}" alt="">`;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDialog();
    });
  }

  function injectButton() {
    const actions = document.getElementById('userActions');
    if (!actions || document.getElementById('editCardBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'editCardBtn';
    btn.type = 'button';
    btn.className = 'btn-edit-card';
    btn.innerHTML = '<span aria-hidden="true">✎</span><span>تعديل البطاقة</span>';
    btn.addEventListener('click', openDialog);
    actions.prepend(btn);
  }

  // ───────────── التشغيل ─────────────

  window.addEventListener('profile:loaded', async (event) => {
    const loaded = event.detail && event.detail.profile;
    if (!loaded || !window.supabaseClient) return;

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session || session.user.id !== loaded.id) return; // التعديل للمالك فقط
      user = session.user;
      profile = loaded;
      injectStyles();
      ensureDialog();
      injectButton();
    } catch (err) {
      console.warn('Card edit init failed:', err);
    }
  });
  // ═══ واجهة برمجية للاستخدام خارج user.html (لوحة التحكم مثلاً) ═══
  window.CardEditor = {
    open({ profile: nextProfile, user: nextUser, onSaved: callback } = {}) {
      if (!nextProfile || !nextUser) {
        console.warn('CardEditor.open: profile و user مطلوبان');
        return;
      }
      user = nextUser;
      profile = nextProfile;
      onSaved = typeof callback === 'function' ? callback : null;
      injectStyles();
      openDialog();
    },
    getProfile() {
      return profile;
    }
  };
})();
