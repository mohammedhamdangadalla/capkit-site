// ═══ Data Loader ═══

let CATEGORIES_DATA = null;
let GOVERNORATES_DATA = null;

async function loadJSON(path) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } catch (err) {
    console.error('❌ Failed to load', path, err);
    return null;
  }
}

async function initData() {
  CATEGORIES_DATA = await loadJSON('categories.json');
  GOVERNORATES_DATA = await loadJSON('governorates.json');
  
  if (CATEGORIES_DATA) console.log('✅ Categories loaded');
  if (GOVERNORATES_DATA) console.log('✅ Governorates loaded');
}

document.addEventListener('DOMContentLoaded', initData);
