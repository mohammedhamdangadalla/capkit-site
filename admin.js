// ═══ Admin Page — Reports & Moderation Management ═══

let adminUser = null;
let allReports = [];
let profilesMap = {};
let commentsMap = {};
let itemsMap = {};
let currentFilter = 'all';

// ═══ Init ═══
async function initAdmin() {
  if (!window.supabaseClient) {
    showState('loading');
    return;
  }

  // 1) Check login
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  adminUser = session?.user || null;

  if (!adminUser) {
    showState('notLogged');
    return;
  }

  // 2) Check admin role
  const { data: profile } = await window.supabaseClient
    .from('profiles')
    .select('role, full_name')
    .eq('id', adminUser.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    showState('notAdmin');
    return;
  }

  document.getElementById('adminEmail').textContent = adminUser.email || '—';

  // 3) Load Global Stats
  await loadGlobalStats();

  // 4) Load Moderation Queue
  await loadModerationQueue();

  // 5) Load Reports Data
  await loadAllReportsData();

  showState('content');
  renderReports();
  setupFilterTabs();
}

// ═══ Global Stats ═══
async function loadGlobalStats() {
  try {
    const { data: stats, error } = await window.supabaseClient.rpc('get_admin_stats');
    if (error) throw error;
    
    if (stats) {
      document.getElementById('statTotalUsers').textContent = stats.total_users || 0;
      document.getElementById('statNewUsers').textContent = stats.new_users_30d || 0;
      document.getElementById('statSuspendedItems').textContent = stats.suspended_items || 0;
      document.getElementById('statPendingReports').textContent = stats.pending_reports || 0;
    }
  } catch (err) {
    console.error('Stats Load Error:', err);
  }
}

