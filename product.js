// ═══ Product Detail Page ═══

let currentProduct = null;
let currentSeller = null;
let currentImages = [];
let activeImageIndex = 0;

// ═══ Init ═══
async function initProduct() {
  if (!window.supabaseClient) {
    showNotFound();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');

  if (!productId) {
    showNotFound();
    return;
  }

  try {
    // جلب المنتج
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

    // جلب معلومات البائع
    await loadSeller(product);

    // عرض المنتج
    renderProduct();
    showContent();

  } catch (err) {
    console.error(err);
    showNotFound();
  }
}

// ═══ Load Seller ═══
async function loadSeller(product) {
  try {
    // لو فيه seller_id (بائع حر)
    if (product.seller_id) {
      const { data: profile } = await window.supabaseClient
        .from('profiles')
        .select('full_name, role, governorate_id')
        .eq('id', product.seller_id)
        .single();

      if (profile) {
        currentSeller = {
          name: profile.full_name || 'بائع',
          type: 'individual',
          role: profile.role,
          id: product.seller_id
        };
        return;
      }
    }

    // لو فيه workshop_id
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
          id: workshop.id,
          whatsapp: workshop.whatsapp
        };
        return;
      }
    }

    // Fallback
    currentSeller = {
      name: 'بائع',
      type: 'individual',
      id: product.seller_id
    };

  } catch (err) {
    console.warn('Seller fetch error:', err);
    currentSeller = { name: 'بائع', type: 'individual' };
  }
}

// ═══ Render Product ═══
function renderProduct() {
  const p = currentProduct;

  // Title
  document.getElementById('productTitle').textContent = p.title || 'بدون اسم';

  // Price
  const priceEl = document.getElementById('productPrice');
  priceEl.innerHTML = `<span>${p.price || 0}</span><small>${p.currency || 'EGP'}</small>`;

  // Description
  document.getElementById('productDescription').textContent = 
    p.description || 'لا يوجد وصف';

  // Badges
  renderBadges();

  // Gallery
  renderGallery();

  // Seller
  renderSeller();

  // WhatsApp
  renderWhatsApp();

  // Page Title
  document.title = `${p.title || 'المنتج'} — CapKit Co.`;
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

  // Main Image
  if (currentImages.length > 0) {
    main.innerHTML = `<img src="${currentImages[0]}" alt="صورة المنتج" onerror="this.parentElement.innerHTML='<span class=\\'placeholder-icon\\'>📦</span>'">`;
  }

  // Thumbs
  thumbs.innerHTML = '';
  currentImages.forEach((url, index) => {
    const t = document.createElement('div');
    t.className = 'gallery-thumb' + (index === 0 ? ' active' : '');
    t.innerHTML = `<img src="${url}" alt="صورة ${index + 1}" onerror="this.parentElement.innerHTML='<span>📦</span>'">`;
    t.addEventListener('click', () => switchImage(index));
    thumbs.appendChild(t);
  });

  // Hide thumbs if only 1 image
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
  const roleText = currentSeller.type === 'workshop' 
    ? 'ورشة / شركة' 
    : 'بائع حر';

  box.innerHTML = `
    <div class="seller-avatar">${icon}</div>
    <div class="seller-info">
      <h4>${escapeHtml(currentSeller.name)}</h4>
      <p>${roleText} · موثّق</p>
    </div>
  `;
}

// ═══ WhatsApp ═══
function renderWhatsApp() {
  const btn = document.getElementById('whatsappBtn');
  const p = currentProduct;

  // رقم الواتساب
  let phone = '';

  if (currentSeller?.whatsapp) {
    phone = currentSeller.whatsapp.replace(/\D/g, '');
  }

  // نص الرسالة
 const productUrl = `https://capkitco.com/product.html?id=${product.id}`;

const message = `مرحباً، أنا مهتم بالمنتج:

${product.title}
${product.price} ${product.currency}

${productUrl}`;

const encodedMsg = encodeURIComponent(message);

  if (phone) {
    btn.href = `https://wa.me/${phone}?text=${encodedMsg}`;
  } else {
    // لو مفيش رقم، نحط نص بس
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
