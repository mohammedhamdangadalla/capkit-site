// ═══ Magazine Admin — إدارة أعداد المجلة والمقالات ═══
// يستمع لحدث admin:tab (من admin-manage.js) ويحمّل عند فتح تبويب «المجلة».

(function () {
  'use strict';

  const state = {
    issues: [],
    articles: [],
    currentIssue: null,
    editingIssue: null,
    editingArticle: null,
    loaded: false,
  };

  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const client = () => window.supabaseClient;

  function toast(message, kind) {
    let el = document.getElementById('adminToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'adminToast';
      el.className = 'admin-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'admin-toast show' + (kind === 'error' ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function explain(err) {
    const msg = String(err?.message || err || '');
    if (/42P01|does not exist/i.test(msg)) return 'جداول المجلة غير موجودة — نفّذ db/007_magazine_schema.sql.';
    if (/42501|permission denied/i.test(msg)) return 'لا تملك صلاحية — تحقق من سياسات RLS في 007.';
    if (/23505|duplicate/i.test(msg)) return 'رقم العدد مستخدم بالفعل.';
    return msg || 'حدث خطأ';
  }

  const fmtDate = (d) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return '—'; }
  };

  /* ═══════════ تحميل الأعداد ═══════════ */

  async function loadIssues(force) {
    if (state.loaded && !force) return;
    const wrap = document.getElementById('magazineIssues');
    try {
      const { data, error } = await client()
        .from('issues')
        .select('id, issue_number, title, publish_date, cover_image, description, is_published, created_at')
        .order('issue_number', { ascending: false });
      if (error) throw error;
      state.issues = data || [];
      state.loaded = true;
      renderIssues();
    } catch (err) {
      wrap.innerHTML = `<div class="state-message"><div class="state-icon">⚠️</div><div class="state-title">${esc(explain(err))}</div></div>`;
    }
  }

  function renderIssues() {
    const wrap = document.getElementById('magazineIssues');
    const count = document.getElementById('magazineCount');
    if (count) count.textContent = `${state.issues.length} عدد`;

    if (!state.issues.length) {
      wrap.innerHTML = '<div class="state-message"><div class="state-icon">📖</div><div class="state-title">لا توجد أعداد بعد — أنشئ العدد الأول</div></div>';
      return;
    }

    wrap.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>الغلاف</th><th>العدد</th><th>العنوان</th><th>تاريخ النشر</th><th>الحالة</th><th></th></tr></thead>
        <tbody>
          ${state.issues.map((i) => `
            <tr>
              <td>${i.cover_image
                ? `<img src="${esc(i.cover_image)}" alt="" style="width:44px;height:58px;object-fit:cover;border-radius:6px;">`
                : '<span style="opacity:.4;">—</span>'}</td>
              <td><strong>#${esc(i.issue_number)}</strong></td>
              <td>${esc(i.title)}</td>
              <td class="admin-cell-muted">${fmtDate(i.publish_date)}</td>
              <td>${i.is_published ? '<span class="pill pill-ok">منشور</span>' : '<span class="pill pill-off">مسودة</span>'}</td>
              <td style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="admin-mini" onclick="MagazineAdmin.openEditor('${i.id}')">إدارة المقالات</button>
                <button class="admin-mini" onclick="MagazineAdmin.editIssue('${i.id}')">تعديل</button>
                <button class="admin-mini ${i.is_published ? '' : 'gold'}"
                  onclick="MagazineAdmin.togglePublish('${i.id}', ${i.is_published ? 'true' : 'false'}, this)">
                  ${i.is_published ? 'إلغاء النشر' : 'نشر'}
                </button>
                <a class="admin-mini" href="/issue.html?id=${i.id}" target="_blank" rel="noopener">معاينة ↗</a>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  /* ═══════════ الغلاف: رفع من الجهاز ═══════════ */

  const COVER_BUCKET = 'magazine-assets';

  async function compressImage(file, maxSize = 1600, quality = 0.85) {
    if (!file.type.startsWith('image/')) throw new Error('الملف ليس صورة');
    if (file.size > 8 * 1024 * 1024) throw new Error('الصورة أكبر من 8 ميجابايت');

    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('صيغة الصورة غير مدعومة في هذا المتصفح');
    }

    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (!blob) throw new Error('تعذّر ضغط الصورة');
    return blob;
  }

  function setCoverPreview(url) {
    const img = document.getElementById('isCoverPreview');
    if (!img) return;
    if (url) {
      img.src = url;
      img.style.display = 'block';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
    }
  }

  function bindCoverUpload() {
    const input = document.getElementById('isCoverFile');
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';

    // معاينة فورية عند لصق رابط
    document.getElementById('isCover')?.addEventListener('input', (e) => {
      setCoverPreview(e.target.value.trim());
    });

    input.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const status = document.getElementById('isCoverStatus');
      input.disabled = true;
      if (status) status.textContent = 'جارٍ الضغط…';

      try {
        const blob = await compressImage(file);
        if (status) status.textContent = 'جارٍ الرفع…';

        const path = `covers/issue-${Date.now()}.jpg`;
        const { error } = await client().storage.from(COVER_BUCKET).upload(path, blob, {
          contentType: 'image/jpeg',
          cacheControl: '31536000',
          upsert: false,
        });
        if (error) throw error;

        const { data } = client().storage.from(COVER_BUCKET).getPublicUrl(path);
        document.getElementById('isCover').value = data.publicUrl;
        setCoverPreview(data.publicUrl);
        if (status) status.textContent = `✔ ${Math.round(blob.size / 1024)}KB`;
        toast('تم رفع الغلاف');
      } catch (err) {
        console.error('[magazine] cover upload failed:', err);
        if (status) status.textContent = '✖ فشل الرفع';
        const msg = String(err?.message || '');
        toast(
          /Bucket not found/i.test(msg)
            ? 'Bucket magazine-assets غير موجود — نفّذ db/011_magazine_assets_bucket.sql'
            : msg || 'فشل رفع الغلاف',
          'error',
        );
      } finally {
        input.disabled = false;
        input.value = '';
      }
    });
  }

  /* ═══════════ العدد: إنشاء/تعديل ═══════════ */

  function openIssueModal() {
    state.editingIssue = null;
    document.getElementById('issueModalTitle').textContent = '＋ عدد جديد';
    document.getElementById('isNumber').value = (Math.max(0, ...state.issues.map((i) => i.issue_number)) + 1);
    document.getElementById('isTitle').value = '';
    document.getElementById('isDesc').value = '';
    document.getElementById('isCover').value = '';
    setCoverPreview('');
    document.getElementById('isCoverStatus').textContent = '';
    bindCoverUpload();
    document.getElementById('isDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('isPublished').checked = false;
    document.getElementById('issueModal').classList.add('open');
  }

  function editIssue(id) {
    const issue = state.issues.find((i) => i.id === id);
    if (!issue) return;
    state.editingIssue = issue;
    document.getElementById('issueModalTitle').textContent = `تعديل العدد #${issue.issue_number}`;
    document.getElementById('isNumber').value = issue.issue_number;
    document.getElementById('isTitle').value = issue.title || '';
    document.getElementById('isDesc').value = issue.description || '';
    document.getElementById('isCover').value = issue.cover_image || '';
    setCoverPreview(issue.cover_image || '');
    document.getElementById('isCoverStatus').textContent = '';
    bindCoverUpload();
    document.getElementById('isDate').value = issue.publish_date || '';
    document.getElementById('isPublished').checked = Boolean(issue.is_published);
    document.getElementById('issueModal').classList.add('open');
  }

  function closeIssueModal() {
    document.getElementById('issueModal').classList.remove('open');
  }

  async function saveIssue() {
    const btn = document.getElementById('isSave');
    const payload = {
      issue_number: Number(document.getElementById('isNumber').value),
      title: document.getElementById('isTitle').value.trim(),
      description: document.getElementById('isDesc').value.trim() || null,
      cover_image: document.getElementById('isCover').value.trim() || null,
      publish_date: document.getElementById('isDate').value || null,
      is_published: document.getElementById('isPublished').checked,
    };

    if (!Number.isInteger(payload.issue_number) || payload.issue_number < 1) return toast('رقم العدد غير صالح', 'error');
    if (payload.title.length < 3) return toast('عنوان العدد قصير', 'error');

    btn.disabled = true;
    try {
      const q = state.editingIssue
        ? client().from('issues').update(payload).eq('id', state.editingIssue.id)
        : client().from('issues').insert(payload);
      const { error } = await q;
      if (error) throw error;
      closeIssueModal();
      toast(state.editingIssue ? 'تم تحديث العدد' : 'تم إنشاء العدد');
      await loadIssues(true);
    } catch (err) {
      toast(explain(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function togglePublish(id, current, btn) {
    btn.disabled = true;
    try {
      const { error } = await client().from('issues').update({ is_published: !current }).eq('id', id);
      if (error) throw error;
      await loadIssues(true);
      toast(!current ? 'تم نشر العدد' : 'أصبح العدد مسودة');
    } catch (err) {
      toast(explain(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* ═══════════ المقالات ═══════════ */

  async function openEditor(issueId) {
    const issue = state.issues.find((i) => i.id === issueId);
    if (!issue) return;
    state.currentIssue = issue;
    document.getElementById('magEditorTitle').textContent = `العدد #${issue.issue_number} — ${issue.title}`;
    document.getElementById('magazineEditor').style.display = 'block';

    const wrap = document.getElementById('magazineArticlesWrap');
    wrap.innerHTML = '<div class="state-message"><div class="state-icon">⏳</div><div class="state-title">جارٍ تحميل المقالات…</div></div>';

    try {
      const { data, error } = await client()
        .from('articles')
        .select('id, title, category, order_index, summary, created_at')
        .eq('issue_id', issueId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      state.articles = data || [];
      renderArticles();
    } catch (err) {
      wrap.innerHTML = `<div class="state-message"><div class="state-icon">⚠️</div><div class="state-title">${esc(explain(err))}</div></div>`;
    }
  }

  function renderArticles() {
    const wrap = document.getElementById('magazineArticlesWrap');
    if (!state.articles.length) {
      wrap.innerHTML = '<div class="state-message"><div class="state-icon">📝</div><div class="state-title">لا مقالات في هذا العدد</div></div>';
      return;
    }
    wrap.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>#</th><th>العنوان</th><th>التصنيف</th><th>الملخص</th><th></th></tr></thead>
        <tbody>
          ${state.articles.map((a) => `
            <tr>
              <td class="admin-cell-muted">${a.order_index}</td>
              <td><strong>${esc(a.title)}</strong></td>
              <td class="admin-cell-muted">${esc(a.category || '—')}</td>
              <td class="admin-cell-muted">${esc((a.summary || '').slice(0, 70))}${(a.summary || '').length > 70 ? '…' : ''}</td>
              <td style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="admin-mini" onclick="MagazineAdmin.editArticle('${a.id}')">تعديل</button>
                <button class="admin-mini danger" onclick="MagazineAdmin.deleteArticle('${a.id}')">حذف</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  async function openArticleModal(articleId) {
    if (!state.currentIssue) return toast('اختر عدداً أولاً', 'error');
    state.editingArticle = null;

    const fields = {
      arTitle: '', arOrder: state.articles.length, arCategory: '', arSummary: '',
      arContent: '', arTechnical: '', arCitations: '',
    };

    if (articleId) {
      try {
        const { data, error } = await client().from('articles').select('*').eq('id', articleId).single();
        if (error) throw error;
        state.editingArticle = data;
        fields.arTitle = data.title || '';
        fields.arOrder = data.order_index ?? 0;
        fields.arCategory = data.category || '';
        fields.arSummary = data.summary || '';
        fields.arContent = data.content_html || '';
        fields.arTechnical = data.technical_details_html || '';
        fields.arCitations = data.citations || '';
      } catch (err) {
        return toast(explain(err), 'error');
      }
    }

    for (const [id, value] of Object.entries(fields)) document.getElementById(id).value = value;
    document.getElementById('articleModalTitle').textContent = articleId ? 'تعديل المقال' : '＋ مقال جديد';
    document.getElementById('articleModal').classList.add('open');
  }

  function closeArticleModal() {
    document.getElementById('articleModal').classList.remove('open');
  }

  async function saveArticle() {
    const btn = document.getElementById('arSave');
    const payload = {
      issue_id: state.currentIssue.id,
      title: document.getElementById('arTitle').value.trim(),
      category: document.getElementById('arCategory').value.trim() || null,
      summary: document.getElementById('arSummary').value.trim() || null,
      content_html: document.getElementById('arContent').value.trim() || null,
      technical_details_html: document.getElementById('arTechnical').value.trim() || null,
      citations: document.getElementById('arCitations').value.trim() || null,
      order_index: Number(document.getElementById('arOrder').value) || 0,
    };

    if (payload.title.length < 3) return toast('عنوان المقال قصير', 'error');

    btn.disabled = true;
    try {
      const q = state.editingArticle
        ? client().from('articles').update(payload).eq('id', state.editingArticle.id)
        : client().from('articles').insert(payload);
      const { error } = await q;
      if (error) throw error;
      closeArticleModal();
      toast(state.editingArticle ? 'تم تحديث المقال' : 'تم إضافة المقال');
      await openEditor(state.currentIssue.id);
    } catch (err) {
      toast(explain(err), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function deleteArticle(id) {
    if (!confirm('حذف هذا المقال نهائياً؟')) return;
    try {
      const { error } = await client().from('articles').delete().eq('id', id);
      if (error) throw error;
      toast('تم حذف المقال');
      await openEditor(state.currentIssue.id);
    } catch (err) {
      toast(explain(err), 'error');
    }
  }

  function closeEditor() {
    document.getElementById('magazineEditor').style.display = 'none';
    state.currentIssue = null;
  }

  /* ═══════════ التهيئة ═══════════ */

  window.MagazineAdmin = {
    openIssueModal, editIssue, closeIssueModal, saveIssue, togglePublish,
    openEditor, closeEditor, openArticleModal, closeArticleModal, saveArticle, deleteArticle,
  };

  window.addEventListener('admin:tab', (e) => {
    if (e.detail?.tab === 'magazine') loadIssues();
  });
})();
