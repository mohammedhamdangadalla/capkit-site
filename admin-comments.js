// ═══ مراجعة تعليقات المقالات — لوحة التحكم ═══
// تعمل عند فتح تبويب «المجلة»، وتُعتمد/تُحذف مباشرة.

(function () {
  'use strict';

  const client = () => window.supabaseClient;
  let loaded = false;

  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  function render(data) {
    const wrap = document.getElementById('pendingComments');
    const count = document.getElementById('pendingCommentsCount');
    if (!wrap) return;

    if (count) count.textContent = data.length ? `${data.length} معلّق` : 'لا شيء';

    if (!data.length) {
      wrap.innerHTML = '<div class="state-message" style="padding:18px;"><div class="state-icon">✅</div><div class="state-title">لا تعليقات معلّقة</div></div>';
      return;
    }

    wrap.innerHTML = data.map((c) => `
      <div class="pending-comment" data-id="${esc(c.id)}" style="border:1px solid var(--border-light,#2a2a2a); border-radius:10px; padding:10px 12px; margin-bottom:8px;">
        <div style="font-size:.72rem; color:#8a8578; margin-bottom:4px;">
          ${esc((c.articles && c.articles.title) || 'مقال')} ·
          ${new Date(c.created_at).toLocaleDateString('ar-EG')}
        </div>
        <p style="margin:0 0 8px; font-size:.88rem; line-height:1.8;">${esc(c.comment_text)}</p>
        <div style="display:flex; gap:8px;">
          <button class="admin-mini gold" data-approve="${esc(c.id)}">✔ اعتماد</button>
          <button class="admin-mini" data-delete="${esc(c.id)}" style="color:#e08b84;">🗑 حذف</button>
        </div>
      </div>`).join('');

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
        if (error) {
          approveBtn.disabled = false;
          approveBtn.textContent = '✔ اعتماد';
          return;
        }
        approveBtn.closest('.pending-comment')?.remove();
        loaded = false;
        load();
        return;
      }

      if (deleteBtn) {
        if (!confirm('حذف التعليق نهائياً؟')) return;
        deleteBtn.disabled = true;
        const { error } = await client()
          .from('article_comments')
          .delete()
          .eq('id', deleteBtn.dataset.delete);
        if (!error) {
          deleteBtn.closest('.pending-comment')?.remove();
          loaded = false;
          load();
        }
      }
    };
  }

  async function load() {
    const wrap = document.getElementById('pendingComments');
    if (!wrap || loaded) return;
    if (!client()) return; // العميل لم يجهز بعد — نحاول في المرة القادمة
    loaded = true;
    wrap.innerHTML = '<div class="state-message" style="padding:18px;"><div class="state-icon">⏳</div><div class="state-title">جارٍ التحميل…</div></div>';

    try {
      const { data, error } = await client()
        .from('article_comments')
        .select('id, comment_text, created_at, article_id, articles(title)')
        .eq('is_approved', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      render(data || []);
    } catch (err) {
      console.error('[admin-comments]', err);
      loaded = false;
      wrap.innerHTML = '<div class="state-message" style="padding:18px;"><div class="state-icon">⚠️</div><div class="state-title">تعذّر تحميل التعليقات</div></div>';
    }
  }

  window.addEventListener('admin:tab', (e) => {
    if (e.detail && e.detail.tab === 'magazine') load();
  });

  window.AdminComments = { reload: () => { loaded = false; load(); } };
})();
