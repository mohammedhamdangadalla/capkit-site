// ═══ Comments System ═══

let commentsUser = null;
let commentTargetType = null;
let commentTargetId = null;
let dailyCommentCount = 0;

// ═══ Init ═══
async function initComments(type, id) {
  if (!window.supabaseClient) return;

  commentTargetType = type;
  commentTargetId = id;

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  commentsUser = session?.user || null;

  renderCommentForm();
  await loadComments();
}

// ═══ Render Comment Form ═══
function renderCommentForm() {
  const container = document.getElementById('commentFormContainer');
  if (!container) return;

  if (!commentsUser) {
    container.innerHTML = `
      <div class="comment-login-prompt">
        <p>سجّل دخولك عشان تقدر تعلّق وتشارك رأيك</p>
        <a href="auth.html">تسجيل الدخول</a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="comment-form">
      <textarea 
        id="commentInput" 
        placeholder="اكتب تعليقك... (2-500 حرف)"
        maxlength="500"
        rows="3"
      ></textarea>
      <div class="comment-form-footer">
        <span class="char-count" id="commentCharCount">0 / 500</span>
        <button class="comment-submit" id="commentSubmit" onclick="submitComment()">
          نشر التعليق
        </button>
      </div>
      <div class="modal-message" id="commentMsg"></div>
    </div>
  `;

  // Char counter
  const input = document.getElementById('commentInput');
  const counter = document.getElementById('commentCharCount');
  if (input && counter) {
    input.addEventListener('input', () => {
      const len = input.value.length;
      counter.textContent = `${len} / 500`;
      counter.className = 'char-count';
      if (len > 450) counter.classList.add('danger');
      else if (len > 400) counter.classList.add('warning');
    });
  }
}

// ═══ Submit Comment ═══
window.submitComment = async function() {
  if (!commentsUser) {
    window.location.href = 'auth.html';
    return;
  }

  const input = document.getElementById('commentInput');
  const content = input.value.trim();
  const msg = document.getElementById('commentMsg');
  const btn = document.getElementById('commentSubmit');

  // Validation
  if (!content || content.length < 2) {
    msg.textContent = 'التعليق قصير جدًا';
    msg.className = 'modal-message error';
    return;
  }

  if (content.length > 500) {
    msg.textContent = 'التعليق طويل جدًا (الحد 500 حرف)';
    msg.className = 'modal-message error';
    return;
  }

  // Simple profanity check (قائمة بسيطة)
  const blocked = ['كلمة1', 'كلمة2']; // ضع الكلمات المحظورة هنا
  const hasBlocked = blocked.some(w => content.includes(w));
  if (hasBlocked) {
    msg.textContent = 'يحتوي تعليقك على كلمات غير مسموحة';
    msg.className = 'modal-message error';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ جارٍ النشر...';
  msg.className = 'modal-message';

  try {
    // Daily limit check
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count } = await window.supabaseClient
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', commentsUser.id)
      .gte('created_at', today.toISOString());

    if (count && count >= 20) {
      throw new Error('وصلت للحد اليومي (20 تعليق/يوم)');
    }

    // Insert
    const commentData = {
      user_id: commentsUser.id,
      content: content
    };

    if (commentTargetType === 'product') commentData.product_id = commentTargetId;
    else commentData.service_id = commentTargetId;

    const { error } = await window.supabaseClient
      .from('comments')
      .insert(commentData);

    if (error) throw error;

    // Success
    input.value = '';
    document.getElementById('commentCharCount').textContent = '0 / 500';
    msg.textContent = '✅ تم نشر تعليقك!';
    msg.className = 'modal-message success';

    setTimeout(() => {
      msg.className = 'modal-message';
    }, 3000);

    // Reload comments
    await loadComments();

  } catch (err) {
    console.error('Comment error:', err);
    msg.textContent = '❌ ' + (err.message || 'فشل النشر');
    msg.className = 'modal-message error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'نشر التعليق';
  }
};

// ═══ Load Comments ═══
async function loadComments() {
  const container = document.getElementById('commentsList');
  if (!container) return;

  container.innerHTML = '<div class="comments-loading">⏳ جارٍ التحميل...</div>';

  try {
    const column = commentTargetType === 'product' ? 'product_id' : 'service_id';

    const { data, error } = await window.supabaseClient
      .from('comments')
      .select(`
        id, content, created_at, user_id, status,
        profiles:user_id (id, full_name, role)
      `)
      .eq(column, commentTargetId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Update count
    const countEl = document.getElementById('commentsCount');
    if (countEl) countEl.textContent = data?.length || 0;

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="comments-empty">
          💬 كن أول من يعلّق
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    data.forEach(comment => {
      container.appendChild(renderCommentCard(comment));
    });

  } catch (err) {
    console.error('Load comments error:', err);
    container.innerHTML = `
      <div class="comments-empty">
        ⚠️ فشل تحميل التعليقات
      </div>
    `;
  }
}

// ═══ Render Comment Card ═══
function renderCommentCard(comment) {
  const card = document.createElement('div');
  card.className = 'comment-card';

  const name = comment.profiles?.full_name || 'مستخدم';
  const initial = name.charAt(0).toUpperCase();
  const isOwner = commentsUser?.id === comment.user_id;
  const date = formatCommentDate(comment.created_at);

  card.innerHTML = `
    <div class="comment-header">
      <div class="comment-avatar">${initial}</div>
      <div class="comment-meta">
        <div class="comment-author">
          <a href="user?id=${comment.user_id}">${escapeHtmlC(name)}</a>
        </div>
        <div class="comment-date">${date}</div>
      </div>
    </div>
    <div class="comment-content">${escapeHtmlC(comment.content)}</div>
    <div class="comment-actions">
      ${isOwner ? `
        <button class="comment-action-btn delete" onclick="deleteComment('${comment.id}')">
          🗑️ حذف
        </button>
      ` : `
        <button class="comment-action-btn report" onclick="reportComment('${comment.id}')">
          ⚠️ إبلاغ
        </button>
      `}
    </div>
  `;

  return card;
}

// ═══ Delete Comment ═══
window.deleteComment = async function(id) {
  if (!confirm('هل أنت متأكد من حذف التعليق؟')) return;

  try {
    const { error } = await window.supabaseClient
      .from('comments')
      .delete()
      .eq('id', id)
      .eq('user_id', commentsUser.id);

    if (error) throw error;

    await loadComments();

  } catch (err) {
    console.error('Delete error:', err);
    alert('❌ فشل الحذف');
  }
};

// ═══ Report Comment ═══
window.reportComment = async function(id) {
  // 1) نتأكد إن المستخدم مسجل دخول
  const { data: { user } } = await window.supabaseClient.auth.getUser();
  if (!user) {
    alert('⚠️ لازم تسجل دخول الأول عشان تبّلغ عن تعليق');
    return;
  }

  // 2) نسأل عن السبب (اختياري)
  const reason = prompt('سبب الإبلاغ (اختياري):');
  if (reason === null) return; // المستخدم ضغط إلغاء

  // 3) نجهز السبب - لو فاضي نستخدم قيمة افتراضية
  const finalReason = (reason || '').trim() || 'لم يُذكر سبب';

  try {
    // 4) INSERT مباشر في جدول reports
    const { error } = await window.supabaseClient
      .from('reports')
      .insert({
        reporter_id: user.id,
        comment_id: id,
        reason: finalReason
      });

    if (error) {
      // 5) لو المستخدم بلّغ عن التعليق ده قبل كده (UNIQUE violation)
      if (error.code === '23505') {
        alert('ℹ️ لقد أبلغت عن هذا التعليق مسبقاً. شكراً لك!');
        return;
      }
      throw error;
    }

    // 6) نجاح ✅ (الـ Trigger زوّد reports_count تلقائياً)
    alert('✅ تم إرسال الإبلاغ. شكراً لك!');
    console.log('✅ Report sent:', { comment_id: id, reason: finalReason });

  } catch (err) {
    console.error('❌ Report error:', err);
    alert('❌ فشل الإبلاغ — حاول تاني');
  }
};
// ═══ Helpers ═══
function formatCommentDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000); // بالثواني

  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
  
  return date.toLocaleDateString('ar-EG', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function escapeHtmlC(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
