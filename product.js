// ═══ Product Detail Page ═══

let currentProduct = null;
let currentSeller = null;
let currentImages = [];
let activeImageIndex = 0;
let isGuest = true;

// ═══ Init ═══
async function initProduct() {
  if (!window.supabaseClient) {
    showNotFound();
    return;
  }

  // التحقق من تسجيل الدخول
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  isGuest = !session;

  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');

  if (!productId) {
    showNotFound();
    return;
  }

  try {
    const { data: product, error } = await window.supabaseClient
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (error || !product) {
      console.error('Product fetch error:', error);
      showNotFound();
      return;
    }

    currentProduct = product;
    currentImages = product.images || [];

    // ✅ تسجيل المشاهدة
    logProductView(product);

    await loadSeller(product);
    renderProduct();
    showContent();

    // تشغيل فحص زر الأدمن
    await initAdminSuspendButton(productId);

  } catch (err) {
    console.error(err);
    showNotFound();
  }
}

// ✅ دالة تسجيل المشاهدات
async function logProductView(product) {
  try {
    await window.supabaseClient
      .from('profile_views')
      .insert([{ profile_id: product.seller_id }]);
  } catch (err) {
    console.warn('Profile view log failed:', err);
  }

  try {
    await window.supabaseClient
      .from('products')
      .update({ views_count: (product.views_count || 0) + 1 })
      .eq('id', product.id);
  } catch (err) {}
}

// ═══ Admin Suspend Button Logic ═══
async function initAdminSuspendButton(productId) {
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
            
            const btn = document.getElementById('btnSuspendProduct');
            btn.addEventListener('click', async () => {
                const reason = prompt('اكتب سبب التعليق (سيظهر للبائع):');
                if (!reason) return;
                const rec = prompt('اكتب توصية للتحسين (اختياري):');

                btn.disabled = true;
                btn.textContent = 'جاري التعليق...';

                const { error } = await window.supabaseClient.rpc('suspend_content', {
                    p_content_type: 'product',
                    p_content_id: productId,
                    p_reason: reason,
                    p_recommendation: rec || null
                });

                if (error) {
                    alert('❌ خطأ: ' + error.message);
                    btn.disabled = false;
                    btn.textContent = '⛔ تعليق هذا المنتج (للمشرفين)';
                } else {
                    alert('✅ تم تعليق المنتج بنجاح. سيختفي من الموقع الآن.');
                    window.location.href = '/'; 
                }
            });
        }
    }
}

// ═══ Load Seller ═══
async function loadSeller(product) {
  try {
    if (product.seller_id) {
      const { data: profile } = await window.supabaseClient
        .from('profiles')
        .select('full_name, role, whatsapp, phone, city, avatar_url')
        .eq('id', product.seller_id)
        .single();

      if (profile) {
        currentSeller = {
          name: profile.full_name || 'بائع',
          type: 'individual',
          role: profile.role,
          id: product.seller_id,
          whatsapp: profile.whatsapp || profile.phone,
          city: profile.city,
          avatar_url: profile.avatar_url
        };
        return;
      }
    }

    if (product.workshop_id) {
      const { data: workshop } = await window.supabaseClient
        .from('workshops')
        .select('*')
        .eq('id', product.workshop_id)
        .single();

      if (workshop) {
        currentSeller = {
          name: workshop.name || 'ورشة',
          type: 'workshop',
          id: workshop.id, // ✅ هنا نستخدم id الورشة
          whatsapp: workshop.whatsapp,
          avatar_url: workshop.logo_url
        };
        return;
      }
    }
    currentSeller = { name: 'بائع', type: 'individual', id: product.seller_id };

  } catch (err) {
    console.warn('Seller fetch error:', err);
    currentSeller = { name: 'بائع', type: 'individual' };
  }
}

// ═══ Render Product ═══
function renderProduct() {
  const p = currentProduct;

  document.getElementById('productTitle').textContent = p.title || 'بدون اسم';

  const priceEl = document.getElementById('productPrice');
  priceEl.innerHTML = `<span>${p.price || 0}</span><small>${p.currency || 'EGP'}</small>`;

  document.getElementById('productDescription').textContent = p.description || 'لا يوجد وصف';

  renderBadges();
  renderGallery();
  renderSeller();
  renderWhatsApp();
  
  document.title = `${p.title || 'المنتج'} — CapKit Co.`;
  
  renderProductLike(p.id);
  
  setTimeout(() => {
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
      shareBtn.onclick = () => shareItem('product', p.id, p.title);
    }
  }, 100);

  updateOpenGraph({
    title: p.title || 'منتج',
    description: p.description?.substring(0, 160) || 'منتج من CapKit Co.',
    image: p.images?.[0] || 'https://capkitco.com/icon-512.png',
    url: `https://capkitco.com/product?id=${p.id}`
  });
    
  initComments('product', p.id);
  initRating('product', p.id);
}

// ═══ Badges ═══
function renderBadges() {
  const p = currentProduct;
  const container = document.getElementById('productBadges');
  container.innerHTML = '';

  if (p.is_capkit_original) {
    const b = document.createElement('span');
    b.className = 'badge-tag original';
    b.textContent = '✨ أصلي';
    container.appendChild(b);
  }

  if (p.seller_type === 'workshop') {
    const b = document.createElement('span');
    b.className = 'badge-tag workshop';
    b.textContent = '🏭 ورشة';
    container.appendChild(b);
  } else {
    const b = document.createElement('span');
    b.className = 'badge-tag individual';
    b.textContent = '👤 بائع حر';
    container.appendChild(b);
  }

  if (p.status === 'published') {
    const b = document.createElement('span');
    b.className = 'badge-tag status';
    b.textContent = '✅ متاح';
    container.appendChild(b);
  }

  if (p.serial_number) {
    const b = document.createElement('span');
    b.className = 'badge-tag original';
    b.textContent = `N° ${p.serial_number}`;
    container.appendChild(b);
  }
}

