// ═══════════════════════════════════════════════════════════════════════
// print-book.js — وضع «الكتاب» للطباعة الورقية
// ═══════════════════════════════════════════════════════════════════════
// الاستخدام:
//   /issue/05/          → عرض عادي + زر «طباعة ككتاب»
//   /issue/05/?print=1  → غلاف مستقل + فهرس بأرقام صفحات + ترقيم تذييل
//
// يعتمد على Paged.js (من jsDelivr، مسموح في CSP) لترقيم الصفحات.
// إن فشل تحميله: يبقى التنسيق الطباعي العادي (فواصل + غلاف) بلا أرقام.
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var PAGED_SRC = 'https://cdn.jsdelivr.net/npm/pagedjs@0.4.3/dist/paged.polyfill.js';

  var params = new URLSearchParams(location.search);
  var bookMode = params.get('print') === '1' || location.hash === '#print';

  /* ─────────── زر الدخول إلى وضع الكتاب ─────────── */

  function addButton() {
    var bar = document.querySelector('.mag-top');
    if (!bar || bar.querySelector('.print-book-link')) return;

    var link = document.createElement('a');
    link.className = 'mag-btn print-book-link';
    link.textContent = '🖨 طباعة ككتاب';

    var url = new URL(location.href);
    url.searchParams.set('print', '1');
    link.href = url.toString();

    var spacer = bar.querySelector('.spacer');
    bar.insertBefore(link, spacer || null);
  }

  /* ─────────── غلاف مستقل ─────────── */

  function buildCover() {
    var payload = window.__ISSUE__ || {};
    var issue = payload.issue;
    if (!issue || !issue.title) return false;
    if (document.querySelector('.print-cover')) return true;

    var el = document.createElement('section');
    el.className = 'print-cover';

    var html = '';
    if (issue.cover_image) {
      html += '<img src="' + issue.cover_image + '" alt="">';
    }
    html += '<div class="pc-overlay">';
    if (issue.issue_number) {
      html += '<div class="pc-num">العدد ' + issue.issue_number + '</div>';
    }
    html += '<h1 class="pc-title">' + issue.title + '</h1>';
    if (issue.description) {
      html += '<div class="pc-sub">' + issue.description + '</div>';
    }
    html += '<div class="pc-brand">CapKitco — المجلة الهندسية</div>';
    html += '</div>';

    el.innerHTML = html;
    document.body.insertBefore(el, document.body.firstChild);
    return true;
  }


  /* ─────────── زر تحميل PDF (إن وُجد ملف العدد) ─────────── */

  function addPdfButton() {
    var bar = document.querySelector('.mag-top');
    if (!bar || bar.querySelector('.pdf-download-link')) return;

    var issue = window.__ISSUE__ && window.__ISSUE__.issue;
    if (!issue || !issue.issue_number) return;

    var nn = String(issue.issue_number).padStart(2, '0');
    var url = '/marketing/pdf/issue-' + nn + '.pdf';

    fetch(url, { method: 'HEAD' })
      .then(function (r) {
        if (!r.ok) return;
        var a = document.createElement('a');
        a.className = 'mag-btn pdf-download-link';
        a.href = url;
        a.setAttribute('download', '');
        a.textContent = '⬇ تحميل PDF';
        a.addEventListener('click', function () {
          if (window.ckTrack) window.ckTrack('pdf_download', { slug: nn });
        });
        bar.insertBefore(a, bar.querySelector('.spacer') || null);
      })
      .catch(function () {});
  }

  function tryPdfButton() {
    var tries = 0;
    var t = setInterval(function () {
      tries += 1;
      if (window.__ISSUE__ && window.__ISSUE__.issue) {
        clearInterval(t);
        addPdfButton();
      } else if (tries > 30) {
        clearInterval(t);
      }
    }, 200);
  }

  /* ─────────── تحميل Paged.js بعد جهوزية المحتوى ─────────── */

  function contentReady() {
    return document.querySelectorAll('#tocList li').length > 0;
  }

  function loadPaged() {
    if (document.querySelector('script[data-paged]')) return;

    var s = document.createElement('script');
    s.src = PAGED_SRC;
    s.dataset.paged = '1';
    s.onerror = function () {
      console.warn('[print-book] تعذّر تحميل Paged.js — سيُطبع بدون أرقام صفحات');
      document.documentElement.classList.add('print-fallback');
    };
    document.head.appendChild(s);
  }

  function waitThenPrint() {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (contentReady() || tries >= 30) {
        clearInterval(timer);
        loadPaged();
      }
    }, 200);
  }

  function start() {
    document.documentElement.classList.add('print-mode');
    if (window.ckTrack) window.ckTrack('print_book', { slug: (window.__ISSUE__ && window.__ISSUE__.issue && String(window.__ISSUE__.issue.issue_number).padStart(2, '0')) || null });
    addPdfButton();
    if (!buildCover()) {
      console.warn('[print-book] لا توجد بيانات عدد — سيُطبع بدون غلاف');
    }
    waitThenPrint();
  }

  /* ─────────── التشغيل ─────────── */

  if (!bookMode) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', addButton);
    } else {
      addButton();
    }
    tryPdfButton();
    return;
  }

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
})();
