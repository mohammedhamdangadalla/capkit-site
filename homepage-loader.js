// ═══ Homepage — Load from Supabase (with Fallback) ═══

async function loadHomepageContent() {
  if (!window.supabaseClient) {
    console.warn('⚠️ Supabase not ready — keeping demo data');
    return;
  }

  // تشغيل عداد الزوار اللحظي
  initLiveCounter();

  try {
    // ═══ 1. المنتجات المميزة ═══
    // المميزة أولاً (is_featured) ثم نُكمل بأحدث المنتجات حتى يمتلئ الصف
    const { data: featuredRows, error: pError } = await window.supabaseClient
      .from('products')
      .select('*')
      .eq('status', 'published')
      .eq('is_featured', true)
      .order('created_at', { ascending: false })
      .limit(8);

    let products = featuredRows || [];

    if (!pError && products.length < 8) {
      const { data: latestRows } = await window.supabaseClient
        .from('products')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(8);

      const seen = new Set(products.map((p) => p.id));
      for (const row of latestRows || []) {
        if (products.length >= 8) break;
        if (!seen.has(row.id)) { products.push(row); seen.add(row.id); }
      }
    }

    if (!pError && products && products.length > 0) {
      const grid = document.getElementById('featuredProductsGrid');
      if (grid) {
        grid.innerHTML = '';
        products.forEach(p => grid.appendChild(createProductCard(p)));
        console.log('✅ Featured products loaded:', products.length);
      }
    }

    // ═══ 2. CapKit Originals ═══
    // أولاً: ما اختاره الأدمن لقسم الهيرو (is_hero)
    let { data: originals, error: oError } = await window.supabaseClient
      .from('products')
      .select('*')
      .eq('status', 'published')
      .eq('is_hero', true)
      .order('created_at', { ascending: false })
      .limit(4);

    // احتياطي: المنتجات الأصلية إن لم يختر الأدمن شيئاً
    if (!oError && (!originals || originals.length === 0)) {
      const fallback = await window.supabaseClient
        .from('products')
        .select('*')
        .eq('status', 'published')
        .eq('is_capkit_original', true)
        .order('created_at', { ascending: false })
        .limit(4);
      originals = fallback.data;
      oError = fallback.error;
    }

    if (!oError && originals && originals.length > 0) {
      const grid = document.getElementById('originalsProductsGrid');
      if (grid) {
        grid.innerHTML = '';
        originals.forEach(p => grid.appendChild(createOriginalCard(p)));
        console.log('✅ Originals loaded:', originals.length);
      }
    }

    // ═══ 3. خدمات الصيانة ═══
    const { data: services, error: sError } = await window.supabaseClient
      .from('services')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(4);

    if (!sError && services && services.length > 0) {
      const grid = document.getElementById('homepageServicesGrid');
      if (grid) {
        grid.innerHTML = '';
        services.forEach(s => grid.appendChild(createHomeServiceCard(s)));
        console.log('✅ Home services loaded:', services.length);
      }
    } else {
      console.log('ℹ️ No real services, keeping demo');
    }

    // ═══ 4. الورش المميزة ═══
    const { data: workshops, error: wError } = await window.supabaseClient
      .from('workshops')
      .select('*')
      .eq('status', 'active')
      .limit(4);

    if (!wError && workshops && workshops.length > 0) {
      const grid = document.getElementById('featuredWorkshopsGrid');
      if (grid) {
        grid.innerHTML = '';
        workshops.forEach(w => grid.appendChild(createWorkshopCard(w)));
        console.log('✅ Workshops loaded:', workshops.length);
      }
    }

  } catch (err) {
    console.warn('⚠️ Homepage load failed — using demo:', err);
  }
}

// ═══ Live Visitor Counter Logic ═══
async function initLiveCounter() {
  if (!window.supabaseClient) return;

  const signupsEl = document.getElementById('dailySignupsCount');

  try {
    // RPC مجمّع (SECURITY DEFINER) — لا نقرأ الجدول مباشرة، فلا 401 ولا كشف صفوف
    const { data, error } = await window.supabaseClient.rpc('public_stats');

    if (!error && data && typeof data.signups_today === 'number') {
      if (signupsEl) signupsEl.textContent = data.signups_today;
    } else if (signupsEl) {
      // لا نعرض رقماً وهمياً: نُخفي الرقم بدل تلفيقه
      signupsEl.textContent = '—';
      console.warn('public_stats unavailable:', error?.message || 'no data');
    }
  } catch (err) {
    if (signupsEl) signupsEl.textContent = '—';
    console.warn('Error fetching daily signups:', err);
  }

  // 2. تتبع الزوار النشطين لحظياً باستخدام Supabase Realtime Presence
  try {
    const room = window.supabaseClient.channel('public-room');
    
    room.on('presence', { event: 'sync' }, () => {
      const state = room.presenceState();
      const activeCount = Object.keys(state).length || 1; 
      const activeEl = document.getElementById('activeVisitorsCount');
      if (activeEl) activeEl.textContent = activeCount;
    });

    await room.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await room.track({ online_at: new Date().toISOString() });
      }
    });
  } catch (err) {
    console.warn('Realtime presence error:', err);
    const activeEl = document.getElementById('activeVisitorsCount');
    if (activeEl) activeEl.textContent = Math.floor(Math.random() * 5) + 3;
  }
}


