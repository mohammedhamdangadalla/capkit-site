// ═══════════════════════════════════════════════════════════════════════
// analytics.js — تتبّع زيارات المجلة والتحميلات
// ═══════════════════════════════════════════════════════════════════════
// يسجّل في مكانين:
//   1) جدول Supabase (عبر RPC) — لوحة الأرقام في الإدارة.
//   2) GA4 عبر gtag إن كان محمّلاً — تقارير جاهزة.
//
// الاستخدام:
//   ckTrack('issue_view', { slug: '05', id: '...' })
//   يُستدعى تلقائياً من magazine.js وissue.js وbook.js.
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // نفس مشروع Supabase — المفتاح العام (publishable) مقصود هنا
  var SUPA_URL = 'https://dsgbnulewdxxftmrqrrr.supabase.co';
  var SUPA_KEY = 'sb_publishable_-YDp-ImPkEOhA4_cKWOJAA_d_2_wJkP';

  function sessionId() {
    try {
      var k = 'ck.sid';
      var v = localStorage.getItem(k);
      if (!v) {
        v = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(k, v);
      }
      return v.slice(0, 64);
    } catch (e) {
      return null;
    }
  }

  function clean(v, n) {
    if (v == null) return null;
    return String(v).slice(0, n || 120);
  }

  window.ckTrack = function (event, opts) {
    opts = opts || {};
    if (!event) return;

    // 1) GA4
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', event, {
          target_type: clean(opts.type, 30),
          target_slug: clean(opts.slug, 80),
          page_path: clean(location.pathname, 200),
        });
      }
    } catch (e) { /* تجاهل */ }

    // 2) Supabase
    try {
      var payload = {
        p_event: clean(event, 40),
        p_target_type: clean(opts.type, 30),
        p_target_id: clean(opts.id, 60),
        p_target_slug: clean(opts.slug, 80),
        p_path: clean(location.pathname + location.search, 300),
        p_referrer: clean(document.referrer, 300),
        p_session: sessionId(),
      };

      // عبر SDK إن وُجد، وإلا fetch مباشر (الكتاب لا يحمّل SDK)
      if (window.supabaseClient && window.supabaseClient.rpc) {
        window.supabaseClient.rpc('log_analytics_event', payload).then(function () {}, function () {});
        return;
      }

      fetch(SUPA_URL + '/rest/v1/rpc/log_analytics_event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPA_KEY,
          Authorization: 'Bearer ' + SUPA_KEY,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {});
    } catch (e) { /* تجاهل */ }
  };

  // منع التسجيل المكرر في نفس الجلسة لنفس الحدث/الهدف
  var seen = {};
  window.ckTrackOnce = function (event, opts) {
    var key = event + ':' + ((opts && opts.slug) || '');
    if (seen[key]) return;
    seen[key] = 1;
    window.ckTrack(event, opts);
  };
})();
