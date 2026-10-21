// ═══ Service Detail Page ═══

let currentService = null;
let currentSeller = null;
let isGuest = true;

// ═══ Init ═══
async function initService() {
  if (!window.supabaseClient) {
    showNotFound();
    return;
  }

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  isGuest = !session;

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

    // تشغيل فحص زر الأدمن
    await initAdminSuspendButton(serviceId);

  } catch (err) {
    console.error(err);
    showNotFound();
  }
}

// ═══ Admin Suspend Button Logic ═══
async function initAdminSuspendButton(serviceId) {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session?.user) return;

    const { data: profile } = await window.supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

    if (profile?.role === 'admin') {
        const container = document.getElementById('adminSuspendContainer');
        if (container) {
            container.style.display = 'block';
            
            const btn = document.getElementById('btnSuspendService');
            btn.addEventListener('click', async () => {
                const reason = prompt('اكتب سبب التعليق (سيظهر للبائع):');
                if (!reason) return;
                const rec = prompt('اكتب توصية للتحسين (اختياري):');

                btn.disabled = true;
                btn.textContent = 'جاري التعليق...';

                const { error } = await window.supabaseClient.rpc('suspend_content', {
                    p_content_type: 'service',
                    p_content_id: serviceId,
                    p_reason: reason,
                    p_recommendation: rec || null
                });

                if (error) {
                    alert('❌ خطأ: ' + error.message);
                    btn.disabled = false;
                    btn.textContent = '⛔ تعليق هذه الخدمة (للمشرفين)';
                } else {
                    alert('✅ تم تعليق الخدمة بنجاح. ستختفي من الموقع الآن.');
                    window.location.href = '/'; 
                }
            });
        }
    }
}

// ═══ Load Seller ═══
async function loadSeller(service) {
  try {
    if (service.freelancer_id) {
      const { data: freelancer } = await window.supabaseClient
        .from('freelancers').select('id, user_id').eq('id', service.freelancer_id).maybeSingle();
      if (freelancer?.user_id) {
        const { data: profile } = await window.supabaseClient
          .from('profiles').select('id, full_name, role, whatsapp, phone, city, verified').eq('id', freelancer.user_id).single();
        if (profile) {
          currentSeller = {
            id: profile.id, name: profile.full_name || 'صانع', type: 'individual',
            role: profile.role, whatsapp: profile.whatsapp || profile.phone, city: profile.city, verified: profile.verified
          };
          return;
        }
      }
    }
    if (service.workshop_id) {
      const { data: workshop } = await window.supabaseClient.from('workshops').select('*').eq('id', service.workshop_id).single();
      if (workshop) {
        currentSeller = {
          id: workshop.owner_id, name: workshop.name || 'ورشة', type: 'workshop',
          whatsapp: workshop.whatsapp, verified: workshop.verified_badge
        };
        return;
      }
    }
    currentSeller = { name: 'صانع', type: 'individual' };
  } catch (err) {
    console.warn('Seller fetch error:', err);
    currentSeller = { name: 'صانع', type: 'individual' };
  }
}

// ═══ Render Service ═══
function renderService() {
  const s = currentService;
  document.getElementById('serviceTitle').textContent = s.title || 'بدون اسم';

  const priceEl = document.getElementById('servicePrice');
  if (s.price_start) {
    const range = s.price_end ? `${s.price_start} - ${s.price_end}` : `${s.price_start}+`;
    priceEl.innerHTML = `<span class="from">يبدأ من</span><span>${range}</span><small>${s.currency || 'EGP'}</small>`;
  } else {
    priceEl.innerHTML = `<span>اتصل للسعر</span>`;
  }

  const iconMap = { repair: '🔧', installation: '🔨', maintenance: '⚙️', consultation: '💬', custom: '✨' };
  document.getElementById('serviceIcon').textContent = iconMap[s.service_type] || '🔧';
  document.getElementById('serviceDescription').textContent = s.description || 'لا يوجد وصف';

  renderBadges();
  renderSeller();
  renderWhatsApp();

  document.title = `${s.title || 'الخدمة'} — CapKit Co.`;
  renderServiceLike(s.id);
  
  setTimeout(() => {
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) shareBtn.onclick = () => shareItem('service', s.id, s.title);
  }, 100);

  updateOpenGraph({
    title: s.title || 'خدمة', description: s.description?.substring(0, 160) || 'خدمة من CapKit Co.',
    image: 'https://capkitco.com/icon-512.png', url: `https://capkitco.com/service?id=${s.id}`
  });

  initComments('service', s.id);
  initRating('service', s.id);
}

