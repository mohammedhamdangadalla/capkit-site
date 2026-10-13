// ═══ Footer — Smart Auto-inject ═══

(function() {
  // لو الفوتر موجود مسبقاً، منضيفش تاني
  if (document.querySelector('footer.site-footer')) return;

  // ═══ تحديد الصفحة ═══
  const path = window.location.pathname;
  const isBrandPage = path.includes('capkit-co');

  // ═══ فوتر CapKit Co. (صفحة الدار) ═══
  const brandFooter = `
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <a href="capkit-co.html" class="logo">
        <span class="logo-mark">C</span>
        <span>CAPKIT CO.<span class="logo-sub">كاب كيت كو</span></span>
      </a>
      <p>
        فن التشكيل المعدني الفاخر. قطع مرقّمة، موثّقة، تُقتنى ولا تُستهلك.
        صُنعت في مصر بمعايير عالمية بواسطة كاب كيت كو.
      </p>
    </div>

    <div class="footer-col">
      <h4>المجموعة</h4>
      <ul>
        <li><a href="capkit-co.html#artifacts">الإصدار الأول</a></li>
        <li><a href="capkit-co.html#digital">الأرشيف الرقمي</a></li>
        <li><a href="capkit-co.html#artifacts">الطقم الكامل</a></li>
      </ul>
    </div>

    <div class="footer-col">
      <h4>الدار</h4>
      <ul>
        <li><a href="capkit-co.html#manifesto">الفلسفة</a></li>
        <li><a href="capkit-co.html#certificate">الشهادات والتحقق</a></li>
        <li><a href="capkit-co.html#marketplace">انضم كصانع</a></li>
      </ul>
    </div>

    <div class="footer-col">
      <h4>تواصل</h4>
      <ul>
        <li><a href="https://wa.me/201116549311" target="_blank">واتساب مباشر</a></li>
        <li><a href="contact.html">الطلبات الخاصة (Bespoke)</a></li>
        <li><a href="about.html">دار كاب كيت كو — مصر</a></li>
      </ul>
    </div>
  </div>

  <div class="footer-bottom">
    <div>© 2026 CAPKIT CO. (كاب كيت كو) — جميع الحقوق محفوظة</div>
    <div class="footer-legal">
      <a href="/">← العودة لـ Souq</a>
      <span>·</span>
      <a href="manifesto.html">الميثاق</a>
      <span>·</span>
      <a href="terms.html">الشروط</a>
      <span>·</span>
      <a href="privacy.html">الخصوصية</a>
      <span>·</span>
      <span>صُنع في مصر</span>
    </div>
  </div>
</footer>
  `;

  // ═══ فوتر CapKit Souq (الصفحات العامة) ═══
  const souqFooter = `
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
        <li><a href="capkit-co.html">CapKit Originals ✨</a></li>
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

  // ═══ اختيار الفوتر المناسب ═══
  const footerHTML = isBrandPage ? brandFooter : souqFooter;

  // ═══ إضافته للصفحة ═══
  document.addEventListener('DOMContentLoaded', function() {
    // احذف الفوتر القديم لو موجود (بدون class site-footer)
    const oldFooters = document.querySelectorAll('footer:not(.site-footer)');
    oldFooters.forEach(f => f.remove());

    // أضف الفوتر الجديد
    const temp = document.createElement('div');
    temp.innerHTML = footerHTML;
    const footer = temp.firstElementChild;
    document.body.appendChild(footer);
  });
})();
