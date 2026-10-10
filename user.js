// ═══ User Profile Page ═══

let currentProfile = null;
let currentUser = null;
let isFollowing = false;
let currentUserId = null;

// ═══ Init ═══
async function initUserPage() {
  if (!window.supabaseClient) {
    showNotFound();
    return;
  }

  // جلب المستخدم الحالي (للتحقق من المتابعة)
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  currentUserId = session?.user?.id || null;

  // جلب ID من URL
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('id');

  if (!userId) {
    showNotFound();
    return;
  }

  try {
    // ═══ جلب البروفايل ═══
    const { data: profile, error } = await window.supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error('Profile error:', error);
      showNotFound();
      return;
    }

    currentProfile = profile;

    // ═══ تسجيل الزيارة ═══
    await logView(userId);

    // ═══ جلب الإحصائيات ═══
    const [stats, isFollow] = await Promise.all([
      getSellerStats(userId),
      checkFollowStatus(userId)
    ]);

    isFollowing = isFollow;

    // ═══ عرض كل حاجة ═══
    renderHeader(profile, stats);
    renderActions(profile);
    renderBio(profile);
    
    if (stats.products_count > 0) {
      await loadProducts(userId);
    }
    
    if (stats.services_count > 0) {
      await loadServices(userId);
    }
    
    if (stats.ratings_count > 0) {
      await loadRatings(userId, stats);
    }

    // عنوان الصفحة
    document.title = `${profile.full_name} — CapKit Co.`;

    showContent();

  } catch (err) {
    console.error(err);
    showNotFound();
  }
}

// ═══ Log View ═══
async function logView(profileId) {
  // متسجلش الزيارة لو المستخدم بيزور بروفايله
  if (currentUserId === profileId) return;

  try {
    await window.supabaseClient
      .from('profile_views')
      .insert({
        profile_id: profileId,
        viewer_id: currentUserId
      });
  } catch (err) {
    console.warn('View log failed:', err);
  }
}

// ═══ Get Seller Stats ═══
async function getSellerStats(userId) {
  try {
    // منتجات
    const { count: productsCount } = await window.supabaseClient
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .eq('status', 'published');

    // خدمات
    const { count: servicesCount } = await window.supabaseClient
      .from('services')
      .select('*', { count: 'exact', head: true })
      .eq('freelancer_id', userId)
      .eq('status', 'published');

    // متابعين
    const { count: followersCount } = await window.supabaseClient
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId);

    // تقييمات
    const { data: ratingsData } = await window.supabaseClient
      .from('ratings')
      .select('rating')
      .or(`workshop_id.eq.${userId},product_id.in.(SELECT id FROM products WHERE seller_id='${userId}')`);

    const ratingsCount = ratingsData?.length || 0;
    const avgRating = ratingsCount > 0
      ? (ratingsData.reduce((s, r) => s + r.rating, 0) / ratingsCount).toFixed(1)
      : null;

    return {
      products_count: productsCount || 0,
      services_count: servicesCount || 0,
      followers_count: followersCount || 0,
      ratings_count: ratingsCount,
      avg_rating: avgRating
    };

  } catch (err) {
    console.warn('Stats error:', err);
    return {
      products_count: 0,
      services_count: 0,
      followers_count: 0,
      ratings_count: 0,
      avg_rating: null
    };
  }
}

// ═══ Follow Status ═══
async function checkFollowStatus(targetId) {
  if (!currentUserId) return false;
  if (currentUserId === targetId) return false;

  const { data } = await window.supabaseClient
    .from('follows')
    .select('id')
    .eq('follower_id', currentUserId)
    .eq('following_id', targetId)
    .maybeSingle();

  return !!data;
}

// ═══ Render Header ═══
function renderHeader(profile, stats) {
  const roleMeta = {
    vendor: { icon: '🛒', name: 'بائع / ورشة' },
    service: { icon: '🔧', name: 'مقدّم خدمة' },
    freelancer: { icon: '🔨', name: 'صنايعي / مقاول / عامل' },
    buyer: { icon: '👤', name: 'مشتري' },
    admin: { icon: '⭐', name: 'مدير' }
  };

  const meta = roleMeta[profile.role] || roleMeta.buyer;

  // Avatar
  document.getElementById('userAvatar').textContent = meta.icon;

  // Name
  document.getElementById('userName').innerHTML = `
    ${escapeHtml(profile.full_name || 'مستخدم')}
    ${profile.verified ? '<span class="verified-badge">✓ موثّق</span>' : ''}
  `;

  // Role
  document.getElementById('userRole').innerHTML = `
    <span>${meta.name}</span>
    ${profile.city ? `<span class="dot">·</span><span>📍 ${escapeHtml(profile.city)}</span>` : ''}
  `;

  // Meta
  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })
    : '';

  document.getElementById('userMeta').innerHTML = joinDate
    ? `عضو منذ ${joinDate}`
    : '';

  // Stats
  document.getElementById('statProducts').textContent = stats.products_count;
  document.getElementById('statServices').textContent = stats.services_count;
  document.getElementById('statFollowers').textContent = stats.followers_count;
  document.getElementById('statRating').textContent = stats.avg_rating || '—';
}

