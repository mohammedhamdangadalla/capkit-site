// ═══ المساحة الاحترافية — صفحة عامة ═══
// تقرأ عبر REST (بلا SDK). جاهزة للـprerender عبر window.__SPACE__.

(function () {
  'use strict';

  const cfg = window.SPACE_CONFIG || {};
  const state = { profile: null, space: null, products: [] };
  const $ = (id) => document.getElementById(id);

  const esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const headers = () => ({ apikey: cfg.supabaseKey, Authorization: `Bearer ${cfg.supabaseKey}` });

  async function api(path) {
    const res = await fetch(cfg.supabaseUrl + path, { headers: headers() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  const waNumber = (raw) =>
    (typeof window.normalizeWhatsApp === 'function' ? window.normalizeWhatsApp(raw) : String(raw || '').replace(/\D/g, ''));

  const waLink = (number, text) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

  const priceText = (p) =>
    p.price == null || p.price === '' ? 'السعر عند الطلب' : `${Number(p.price).toLocaleString('ar-EG')} جنيه`;

  function usernameFromLocation() {
    const q = new URLSearchParams(location.search).get('username');
    if (q) return q.toLowerCase();
    const m = location.pathname.match(/\/space\/([a-z0-9_]{3,30})\/?$/i);
    return m ? m[1].toLowerCase() : null;
  }

  /* ─────────── العرض ─────────── */

  function render() {
    const { space, products, profile } = state;

    document.title = `${space.store_name} — Capkitco`;
    const desc = (space.tagline || space.about_text || '').slice(0, 160);
    const url = `${location.origin}/space/${profile.username}/`;

    document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${space.store_name} — Capkitco`);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', desc);
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', url);
    if (space.cover_url) document.querySelector('meta[property="og:image"]')?.setAttribute('content', space.cover_url);

    // الغلاف: <img> بدل background-image (ليمكن اكتشاف فشل التحميل)
    if (space.cover_url) {
      const coverImg = document.createElement('img');
      coverImg.src = optimizeImage(space.cover_url, 1600);
      coverImg.alt = '';
      coverImg.referrerPolicy = 'no-referrer';
      coverImg.addEventListener('error', () => {
        console.error('[space] cover failed:', space.cover_url);
        coverImg.remove();
      });
      $('spCover').appendChild(coverImg);
    }

    // الشعار: صورة وإلا الحرف الأول، مع fallback عند الفشل
    const logoBox = $('spLogo');
    const initial = (space.store_name || '•').trim().charAt(0);
    if (space.logo_url) {
      const logoImg = document.createElement('img');
      logoImg.src = optimizeImage(space.logo_url, 400);
      logoImg.alt = space.store_name;
      logoImg.referrerPolicy = 'no-referrer';
      logoImg.addEventListener('error', () => {
        console.error('[space] logo failed:', space.logo_url);
        logoBox.innerHTML = '';
        logoBox.textContent = initial;
      });
      logoBox.innerHTML = '';
      logoBox.appendChild(logoImg);
    } else {
      logoBox.textContent = initial;
    }

    $('spName').textContent = space.store_name;
    $('spTagline').textContent = space.tagline || '';
    $('spTagline').hidden = !space.tagline;
    $('spAbout').textContent = space.about_text || '';
    $('spAbout').hidden = !space.about_text;

    const number = waNumber(space.contact_whatsapp || space.contact_phone);
    $('spActions').innerHTML = [
      number
        ? `<a class="sp-btn wa" target="_blank" rel="noopener" href="${waLink(number, `مرحباً، وجدت مساحة «${space.store_name}» على Capkitco وأرغب في الاستفسار.`)}">💬 تواصل على واتساب</a>`
        : '',
      space.contact_phone
        ? `<a class="sp-btn ghost" href="tel:${esc(space.contact_phone.replace(/[^\d+]/g, ''))}">📞 اتصال</a>`
        : '',
      `<a class="sp-btn ghost" href="/">تصفح Capkitco</a>`,
    ].filter(Boolean).join('');

    // المنتجات
    $('spProductsCount').textContent = products.length ? `${products.length} منتج` : '';

    if (!products.length) {
      $('spGrid').innerHTML = `
        <div class="sp-state" style="grid-column:1/-1;">
          <div class="icon">📦</div><h2>لا منتجات بعد</h2>
          <p>تابع المساحة — ستُضاف المنتجات قريباً.</p>
        </div>`;
    } else {
      $('spGrid').innerHTML = products.map((p) => `
        <article class="sp-card" data-product="${p.id}" tabindex="0" role="button" aria-label="${esc(p.title)}">
          <div class="thumb">${p.image_url ? `<img src="${esc(optimizeImage(p.image_url, 700))}" alt="${esc(p.title)}" loading="lazy" decoding="async" width="600" height="450" referrerpolicy="no-referrer" data-fallback="📦">` : '📦'}</div>
          <div class="body">
            <h3>${esc(p.title)}</h3>
            ${p.description ? `<p class="desc">${esc(p.description.slice(0, 90))}${p.description.length > 90 ? '…' : ''}</p>` : ''}
            <div class="price">${esc(priceText(p))}</div>
          </div>
        </article>`).join('');

      bindImageFallbacks($('spGrid'));
      bindCards();
    }

    $('spaceState').style.display = 'none';
    $('spaceContent').style.display = 'block';

    injectJsonLd(url);

    // جاهزية الـprerender
    window.__SPACE__ = { space, products, profile };
  }

  function bindCards() {
    document.querySelectorAll('.sp-card').forEach((card) => {
      const open = () => openProduct(card.dataset.product);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  /** يستبدل أي صورة فاشلة بعنصر بديل ويسجّل الخطأ في الكونسول */
  function bindImageFallbacks(root) {
    root.querySelectorAll('img[data-fallback]').forEach((img) => {
      img.addEventListener('error', () => {
        console.error('[space] image failed:', img.currentSrc || img.src);
        const span = document.createElement('span');
        span.textContent = img.dataset.fallback || '📦';
        img.replaceWith(span);
      });
    });
  }

  /* ─────────── المودال ─────────── */

  function openProduct(id) {
    const p = state.products.find((x) => x.id === id);
    if (!p) return;

    const specs = p.specs_jsonb && typeof p.specs_jsonb === 'object' ? Object.entries(p.specs_jsonb) : [];
    const number = waNumber(state.space.contact_whatsapp || state.space.contact_phone);
    const msg = `مرحباً، أرى منتجك «${p.title}» على CapKitco، أرغب في الاستفسار عنه.`;

    $('spModalBody').innerHTML = `
      ${p.image_url ? `<img src="${esc(optimizeImage(p.image_url, 1200))}" alt="${esc(p.title)}" referrerpolicy="no-referrer">` : ''}
      <h2>${esc(p.title)}</h2>
      <div class="price">${esc(priceText(p))}</div>
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
      ${specs.length ? `
        <table class="sp-specs">
          <tbody>${specs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody>
        </table>` : ''}
      ${number
        ? `<a class="sp-btn wa" target="_blank" rel="noopener" href="${waLink(number, msg)}">💬 استفسر عن هذا المنتج</a>`
        : ''}`;

    $('spModal').classList.add('open');
    document.body.style.overflow = 'hidden';

    $('spModalBody').querySelectorAll('img').forEach((img) => {
      img.addEventListener('error', () => {
        console.error('[space] modal image failed:', img.src);
        img.remove();
      });
    });
  }

  function closeModal() {
    $('spModal').classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ─────────── JSON-LD ─────────── */

  function injectJsonLd(url) {
    const { space, products, profile } = state;
    const graph = [
      {
        '@type': 'Store',
        '@id': url + '#store',
        name: space.store_name,
        description: space.tagline || space.about_text || undefined,
        url,
        image: space.cover_url || space.logo_url || 'https://capkitco.com/icon-512.png',
        telephone: space.contact_phone || space.contact_whatsapp || undefined,
        address: profile.city ? { '@type': 'PostalAddress', addressLocality: profile.city, addressCountry: 'EG' } : undefined,
        parentOrganization: { '@type': 'Organization', name: 'Capkitco', url: 'https://capkitco.com/' },
        makesOffer: products.slice(0, 30).map((p) => ({
          '@type': 'Offer',
          itemOffered: { '@type': 'Product', name: p.title, image: p.image_url || undefined },
          price: p.price != null ? Number(p.price) : undefined,
          priceCurrency: 'EGP',
          availability: 'https://schema.org/InStock',
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: 'https://capkitco.com/' },
          { '@type': 'ListItem', position: 2, name: space.store_name, item: url },
        ],
      },
    ];

    const el = $('spaceLd');
    if (el) el.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  }

  /* ─────────── التشغيل ─────────── */

  (async function init() {
    if (window.__SPACE__ && window.__SPACE__.space) {
      state.space = window.__SPACE__.space;
      state.products = window.__SPACE__.products || [];
      state.profile = window.__SPACE__.profile || {};
      render();
      return;
    }

    const username = usernameFromLocation();
    if (!cfg.supabaseUrl || !username) return showError();

    try {
      const profiles = await api(`/rest/v1/public_profiles?select=id,full_name,username,city&username=eq.${encodeURIComponent(username)}&limit=1`);
      const profile = profiles[0];
      if (!profile) return showError();

      const spaces = await api(`/rest/v1/premium_spaces?select=*&user_id=eq.${profile.id}&is_active=eq.true&limit=1`);
      const space = spaces[0];
      if (!space) return showError();

      const products = await api(`/rest/v1/premium_products?select=*&space_id=eq.${space.id}&order=created_at.desc`);

      state.profile = profile;
      state.space = space;
      state.products = products || [];
      render();
    } catch (err) {
      console.error(err);
      showError();
    }
  })();

  function showError() {
    $('spaceState').innerHTML = `
      <div class="sp-state">
        <div class="icon">🔍</div>
        <h2>المساحة غير موجودة</h2>
        <p>ربما لم تُنشر بعد أو أن الرابط غير صحيح.</p>
        <a class="sp-btn gold" href="/" style="margin-top:16px;">الرئيسية</a>
      </div>`;
  }

  $('spModalClose')?.addEventListener('click', closeModal);
  $('spModal')?.addEventListener('click', (e) => { if (e.target.id === 'spModal') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
})();
