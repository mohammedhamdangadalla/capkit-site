// ═══ Drawer Control ═══

function openDrawer(id) {
  closeAllDrawers();
  const drawer = document.getElementById(id);
  const overlay = document.getElementById('overlay');
  if (drawer) {
    drawer.classList.add('active');
    overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeDrawer(id) {
  const drawer = document.getElementById(id);
  const overlay = document.getElementById('overlay');
  if (drawer) {
    drawer.classList.remove('active');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function closeAllDrawers() {
  document.querySelectorAll('.drawer').forEach(d => d.classList.remove('active'));
  document.getElementById('overlay')?.classList.remove('active');
  document.body.style.overflow = '';
}

// Escape key closes drawer
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllDrawers();
});

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Open categories drawer
  document.getElementById('openCategories')?.addEventListener('click', () => {
    openDrawer('categoriesDrawer');
    if (CATEGORIES_DATA) {
      renderTree(document.getElementById('categoriesTree'), CATEGORIES_DATA);
    }
  });

  // Open governorates drawer
  document.getElementById('openGovernorates')?.addEventListener('click', () => {
    openDrawer('governoratesDrawer');
    if (GOVERNORATES_DATA) {
      renderTree(document.getElementById('governoratesTree'), GOVERNORATES_DATA);
    }
  });

  // Open search drawer
  document.getElementById('openSearch')?.addEventListener('click', () => {
    openDrawer('searchDrawer');
  });
});