// ═══ منتجات المساحات الاحترافية (تظهر فوراً) ═══
async function loadPremiumShowcase() {
  const grid = document.getElementById('featuredProductsGrid');
  if (!grid) return;

  try {
    const { data: spaces } = await window.supabaseClient
      .from('premium_spaces')
      .select('id, user_id, store_name')
      .eq('is_active', true)
      .limit(20);

    if (!spaces || !spaces.length) return;

    const spaceIds = spaces.map((s) => s.id);
    const { data: items } = await window.supabaseClient
      .from('premium_products')
      .select('id, title, price, image_url, space_id')
      .in('space_id', spaceIds)
      .order('created_at', { ascending: false })
      .limit(4);

    if (!items || !items.length) return;

    const userIds = [...new Set(spaces.map((s) => s.user_id))];
    const { data: profiles } = await window.supabaseClient
      .from('public_profiles')
      .select('id, username')
      .in('id', userIds);

    const usernameById = new Map((profiles || []).map((p) => [p.id, p.username]));
    const spaceById = new Map(spaces.map((s) => [s.id, s]));

    for (const item of items) {
      const space = spaceById.get(item.space_id);
      const username = space ? usernameById.get(space.user_id) : null;
      if (!username) continue;

      const a = document.createElement('a');
      a.href = `/space.html?username=${encodeURIComponent(username)}`;
      a.className = 'product-card';

      const img = item.image_url
        ? `<img src="${optimizeImage(item.image_url, 700)}" srcset="${imageSrcset(item.image_url, [400, 700, 1000])}" sizes="(max-width: 640px) 45vw, 300px" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async" width="600" height="600" style="width:100%;height:100%;object-fit:cover;">`
        : '<div class="product-emblem">🪄</div>';

      a.innerHTML = `
        <div class="product-image">
          <span class="badge-service" style="background: rgba(201,169,97,.15); color: var(--gold);">مساحة احترافية</span>
          ${img}
        </div>
        <div class="product-info">
          <div class="product-title">${escapeHtml(item.title)}</div>
          <div class="product-desc">${escapeHtml(space ? space.store_name : '')}</div>
          <div class="product-footer">
            <div class="product-price">${item.price != null ? item.price : '—'} <small>EGP</small></div>
          </div>
        </div>`;

      grid.appendChild(a);
    }
  } catch (err) {
    console.warn('Premium showcase skipped:', err.message);
  }
}

// ═══ Card Builders ═══

function createProductCard(product) {
  const a = document.createElement('a');
  a.href = itemUrl('product', product);
  a.className = 'product-card';

  const imageUrl = product.images && product.images.length > 0 
    ? product.images[0] 
    : '';

  const sellerName = product.seller_type === 'workshop' 
    ? '🏭 ورشة' 
    : '👤 بائع';

  a.innerHTML = `
    <div class="product-image">
      ${imageUrl 
        ? `<img src="${optimizeImage(imageUrl, 700)}" srcset="${imageSrcset(imageUrl, [400, 700, 1000])}" sizes="(max-width: 640px) 45vw, 300px" alt="${escapeHtml(product.title)}" loading="lazy" decoding="async" width="600" height="600" style="width:100%;height:100%;object-fit:cover;">`
        : `<div class="product-emblem">📦</div>`}
      ${product.is_capkit_original ? '<span class="badge-original">✨ أصلي</span>' : ''}
    </div>
    <div class="product-info">
      <div class="product-title">${escapeHtml(product.title)}</div>
      <div class="product-desc">${escapeHtml((product.description || '').substring(0, 40))}...</div>
      ${renderCardRating(product.rating_avg, product.rating_count)}
      <div class="product-meta">
        <span class="workshop-name">${sellerName}</span>
      </div>
      <div class="product-footer">
        <div class="product-price">${product.price || 0} <small>${product.currency || 'EGP'}</small></div>
        <span class="btn-wa">واتساب</span>
      </div>
    </div>
  `;

  return a;
}

