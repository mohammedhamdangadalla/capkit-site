// ═══ Admin Page — Reports Management ═══

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

  // 3) Load reports
  await loadAllData();

  showState('content');
  renderReports();
  setupFilterTabs();
}

// ═══ Load All Data ═══
async function loadAllData() {
  try {
    // Reports
    const { data: reports, error } = await window.supabaseClient
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    allReports = reports || [];

    if (allReports.length === 0) return;

    // Comment IDs
    const commentIds = [...new Set(allReports.map(r => r.comment_id).filter(Boolean))];

    // Comments
    if (commentIds.length > 0) {
      const { data: comments } = await window.supabaseClient
        .from('comments')
        .select('id, content, user_id, product_id, service_id, status')
        .in('id', commentIds);

      (comments || []).forEach(c => commentsMap[c.id] = c);
    }

    // User IDs (reporters + comment authors)
    const userIds = new Set();
    allReports.forEach(r => r.reporter_id && userIds.add(r.reporter_id));
    Object.values(commentsMap).forEach(c => c.user_id && userIds.add(c.user_id));

    if (userIds.size > 0) {
      const { data: profiles } = await window.supabaseClient
        .from('profiles')
        .select('id, full_name')
        .in('id', [...userIds]);

      (profiles || []).forEach(p => profilesMap[p.id] = p);
    }

    // Product/Service titles
    const prodIds = new Set();
    const servIds = new Set();
    Object.values(commentsMap).forEach(c => {
      if (c.product_id) prodIds.add(c.product_id);
      if (c.service_id) servIds.add(c.service_id);
    });

    if (prodIds.size > 0) {
      const { data: prods } = await window.supabaseClient
        .from('products')
        .select('id, title')
        .in('id', [...prodIds]);
      (prods || []).forEach(p => itemsMap['p_' + p.id] = p);
    }

    if (servIds.size > 0) {
      const { data: servs } = await window.supabaseClient
        .from('services')
        .select('id, title')
        .in('id', [...servIds]);
      (servs || []).forEach(s => itemsMap['s_' + s.id] = s);
    }

    // Update stats
    updateStats();

  } catch (err) {
    console.error('Load error:', err);
  }
}

// ═══ Update Stats ═══
function updateStats() {
  document.getElementById('statTotal').textContent = allReports.length;
  document.getElementById('statPending').textContent = allReports.filter(r => (r.status || 'pending') === 'pending').length;
  document.getElementById('statReviewed').textContent = allReports.filter(r => r.status === 'reviewed').length;
  document.getElementById('statDismissed').textContent = allReports.filter(r => r.status === 'dismissed').length;
}

// ═══ Setup Filter Tabs ═══
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