// ═══ Gallery ═══
function renderGallery() {
  const main = document.getElementById('galleryMain');
  const thumbs = document.getElementById('galleryThumbs');

  if (currentImages.length > 0) {
    main.innerHTML = `<img src="${currentImages[0]}" alt="صورة المنتج" onerror="this.parentElement.innerHTML='<span class=\\'placeholder-icon\\'>📦</span>'">`;
  }

  thumbs.innerHTML = '';
  currentImages.forEach((url, index) => {
    const t = document.createElement('div');
    t.className = 'gallery-thumb' + (index === 0 ? ' active' : '');
    t.innerHTML = `<img src="${url}" alt="صورة ${index + 1}" onerror="this.parentElement.innerHTML='<span>📦</span>'">`;
    t.addEventListener('click', () => switchImage(index));
    thumbs.appendChild(t);
  });

  if (currentImages.length <= 1) {
    thumbs.style.display = 'none';
  }
}

function switchImage(index) {
  activeImageIndex = index;
  const main = document.getElementById('galleryMain');
  main.innerHTML = `<img src="${currentImages[index]}" alt="صورة المنتج">`;

  document.querySelectorAll('.gallery-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === index);
  });
}

// ═══ Seller ═══
function renderSeller() {
  if (!currentSeller) return;

  const box = document.getElementById('sellerBox');
  const icon = currentSeller.type === 'workshop' ? '🏭' : '👤';
  const roleText = currentSeller.type === 'workshop' ? 'ورشة / شركة' : 'بائع حر';

  // ✅ التوجيه الذكي: إذا كان ورشة نفتح صفحة الورشة، وإذا كان بائعاً حراً نفتح صفحة المستخدم
  let sellerLink = '#';
  if (currentSeller.id) {
    sellerLink = currentSeller.type === 'workshop' 
      ? `workshop.html?id=${currentSeller.id}` 
      : `user.html?id=${currentSeller.id}`;
  }

  // ✅ التحقق من وجود صورة للبائع أو شعار للورشة
  let avatarHTML = '';
  if (currentSeller.avatar_url) {
    avatarHTML = `<a href="${sellerLink}" class="seller-avatar" style="text-decoration:none; background-image: url('${currentSeller.avatar_url}'); background-size: cover; background-position: center; color: transparent;"></a>`;
  } else {
    avatarHTML = `<a href="${sellerLink}" class="seller-avatar" style="text-decoration:none;">${icon}</a>`;
  }

  box.innerHTML = `
    ${avatarHTML}
    <div class="seller-info">
      <h4>
        <a href="${sellerLink}" style="color: inherit; text-decoration: none;">
          ${escapeHtml(currentSeller.name)}
        </a>
      </h4>
      <p>${roleText} · موثّق · <span style="color: var(--gold);">شوف الملف ←</span></p>
    </div>
  `;
}

// ═══ WhatsApp (Guests) ═══
function renderWhatsApp() {
  const btn = document.getElementById('whatsappBtn');
  const p = currentProduct;

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
  if (currentSeller?.whatsapp) {
    phone = currentSeller.whatsapp.replace(/\D/g, '');
  }

  const productUrl = `https://capkitco.com/product?id=${p.id}`;
  const message = `مرحباً، أنا مهتم بالمنتج:\n\n${p.title}\n${p.price} ${p.currency}\n\n${productUrl}`;
  const encodedMsg = encodeURIComponent(message);

  if (phone) {
    btn.href = `https://wa.me/${phone}?text=${encodedMsg}`;
  } else {
    btn.href = `https://wa.me/?text=${encodedMsg}`;
  }
}

// ═══ Helpers ═══
function showNotFound() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('productContent').style.display = 'none';
  document.getElementById('notFoundState').style.display = 'block';
}

function showContent() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('notFoundState').style.display = 'none';
  document.getElementById('productContent').style.display = 'block';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══ Start ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProduct);
} else {
  initProduct();
}

async function renderProductLike(productId) {
  const container = document.getElementById('likeContainer');
  if (!container) return;
  container.innerHTML = renderLikeButton('product', productId);
  await refreshLikeButton('product', productId);
}

function updateOpenGraph({ title, description, image, url }) {
  const fullTitle = `${title} — CapKit Co.`;
  const ogTitle = document.getElementById('ogTitle');
  const ogDesc = document.getElementById('ogDescription');
  const ogImage = document.getElementById('ogImage');
  const ogUrl = document.getElementById('ogUrl');
  if (ogTitle) ogTitle.setAttribute('content', fullTitle);
  if (ogDesc) ogDesc.setAttribute('content', description);
  if (ogImage) ogImage.setAttribute('content', image);
  if (ogUrl) ogUrl.setAttribute('content', url);
  const tTitle = document.getElementById('twitterTitle');
  const tDesc = document.getElementById('twitterDescription');
  const tImage = document.getElementById('twitterImage');
  if (tTitle) tTitle.setAttribute('content', fullTitle);
  if (tDesc) tDesc.setAttribute('content', description);
  if (tImage) tImage.setAttribute('content', image);
}