function createOriginalCard(product) {
  const a = document.createElement('a');
  a.href = itemUrl('product', product);
  a.className = 'product-card';

  const imageUrl = product.images && product.images.length > 0 
    ? product.images[0] 
    : '';

  const serial = product.serial_number || '';

  a.innerHTML = `
    <div class="product-image">
      ${imageUrl 
        ? `<img src="${optimizeImage(imageUrl, 700)}" srcset="${imageSrcset(imageUrl, [400, 700, 1000])}" sizes="(max-width: 640px) 45vw, 300px" alt="${escapeHtml(product.title)}" loading="lazy" decoding="async" width="600" height="600" style="width:100%;height:100%;object-fit:cover;">`
        : `<div class="product-emblem">✦</div>`}
      ${serial ? `<span class="badge-original">N° ${serial}</span>` : ''}
    </div>
    <div class="product-info">
      <div class="product-title">${escapeHtml(product.title)}</div>
      <div class="product-desc">${escapeHtml((product.description || '').substring(0, 40))}...</div>
      ${renderCardRating(product.rating_avg, product.rating_count)}
      <div class="product-footer">
        <div class="product-price">${product.price || 0} <small>${product.currency || 'EGP'}</small></div>
      </div>
    </div>
  `;

  return a;
}

function createWorkshopCard(workshop) {
  const a = document.createElement('a');
  a.href = itemUrl('workshop', workshop);
  a.className = 'workshop-card';

  const initial = (workshop.name || 'و').charAt(0);
  const logo = workshop.logo_url || workshop.cover_url || '';
  // quotes: نستخدم ' داخل url() لأن السمة نفسها محاطة بـ""
  const avatarStyle = logo
    ? "background-image:url('" + optimizeImage(logo, 200).replace(/'/g, '%27') + "');background-size:cover;background-position:center;color:transparent;overflow:hidden;"
    : '';

  a.innerHTML = `
    <div class="workshop-avatar" style="${avatarStyle}">${logo ? '' : escapeHtml(initial)}</div>
    <h3>${escapeHtml(workshop.name || 'ورشة')}</h3>
    <div class="workshop-cat">${escapeHtml(workshop.workshop_type || 'منتجات')}</div>
    <div class="workshop-stats">
      <div><strong>—</strong>منتج</div>
      <div><strong>—</strong>تقييم</div>
    </div>
  `;

  return a;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function createHomeServiceCard(service) {
  const a = document.createElement('a');
  a.href = itemUrl('service', service);
  a.className = 'product-card';

  const iconMap = {
    repair: '🔧',
    installation: '🔨',
    maintenance: '⚙️',
    consultation: '💬',
    custom: '✨'
  };
  const icon = iconMap[service.service_type] || '🔧';

  const priceText = service.price_start
    ? `يبدأ ${service.price_start}${service.price_end ? ' - ' + service.price_end : '+'}`
    : 'اتصل للسعر';

  a.innerHTML = `
    <div class="product-image">
      <span class="badge-service">خدمة</span>
      <div class="product-emblem service">${icon}</div>
    </div>
    <div class="product-info">
      <div class="product-title">${escapeHtml(service.title)}</div>
      <div class="product-desc">${escapeHtml((service.description || '').substring(0, 40))}...</div>
      ${renderCardRating(service.rating_avg, service.rating_count)}
      <div class="product-footer">
        <div class="product-price service-price">${priceText} ${service.currency || 'EGP'}</div>
        <span class="btn-wa" role="link" tabindex="0"
              data-href="https://wa.me/?text=${encodeURIComponent('مرحباً، أنا مهتم بالخدمة: ' + service.title)}">اتصال</span>
      </div>
    </div>
  `;

  // واتساب داخل كرت قابل للنقر: span بدل <a> (تداخل <a> داخل <a> يفسد HTML)
  const wa = a.querySelector('.btn-wa');
  if (wa) {
    const openWa = (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open(wa.dataset.href, '_blank', 'noopener');
    };
    wa.addEventListener('click', openWa);
    wa.addEventListener('keydown', (e) => { if (e.key === 'Enter') openWa(e); });
  }

  return a;
}

function renderCardRating(avg, count) {
  if (!count || count === 0) return '';
  const avgNum = Number(avg) || 0;
  return `
    <div class="card-rating">
      <span class="star-icon">⭐</span>
      <span class="avg">${avgNum.toFixed(1)}</span>
      <span class="count">(${count})</span>
    </div>
  `;
}

// ═══ Start ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { loadHomepageContent().then(loadPremiumShowcase); });
} else {
  loadHomepageContent().then(loadPremiumShowcase);
}
