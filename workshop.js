// ═══ Workshop Page ═══

let currentWorkshop = null;
let currentWorkshopOwner = null;
let currentUserId = null;
let isFollowing = false;

// ═══ Init ═══
async function initWorkshopPage() {
  if (!window.supabaseClient) {
    showNotFound();
    return;
  }

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  currentUserId = session?.user?.id || null; // إذا كان null يعني زائر

  const params = new URLSearchParams(window.location.search);
  const workshopId = params.get('id');

  if (!workshopId) {
    showNotFound();
    return;
  }

  try {
    // ═══ جلب الورشة ═══
    const { data: workshop, error } = await window.supabaseClient
      .from('workshops')
      .select('*')
      .eq('id', workshopId)
      .single();

    if (error || !workshop) {
      console.error('Workshop error:', error);
      showNotFound();
      return;
    }

    currentWorkshop = workshop;

    // ✅ تسجيل مشاهدة (تم تعديلها لتسجل في profile_views أيضاً)
    await logWorkshopView(workshop);

    // ═══ جلب المتابعة ═══
    isFollowing = await checkFollowStatus(workshop.owner_id);

    // ═══ جلب الإحصائيات ═══
    const stats = await getWorkshopStats(workshop);

    // ═══ عرض كل حاجة ═══
    renderCoverAndLogo(workshop);
    renderHeader(workshop);
    loadGovernorateName(workshop.governorate_id);
    renderActions(workshop);
    renderDescription(workshop);

    // ═══ عرض الإحصائيات في الـ DOM ═══
    document.getElementById('statProducts').textContent = stats.products_count;
    document.getElementById('statServices').textContent = stats.services_count;
    document.getElementById('statFollowers').textContent = stats.followers_count;
    document.getElementById('statRating').textContent = stats.avg_rating || '—';

    // ═══ تحميل المحتوى ═══
    if (stats.products_count > 0) {
      await loadProducts(workshop);
    }

    if (stats.services_count > 0) {
      await loadServices(workshop);
    }

    if (stats.ratings_count > 0) {
      await loadRatings(workshop, stats);
    }

    document.title = `${workshop.name} — CapKit Co.`;

    showContent();

  } catch (err) {
    console.error(err);
    showNotFound();
  }
}

// ✅ دالة تسجيل المشاهدات المحدثة
async function logWorkshopView(workshop) {
  try {
    // 1. تسجيل الزيارة في الجدول الذي تقرأ منه لوحة التحكم
    await window.supabaseClient
      .from('profile_views')
      .insert([{ profile_id: workshop.owner_id }]);

    // 2. تحديث العداد الخاص بالورشة
    await window.supabaseClient
      .from('workshops')
      .update({ views_count: (workshop.views_count || 0) + 1 })
      .eq('id', workshop.id);

  } catch (err) {
    console.warn('View log failed:', err);
  }
}

// ═══ Get Workshop Stats ═══
async function getWorkshopStats(workshop) {
  try {
    const { data: products } = await window.supabaseClient
      .from('products')
      .select('id, rating_avg, rating_count')
      .or(`workshop_id.eq.${workshop.id},seller_id.eq.${workshop.owner_id}`)
      .eq('status', 'published');

    const { data: services } = await window.supabaseClient
      .from('services')
      .select('id, rating_avg, rating_count')
      .eq('workshop_id', workshop.id)
      .eq('status', 'published');

    const { count: followersCount } = await window.supabaseClient
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', workshop.owner_id);

    const allItems = [...(products || []), ...(services || [])];
    const totalCount = allItems.reduce((s, i) => s + (i.rating_count || 0), 0);
    const weightedSum = allItems.reduce(
      (s, i) => s + (Number(i.rating_avg) || 0) * (i.rating_count || 0), 0
    );
    const avgRating = totalCount > 0 ? (weightedSum / totalCount).toFixed(1) : null;

    return {
      products_count: (products || []).length,
      services_count: (services || []).length,
      followers_count: followersCount || 0,
      ratings_count: totalCount,
      avg_rating: avgRating
    };

  } catch (err) {
    console.warn('Stats error:', err);
    return { products_count: 0, services_count: 0, followers_count: 0, ratings_count: 0, avg_rating: null };
  }
}

