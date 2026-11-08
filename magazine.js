// ═══ أرشيف المجلة ═══
// يقرأ الأعداد المنشورة من public.issues عبر REST (بلا SDK).

(function () {
  'use strict';

  const cfg = window.MAG_CONFIG || {};
  const grid = document.getElementById('issuesGrid');

  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtDate = (d) => {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' }); }
    catch { return ''; }
  };

  function emptyState(title, text) {
    grid.innerHTML = `<div class="mag-state" style="grid-column:1/-1;">
      <div class="icon">📖</div><h2>${esc(title)}</h2><p>${esc(text)}</p>
    </div>`;
  }

  async function load() {
    if (!cfg.supabaseUrl) return emptyState('إعداد ناقص', 'لم يُحمّل magazine-config.js');

    try {
      const url = `${cfg.supabaseUrl}/rest/v1/issues?select=id,issue_number,title,publish_date,cover_image,description&is_published=eq.true&order=issue_number.desc`;
      const res = await fetch(url, {
        headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const issues = await res.json();

      if (!Array.isArray(issues) || issues.length === 0) {
        return emptyState('لم يصدر عدد بعد', 'تابعنا — العدد الأول في الطريق.');
      }

      grid.innerHTML = issues.map((i) => `
        <a class="issue-card" href="/issue.html?id=${encodeURIComponent(i.id)}">
          <div class="cover ${i.cover_image ? '' : 'empty'}">
            ${i.cover_image
              ? `<img src="${esc(i.cover_image)}" alt="غلاف ${esc(i.title)}" loading="lazy" decoding="async" width="600" height="800">`
              : '✦'}
          </div>
          <div class="body">
            <div class="num">العدد ${esc(i.issue_number)}</div>
            <h2>${esc(i.title)}</h2>
            ${i.publish_date ? `<div class="date">${esc(fmtDate(i.publish_date))}</div>` : ''}
            ${i.description ? `<p class="desc">${esc(i.description.slice(0, 90))}${i.description.length > 90 ? '…' : ''}</p>` : ''}
          </div>
        </a>`).join('');
    } catch (err) {
      console.error(err);
      emptyState('تعذّر تحميل الأعداد', 'حاول تحديث الصفحة بعد قليل.');
    }
  }

  load();
})();
