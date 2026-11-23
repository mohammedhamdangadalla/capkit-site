// ═══ مراجعة تعليقات المقالات — لوحة التحكم ═══
// قسمان: المعلّقة (تحتاج قراراً) + آخر المنشورة (للمتابعة والحذف).

(function () {
  'use strict';

  const client = () => window.supabaseClient;
  let loaded = false;

  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  // خريطة معرّف المقال → رابطه الثابت (من prerender-manifest)
  let urlMap = null;
  async function getUrlMap() {
    if (urlMap) return urlMap;
    urlMap = {};
    try {
      const res = await fetch('/prerender-manifest.json', { cache: 'force-cache' });
      const m = await res.json();
      (m.pages || []).forEach((p) => {
        if (p.id && p.url) urlMap[p.id] = p.url;
      });
    } catch (e) { /* fallback أدناه */ }
    return urlMap;
  }

  function articleLink(c) {
    const art = c.articles;
    if (!art) return '';
    const issueNumber = art.issues && art.issues.issue_number;
    const title = art.title || 'المقال';
    const url = (urlMap && art.id && urlMap[art.id])
      || (issueNumber ? `/issue/${issueNumber}/` : '');
    if (!url) return esc(title);
    return `<a href="${esc(url)}" target="_blank" rel="noopener" style="color:var(--gold); text-decoration:none;">${esc(title)}</a>`;
  }

  function commentRow(c, withActions) {
    return `
      <div class="pending-comment" data-id="${esc(c.id)}" style="border:1px solid var(--border-light,#2a2a2a); border-radius:10px; padding:10px 12px; margin-bottom:8px;">
        <div style="font-size:.72rem; color:#8a8578; margin-bottom:4px;">
          ${articleLink(c) || 'مقال'} ·
          ${new Date(c.created_at).toLocaleDateString('ar-EG')}
        </div>
        <p style="margin:0 0 8px; font-size:.88rem; line-height:1.8;">${esc(c.comment_text)}</p>
        <div style="display:flex; gap:8px;">
          ${withActions ? `<button class="admin-mini gold" data-approve="${esc(c.id)}">✔ اعتماد</button>` : ''}
          <button class="admin-mini" data-delete="${esc(c.id)}" style="color:#e08b84;">🗑 حذف</button>
        </div>
      </div>`;
  }

  function emptyBox(text) {
    return `<div style="padding:8px 2px; color:#8a8578; font-size:.84rem; line-height:1.9;">${text}</div>`;
  }

  async function fetchComments(approved) {
    const { data, error } = await client()
      .from('article_comments')
      .select('id, comment_text, created_at, is_approved, article_id, articles(id, title, order_index, issues(issue_number))')
      .eq('is_approved', approved)
      .order('created_at', { ascending: false })
      .limit(approved ? 10 : 50);
    if (error) throw error;
    return data || [];
  }

  function bindActions(wrap, reload) {
    wrap.onclick = async (e) => {
      const approveBtn = e.target.closest('[data-approve]');
      const deleteBtn = e.target.closest('[data-delete]');

      if (approveBtn) {
        approveBtn.disabled = true;
        approveBtn.textContent = '…';
        const { error } = await client()
          .from('article_comments')
          .update({ is_approved: true })
          .eq('id', approveBtn.dataset.approve);
        if (!error) reload();
        else { approveBtn.disabled = false; approveBtn.textContent = '✔ اعتماد'; }
        return;
      }

      if (deleteBtn) {
        if (!confirm('حذف التعليق نهائياً؟')) return;
        deleteBtn.disabled = true;
        const { error } = await client()
          .from('article_comments')
          .delete()
          .eq('id', deleteBtn.dataset.delete);
        if (!error) reload();
      }
    };
  }

  async function load() {
    const pendingWrap = document.getElementById('pendingComments');
    const approvedWrap = document.getElementById('approvedComments');
    const count = document.getElementById('pendingCommentsCount');
    if (!pendingWrap || loaded) return;
    if (!client()) return;
    loaded = true;

    pendingWrap.innerHTML = emptyBox('⏳ جارٍ التحميل…');
    if (approvedWrap) approvedWrap.innerHTML = '';

    try {
      await getUrlMap();
      const [pending, approved] = await Promise.all([fetchComments(false), fetchComments(true)]);

      if (count) count.textContent = pending.length ? `${pending.length} معلّق` : 'لا شيء';

      pendingWrap.innerHTML = pending.length
        ? pending.map((c) => commentRow(c, true)).join('')
        : emptyBox('لا تعليقات معلّقة الآن — كل التعليقات معتمدة ✅');

      bindActions(pendingWrap, () => { loaded = false; load(); });

      if (approvedWrap) {
        approvedWrap.innerHTML = approved.length
          ? approved.map((c) => commentRow(c, false)).join('')
          : emptyBox('لا تعليقات منشورة بعد.');
        bindActions(approvedWrap, () => { loaded = false; load(); });
      }
    } catch (err) {
      console.error('[admin-comments]', err);
      loaded = false;
      pendingWrap.innerHTML = emptyBox('تعذّر تحميل التعليقات — تأكد أنك مسجّل كمشرف.');
    }
  }

  window.addEventListener('admin:tab', (e) => {
    if (e.detail && e.detail.tab === 'magazine') load();
  });

  window.AdminComments = { reload: () => { loaded = false; load(); } };
})();
