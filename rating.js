// ═══ Rating System ═══

let ratingUser = null;
let ratingTargetType = null;
let ratingTargetId = null;
let selectedStars = 0;
let userExistingRating = null;

// ═══ Init ═══
async function initRating(type, id) {
  if (!window.supabaseClient) return;

  ratingTargetType = type;
  ratingTargetId = id;

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  ratingUser = session?.user || null;

  // تحقق من تقييم موجود
  if (ratingUser) {
    await checkExistingRating();
  }

  await loadRatingSummary();
  await loadRatings();
  renderRatingForm();
}

// ═══ Check Existing Rating ═══
async function checkExistingRating() {
  const column = ratingTargetType === 'product' ? 'product_id' : 'service_id';
  
  const { data } = await window.supabaseClient
    .from('ratings')
    .select('*')
    .eq('user_id', ratingUser.id)
    .eq(column, ratingTargetId)
    .maybeSingle();

  userExistingRating = data || null;
  if (data) selectedStars = data.rating;
}

// ═══ Render Rating Form ═══
function renderRatingForm() {
  const container = document.getElementById('ratingFormContainer');
  if (!container) return;

  // زائر
  if (!ratingUser) {
    container.innerHTML = `
      <div class="rating-section">
      
       <h3 class="rating-section-title">⭐ قيّم ${ratingTargetType === 'product' ? 'هذا المنتج' : 'هذه الخدمة'}</h3>
        <p class="rating-prompt">سجّل دخولك عشان تقدر تقيّم</p>
        <a href="auth.html" class="rating-submit-btn" style="text-decoration: none; display: inline-block;">تسجيل الدخول</a>
      </div>
    `;
    return;
  }

  // المستخدم نفسه هو البائع
  // (سيتم التحقق لاحقاً)

  // مسجّل دخول
  const isEdit = !!userExistingRating;
  
  container.innerHTML = `
    <div class="rating-section">
      <h3 class="rating-section-title">

     ${isEdit ? '✏️ عدّل تقييمك' : '⭐ قيّم ' + (ratingTargetType === 'product' ? 'هذا المنتج' : 'هذه الخدمة')}
      </h3>
      <p class="rating-prompt">
        ${isEdit ? 'يمكنك تعديل تقييمك في أي وقت' : 'اضغط على النجوم لاختيار التقييم'}
      </p>
      
      <div class="star-rating" id="starRating">
        ${[1,2,3,4,5].map(i => `
          <span 
            class="star ${i <= selectedStars ? 'filled' : ''}" 
            data-value="${i}"
            onclick="selectStar(${i})"
            onmouseover="hoverStar(${i})"
            onmouseout="resetStarHover()"
          >★</span>
        `).join('')}
      </div>
      
      <textarea 
        class="rating-comment-input" 
        id="ratingComment"
        placeholder="اكتب تعليقك (اختياري)..."
        maxlength="500"
      >${userExistingRating?.comment || ''}</textarea>
      
      <div class="modal-message" id="ratingMsg"></div>
      
      <button class="rating-submit-btn" id="ratingSubmitBtn" onclick="submitRating()">
        ${isEdit ? '💾 حفظ التعديل' : '📩 إرسال التقييم'}
      </button>
    </div>
  `;
}

// ═══ Star Interaction ═══
window.selectStar = function(value) {
  selectedStars = value;
  updateStarsDisplay();
};

window.hoverStar = function(value) {
  document.querySelectorAll('#starRating .star').forEach((s, i) => {
    s.classList.toggle('filled', i < value);
  });
};

window.resetStarHover = function() {
  updateStarsDisplay();
};

function updateStarsDisplay() {
  document.querySelectorAll('#starRating .star').forEach((s, i) => {
    s.classList.toggle('filled', i < selectedStars);
  });
}

