// ═══ Search — Logic ═══

let currentQuery = '';
let currentType = 'all';
let currentCategoryId = null;
let categoriesCache = [];
let searchTimeout = null;

// ═══ Init ═══
async function initSearch() {
  if (!window.supabaseClient) {
    console.error('Supabase not ready');
    return;
  }

  // قراءة الـ query من URL (لو موجود)
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  const cat = params.get('cat');
  
  if (q) {
    document.getElementById('searchInput').value = q;
    currentQuery = q;
  }
  
  if (cat) {
    currentCategoryId = parseInt(cat);
  }

  // تحميل التصنيفات
  await loadCategories();

  // ربط الأحداث
  setupEventListeners();

  // البحث الأولي لو فيه query
  if (currentQuery || currentCategoryId) {
    performSearch();
  }
}

// ═══ Load Categories ═══
async function loadCategories() {
  try {
    const { data, error } = await window.supabaseClient
      .from('categories')
      .select('id, name_ar, parent_id, sort_order')
      .order('sort_order');

    if (error) throw error;

    categoriesCache = data || [];

    // تصفية للتصنيفات الرئيسية فقط
    const mainCats = categoriesCache.filter(c => !c.parent_id);

    // ملء الفلاتر
    const container = document.getElementById('categoryFilters');
    container.innerHTML = '';

    // زر "الكل"
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-chip' + (!currentCategoryId ? ' active' : '');
    allBtn.dataset.cat = '';
    allBtn.innerHTML = '📂 كل التصنيفات';
    allBtn.addEventListener('click', () => {
      currentCategoryId = null;
      updateCategoryChips();
      performSearch();
    });
    container.appendChild(allBtn);

    // التصنيفات
    mainCats.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-chip' + (currentCategoryId === cat.id ? ' active' : '');
      btn.dataset.cat = cat.id;
      btn.innerHTML = `📂 ${escapeHtml(cat.name_ar)}`;
      btn.addEventListener('click', () => {
        currentCategoryId = cat.id;
        updateCategoryChips();
        performSearch();
      });
      container.appendChild(btn);
    });

    console.log('✅ Categories loaded:', mainCats.length);

  } catch (err) {
    console.warn('Categories error:', err);
  }
}

// ═══ Update Category Chips ═══
function updateCategoryChips() {
  document.querySelectorAll('#categoryFilters .filter-chip').forEach(chip => {
    const catId = chip.dataset.cat;
    const isActive = (!catId && !currentCategoryId) || (catId && parseInt(catId) === currentCategoryId);
    chip.classList.toggle('active', isActive);
  });
}

// ═══ Setup Event Listeners ═══
function setupEventListeners() {
  // حقل البحث
  const input = document.getElementById('searchInput');
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  // debounce — بحث تلقائي بعد 500ms
  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentQuery = input.value.trim();
      performSearch();
    }, 500);
  });

  // فلتر النوع
  document.querySelectorAll('#typeFilters .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#typeFilters .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentType = chip.dataset.type;
      performSearch();
    });
  });
}

