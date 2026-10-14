// ═══ Likes System ═══

let currentUser = null;
let userLikes = new Set(); // IDs of liked products/services

// ═══ Init ═══
async function initLikes() {
  if (!window.supabaseClient) return;

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  currentUser = session?.user || null;

  if (currentUser) {
    await loadUserLikes();
  }
}

// ═══ Load User's Likes ═══
async function loadUserLikes() {
  if (!currentUser) return;

  const { data, error } = await window.supabaseClient
    .from('likes')
    .select('product_id, service_id')
    .eq('user_id', currentUser.id);

  if (error || !data) return;

  userLikes.clear();
  data.forEach(like => {
    if (like.product_id) userLikes.add('p-' + like.product_id);
    if (like.service_id) userLikes.add('s-' + like.service_id);
  });
}

// ═══ Get Like Count ═══
async function getLikeCount(type, id) {
  const column = type === 'product' ? 'product_id' : 'service_id';
  
  const { count, error } = await window.supabaseClient
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq(column, id);

  if (error) return 0;
  return count || 0;
}

// ═══ Toggle Like ═══
async function toggleLike(type, id) {
  if (!currentUser) {
    showLoginDialog();
    return;
  }

  const key = (type === 'product' ? 'p-' : 's-') + id;
  const isLiked = userLikes.has(key);

  try {
    if (isLiked) {
      // إزالة الإعجاب
      const column = type === 'product' ? 'product_id' : 'service_id';
      const { error } = await window.supabaseClient
        .from('likes')
        .delete()
        .eq('user_id', currentUser.id)
        .eq(column, id);

      if (error) throw error;
      userLikes.delete(key);

    } else {
      // إضافة الإعجاب
      const likeData = { user_id: currentUser.id };
      if (type === 'product') likeData.product_id = id;
      else likeData.service_id = id;

      const { error } = await window.supabaseClient
        .from('likes')
        .insert(likeData);

      if (error) throw error;
      userLikes.add(key);
    }

    // تحديث الواجهة
    await refreshLikeButton(type, id);

  } catch (err) {
    console.error('Like error:', err);
    alert('❌ حدث خطأ، حاول تاني');
  }
}

// ═══ Refresh Like Button ═══
async function refreshLikeButton(type, id) {
  const btn = document.querySelector(`[data-like-type="${type}"][data-like-id="${id}"]`);
  if (!btn) return;

  const key = (type === 'product' ? 'p-' : 's-') + id;
  const isLiked = userLikes.has(key);
  const count = await getLikeCount(type, id);

  btn.classList.toggle('liked', isLiked);
  btn.querySelector('.heart').textContent = isLiked ? '❤️' : '🤍';
  btn.querySelector('.count').textContent = count;
}

// ═══ Show Login Dialog ═══
function showLoginDialog() {
  if (confirm('سجّل دخولك عشان تقدر تعمل إعجاب. تروح لصفحة التسجيل؟')) {
    window.location.href = 'auth.html';
  }
}

// ═══ Render Like Button ═══
function renderLikeButton(type, id) {
  const key = (type === 'product' ? 'p-' : 's-') + id;
  const isLiked = userLikes.has(key);

  return `
    <button 
      class="like-btn ${isLiked ? 'liked' : ''}" 
      data-like-type="${type}" 
      data-like-id="${id}"
      onclick="toggleLike('${type}', '${id}')">
      <span class="heart">${isLiked ? '❤️' : '🤍'}</span>
      <span class="count">0</span>
    </button>
  `;
}

// ═══ Init on Ready ═══
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLikes);
} else {
  initLikes();
}
