// ═══ بطاقة التعريف العامة ═══
// تقرأ البيانات من window.__PRERENDER__ (الصفحة المولّدة) أو تجلبها من
// public_profiles عند فتح الصفحة مباشرة. لا تستخدم Supabase SDK — طلب fetch واحد.
//
// كل النصوص تُهرَّب قبل الحقن، وكل الروابط تُفحص (http/https فقط) لمنع XSS.

(function () {
  'use strict';

  const ROLE_LABELS = {
    vendor: 'ورشة / تاجر',
    freelancer: 'مهندس / فني',
    buyer: 'عضو',
    admin: 'إدارة Capkitco'
  };

  // الترتيب هنا هو ترتيب الظهور، والمفتاح هو اسم الحقل داخل social_links
  const SOCIALS = [
    { key: 'instagram', label: 'إنستجرام', icon: '📸', base: 'https://instagram.com/' },
    { key: 'facebook', label: 'فيسبوك', icon: '📘', base: 'https://facebook.com/' },
    { key: 'linkedin', label: 'لينكد إن', icon: '💼', base: 'https://linkedin.com/in/' },
    { key: 'x', label: 'X', icon: '✖️', base: 'https://x.com/' },
    { key: 'twitter', label: 'تويتر', icon: '✖️', base: 'https://x.com/' },
    { key: 'tiktok', label: 'تيك توك', icon: '🎵', base: 'https://tiktok.com/@' },
    { key: 'youtube', label: 'يوتيوب', icon: '▶️', base: 'https://youtube.com/@' },
    { key: 'github', label: 'GitHub', icon: '🐙', base: 'https://github.com/' },
    { key: 'behance', label: 'بيهانس', icon: '🎨', base: 'https://behance.net/' }
  ];

  const cfg = window.CARD_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  // ───────────── أدوات ─────────────

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** يقبل روابط http/https فقط، ويعيد null لما عداها */
  function safeHttpUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value).trim(), location.origin);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  /** يحوّل رقماً محلياً (010...) إلى صيغة دولية لواتساب — مصر افتراضياً */
  function normalizeWhatsapp(value) {
    let d = String(value || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '20' + d.slice(1);
    return d.length >= 8 ? d : '';
  }

  function socialHref(base, value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return null;

    const direct = safeHttpUrl(raw);
    if (direct) return direct;

    // اسم مستخدم فقط: نزيل @ والمسافات ونرمّز
    const handle = raw.replace(/^@+/, '').replace(/[^\w.\-]/g, '');
    return handle ? base + encodeURIComponent(handle) : null;
  }

  function usernameFromLocation() {
    const fromPath = location.pathname.match(/\/u\/([a-z0-9_]{3,30})\/?$/i);
    if (fromPath) return fromPath[1].toLowerCase();
    const fromQuery = new URLSearchParams(location.search).get('u');
    return fromQuery ? fromQuery.toLowerCase() : null;
  }

  async function fetchByUsername(username) {
    if (!cfg.supabaseUrl || !cfg.supabaseKey) throw new Error('CARD_CONFIG ناقص');
    const url =
      `${cfg.supabaseUrl}/rest/v1/public_profiles` +
      `?select=*&username=eq.${encodeURIComponent(username)}&limit=1`;

    const res = await fetch(url, {
      headers: { apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` }
    });
    if (!res.ok) throw new Error(`profiles: HTTP ${res.status}`);
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  // ───────────── العرض ─────────────

  function renderAvatar(profile, name) {
    const box = $('cardAvatar');
    const imgUrl = safeHttpUrl(profile.avatar_url);

    if (imgUrl) {
      const img = document.createElement('img');
      img.src = imgUrl;
      img.alt = name;
      img.width = 116;
      img.height = 116;
      img.loading = 'eager';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        box.innerHTML = `<span id="cardInitial">${esc((name || '•').trim().charAt(0))}</span>`;
      });
      box.innerHTML = '';
      box.appendChild(img);
      return;
    }

    box.innerHTML = `<span id="cardInitial">${esc((name || '•').trim().charAt(0))}</span>`;
  }

  function renderSocials(links) {
    const box = $('cardSocials');
    box.innerHTML = '';
    if (!links || typeof links !== 'object') return;

    for (const network of SOCIALS) {
      const value = links[network.key];
      if (!value) continue;
      const href = socialHref(network.base, value);
      if (!href) continue;

      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      a.innerHTML = `<span aria-hidden="true">${network.icon}</span><span>${esc(network.label)}</span>`;
      box.appendChild(a);
    }

    if (!box.children.length) box.style.display = 'none';
  }

  function renderWhatsapp(profile, name) {
    const btn = $('cardWhatsapp');
    const digits = normalizeWhatsapp(profile.whatsapp);

    if (!digits) {
      btn.hidden = true;
      return;
    }

    const text = encodeURIComponent(`مرحباً ${name}، وجدت بطاقتك على Capkitco وأرغب في التواصل.`);
    btn.href = `https://wa.me/${digits}?text=${text}`;
    btn.hidden = false;
  }

  function renderShare(profile, name) {
    const btn = $('cardShare');
    const shareUrl = location.href;
    const shareTitle = `${name} — Capkitco`;

    btn.addEventListener('click', async () => {
      const payload = {
        title: shareTitle,
        text: `${name} على Capkitco`,
        url: shareUrl
      };

      try {
        if (navigator.share) {
          await navigator.share(payload);
          return;
        }
        await navigator.clipboard.writeText(shareUrl);
        const original = btn.innerHTML;
        btn.innerHTML = '<span>✅</span><span>تم نسخ الرابط</span>';
        setTimeout(() => { btn.innerHTML = original; }, 1800);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.warn('Share failed:', err);
      }
    });
  }

  function render(profile) {
    const name = profile.full_name || profile.username || 'عضو Capkitco';

    $('cardName').textContent = name;

    const role = ROLE_LABELS[profile.role] || '';
    $('cardRole').textContent = role;
    $('cardRole').hidden = !role;

    const metaParts = [];
    if (profile.city) metaParts.push(`📍 ${esc(profile.city)}`);
    if (profile.verified) metaParts.push('<span class="verified">✓ موثّق</span>');
    $('cardMeta').innerHTML = metaParts.join('<span>·</span>');
    $('cardMeta').hidden = metaParts.length === 0;

    const bio = (profile.bio || '').trim();
    $('cardBio').textContent = bio;
    $('cardBio').hidden = !bio;

    renderAvatar(profile, name);
    renderSocials(profile.social_links);
    renderWhatsapp(profile, name);
    renderShare(profile, name);

    $('cardLoading').hidden = true;
    $('cardContent').style.display = 'block';
  }

  function showNotFound() {
    $('cardLoading').hidden = true;
    $('cardNotFound').classList.add('show');
  }

  // ───────────── التشغيل ─────────────

  (async function init() {
    const pre = window.__PRERENDER__;

    if (pre && pre.type === 'profile' && pre.data) {
      render(pre.data);
      return;
    }

    const username = usernameFromLocation();
    if (!username) {
      showNotFound();
      return;
    }

    try {
      const profile = await fetchByUsername(username);
      if (!profile) {
        showNotFound();
        return;
      }
      render(profile);
      document.title = `${profile.full_name || profile.username} — Capkitco`;
    } catch (err) {
      console.warn('Card load failed:', err);
      showNotFound();
    }
  })();
})();
