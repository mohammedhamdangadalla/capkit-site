// ═══ Data Loader — Supabase Edition ═══

let CATEGORIES_DATA = null;
let GOVERNORATES_DATA = null;

// ═══ Region Meta (للمحافظات) ═══
const REGION_META = {
  'greater-cairo': { name: 'القاهرة الكبرى', icon: '🏙️' },
  'alexandria-delta': { name: 'الإسكندرية والدلتا', icon: '🌊' },
  'canal': { name: 'القناة', icon: '🚢' },
  'upper-egypt': { name: 'الوجه القبلي', icon: '🏜️' },
  'coasts': { name: 'السواحل والصحراء', icon: '🏝️' }
};

// ═══ بناء شجرة التصنيفات من قائمة مسطحة ═══
function buildCategoryTree(flatList) {
  const map = {};
  const roots = [];
  
  flatList.forEach(item => {
    map[item.id] = {
      id: item.slug || String(item.id),
      name: item.name_ar,
      name_en: item.name_en,
      icon: item.icon,
      type: item.type,
      children: []
    };
  });
  
  flatList.forEach(item => {
    if (item.parent_id && map[item.parent_id]) {
      map[item.parent_id].children.push(map[item.id]);
    } else {
      roots.push(map[item.id]);
    }
  });
  
  function cleanChildren(node) {
    if (node.children.length === 0) {
      delete node.children;
    } else {
      node.children.forEach(cleanChildren);
    }
  }
  roots.forEach(cleanChildren);
  
  return roots;
}

// ═══ بناء شجرة المحافظات (حسب المنطقة) ═══
function buildGovernorateTree(flatList) {
  const regions = {};
  
  flatList.forEach(gov => {
    const key = gov.region || 'other';
    if (!regions[key]) {
      regions[key] = {
        id: key,
        name: REGION_META[key]?.name || key,
        icon: REGION_META[key]?.icon || '📍',
        children: []
      };
    }
    regions[key].children.push({
      id: gov.name_en?.toLowerCase().replace(/\s+/g, '-') || String(gov.id),
      name: gov.name_ar,
      name_en: gov.name_en
    });
  });
  
  return Object.values(regions);
}

// ═══ جلب البيانات من Supabase ═══
async function loadFromSupabase() {
  if (!window.supabaseClient) {
    throw new Error('Supabase client not ready');
  }
  
  // التصنيفات
  const catsResult = await window.supabaseClient
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });
  
  if (catsResult.error) throw catsResult.error;
  
  CATEGORIES_DATA = {
    version: '2.0',
    source: 'supabase',
    categories: buildCategoryTree(catsResult.data || [])
  };
  console.log('✅ Categories from Supabase:', catsResult.data?.length || 0);
  
  // المحافظات
  const govsResult = await window.supabaseClient
    .from('governorates')
    .select('*')
    .order('sort_order', { ascending: true });
  
  if (govsResult.error) throw govsResult.error;
  
  GOVERNORATES_DATA = {
    version: '2.0',
    source: 'supabase',
    regions: buildGovernorateTree(govsResult.data || [])
  };
  console.log('✅ Governorates from Supabase:', govsResult.data?.length || 0);
  
  // لو فاضي، نرجع للـ JSON
  if (!catsResult.data?.length || !govsResult.data?.length) {
    console.warn('⚠️ Empty data, falling back to JSON');
    await loadFromJSON();
  }
}

// ═══ Fallback: قراءة من JSON محلي ═══
async function loadFromJSON() {
  try {
    const catRes = await fetch('categories.json');
    if (catRes.ok) {
      CATEGORIES_DATA = await catRes.json();
      console.log('📁 Categories from JSON');
    }
    
    const govRes = await fetch('governorates.json');
    if (govRes.ok) {
      GOVERNORATES_DATA = await govRes.json();
      console.log('📁 Governorates from JSON');
    }
  } catch (err) {
    console.error('❌ JSON fallback failed:', err);
  }
}

// ═══ الدالة الرئيسية ═══
async function initData() {
  try {
    await loadFromSupabase();
  } catch (err) {
    console.error('❌ Supabase error:', err.message);
    await loadFromJSON();
  }
  
  // إشعار باقي السكريبتات
  document.dispatchEvent(new CustomEvent('dataReady', {
    detail: {
      categories: CATEGORIES_DATA,
      governorates: GOVERNORATES_DATA
    }
  }));
}

// ═══ تشغيل عند جاهزية DOM ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initData);
} else {
  initData();
      }
