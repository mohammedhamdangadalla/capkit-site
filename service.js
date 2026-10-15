// ═══ Service Detail Page ═══

let currentService = null;
let currentSeller = null;

// ═══ Init ═══
async function initService() {
  if (!window.supabaseClient) {
    showNotFound();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const serviceId = params.get('id');

  if (!serviceId) {
    showNotFound();
    return;
  }

  try {
    const { data: service, error } = await window.supabaseClient
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (error || !service) {
      console.error('Service fetch error:', error);
      showNotFound();
      return;
    }

    currentService = service;

    await loadSeller(service);
    renderService();
    showContent();

  } catch (err) {
    console.error(err);
    showNotFound();
  }
}

// ═══ Load Seller ═══
async function loadSeller(service) {
  try {
    // الأول: نجرب freelancers
    if (service.freelancer_id) {
      const { data: freelancer } = await window.supabaseClient
        .from('freelancers')
        .select('id, user_id')
        .eq('id', service.freelancer_id)
        .maybeSingle();

      if (freelancer?.user_id) {
        const { data: profile } = await window.supabaseClient
          .from('profiles')
          .select('id, full_name, role, whatsapp, phone, city, verified')
          .eq('id', freelancer.user_id)
          .single();

        if (profile) {
          currentSeller = {
            id: profile.id,
            name: profile.full_name || 'صانع',
            type: 'individual',
            role: profile.role,
            whatsapp: profile.whatsapp || profile.phone,
            city: profile.city,
            verified: profile.verified
          };
          return;
        }
      }
    }

    // التاني: نجرب workshops
    if (service.workshop_id) {
      const { data: workshop } = await window.supabaseClient
        .from('workshops')
        .select('*')
        .eq('id', service.workshop_id)
        .single();

      if (workshop) {
        currentSeller = {
          id: workshop.owner_id,
          name: workshop.name || 'ورشة',
          type: 'workshop',
          whatsapp: workshop.whatsapp,
          verified: workshop.verified_badge
        };
        return;
      }
    }

    // Fallback
    currentSeller = { name: 'صانع', type: 'individual' };

  } catch (err) {
    console.warn('Seller fetch error:', err);
    currentSeller = { name: 'صانع', type: 'individual' };
  }
}

// ═══ Render Service ═══
function renderService() {
  const s = currentService;

  // Title
  document.getElementById('serviceTitle').textContent = s.title || 'بدون اسم';

  // Price
  const priceEl = document.getElementById('servicePrice');
  if (s.price_start) {
    const range = s.price_end 
      ? `${s.price_start} - ${s.price_end}` 
      : `${s.price_start}+`;
    priceEl.innerHTML = `
      <span class="from">يبدأ من</span>
      <span>${range}</span>
      <small>${s.currency || 'EGP'}</small>
    `;
  } else {
    priceEl.innerHTML = `<span>اتصل للسعر</span>`;
  }

  // Icon
  const iconMap = {
    repair: '🔧',
    installation: '🔨',
    maintenance: '⚙️',
    consultation: '💬',
    custom: '✨'
  };
  document.getElementById('serviceIcon').textContent = iconMap[s.service_type] || '🔧';

  // Description
  document.getElementById('serviceDescription').textContent = 
    s.description || 'لا يوجد وصف';

  // Render
  renderBadges();
  renderSeller();
  renderWhatsApp();

  // Page Title
  document.title = `${s.title || 'الخدمة'} — CapKit Co.`;

  // ✨ Like
  renderServiceLike(s.id);
  
  // ✨ Share
  setTimeout(() => {
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
      shareBtn.onclick = () => shareItem('service', s.id, s.title);
    }
  }, 100);

  // ✨ Open Graph
  updateOpenGraph({
    title: s.title || 'خدمة',
    description: s.description?.substring(0, 160) || 'خدمة من CapKit Co.',
    image: 'https://capkitco.com/icon-512.png',
    url: `https://capkitco.com/service?id=${s.id}`
  });

  // ✨ تحميل التعليقات
  initComments('service', s.id);
}
// ═══ Badges ═══
function renderBadges() {
  const s = currentService;
  const container = document.getElementById('serviceBadges');
  container.innerHTML = '';

  const typeMap = {
    repair: '🔧 صيانة',
    installation: '🔨 تركيب',
    maintenance: '⚙️ صيانة دورية',
    consultation: '💬 استشارة',
    custom: '✨ مخصصة'
  };

  if (s.service_type) {
    const b = document.createElement('span');
    b.className = 'badge-tag service-type';
    b.textContent = typeMap[s.service_type] || s.service_type;
    container.appendChild(b);
  }

  if (s.negotiable) {
    const b = document.createElement('span');
    b.className = 'badge-tag negotiable';
    b.textContent = '💬 سعر قابل للتفاوض';
    container.appendChild(b);
  }

  if (s.status === 'published') {
    const b = document.createElement('span');
    b.className = 'badge-tag status';
    b.textContent = '✅ متاح';
    container.appendChild(b);
  }
}

// ═══ Seller ═══
function renderSeller() {
  if (!currentSeller) return;

  const box = document.getElementById('sellerBox');
  const avatar = document.getElementById('sellerAvatar');
  
  const icon = currentSeller.type === 'workshop' ? '🏭' : '👤';
  const roleText = currentSeller.type === 'workshop' 
    ? 'ورشة / شركة' 
    : 'صانع / مقدّم خدمة';

  avatar.textContent = icon;

  const verifiedBadge = currentSeller.verified 
    ? ' · <span style="color: #22c55e;">✓ موثّق</span>' 
    : '';

  box.querySelector('.seller-info').innerHTML = `
    <h4>${escapeHtml(currentSeller.name)}</h4>
    <p>${roleText}${verifiedBadge}${currentSeller.city ? ` · 📍 ${escapeHtml(currentSeller.city)}` : ''}</p>
  `;
}

// ═══ Go to Seller ═══
window.goToSeller = function() {
  if (currentSeller?.id) {
    window.location.href = `user?id=${currentSeller.id}`;
  }
};

// ═══ WhatsApp ═══
function renderWhatsApp() {
  const btn = document.getElementById('whatsappBtn');
  const s = currentService;

  let phone = '';
  if (currentSeller?.whatsapp) {
    phone = currentSeller.whatsapp.replace(/\D/g, '');
  }

  const serviceUrl = `https://capkitco.com/service?id=${s.id}`;

  const message = `مرحباً، أنا مهتم بالخدمة:

${s.title}
${s.price_start ? `يبدأ من ${s.price_start} ${s.currency || 'EGP'}` : 'السعر بالتفاوض'}

${serviceUrl}`;

  const encodedMsg = encodeURIComponent(message);

  if (phone) {
    btn.href = `https://wa.me/${phone}?text=${encodedMsg}`;
  } else {
    btn.href = `https://wa.me/?text=${encodedMsg}`;
  }
}

// ═══ Copy Link ═══
window.copyLink = function() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const btn = event.target.closest('button');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span>✅</span><span>تم النسخ!</span>';
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 1500);
  });
};

// ═══ Render Service Like ═══
function renderServiceLike(serviceId) {
  const container = document.getElementById('likeContainer');
  if (!container) return;

  container.innerHTML = renderLikeButton('service', serviceId);
  refreshLikeButton('service', serviceId);
}

// ═══ Helpers ═══
function showNotFound() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('serviceContent').style.display = 'none';
  document.getElementById('notFoundState').style.display = 'block';
}

function showContent() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('notFoundState').style.display = 'none';
  document.getElementById('serviceContent').style.display = 'block';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══ Start ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initService);
} else {
  initService();
}