// ═══ Moderation Queue ═══
async function loadModerationQueue() {
  const container = document.getElementById('moderationList');
  try {
    const { data: queue, error } = await window.supabaseClient.rpc('get_moderation_queue');
    if (error) throw error;

    if (!queue || queue.length === 0) {
      container.innerHTML = `
        <div class="state-message">
          <div class="state-icon">✨</div>
          <div class="state-title">لا يوجد محتوى معلق أو منتظر</div>
          <div class="state-desc">كل المحتوى آمن ومتوافق مع الشروط.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    queue.forEach(item => {
      container.appendChild(renderModerationCard(item));
    });

  } catch (err) {
    console.error('Moderation Load Error:', err);
    container.innerHTML = `<div class="state-message" style="color: red;">خطأ في جلب المحتوى: ${err.message}</div>`;
  }
}

function renderModerationCard(item) {
  const card = document.createElement('div');
  card.className = 'report-card';

  const date = new Date(item.created_at).toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'short', day: 'numeric'
  });

  const typeNames = {
    'product': '📦 منتج',
    'service': '🛠️ خدمة',
    'workshop': '🏭 ورشة',
    'freelancer': '👤 فري لانسر'
  };

  const statusMap = {
    'suspended': { text: '⛔ معلق', class: 'status-suspended' },
    'pending_review': { text: '⏳ قيد المراجعة', class: 'status-pending' }
  };
  const statusInfo = statusMap[item.moderation_status] || statusMap.suspended;

  card.innerHTML = `
    <div class="report-header">
      <div style="display: flex; gap: 8px;">
        <span class="report-reason" style="background: rgba(201, 169, 97, 0.1); border-color: rgba(201, 169, 97, 0.3); color: var(--gold);">${typeNames[item.content_type]}</span>
        <span class="report-status ${statusInfo.class}">${statusInfo.text}</span>
      </div>
      <span class="report-date">${date}</span>
    </div>

    <div class="report-comment-box">
      <div class="report-comment-label">بيانات المحتوى</div>
      <div class="report-comment-author">
        <span>👤</span> <span>${escapeHtmlA(item.owner_name)}</span>
      </div>
      <div class="report-comment-content" style="font-size: 1rem; font-weight: bold; margin-bottom: 8px;">
        "${escapeHtmlA(item.title)}"
      </div>
      
      ${item.suspension_reason ? `
        <div style="background: rgba(239, 68, 68, 0.05); border-right: 3px solid #ef4444; padding: 10px; margin-top: 10px; border-radius: 4px;">
          <strong style="color: #fca5a5; font-size: 0.8rem;">سبب التعليق:</strong>
          <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px;">${escapeHtmlA(item.suspension_reason)}</div>
        </div>
      ` : ''}

      ${item.recommendation ? `
        <div style="background: rgba(34, 197, 94, 0.05); border-right: 3px solid #22c55e; padding: 10px; margin-top: 8px; border-radius: 4px;">
          <strong style="color: #86efac; font-size: 0.8rem;">التوصية للبائع:</strong>
          <div style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 4px;">${escapeHtmlA(item.recommendation)}</div>
        </div>
      ` : ''}
    </div>

    <div class="report-actions">
      <button class="btn-report-action btn-mark-reviewed" onclick="approveContent('${item.content_type}', '${item.id}')">
        ✅ موافقة / رفع التعليق
      </button>
      <button class="btn-report-action btn-delete-comment" onclick="suspendContent('${item.content_type}', '${item.id}')">
        ⛔ تعليق / تعديل السبب
      </button>
      <button class="btn-report-action btn-delete-comment" onclick="deleteContentPermanently('${item.content_type}', '${item.id}')">
  🗑️ حذف نهائي
</button>
    </div>
  `;
  return card;
}

// Moderation Actions
window.approveContent = async function(type, id) {
  if (!confirm('هل أنت متأكد من الموافقة على هذا المحتوى؟ سيظهر للعامة فوراً.')) return;
  try {
    const { error } = await window.supabaseClient.rpc('approve_content', { 
      p_content_type: type, p_content_id: id 
    });
    if (error) throw error;
    alert('✅ تمت الموافقة بنجاح');
    await initAdmin(); // Refresh everything
  } catch (err) { alert('❌ خطأ: ' + err.message); }
};

window.suspendContent = async function(type, id) {
  const reason = prompt('اكتب سبب التعليق (إجباري - سيظهر للبائع):');
  if (!reason) return;
  const rec = prompt('اكتب توصية للتحسين (اختياري):');
  
  try {
    const { error } = await window.supabaseClient.rpc('suspend_content', { 
      p_content_type: type, 
      p_content_id: id,
      p_reason: reason,
      p_recommendation: rec || null
    });
    if (error) throw error;
    alert('⛔ تم تعليق المحتوى بنجاح');
    await initAdmin(); // Refresh everything
  } catch (err) { alert('❌ خطأ: ' + err.message); }
  // ═══ دالة الحذف النهائي للمحتوى ═══
window.deleteContentPermanently = async function(type, id) {
  if (!confirm('⚠️ هل أنت متأكد من الحذف النهائي؟ لا يمكن التراجع عن هذه الخطوة!')) return;
  
  // تحديد اسم الجدول بناءً على نوع المحتوى
  const table = type === 'product' ? 'products' : 
                (type === 'service' ? 'services' : 
                (type === 'workshop' ? 'workshops' : 'freelancers'));
  
  try {
    // تنفيذ أمر الحذف في قاعدة البيانات
    const { error } = await window.supabaseClient
      .from(table)
      .delete()
      .eq('id', id);

    if (error) throw error;
    
    alert('🗑️ تم حذف المحتوى نهائياً بنجاح');
    
    // إعادة تحميل لوحة التحكم لتحديث القائمة والإحصائيات
    await initAdmin(); 
    
  } catch (err) {
    console.error('Delete Error:', err);
    alert('❌ فشل الحذف: ' + err.message);
  }
};
};

// ═══ Main Tabs Switcher ═══
window.switchMainTab = function(tabName) {
  document.querySelectorAll('.main-nav-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  if (tabName === 'reports') {
    document.getElementById('reportsSection').style.display = 'block';
    document.getElementById('moderationSection').style.display = 'none';
  } else {
    document.getElementById('reportsSection').style.display = 'none';
    document.getElementById('moderationSection').style.display = 'block';
  }
};

// ═══ Load All Reports Data (Existing Logic) ═══
async function loadAllReportsData() {
  try {
    const { data: reports, error } = await window.supabaseClient
      .from('reports').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    allReports = reports || [];
    if (allReports.length === 0) return;

    const commentIds = [...new Set(allReports.map(r => r.comment_id).filter(Boolean))];
    if (commentIds.length > 0) {
      const { data: comments } = await window.supabaseClient
        .from('comments').select('id, content, user_id, product_id, service_id, status').in('id', commentIds);
      (comments || []).forEach(c => commentsMap[c.id] = c);
    }

    const userIds = new Set();
    allReports.forEach(r => r.reporter_id && userIds.add(r.reporter_id));
    Object.values(commentsMap).forEach(c => c.user_id && userIds.add(c.user_id));

    if (userIds.size > 0) {
      const { data: profiles } = await window.supabaseClient.from('profiles').select('id, full_name').in('id', [...userIds]);
      (profiles || []).forEach(p => profilesMap[p.id] = p);
    }

    const prodIds = new Set();
    const servIds = new Set();
    Object.values(commentsMap).forEach(c => {
      if (c.product_id) prodIds.add(c.product_id);
      if (c.service_id) servIds.add(c.service_id);
    });

    if (prodIds.size > 0) {
      const { data: prods } = await window.supabaseClient.from('products').select('id, title').in('id', [...prodIds]);
      (prods || []).forEach(p => itemsMap['p_' + p.id] = p);
    }
    if (servIds.size > 0) {
      const { data: servs } = await window.supabaseClient.from('services').select('id, title').in('id', [...servIds]);
      (servs || []).forEach(s => itemsMap['s_' + s.id] = s);
    }
  } catch (err) {
    console.error('Reports Load error:', err);
  }
}

// ═══ Existing Report Functions (Updated to use initAdmin for refresh) ═══
window.markReviewed = async function(reportId) {
  if (!confirm('تأكيد المراجعة؟')) return;
  try {
    await window.supabaseClient.from('reports').update({
      status: 'reviewed', reviewed_by: adminUser.id, reviewed_at: new Date().toISOString()
    }).eq('id', reportId);
    await initAdmin();
  } catch (err) { alert('❌ فشل التحديث'); }
};

window.markDismissed = async function(reportId) {
  if (!confirm('تأكيد رفض الإبلاغ؟')) return;
  try {
    await window.supabaseClient.from('reports').update({
      status: 'dismissed', reviewed_by: adminUser.id, reviewed_at: new Date().toISOString()
    }).eq('id', reportId);
    await initAdmin();
  } catch (err) { alert('❌ فشل التحديث'); }
};

window.deleteReportedComment = async function(reportId, commentId) {
  if (!confirm('⚠️ تأكيد حذف التعليق نهائياً؟')) return;
  try {
    await window.supabaseClient.from('comments').delete().eq('id', commentId);
    await window.supabaseClient.from('reports').update({
      status: 'reviewed', reviewed_by: adminUser.id, reviewed_at: new Date().toISOString()
    }).eq('id', reportId);
    await initAdmin();
    alert('✅ تم حذف التعليق');
  } catch (err) { alert('❌ فشل الحذف'); }
};

// ═══ Render Reports (Existing) ═══
function renderReports() {
  const container = document.getElementById('reportsList');
  let filtered = currentFilter !== 'all' ? allReports.filter(r => (r.status || 'pending') === currentFilter) : allReports;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="state-message"><div class="state-icon">✨</div><div class="state-title">مفيش إبلاغات</div></div>`;
    return;
  }

  container.innerHTML = '';
  filtered.forEach(report => {
    const card = document.createElement('div');
    card.className = 'report-card';
    const comment = commentsMap[report.comment_id];
    const reporterName = profilesMap[report.reporter_id]?.full_name || 'مستخدم';
    const authorName = comment ? (profilesMap[comment.user_id]?.full_name || 'مستخدم') : '—';
    const status = report.status || 'pending';

    const statusMap = {
      'pending': { text: '⏳ قيد المراجعة', class: 'status-pending' },
      'reviewed': { text: '✅ تمت المراجعة', class: 'status-reviewed' },
      'dismissed': { text: '🗑️ مرفوض', class: 'status-dismissed' }
    };
    const statusInfo = statusMap[status] || statusMap.pending;

    const date = new Date(report.created_at).toLocaleDateString('ar-EG', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    let itemLink = ''; let itemTitle = '';
    if (comment?.product_id) { itemLink = `product?id=${comment.product_id}`; itemTitle = itemsMap['p_' + comment.product_id]?.title || 'منتج'; } 
    else if (comment?.service_id) { itemLink = `service?id=${comment.service_id}`; itemTitle = itemsMap['s_' + comment.service_id]?.title || 'خدمة'; }

    card.innerHTML = `
      <div class="report-header">
        <span class="report-reason">⚠️ ${escapeHtmlA(report.reason || 'بدون سبب')}</span>
        <div style="display: flex; gap: 10px; align-items: center;">
          <span class="report-status ${statusInfo.class}">${statusInfo.text}</span>
          <span class="report-date">${date}</span>
        </div>
      </div>
      <div class="report-comment-box">
        <div class="report-comment-label">التعليق المُبلَّغ عنه</div>
        ${comment ? `
          <div class="report-comment-author"><span>👤</span><span>${escapeHtmlA(authorName)}</span></div>
          <div class="report-comment-content">"${escapeHtmlA(comment.content)}"</div>
        ` : `<div class="report-comment-content" style="color: var(--text-muted); font-style: italic;">التعليق اتحذف بالفعل</div>`}
      </div>
      <div class="report-meta">
        <span>📩 المُبلِّغ: <strong style="color: var(--text-secondary);">${escapeHtmlA(reporterName)}</strong></span>
        ${itemTitle ? `<span>📦 على: <strong style="color: var(--text-secondary);">${escapeHtmlA(itemTitle)}</strong></span>` : ''}
      </div>
      <div class="report-actions">
        ${comment && itemLink ? `<a href="${itemLink}" target="_blank" class="btn-report-action btn-view-item">👁️ عرض</a>` : ''}
        ${status !== 'reviewed' && status !== 'dismissed' ? `
          <button class="btn-report-action btn-mark-reviewed" onclick="markReviewed('${report.id}')">✅ تمت المراجعة</button>
          <button class="btn-report-action btn-dismiss" onclick="markDismissed('${report.id}')">🚫 رفض</button>
        ` : ''}
        ${comment ? `<button class="btn-report-action btn-delete-comment" onclick="deleteReportedComment('${report.id}', '${comment.id}')">🗑️ حذف التعليق</button>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

function setupFilterTabs() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.status;
      renderReports();
    });
  });
}

function showState(state) {
  ['loadingState', 'notLoggedState', 'notAdminState', 'adminContent'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  const map = { 'loading': 'loadingState', 'notLogged': 'notLoggedState', 'notAdmin': 'notAdminState', 'content': 'adminContent' };
  document.getElementById(map[state]).style.display = 'block';
}

function escapeHtmlA(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}