// ═══ Submit Rating ═══
window.submitRating = async function() {
  if (!ratingUser) {
    window.location.href = 'auth.html';
    return;
  }

  if (selectedStars < 1) {
    showRatingMessage('اختر عدد النجوم أولاً', 'error');
    return;
  }

  const comment = document.getElementById('ratingComment').value.trim();
  const btn = document.getElementById('ratingSubmitBtn');

  btn.disabled = true;
  btn.textContent = '⏳ جارٍ الحفظ...';

  try {
    const ratingData = {
      user_id: ratingUser.id,
      rating: selectedStars,
      comment: comment || null,
      updated_at: new Date().toISOString()
    };

    if (ratingTargetType === 'product') {
      ratingData.product_id = ratingTargetId;
    } else {
      ratingData.service_id = ratingTargetId;
    }

    let result;
    if (userExistingRating) {
      // Update
      result = await window.supabaseClient
        .from('ratings')
        .update(ratingData)
        .eq('id', userExistingRating.id)
        .select();
    } else {
      // Insert
      result = await window.supabaseClient
        .from('ratings')
        .insert(ratingData)
        .select();
    }

    if (result.error) throw new Error(result.error.message);

    showRatingMessage('✅ تم حفظ تقييمك! شكراً', 'success');

    // Reload
    await checkExistingRating();
    await loadRatingSummary();
    await loadRatings();
    renderRatingForm();

  } catch (err) {
    console.error('Rating error:', err);
    showRatingMessage('❌ ' + (err.message || 'فشل الحفظ'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = userExistingRating ? '💾 حفظ التعديل' : '📩 إرسال التقييم';
  }
};

// ═══ Load Rating Summary ═══
async function loadRatingSummary() {
  const container = document.getElementById('ratingSummary');
  if (!container) return;

  const column = ratingTargetType === 'product' ? 'product_id' : 'service_id';

  const { data, error } = await window.supabaseClient
    .from('ratings')
    .select('rating')
    .eq(column, ratingTargetId);

  if (error || !data || data.length === 0) {
    container.innerHTML = '';
    return;
  }

  const total = data.length;
  const avg = (data.reduce((s, r) => s + r.rating, 0) / total).toFixed(1);
  const stars = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));

  container.innerHTML = `
    <div class="rating-summary">
      <div>
        <div class="rating-big">${avg}</div>
      </div>
      <div>
        <div class="rating-stars-big">${stars}</div>
        <div class="rating-count">${total} تقييم</div>
      </div>
    </div>
  `;
}

// ═══ Load Ratings List ═══
async function loadRatings() {
  const container = document.getElementById('ratingsList');
  if (!container) return;

  const column = ratingTargetType === 'product' ? 'product_id' : 'service_id';

  const { data, error } = await window.supabaseClient
    .from('ratings')
    .select(`
      id, rating, comment, created_at, user_id,
      profiles:user_id (full_name)
    `)
    .eq(column, ratingTargetId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';

  data.forEach(rating => {
    container.appendChild(renderRatingCard(rating));
  });
}

// ═══ Render Rating Card ═══
function renderRatingCard(rating) {
  const card = document.createElement('div');
  card.className = 'rating-card';

  const name = rating.profiles?.full_name || 'مستخدم';
  const initial = name.charAt(0).toUpperCase();
  const date = formatRatingDate(rating.created_at);
  const stars = '★'.repeat(rating.rating) + '☆'.repeat(5 - rating.rating);

  card.innerHTML = `
    <div class="rating-card-header">
      <div class="rating-avatar">${initial}</div>
      <div class="rating-info">
        <h4>${escapeHtmlR(name)}</h4>
        <div class="meta">${date}</div>
      </div>
      <div class="rating-stars-big" style="font-size: 0.95rem; letter-spacing: 1px;">${stars}</div>
    </div>
    ${rating.comment ? `<div class="rating-text">${escapeHtmlR(rating.comment)}</div>` : ''}
  `;

  return card;
}

// ═══ Helpers ═══
function showRatingMessage(text, type) {
  const msg = document.getElementById('ratingMsg');
  if (!msg) return;
  msg.textContent = text;
  msg.className = 'modal-message ' + type;
  
  if (type === 'success') {
    setTimeout(() => {
      msg.className = 'modal-message';
    }, 3000);
  }
}

function formatRatingDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
  
  return date.toLocaleDateString('ar-EG', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function escapeHtmlR(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
