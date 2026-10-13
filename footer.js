// ═══ Footer — Auto-inject on all pages ═══

(function() {
  // لو الفوتر موجود مسبقاً، منضيفش تاني
  if (document.querySelector('footer.site-footer')) return;

  const footerHTML = `
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <a href="/" class="logo">
        <span class="logo-mark">C</span>
        <span>CAPKIT<span class="logo-sub">SOUQ</span></span>
      </a>
      <p>
        منصة تجمع الورش والحرفيين ومقدمي الخدمات في العالم العربي.
        عرض مجاني، تواصل مباشر، بلا وسطاء. مشروع من CapKit Co.
      </p>
    </div>

    <div class="footer-col">
      <h4>المنصة</h4>
      <ul>
        <li><a href="search.html">تصفح المنتجات</a></li>
        <li><a href="search.html">الخدمات</a></li>
        <li><a href="search.html">الورش</a></li>
        <li><a href="capkit-co.html">CapKit Originals</a></li>
      </ul>
    </div>

    <div class="footer-col">
      <h4>الصنّاع</h4>
      <ul>
        <li><a href="auth.html">انضم كصانع</a></li>
        <li><a href="auth.html">قدّم خدمة</a></li>
        <li><a href="manifesto.html">الميثاق</a></li>
        <li><a href="about.html">من نحن</a></li>
      </ul>
    </div>

    <div class="footer-col">
      <h4>تواصل</h4>
      <ul>
        <li><a href="https://wa.me/201116549311" target="_blank">واتساب</a></li>
        <li><a href="contact.html">تواصل معنا</a></li>
        <li><a href="mailto:hello@capkitco.com">البريد</a></li>
        <li><a href="about.html">عن CapKit Co.</a></li>
      </ul>
    </div>
  </div>

  <div class="footer-bottom">
    <div>© 2026 CapKit Co. — جميع الحقوق محفوظة · صُنع في مصر</div>
    <div class="footer-legal">
      <a href="terms.html">الشروط والأحكام</a>
      <span>·</span>
      <a href="privacy.html">سياسة الخصوصية</a>
      <span>·</span>
      <a href="manifesto.html">الميثاق</a>
    </div>
  </div>
</footer>
  `;

  // نضيف الفوتر في نهاية الـ body
  document.addEventListener('DOMContentLoaded', function() {
    const temp = document.createElement('div');
    temp.innerHTML = footerHTML;
    const footer = temp.firstElementChild;
    document.body.appendChild(footer);
  });
})();