// ═══ Follow Status ═══
async function checkFollowStatus(ownerId) {
  if (!currentUserId) return false;
  if (currentUserId === ownerId) return false;

  const { data } = await window.supabaseClient
    .from('follows')
    .select('id')
    .eq('follower_id', currentUserId)
    .eq('following_id', ownerId)
    .maybeSingle();

  return !!data;
}

// ═══ Render Cover & Logo ═══
function renderCoverAndLogo(workshop) {
  const cover = document.getElementById('workshopCover');
  const logo = document.getElementById('workshopLogo');

  if (workshop.cover_url) {
    cover.style.backgroundImage = `url('${workshop.cover_url}')`;
  }

  if (workshop.logo_url) {
    logo.textContent = '';
    logo.style.backgroundImage = `url('${workshop.logo_url}')`;
  } else {
    logo.textContent = (workshop.name || 'و').charAt(0);
  }
}

// ═══ Load Governorate Name ═══
async function loadGovernorateName(govId) {
  if (!govId) return;
  try {
    const { data } = await window.supabaseClient
      .from('governorates')
      .select('name_ar')
      .eq('id', govId)
      .single();
    
    if (data?.name_ar) {
      const govEl = document.getElementById('workshopGov');
      if (govEl) govEl.textContent = `📍 ${data.name_ar}`;
    }
  } catch (err) {
    console.warn('Governorate load error:', err);
  }
}

// ═══ Render Header ═══
function renderHeader(workshop) {
  const nameEl = document.getElementById('workshopName');
  nameEl.innerHTML = `
    ${escapeHtmlW(workshop.name || 'ورشة')}
    ${workshop.verified_badge ? '<span class="verified-badge">✓ موثّق</span>' : ''}
  `;

  const typeEl = document.getElementById('workshopType');
  if (workshop.workshop_type) {
    typeEl.innerHTML = `<span class="workshop-type-badge">🏭 ${escapeHtmlW(workshop.workshop_type)}</span>`;
  }

  const metaEl = document.getElementById('workshopMeta');
  const metaParts = [];

  if (workshop.year_founded) {
    metaParts.push(`<span>📅 تأسست ${workshop.year_founded}</span>`);
  }

  if (workshop.governorate_id) {
    metaParts.push(`<span id="workshopGov">📍 ...</span>`);
  }

  if (workshop.status === 'active') {
    metaParts.push(`<span style="color: #22c55e;">● نشطة</span>`);
  }

  metaEl.innerHTML = metaParts.join('<span class="dot">·</span>');
}

// ═══ Render Actions ═══
function renderActions(workshop) {
  const waBtn = document.getElementById('whatsappContact');
  const igBtn = document.getElementById('instagramContact');

  if (!currentUserId) {
    waBtn.href = 'javascript:void(0)';
    waBtn.innerHTML = '<span>🔒</span><span>سجل لرؤية الواتساب</span>';
    waBtn.style.background = 'var(--obsidian-3)';
    waBtn.style.color = 'var(--gold)';
    waBtn.style.border = '1px solid var(--gold)';
    waBtn.onclick = () => window.location.href = 'auth.html';

    if (workshop.instagram) {
      igBtn.style.display = 'flex';
      igBtn.href = 'javascript:void(0)';
      igBtn.innerHTML = '<span>🔒</span><span>سجل لرؤية إنستجرام</span>';
      igBtn.style.background = 'var(--obsidian-3)';
      igBtn.style.color = 'var(--gold)';
      igBtn.style.border = '1px solid var(--gold)';
      igBtn.onclick = () => window.location.href = 'auth.html';
    }

    const followBtn = document.getElementById('followBtn');
    followBtn.innerHTML = '<span>♡</span><span>متابعة</span>';
    followBtn.onclick = () => {
      if (confirm('لازم تسجل دخول للمتابعة. تروح لصفحة التسجيل؟')) {
        window.location.href = 'auth.html';
      }
    };
    return;
  }

  const phone = (workshop.whatsapp || workshop.phone || '').replace(/\D/g, '');

  if (phone) {
    const msg = encodeURIComponent(`مرحباً، شفت ورشتكم على CapKit وأرغب في التواصل.`);
    waBtn.href = `https://wa.me/${phone}?text=${msg}`;
  } else {
    waBtn.href = '#';
    waBtn.style.opacity = '0.5';
    waBtn.style.pointerEvents = 'none';
  }

  if (workshop.instagram) {
    let handle = workshop.instagram.replace('@', '').trim();
    let url = handle.startsWith('http') ? handle : `https://instagram.com/${handle}`;
    igBtn.href = url;
    igBtn.style.display = 'flex';
  }

  const followBtn = document.getElementById('followBtn');
  if (currentUserId === workshop.owner_id) {
    followBtn.style.display = 'none';
    return;
  }

  updateFollowButton();
}