// ═══ Badges ═══
function renderBadges() {
  const s = currentService;
  const container = document.getElementById('serviceBadges');
  container.innerHTML = '';
  const typeMap = { repair: '🔧 صيانة', installation: '🔨 تركيب', maintenance: '⚙️ صيانة دورية', consultation: '💬 استشارة', custom: '✨ مخصصة' };
  if (s.service_type) {
    const b = document.createElement('span'); b.className = 'badge-tag service-type'; b.textContent = typeMap[s.service_type] || s.service_type; container.appendChild(b);
  }
  if (s.negotiable) {
    const b = document.createElement('span'); b.className = 'badge-tag negotiable'; b.textContent = '💬 سعر قابل للتفاوض'; container.appendChild(b);
  }
  if (s.status === 'published') {
    const b = document.createElement('span'); b.className = 'badge-tag status'; b.textContent = '✅ متاح'; container.appendChild(b);
  }
}

// ═══ Seller ═══
function renderSeller() {
  if (!currentSeller) return;
  const box = document.getElementById('sellerBox');
  const avatar = document.getElementById('sellerAvatar');
  const icon = currentSeller.type === 'workshop' ? '🏭' : '👤';
  const roleText = currentSeller.type === 'workshop' ? 'ورشة / شركة' : 'صانع / مقدّم خدمة';
  avatar.textContent = icon;
  const verifiedBadge = currentSeller.verified ? ' · <span style="color: #22c55e;">✓ موثّق</span>' : '';
  box.querySelector('.seller-info').innerHTML = `
    <h4>${escapeHtml(currentSeller.name)}</h4>
    <p>${roleText}${verifiedBadge}${currentSeller.city ? ` · 📍 ${escapeHtml(currentSeller.city)}` : ''}</p>
  `;
}

window.goToSeller = function() {
  if (currentSeller?.id) window.location.href = `user?id=${currentSeller.id}`;
};

// ═══ WhatsApp (Guests) ═══
function renderWhatsApp() {
  const btn = document.getElementById('whatsappBtn');
  const s = currentService;

  if (isGuest) {
    btn.href = 'javascript:void(0)';
    btn.innerHTML = '<span>🔒</span><span>سجل دخول لرؤية رقم التواصل</span>';
    btn.style.background = 'var(--obsidian-3)';
    btn.style.color = 'var(--gold)';
    btn.style.border = '1px solid var(--gold)';
    btn.onclick = () => window.location.href = 'auth.html';
    return;
  }

  let phone = '';
  if (currentSeller?.whatsapp) phone = currentSeller.whatsapp.replace(/\D/g, '');
  const serviceUrl = `https://capkitco.com/service?id=${s.id}`;
  const message = `مرحباً، أنا مهتم بالخدمة:\n\n${s.title}\n${s.price_start ? `يبدأ من ${s.price_start} ${s.currency || 'EGP'}` : 'السعر بالتفاوض'}\n\n${serviceUrl}`;
  const encodedMsg = encodeURIComponent(message);

  if (phone) btn.href = `https://wa.me/${phone}?text=${encodedMsg}`;
  else btn.href = `https://wa.me/?text=${encodedMsg}`;
}

function renderServiceLike(serviceId) {
  const container = document.getElementById('likeContainer');
  if (!container) return;
  container.innerHTML = renderLikeButton('service', serviceId);
  refreshLikeButton('service', serviceId);
}

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initService);
} else {
  initService();
}
