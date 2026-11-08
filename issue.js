// ═══ قراءة عدد من المجلة ═══
// بلا SDK في التحميل الأول. يُحمَّل Supabase عند الحاجة فقط (إضافة تعليق).

(function () {
  'use strict';

  const cfg = window.MAG_CONFIG || {};
  const state = { issue: null, articles: [], client: null };

  const $ = (id) => document.getElementById(id);

  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const fmtDate = (d) => {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return ''; }
  };

  function headers() {
    return { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` };
  }

  async function api(path) {
    const res = await fetch(`${cfg.supabaseUrl}${path}`, { headers: headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ─────────── معرّف العدد ─────────── */

  function issueId() {
    const q = new URLSearchParams(location.search).get('id');
    if (q) return q;
    const m = location.pathname.match(/\/issue\/([0-9a-f-]{36})\/?$/i);
    return m ? m[1] : null;
  }

  /* ─────────── العرض ─────────── */

  function renderIssue(issue, articles) {
    document.title = `العدد ${issue.issue_number} — ${issue.title} | Capkitco`;
    const desc = (issue.description || '').slice(0, 160);
    document.querySelector('meta[name="description"]')?.setAttribute('content', desc || issue.title);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', `العدد ${issue.issue_number} — ${issue.title}`);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc || issue.title);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', `https://capkitco.com/issue.html?id=${issue.id}`);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://capkitco.com/issue.html?id=${issue.id}`);
    if (issue.cover_image) {
      document.querySelector('meta[property="og:image"]')?.setAttribute('content', issue.cover_image);
    }

    // الفهرس
    $('tocList').innerHTML = articles.map((a) => `
      <li><a href="#a-${a.id}" data-target="a-${a.id}">${esc(a.title)}</a></li>`).join('');

    // الغلاف والعنوان
    const head = `
      <header class="issue-head">
        ${issue.cover_image ? `<img src="${esc(issue.cover_image)}" alt="غلاف العدد ${esc(issue.issue_number)}" style="border-radius:12px; margin-bottom:18px; max-height:420px; object-fit:cover;" loading="eager" decoding="async">` : ''}
        <div class="num">العدد ${esc(issue.issue_number)}</div>
        <h1>${esc(issue.title)}</h1>
        ${issue.publish_date ? `<div class="date">${esc(fmtDate(issue.publish_date))}</div>` : ''}
        ${issue.description ? `<p class="lead">${esc(issue.description)}</p>` : ''}
      </header>`;

    // المقالات
    const body = articles.map((a) => `
      <section class="article" id="a-${a.id}" data-article-id="${a.id}">
        ${a.category ? `<span class="cat">${esc(a.category)}</span>` : ''}
        <h2>${esc(a.title)}</h2>
        ${a.summary ? `<p class="summary">${esc(a.summary)}</p>` : ''}
        ${a.content_html ? `<div class="prose">${a.content_html}</div>` : ''}
        ${a.technical_details_html ? `
          <details class="tech">
            <summary>اقرأ التفاصيل الفنية العميقة…</summary>
            <div class="tech-body prose">${a.technical_details_html}</div>
          </details>` : ''}
        ${a.citations ? `
          <div class="citations">
            <h3>المصادر والمراجع</h3>
            <ol>${a.citations.split('\n').filter(Boolean).map((c) => `<li>${esc(c.replace(/^\s*\d+[.)]\s*/, ''))}</li>`).join('')}</ol>
          </div>` : ''}
        <div class="comments" data-comments-for="${a.id}">
          <button class="mag-btn no-print" type="button" data-load-comments="${a.id}">💬 عرض التعليقات</button>
          <div class="comments-list" id="comments-${a.id}"></div>
        </div>
      </section>`).join('');

    $('issueBody').innerHTML = head + body;
    $('issueLayout').style.display = 'grid';
    $('issueState').style.display = 'none';

    setupTocObserver();
    setupComments();
    injectJsonLd(issue, articles);

    // جاهزية الـprerender مستقبلاً
    window.__ISSUE__ = { issue, articles };
  }

  /* ─────────── الفهرس التفاعلي ─────────── */

  function setupTocObserver() {
    const links = [...document.querySelectorAll('#tocList a')];
    const sections = links.map((l) => document.getElementById(l.dataset.target)).filter(Boolean);
    if (!sections.length || !('IntersectionObserver' in window)) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((l) => l.classList.toggle('active', l.dataset.target === e.target.id));
      });
    }, { rootMargin: '-30% 0px -60% 0px' });

    sections.forEach((s) => io.observe(s));

    links.forEach((l) => l.addEventListener('click', (ev) => {
      ev.preventDefault();
      const target = document.getElementById(l.dataset.target);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState({}, '', `#${l.dataset.target}`);
    }));
  }

  /* ─────────── التعليقات (كسولة) ─────────── */

  function setupComments() {
    document.querySelectorAll('[data-load-comments]').forEach((btn) => {
      btn.addEventListener('click', () => loadComments(btn.dataset.loadComments, btn));
    });
  }

  async function loadComments(articleId, btn) {
    if (btn.dataset.loaded === '1') return;
    btn.disabled = true;
    btn.textContent = '⏳ جارٍ التحميل…';
    try {
      const comments = await api(
        `/rest/v1/article_comments?select=user_id,comment_text,created_at&article_id=eq.${articleId}&is_approved=eq.true&order=created_at.asc&limit=100`,
      );

      let names = {};
      const ids = [...new Set(comments.map((c) => c.user_id).filter(Boolean))];
      if (ids.length) {
        const profiles = await api(
          `/rest/v1/public_profiles?select=id,full_name,username&id=in.(${ids.join(',')})`,
        ).catch(() => []);
        names = Object.fromEntries(profiles.map((p) => [p.id, p.full_name || p.username || 'عضو']));
      }

      const list = document.getElementById(`comments-${articleId}`);
      list.innerHTML = comments.length
        ? comments.map((c) => `
            <div class="comment">
              <span class="who">${esc(names[c.user_id] || 'عضو')}</span>
              <span class="when">${esc(fmtDate(c.created_at))}</span>
              <p>${esc(c.comment_text)}</p>
            </div>`).join('')
        : '<p style="color: var(--ink-muted); font-size:.86rem;">لا تعليقات بعد — كن أول من يشارك.</p>';

      btn.dataset.loaded = '1';
      btn.textContent = '💬 التعليقات';
      btn.after(buildAddComment(articleId));
    } catch (err) {
      console.error(err);
      btn.textContent = 'تعذّر التحميل — أعد المحاولة';
    } finally {
      btn.disabled = false;
    }
  }

  function buildAddComment(articleId) {
    const box = document.createElement('div');
    box.style.marginTop = '12px';
    const btn = document.createElement('button');
    btn.className = 'mag-btn no-print';
    btn.type = 'button';
    btn.textContent = '＋ أضف تعليقاً';
    box.appendChild(btn);

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const client = await ensureSupabase();
        const { data: { session } } = await client.auth.getSession();
        if (!session) {
          location.href = `/auth.html?next=${encodeURIComponent(location.pathname + location.search)}`;
          return;
        }
        btn.remove();

        const area = document.createElement('textarea');
        area.rows = 3;
        area.maxLength = 1000;
        area.placeholder = 'اكتب تعليقك… (يظهر بعد مراجعة الإدارة)';
        area.style.cssText = 'width:100%; padding:10px 12px; border-radius:10px; border:1px solid var(--line); background:var(--paper-2); color:var(--ink); font-family:inherit; font-size:.9rem;';

        const send = document.createElement('button');
        send.className = 'mag-btn gold no-print';
        send.type = 'button';
        send.textContent = 'إرسال';
        send.style.marginTop = '8px';

        send.addEventListener('click', async () => {
          const text = area.value.trim();
          if (text.length < 2) return;
          send.disabled = true;
          send.textContent = 'جارٍ الإرسال…';
          const { error } = await client.from('article_comments').insert({
            article_id: articleId,
            user_id: session.user.id,
            comment_text: text,
          });
          if (error) {
            send.textContent = 'تعذّر الإرسال';
            send.disabled = false;
            return;
          }
          box.innerHTML = '<p style="color: var(--gold); font-size:.86rem;">✅ تم إرسال تعليقك للمراجعة.</p>';
        });

        box.appendChild(area);
        box.appendChild(send);
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = 'تعذّر فتح المحرر';
      }
    });

    return box;
  }

  /** تحميل SDK عند الحاجة فقط */
  function ensureSupabase() {
    if (state.client) return Promise.resolve(state.client);
    if (window.supabase) {
      state.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
      return Promise.resolve(state.client);
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = () => {
        state.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
        resolve(state.client);
      };
      s.onerror = () => reject(new Error('تعذّر تحميل Supabase'));
      document.head.appendChild(s);
    });
  }

  /* ─────────── JSON-LD ─────────── */

  function injectJsonLd(issue, articles) {
    const url = `https://capkitco.com/issue.html?id=${issue.id}`;
    const graph = [
      {
        '@type': 'PublicationIssue',
        '@id': `${url}#issue`,
        issueNumber: String(issue.issue_number),
        name: issue.title,
        datePublished: issue.publish_date || undefined,
        description: issue.description || undefined,
        image: issue.cover_image || 'https://capkitco.com/icon-512.png',
        url,
        isPartOf: { '@type': 'Periodical', name: 'المجلة الهندسية — Capkitco', url: 'https://capkitco.com/magazine.html' },
      },
      ...articles.map((a) => ({
        '@type': 'Article',
        '@id': `${url}#${a.id}`,
        headline: a.title,
        abstract: a.summary || undefined,
        articleSection: a.category || undefined,
        url: `${url}#a-${a.id}`,
        isPartOf: { '@id': `${url}#issue` },
        author: { '@type': 'Organization', name: 'Capkitco' },
        publisher: { '@type': 'Organization', name: 'Capkitco', logo: { '@type': 'ImageObject', url: 'https://capkitco.com/icon-512.png' } },
      })),
    ];
    const el = document.getElementById('issueLd');
    if (el) el.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  }

  /* ─────────── الطباعة ─────────── */

  document.getElementById('printBtn')?.addEventListener('click', () => window.print());
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('details.tech').forEach((d) => { d.dataset.wasOpen = d.open ? '1' : '0'; d.open = true; });
  });
  window.addEventListener('afterprint', () => {
    document.querySelectorAll('details.tech').forEach((d) => { d.open = d.dataset.wasOpen === '1'; });
  });

  /* ─────────── التشغيل ─────────── */

  (async function init() {
    const id = issueId();
    if (!cfg.supabaseUrl || !id) return showError();

    try {
      const issues = await api(`/rest/v1/issues?select=*&id=eq.${id}&is_published=eq.true&limit=1`);
      const issue = issues[0];
      if (!issue) return showError();

      const articles = await api(
        `/rest/v1/articles?select=*&issue_id=eq.${id}&order=order_index.asc`,
      );

      state.issue = issue;
      state.articles = articles;
      renderIssue(issue, articles);
    } catch (err) {
      console.error(err);
      showError();
    }
  })();

  function showError() {
    $('issueState').innerHTML = `
      <div class="mag-state">
        <div class="icon">🔍</div>
        <h2>العدد غير موجود</h2>
        <p>ربما لم يُنشر بعد أو أن الرابط غير صحيح.</p>
        <a class="mag-btn gold" href="/magazine.html" style="margin-top:16px;">كل الأعداد</a>
      </div>`;
  }
})();