// ═══ Update Follow Button ═══
function updateFollowButton() {
  const btn = document.getElementById('followBtn');
  if (isFollowing) {
    btn.classList.add('following');
    btn.innerHTML = '<span>✓</span><span>تتابع</span>';
  } else {
    btn.classList.remove('following');
    btn.innerHTML = '<span>♡</span><span>متابعة</span>';
  }
}

// ═══ Toggle Follow ═══
window.toggleFollow = async function() {
  if (!currentUserId) {
    window.location.href = 'auth.html';
    return;
  }
  if (!currentWorkshop) return;
  const btn = document.getElementById('followBtn');
  btn.disabled = true;
  try {
    if (isFollowing) {
      await window.supabaseClient
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', currentWorkshop.owner_id);
      isFollowing = false;
    } else {
      await window.supabaseClient
        .from('follows')
        .insert({ follower_id: currentUserId, following_id: currentWorkshop.owner_id });
      isFollowing = true;
    }
    updateFollowButton();
    const { count } = await window.supabaseClient
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', currentWorkshop.owner_id);
    document.getElementById('statFollowers').textContent = count || 0;
  } catch (err) {
    console.error('Follow error:', err);
    alert('حدث خطأ، حاول تاني');
  } finally {
    btn.disabled = false;
  }
};

// ═══ Render Description ═══
function renderDescription(workshop) {
  const el = document.getElementById('workshopDescription');
  if (workshop.description && workshop.description.trim()) {
    el.textContent = workshop.description;
  } else {
    el.textContent = 'لا يوجد وصف بعد';
    el.style.color = 'var(--text-muted)';
    el.style.fontStyle = 'italic';
    el.style.textAlign = 'center';
  }
}

// ═══ Load Products ═══
async function loadProducts(workshop) {
  const { data: products, error } = await window.supabaseClient
    .from('products')
    .select('*')
    .or(`workshop_id.eq.${workshop.id},seller_id.eq.${workshop.owner_id}`)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !products || products.length === 0) return;
  document.getElementById('productsCount').textContent = products.length;
  const container = document.getElementById('productsContainer');
  container.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'workshop-products-grid';
  products.forEach(p => grid.appendChild(createProductCard(p)));
  container.appendChild(grid);
}

// ═══ Load Services ═══
async function loadServices(workshop) {
  try {
    const { data: services, error } = await window.supabaseClient
      .from('services')
      .select('*')
      .eq('workshop_id', workshop.id)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(12);

    if (error || !services || services.length === 0) return;
    document.getElementById('servicesSection').style.display = 'block';
    document.getElementById('servicesCount').textContent = services.length;
    const container = document.getElementById('servicesContainer');
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'workshop-products-grid';
    services.forEach(s => grid.appendChild(createServiceCard(s)));
    container.appendChild(grid);
  } catch (err) {
    console.warn('Services error:', err);
  }
}

// ═══ Load Ratings ═══
async function loadRatings(workshop, stats) {
  const { data: prods } = await window.supabaseClient
    .from('products')
    .select('id')
    .or(`workshop_id.eq.${workshop.id},seller_id.eq.${workshop.owner_id}`);

  const prodIds = (prods || []).map(p => p.id);

  const { data: servs } = await window.supabaseClient
    .from('services')
    .select('id')
    .eq('workshop_id', workshop.id);

  const servIds = (servs || []).map(s => s.id);
  if (prodIds.length === 0 && servIds.length === 0) return;

  const orConds = [];
  if (prodIds.length > 0) orConds.push(`product_id.in.(${prodIds.join(',')})`);
  if (servIds.length > 0) orConds.push(`service_id.in.(${servIds.join(',')})`);

  const { data: ratings, error } = await window.supabaseClient
    .from('ratings')
    .select('*, profiles:user_id(full_name)')
    .or(orConds.join(','))
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !ratings || ratings.length === 0) return;

  document.getElementById('ratingsSection').style.display = 'block';
  document.getElementById('ratingsCount').textContent = ratings.length;
  const container = document.getElementById('ratingsContainer');
  container.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'ratings-summary';
  summary.innerHTML = `
    <div>
      <div class="rating-big">${stats.avg_rating || '—'}</div>
    </div>
    <div>
      <div class="rating-stars-big">${getStars(stats.avg_rating)}</div>
      <div class="rating-count">${stats.ratings_count} تقييم</div>
    </div>
  `;
  container.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'ratings-list';
  ratings.forEach(r => list.appendChild(createRatingCard(r)));
  container.appendChild(list);
}

