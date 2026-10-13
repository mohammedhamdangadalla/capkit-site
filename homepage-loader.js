// ═══ Homepage — Load from Supabase (with Fallback) ═══

async function loadHomepageContent() {
  if (!window.supabaseClient) {
    console.warn('⚠️ Supabase not ready — keeping demo data');
    return;
  }

  try {
    // ═══ 1. المنتجات المميزة ═══
    const { data: products, error: pError } = await window.supabaseClient
      .from('products')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(8);

    if (!pError && products && products.length > 0) {
      const grid = document.getElementById('featuredProductsGrid');
      if (grid) {
        grid.innerHTML = '';
        products.forEach(p => grid.appendChild(createProductCard(p)));
        console.log('✅ Featured products loaded:', products.length);
      }
    }

    // ═══ 2. CapKit Originals ═══
    const { data: originals, error: oError } = await window.supabaseClient
      .from('products')
      .select('*')
      .eq('status', 'published')
      .eq('is_capkit_original', true)
      .order('created_at', { ascending: false })
      .limit(4);

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

    // ═══ 3. الورش المميزة ═══
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

// ═══ Card Builders ═══

function createProductCard(product) {
  const a = document.createElement('a');
  a.href = `product.html?id=${product.id}`;
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
        ? `<img src="${imageUrl}" alt="${escapeHtml(product.title)}" style="width:100%;height:100%;object-fit:cover;">`
        : `<div class="product-emblem">📦</div>`}
      ${product.is_capkit_original ? '<span class="badge-original">✨ أصلي</span>' : ''}
    </div>
    <div class="product-info">
      <div class="product-title">${escapeHtml(product.title)}</div>
      <div class="product-desc">${escapeHtml((product.description || '').substring(0, 40))}...</div>
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
  a.href = `product.html?id=${product.id}`;
  a.className = 'product-card';

  const imageUrl = product.images && product.images.length > 0 
    ? product.images[0] 
    : '';

  const serial = product.serial_number || '';

  a.innerHTML = `
    <div class="product-image">
      ${imageUrl 
        ? `<img src="${imageUrl}" alt="${escapeHtml(product.title)}" style="width:100%;height:100%;object-fit:cover;">`
        : `<div class="product-emblem">✦</div>`}
      ${serial ? `<span class="badge-original">N° ${serial}</span>` : ''}
    </div>
    <div class="product-info">
      <div class="product-title">${escapeHtml(product.title)}</div>
      <div class="product-desc">${escapeHtml((product.description || '').substring(0, 40))}...</div>
      <div class="product-footer">
        <div class="product-price">${product.price || 0} <small>${product.currency || 'EGP'}</small></div>
      </div>
    </div>
  `;

  return a;
}

function createWorkshopCard(workshop) {
  const a = document.createElement('a');
  a.href = `workshop.html?id=${workshop.id}`;
  a.className = 'workshop-card';

  const initial = (workshop.name || 'و').charAt(0);

  a.innerHTML = `
    <div class="workshop-avatar">${escapeHtml(initial)}</div>
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
// ═══ Home Service Card ═══
function createHomeServiceCard(service) {
  const a = document.createElement('a');
  a.href = `service?id=${service.id}`;
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
      <div class="product-footer">
        <div class="product-price service-price">${priceText} ${service.currency || 'EGP'}</div>
        <a href="https://wa.me/?text=${encodeURIComponent('مرحباً، أنا مهتم بالخدمة: ' + service.title)}" 
           class="btn-wa" 
           target="_blank"
           onclick="event.stopPropagation()">اتصال</a>
      </div>
    </div>
  `;

  return a;
}

// ═══ Start ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadHomepageContent);
} else {
  loadHomepageContent();
}
