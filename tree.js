// ═══ Tree Renderer ═══

// Determine data source and current path
let currentTreeState = {
  categories: { path: [], data: null },
  governorates: { path: [], data: null }
};

function renderTree(container, data, parentPath = []) {
  if (!container) return;
  
  const treeId = container.id;
  const isCategories = treeId === 'categoriesTree';
  const stateKey = isCategories ? 'categories' : 'governorates';
  
  // Save state
  currentTreeState[stateKey] = { path: parentPath, data: data };
  
  container.innerHTML = '';
  
  const list = document.createElement('ul');
  list.className = 'tree-list';
  
  // Get items based on data structure
  let items = [];
  if (data.children) items = data.children;
  else if (data.categories) items = data.categories;
  else if (data.regions) items = data.regions;
  else if (data.governorates) items = data.governorates;
  
  // Add "All" option if at root
  if (parentPath.length === 0) {
    const allLi = document.createElement('li');
    allLi.className = 'tree-item';
    const allBtn = document.createElement('button');
    allBtn.className = 'tree-btn tree-btn-all';
    allBtn.innerHTML = `<span class="tree-icon">🌐</span><span class="tree-name">${isCategories ? 'كل التصنيفات' : 'كل المناطق'}</span>`;
    allBtn.addEventListener('click', () => {
      applyFilter([], isCategories ? 'all-cat' : 'all-gov');
    });
    allLi.appendChild(allBtn);
    list.appendChild(allLi);
  }
  
  // Render items
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'tree-item';
    
    const btn = document.createElement('button');
    btn.className = 'tree-btn';
    
    let content = '';
    if (item.icon) content += `<span class="tree-icon">${item.icon}</span>`;
    content += `<span class="tree-name">${item.name}</span>`;
    
    const hasChildren = item.children && item.children.length > 0;
    if (hasChildren) {
      content += `<span class="tree-arrow">‹</span>`;
    }
    
    btn.innerHTML = content;
    
    btn.addEventListener('click', () => {
      if (hasChildren) {
        // Navigate deeper
        const newPath = [...parentPath, item.name];
        renderTree(container, item, newPath);
        updateBreadcrumb(treeId, newPath, item.name);
      } else {
        // Leaf node — apply filter
        const fullPath = [...parentPath, item.name];
        applyFilter(fullPath, item.id);
        updateBreadcrumb(treeId, parentPath, item.name);
      }
    });
    
    li.appendChild(btn);
    list.appendChild(li);
  });
  
  container.appendChild(list);
  container.scrollTop = 0;
}

function updateBreadcrumb(treeId, parentPath, currentName) {
  const bcId = treeId === 'categoriesTree' ? 'categoriesBreadcrumb' : 'governoratesBreadcrumb';
  const bc = document.getElementById(bcId);
  if (!bc) return;
  
  const rootText = treeId === 'categoriesTree' ? 'الرئيسية' : 'مصر';
  const rootData = treeId === 'categoriesTree' ? CATEGORIES_DATA : GOVERNORATES_DATA;
  
  bc.innerHTML = '';
  
  // Root (clickable)
  const rootSpan = document.createElement('span');
  rootSpan.className = 'bc-item bc-home';
  rootSpan.textContent = rootText;
  rootSpan.addEventListener('click', () => {
    const container = document.getElementById(treeId);
    renderTree(container, rootData, []);
    resetBreadcrumb(bcId, rootText);
  });
  bc.appendChild(rootSpan);
  
  // Path items
  parentPath.forEach((pathName) => {
    const sep = document.createElement('span');
    sep.className = 'bc-sep';
    sep.textContent = '›';
    bc.appendChild(sep);
    
    const item = document.createElement('span');
    item.className = 'bc-item';
    item.textContent = pathName;
    bc.appendChild(item);
  });
  
  // Current
  if (currentName) {
    const sep = document.createElement('span');
    sep.className = 'bc-sep';
    sep.textContent = '›';
    bc.appendChild(sep);
    
    const current = document.createElement('span');
    current.className = 'bc-item bc-current';
    current.textContent = currentName;
    bc.appendChild(current);
  }
}

// Override applyFilter to update UI
const originalApplyFilter = window.applyFilter;
window.applyFilter = function(path, id) {
  console.log('🎯 Applied:', { path, id });
  closeAllDrawers();
  // Future: fetch and display results
};
