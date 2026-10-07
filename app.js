// ═══ CapKit Souq — App Logic ═══

let currentTab = 'products';
let selectedGovernorate = null;
let selectedCategory = null;

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.tab;
    console.log('Tab:', currentTab);
    if (CATEGORIES_DATA) {
      renderTree(document.getElementById('categoriesTree'), CATEGORIES_DATA);
      resetBreadcrumb('categoriesBreadcrumb', 'الرئيسية');
    }
  });
});

// Search tab switching
document.querySelectorAll('.search-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
  });
});

// Apply filter
function applyFilter(path, id) {
  console.log('✅ Filter:', { path, id, tab: currentTab });
  selectedCategory = id;
  closeAllDrawers();
}

// Reset breadcrumb
function resetBreadcrumb(bcId, homeText) {
  const bc = document.getElementById(bcId);
  if (!bc) return;
  bc.innerHTML = `<span class="bc-item bc-home">${homeText}</span>`;
}

// Perform search
function performSearch() {
  const q = document.getElementById('searchInput')?.value || '';
  const searchType = document.querySelector('.search-tab.active')?.dataset.search || 'product';
  console.log('🔍 Search:', { q, type: searchType, gov: selectedGovernorate, cat: selectedCategory });
  alert('سيتم البحث عن: "' + q + '"');
}

// Language toggle
document.querySelector('.lang-toggle')?.addEventListener('click', () => {
  alert('English version coming soon');
});