// ═══ Card Builders ═══
function createProductCard(product) {
  const a = document.createElement('a');
  a.href = `product?id=${product.id}`;
  a.className = 'product-card';
  const img = product.images && product.images[0] ? product.images[0] : '';
  a.innerHTML = `
    <div class="product-image">
      ${img 
        ? `<img src="${img}" alt="${escapeHtmlW(product.title)}" style="width:100%;height:100%;object-fit:cover;">`
        : `<div class="product-emblem">📦</div>`}
      ${product.is_capkit_original ? '<span class="badge-original">✨ أصلي</span>' : ''}
    </div>
    <div class="product-info">
      <div class="product-title">${escapeHtmlW(product.title)}</div>
      ${renderCardRating(product.rating_avg, product.rating_count)}
      <div class="product-footer">
        <div class="product-price">${product.price || 0} <small>${product.currency || 'EGP'}</small></div>
      </div>
    </div>
  `;
  return a;
}

function createServiceCard(service) {
  const a = document.createElement('a');
  a.href = `service?id=${service.id}`;
  a.className = 'product-card';
  const iconMap = { repair: '🔧', installation: '🔨', maintenance: '⚙️', consultation: '💬', custom: '✨' };
  const icon = iconMap[service.service_type] || '🔧';
  const priceText = service.price_start
    ? `${service.price_start}${service.price_end ? ' - ' + service.price_end : '+'} ${service.currency || 'EGP'}`
    : 'اتصل للسعر';
  a.innerHTML = `
    <div class="product-image">
      <span class="badge-service">خدمة</span>
      <div class="product-emblem service">${icon}</div>
    </div>
    <div class="product-info">
      <div class="product-title">${escapeHtmlW(service.title)}</div>
      ${renderCardRating(service.rating_avg, service.rating_count)}
      <div class="product-footer">
        <div class="product-price service-price">${priceText}</div>
      </div>
    </div>
  `;
  return a;
}

function createRatingCard(rating) {
  const card = document.createElement('div');
  card.className = 'rating-card';
  const userName = rating.profiles?.full_name || 'مستخدم';
  const initial = userName.charAt(0).toUpperCase();
  const date = new Date(rating.created_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
  card.innerHTML = `
    <div class="rating-card-header">
      <div class="rating-avatar">${initial}</div>
      <div class="rating-info">
        <h4>${escapeHtmlW(userName)}</h4>
        <div class="meta">${date}</div>
      </div>
      <div class="rating-stars-small">${getStars(rating.rating)}</div>
    </div>
    ${rating.comment ? `<div class="rating-text">${escapeHtmlW(rating.comment)}</div>` : ''}
  `;
  return card;
}

function getStars(rating) {
  const r = Math.round(rating || 0);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
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

// ═══ Share ═══
window.shareWorkshop = function() {
  const url = window.location.href;
  const name = currentWorkshop?.name || 'ورشة';
  if (navigator.share) {
    navigator.share({ title: name, url });
  } else {
    navigator.clipboard.writeText(url).then(() => {
      alert('✅ تم نسخ الرابط');
    });
  }
};

// ═══ Helpers ═══
function showNotFound() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('workshopContent').style.display = 'none';
  document.getElementById('notFoundState').style.display = 'block';
}

function showContent() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('notFoundState').style.display = 'none';
  document.getElementById('workshopContent').style.display = 'block';
}

function escapeHtmlW(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══ Start ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWorkshopPage);
} else {
  initWorkshopPage();
}