// ═══ Perform Search ═══
window.performSearch = async function() {
  const input = document.getElementById('searchInput');
  currentQuery = input.value.trim();

  // تحديث الـ URL
  const url = new URL(window.location);
  if (currentQuery) url.searchParams.set('q', currentQuery);
  else url.searchParams.delete('q');
  
  if (currentCategoryId) url.searchParams.set('cat', currentCategoryId);
  else url.searchParams.delete('cat');
  
  window.history.replaceState({}, '', url);

  // عرض Loading
  const content = document.getElementById('searchContent');
  content.innerHTML = '<div class="search-loading">⏳ جارٍ البحث...</div>';

  try {
    // ═══ هل فيه بحث؟ ═══
    if (!currentQuery && !currentCategoryId) {
      content.innerHTML = `
        <div class="search-empty">
          <div class="search-empty-icon">🔍</div>
          <h3>ابدأ البحث</h3>
          <p>اكتب كلمة للبحث في المنتجات والخدمات</p>
        </div>
      `;
      document.getElementById('resultsNumber').textContent = '0';
      return;
    }

    // ═══ البحث ═══
    let products = [];
    let services = [];

    // ═══ منتجات ═══
    if (currentType === 'all' || currentType === 'product') {
      let query = window.supabaseClient
        .from('products')
        .select('*')
        .eq('status', 'published');

      if (currentQuery) {
        query = query.or(`title.ilike.%${currentQuery}%,description.ilike.%${currentQuery}%`);
      }

      if (currentCategoryId) {
        query = query.eq('category_id', currentCategoryId);
      }

      const { data } = await query.limit(30);
      products = data || [];
    }

    // ═══ خدمات ═══
    if (currentType === 'all' || currentType === 'service') {
      let query = window.supabaseClient
        .from('services')
        .select('*')
        .eq('status', 'published');

      if (currentQuery) {
        query = query.or(`title.ilike.%${currentQuery}%,description.ilike.%${currentQuery}%`);
      }

      if (currentCategoryId) {
        query = query.eq('category_id', currentCategoryId);
      }

      const { data } = await query.limit(30);
      services = data || [];
    }

    // ═══ عرض النتائج ═══
    const total = products.length + services.length;
    document.getElementById('resultsNumber').textContent = total;

    if (total === 0) {
      content.innerHTML = `
        <div class="search-empty">
          <div class="search-empty-icon">😕</div>
          <h3>لا توجد نتائج</h3>
          <p>حاول تغيير كلمات البحث أو التصنيف</p>
        </div>
      `;
      return;
    }

    // جريد واحد مشترك
    const grid = document.createElement('div');
    grid.className = 'results-grid';

    // خلط النتائج
    const allResults = [
      ...products.map(p => ({ ...p, _type: 'product' })),
      ...services.map(s => ({ ...s, _type: 'service' }))
    ];

    allResults.forEach(item => {
      if (item._type === 'product') {
        grid.appendChild(createProductCard(item));
      } else {
        grid.appendChild(createServiceCard(item));
      }
    });

    content.innerHTML = '';
    content.appendChild(grid);

    console.log(`✅ Results: ${products.length} products, ${services.length} services`);

  } catch (err) {
    console.error('Search error:', err);
    content.innerHTML = `
      <div class="search-empty">
        <div class="search-empty-icon">⚠️</div>
        <h3>حدث خطأ</h3>
        <p>حاول تحديث الصفحة</p>
      </div>
    `;
  }
};

// ═══ Create Product Card ═══
function createProductCard(product) {
  const a = document.createElement('a');
  a.href = `product?id=${product.id}`;
  a.className = 'product-card';

  const img = product.images && product.images[0] ? product.images[0] : '';
  const priceText = product.price ? `${product.price} ${product.currency || 'EGP'}` : 'اتصل للسعر';

  a.innerHTML = `
    <div class="product-image">
      ${img 
        ? `<img src="${img}" alt="${escapeHtml(product.title)}" style="width:100%;height:100%;object-fit:cover;">`
        : `<div class="product-emblem">📦</div>`}
      ${product.is_capkit_original ? '<span class="badge-original">✨ أصلي</span>' : ''}
    </div>
    <div class="product-info">
      <div class="product-title">${escapeHtml(product.title)}</div>
      <div class="product-desc">${escapeHtml((product.description || '').substring(0, 40))}...</div>
            ${renderCardRating(product.rating_avg, product.rating_count)}
      <div class="product-footer">
        <div class="product-price">${priceText}</div>
      </div>
    </div>
  `;

  return a;
}

// ═══ Create Service Card ═══
function createServiceCard(service) {
  const a = document.createElement('a');
  a.href = `service?id=${service.id}`;
  a.className = 'product-card';

  const priceText = service.price_start
    ? `${service.price_start}${service.price_end ? ' - ' + service.price_end : '+'} ${service.currency || 'EGP'}`
    : 'اتصل للسعر';

  a.innerHTML = `
    <div class="product-image">
      <span class="badge-service">خدمة</span>
      <div class="product-emblem service">🔧</div>
    </div>
    <div class="product-info">
      <div class="product-title">${escapeHtml(service.title)}</div>
      <div class="product-desc">${escapeHtml((service.description || '').substring(0, 40))}...</div>
            ${renderCardRating(service.rating_avg, service.rating_count)}
      <div class="product-footer">
        <div class="product-price service-price">${priceText}</div>
      </div>
    </div>
  `;

  return a;
}

// ═══ Helpers ═══
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══ Start ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSearch);
} else {
  initSearch();
}
// ═══ Render Card Rating (نجوم صغيرة للكروت) ═══
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
