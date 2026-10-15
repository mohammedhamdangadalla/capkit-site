// ═══ Share System ═══

// ═══ Share Product/Service ═══
window.shareItem = function(type, id, title, imageUrl) {
  const url = `${window.location.origin}/${type}?id=${id}`;
  const shareTitle = `${title} — CapKit Co.`;
  const shareText = `شوف "${title}" على CapKit Co.`;

  // Dialog
  showShareDialog(url, shareTitle, shareText);
};

// ═══ Show Share Dialog ═══
function showShareDialog(url, title, text) {
  // احذف أي Dialog قديم
  document.querySelector('.share-overlay')?.remove();

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedText = encodeURIComponent(text);

  const dialog = document.createElement('div');
  dialog.className = 'share-overlay';
  dialog.innerHTML = `
    <div class="share-dialog">
      <div class="share-header">
        <h3>🔗 مشاركة</h3>
        <button class="share-close" onclick="closeShareDialog()">✕</button>
      </div>
      
      <div class="share-options">
        <a href="https://wa.me/?text=${encodedText}%0A${encodedUrl}" 
           target="_blank" 
           class="share-option whatsapp">
          <span class="share-icon">💬</span>
          <span>واتساب</span>
        </a>
        
        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" 
           target="_blank" 
           class="share-option facebook">
          <span class="share-icon">📘</span>
          <span>فيسبوك</span>
        </a>
        
        <a href="https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}" 
           target="_blank" 
           class="share-option twitter">
          <span class="share-icon">🐦</span>
          <span>تويتر</span>
        </a>
        
        <a href="https://t.me/share/url?url=${encodedUrl}&text=${encodedText}" 
           target="_blank" 
           class="share-option telegram">
          <span class="share-icon">✈️</span>
          <span>تيليجرام</span>
        </a>
      </div>
      
      <div class="share-copy">
        <input type="text" readonly value="${url}" id="shareUrlInput">
        <button onclick="copyShareUrl('${url}')" class="share-copy-btn">
          📋 نسخ
        </button>
      </div>
      
      <div class="share-footer">
        <button onclick="tryNativeShare('${encodedTitle}', '${encodedText}', '${encodedUrl}')" class="share-native-btn">
          📱 مشاركة عبر تطبيقات أخرى
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // Animation
  requestAnimationFrame(() => dialog.classList.add('active'));

  // Close on overlay click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeShareDialog();
  });
}

// ═══ Close Share Dialog ═══
window.closeShareDialog = function() {
  const dialog = document.querySelector('.share-overlay');
  if (dialog) {
    dialog.classList.remove('active');
    setTimeout(() => dialog.remove(), 300);
  }
};

// ═══ Copy URL ═══
window.copyShareUrl = function(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('✅ تم نسخ الرابط!');
    closeShareDialog();
  }).catch(() => {
    showToast('❌ فشل النسخ');
  });
};

// ═══ Native Share (Mobile) ═══
window.tryNativeShare = async function(title, text, url) {
  try {
    if (navigator.share) {
      await navigator.share({
        title: decodeURIComponent(title),
        text: decodeURIComponent(text),
        url: decodeURIComponent(url)
      });
      closeShareDialog();
    } else {
      copyShareUrl(decodeURIComponent(url));
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('Share failed:', err);
    }
  }
};

// ═══ Toast ═══
function showToast(msg) {
  document.querySelector('.share-toast')?.remove();

  const toast = document.createElement('div');
  toast.className = 'share-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
// ═══ Update Open Graph Meta Tags ═══
window.updateOpenGraph = function({ title, description, image, url }) {
  const fullTitle = `${title} — CapKit Co.`;
  
  const setMeta = (id, content) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('content', content);
  };
  
  // OG
  setMeta('ogTitle', fullTitle);
  setMeta('ogDescription', description);
  setMeta('ogImage', image);
  setMeta('ogUrl', url);
  
  // Twitter
  setMeta('twitterTitle', fullTitle);
  setMeta('twitterDescription', description);
  setMeta('twitterImage', image);
  
  console.log('✅ Open Graph updated:', fullTitle);
};