// ═══ Render Reports ═══
function renderReports() {
  const container = document.getElementById('reportsList');

  // Filter
  let filtered = allReports;
  if (currentFilter !== 'all') {
    filtered = allReports.filter(r => (r.status || 'pending') === currentFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="state-message">
        <div class="state-icon">✨</div>
        <div class="state-title">${currentFilter === 'all' ? 'مفيش إبلاغات' : 'مفيش إبلاغات في القسم ده'}</div>
        <div class="state-desc">${currentFilter === 'all' ? 'كل حاجة تمام!' : 'جرّب قسم تاني'}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  filtered.forEach(report => {
    container.appendChild(renderReportCard(report));
  });
}

// ═══ Render Report Card ═══
function renderReportCard(report) {
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

  // الرابط للمنتج/الخدمة
  let itemLink = '';
  let itemTitle = '';
  if (comment?.product_id) {
    itemLink = `product?id=${comment.product_id}`;
    itemTitle = itemsMap['p_' + comment.product_id]?.title || 'منتج';
  } else if (comment?.service_id) {
    itemLink = `service?id=${comment.service_id}`;
    itemTitle = itemsMap['s_' + comment.service_id]?.title || 'خدمة';
  }

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
        <div class="report-comment-author">
          <span>👤</span>
          <span>${escapeHtmlA(authorName)}</span>
        </div>
        <div class="report-comment-content">"${escapeHtmlA(comment.content)}"</div>
      ` : `
        <div class="report-comment-content" style="color: var(--text-muted); font-style: italic;">
          التعليق اتحذف بالفعل
        </div>
      `}
    </div>

    <div class="report-meta">
      <span>📩 المُبلِّغ: <strong style="color: var(--text-secondary);">${escapeHtmlA(reporterName)}</strong></span>
      ${itemTitle ? `<span>📦 على: <strong style="color: var(--text-secondary);">${escapeHtmlA(itemTitle)}</strong></span>` : ''}
    </div>

    <div class="report-actions">
      ${comment && itemLink ? `
        <a href="${itemLink}" target="_blank" class="btn-report-action btn-view-item">
          👁️ عرض المنتج/الخدمة
        </a>
      ` : ''}
      
      ${status !== 'reviewed' && status !== 'dismissed' ? `
        <button class="btn-report-action btn-mark-reviewed" onclick="markReviewed('${report.id}')">
          ✅ تمت المراجعة
        </button>
        <button class="btn-report-action btn-dismiss" onclick="markDismissed('${report.id}')">
          🚫 رفض الإبلاغ
        </button>
      ` : ''}
      
      ${comment ? `
        <button class="btn-report-action btn-delete-comment" onclick="deleteReportedComment('${report.id}', '${comment.id}')">
          🗑️ حذف التعليق
        </button>
      ` : ''}
    </div>
  `;

  return card;
}

// ═══ Mark as Reviewed ═══
window.markReviewed = async function(reportId) {
  if (!confirm('تأكيد المراجعة؟')) return;

  try {
    const { error } = await window.supabaseClient
      .from('reports')
      .update({
        status: 'reviewed',
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (error) throw error;

    // Update locally
    const r = allReports.find(x => x.id === reportId);
    if (r) r.status = 'reviewed';

    updateStats();
    renderReports();

  } catch (err) {
    console.error('Update error:', err);
    alert('❌ فشل التحديث');
  }
};

// ═══ Mark as Dismissed ═══
window.markDismissed = async function(reportId) {
  if (!confirm('تأكيد رفض الإبلاغ؟')) return;

  try {
    const { error } = await window.supabaseClient
      .from('reports')
      .update({
        status: 'dismissed',
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', reportId);

    if (error) throw error;

    const r = allReports.find(x => x.id === reportId);
    if (r) r.status = 'dismissed';

    updateStats();
    renderReports();

  } catch (err) {
    console.error('Update error:', err);
    alert('❌ فشل التحديث');
  }
};

// ═══ Delete Comment ═══
window.deleteReportedComment = async function(reportId, commentId) {
  if (!confirm('⚠️ تأكيد حذف التعليق نهائياً؟')) return;

  try {
    // 1) Delete comment
    const { error: delErr } = await window.supabaseClient
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (delErr) throw delErr;

    // 2) Mark report as reviewed
    await window.supabaseClient
      .from('reports')
      .update({
        status: 'reviewed',
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', reportId);

    // 3) Update locally
    delete commentsMap[commentId];
    const r = allReports.find(x => x.id === reportId);
    if (r) r.status = 'reviewed';

    updateStats();
    renderReports();

    alert('✅ تم حذف التعليق');

  } catch (err) {
    console.error('Delete error:', err);
    alert('❌ فشل الحذف');
  }
};

// ═══ State Switcher ═══
function showState(state) {
  ['loadingState', 'notLoggedState', 'notAdminState', 'adminContent'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });

  const map = {
    'loading': 'loadingState',
    'notLogged': 'notLoggedState',
    'notAdmin': 'notAdminState',
    'content': 'adminContent'
  };

  document.getElementById(map[state]).style.display = 'block';
}

// ═══ Helpers ═══
function escapeHtmlA(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══ Start ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdmin);
} else {
  initAdmin();
}