// ═══ Render Actions ═══
function renderActions(profile) {
  // زر الواتساب
  const waBtn = document.getElementById('whatsappContact');
  const phone = (profile.whatsapp || '').replace(/\D/g, '');

  if (phone) {
    const msg = encodeURIComponent(`مرحباً، شفت صفحتك على CapKit وأرغب في التواصل.`);
    waBtn.href = `https://wa.me/${phone}?text=${msg}`;
  } else {
    waBtn.href = '#';
    waBtn.style.opacity = '0.5';
    waBtn.style.pointerEvents = 'none';
  }

  // زر المتابعة
  const followBtn = document.getElementById('followBtn');

  // لو المستخدم نفسه — نخفي زر المتابعة
  if (currentUserId === profile.id) {
    followBtn.style.display = 'none';
    return;
  }

  // لو مش مسجل — نظهر رسالة عند الضغط
  if (!currentUserId) {
    followBtn.innerHTML = '<span>♡</span><span>متابعة</span>';
    followBtn.onclick = () => {
      if (confirm('لازم تسجل دخول للمتابعة. تروح لصفحة التسجيل؟')) {
        window.location.href = 'auth.html';
      }
    };
    return;
  }

  updateFollowButton();
}

// ═══ Update Follow Button ═══
function updateFollowButton() {
  const btn = document.getElementById('followBtn');
  
  if (isFollowing) {
    btn.classList.add('following');
    btn.innerHTML = '<span>✓</span><span>تتابعه</span>';
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

  const btn = document.getElementById('followBtn');
  btn.disabled = true;

  try {
    if (isFollowing) {
      // إلغاء المتابعة
      await window.supabaseClient
        .from('follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', currentProfile.id);

      isFollowing = false;
    } else {
      // متابعة
      await window.supabaseClient
        .from('follows')
        .insert({
          follower_id: currentUserId,
          following_id: currentProfile.id
        });

      isFollowing = true;
    }

    updateFollowButton();

    // تحديث عدد المتابعين
    const { count } = await window.supabaseClient
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', currentProfile.id);

    document.getElementById('statFollowers').textContent = count || 0;

  } catch (err) {
    console.error('Follow error:', err);
    alert('حدث خطأ، حاول تاني');
  } finally {
    btn.disabled = false;
  }
};

// ═══ Render Bio ═══
function renderBio(profile) {
  const bioEl = document.getElementById('userBio');

  if (profile.bio && profile.bio.trim()) {
    bioEl.textContent = profile.bio;
    bioEl.classList.remove('user-bio-empty');
  } else {
    bioEl.textContent = 'لا توجد نبذة بعد';
    bioEl.classList.add('user-bio-empty');
  }
}

// ═══ Load Products ═══
async function loadProducts(userId) {
  const { data: products, error } = await window.supabaseClient
    .from('products')
    .select('*')
    .eq('seller_id', userId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(12);

  if (error || !products || products.length === 0) return;

  document.getElementById('productsCount').textContent = products.length;

  const container = document.getElementById('productsContainer');
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'user-products-grid';

  products.forEach(p => grid.appendChild(createProductCard(p)));
  container.appendChild(grid);
}

// ═══ Load Services ═══
async function loadServices(userId) {
  const { data: services, error } = await window.supabaseClient
    .from('services')
    .select('*')
    .eq('freelancer_id', userId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(6);

  if (error || !services || services.length === 0) return;

  document.getElementById('servicesSection').style.display = 'block';
  document.getElementById('servicesCount').textContent = services.length;

  const container = document.getElementById('servicesContainer');
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'user-products-grid';

  services.forEach(s => grid.appendChild(createServiceCard(s)));
  container.appendChild(grid);
}

// ═══ Load Ratings ═══
async function loadRatings(userId, stats) {
  const { data: ratings, error } = await window.supabaseClient
    .from('ratings')
    .select('*, profiles:user_id(full_name)')
    .or(`workshop_id.eq.${userId},freelancer_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !ratings || ratings.length === 0) return;

  document.getElementById('ratingsCount').textContent = ratings.length;

  const container = document.getElementById('ratingsContainer');
  container.innerHTML = '';

  // ملخص
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

  // قائمة
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
        ? `<img src="${img}" alt="${escapeHtml(product.title)}" style="width:100%;height:100%;object-fit:cover;">`
        : `<div class="product-emblem">📦</div>`}
    </div>
    <div class="product-info">
      <div class="product-title">${escapeHtml(product.title)}</div>
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

  a.innerHTML = `
    <div class="product-image">
      <div class="product-emblem service">🔧</div>
    </div>
    <div class="product-info">
      <div class="product-title">${escapeHtml(service.title)}</div>
      <div class="product-footer">
        <div class="product-price service-price">${service.price_start || 0}+ ${service.currency || 'EGP'}</div>
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
        <h4>${escapeHtml(userName)}</h4>
        <div class="meta">${date}</div>
      </div>
      <div class="rating-stars-small">${getStars(rating.rating)}</div>
    </div>
    ${rating.comment ? `<div class="rating-text">${escapeHtml(rating.comment)}</div>` : ''}
  `;

  return card;
}

function getStars(rating) {
  const r = Math.round(rating || 0);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

// ═══ Share ═══
window.shareProfile = function() {
  const url = window.location.href;
  
  if (navigator.share) {
    navigator.share({ title: currentProfile.full_name, url });
  } else {
    navigator.clipboard.writeText(url).then(() => {
      alert('✅ تم نسخ الرابط');
    });
  }
};

// ═══ Helpers ═══
function showNotFound() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('userContent').style.display = 'none';
  document.getElementById('notFoundState').style.display = 'block';
}

function showContent() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('notFoundState').style.display = 'none';
  document.getElementById('userContent').style.display = 'block';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══ Start ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUserPage);
} else {
  initUserPage();
}
