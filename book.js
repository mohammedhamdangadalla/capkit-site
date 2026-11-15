// ═══════════════════════════════════════════════════════════════════════
// book.js — حاسبات الكتاب التفاعلي (بلا مكتبات)
// ═══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var num = function (el, fallback) {
    var v = parseFloat(el && el.value);
    return isFinite(v) ? v : (fallback || 0);
  };
  var fx = function (n, d) {
    if (!isFinite(n)) return '—';
    var s = Number(n).toFixed(d == null ? 1 : d);
    return s.replace(/\.0+$/, '');
  };

  /* ═════════════ 1) الليزر: الإعدادات ═════════════ */

  var LASER_K = {
    acrylic: 1.20,
    mdf: 0.85,
    plywood: 0.95,
    wood: 1.00,
    leather: 0.35,
    cardboard: 0.20,
    felt: 0.18
  };

  var LASER_NAMES = {
    acrylic: 'أكريليك',
    mdf: 'MDF',
    plywood: 'خشب رقائقي',
    wood: 'خشب صلب',
    leather: 'جلد',
    cardboard: 'كرتون',
    felt: 'جوخ'
  };

  function calcLaser() {
    var mat = $('lzMat').value;
    var k = LASER_K[mat] || 1;
    var t = Math.max(0.2, num($('lzThick'), 3));
    var W = Math.max(5, num($('lzPower'), 60));
    var pct = Math.min(100, Math.max(5, num($('lzPct'), 55)));
    var P = W * pct / 100;

    var speed = P / (k * t);       // مم/ث
    var passes = 1;
    var clamped = false;
    var MAX = 55, MIN = 1.5;

    if (speed < MIN) {
      passes = Math.ceil(MIN / speed);
      speed = MIN;
      clamped = true;
    } else if (speed > MAX) {
      speed = MAX;
      clamped = true;
    }

    var energy = P / speed;        // جول/مم

    $('lzSpeed').textContent = fx(speed, 1);
    $('lzPasses').textContent = String(passes);
    $('lzEnergy').textContent = fx(energy, 1);

    $('lzFormula').textContent =
      'speed = (' + W + ' × ' + pct + '%) ÷ (' + k + ' × ' + fx(t, 2) + ') = ' +
      fx(P / (k * t), 1) + ' mm/s   →   passes = ' + passes;

    var box = $('lzMsg');
    box.className = 'msg ' + (clamped ? 'warn' : 'ok');
    box.textContent = clamped
      ? 'النتيجة المحسوبة خارج النطاق العملي، فتم تعديلها. ابدأ بهذه القيمة ثم عدّل ±10% حسب النتيجة.'
      : 'قيمة داخل النطاق العملي. اختبرها على قصاصة ' + LASER_NAMES[mat] + ' بسماكة ' + fx(t, 1) + ' مم.';

    if (t > 10 && mat === 'acrylic') {
      box.className = 'msg warn';
      box.textContent = 'سماكة كبيرة على الأكريليك: استخدم عدسة أطول (76 مم) وتمريرات متعددة.';
    }
    if (W > 100 && pct > 85) {
      box.className = 'msg warn';
      box.textContent = 'قدرة عالية لفترة طويلة تُقصّر عمر الأنبوب. راقب حرارة ماء التبريد.';
    }
  }

  /* ═════════════ 2) الليزر: Kerf ═════════════ */

  function calcKerf() {
    var design = num($('kfDesign'), 20);
    var measured = num($('kfMeasured'), design);
    var kerf = design - measured;
    var side = kerf / 2;

    $('kfKerf').textContent = fx(kerf, 2);
    $('kfSide').textContent = fx(side, 2);
    $('kfSlot').textContent = fx(design - kerf, 2);
    $('kfTab').textContent = fx(design + kerf, 2);

    var box = $('kfMsg');
    if (kerf <= 0) {
      box.className = 'msg bad';
      box.textContent = 'المقاس الناتج أكبر من المرسوم — تأكد من اتجاه القياس (خارجي/داخلي) وأن الملف ليس مكبّراً.';
    } else if (kerf > 0.8) {
      box.className = 'msg warn';
      box.textContent = 'Kerf كبير غير معتاد. افحص البؤرة ونظافة العدسة؛ قد تكون خارج التركيز.';
    } else {
      box.className = 'msg ok';
      box.textContent = 'Kerf = ' + fx(kerf, 2) + ' مم. أعد القياس على مادة أخرى إن غيّرت السماكة أو العدسة.';
    }
  }

  /* ═════════════ 3) الراوتر ═════════════ */

  var ROUTER = {
    wood:    { chip: [0.05, 0.10], name: 'خشب صلب' },
    mdf:     { chip: [0.05, 0.08], name: 'MDF' },
    plywood: { chip: [0.04, 0.08], name: 'خشب رقائقي' },
    acrylic: { chip: [0.03, 0.06], name: 'أكريليك' },
    alu:     { chip: [0.01, 0.03], name: 'ألومنيوم' }
  };

  function calcRouter() {
    var mat = $('rtMat').value;
    var cfg = ROUTER[mat] || ROUTER.mdf;
    var dia = Math.max(1, num($('rtDia'), 6));
    var flutes = Math.max(1, Math.min(6, num($('rtFlutes'), 2)));
    var rpm = Math.max(3000, num($('rtRpm'), 18000));
    var thick = Math.max(1, num($('rtThick'), 18));

    var chipTarget = (cfg.chip[0] + cfg.chip[1]) / 2;
    var feed = rpm * flutes * chipTarget;      // مم/دقيقة
    var depth = 0.5 * dia;
    var passes = Math.ceil(thick / depth);

    $('rtChip').textContent = fx(chipTarget, 3);
    $('rtFeed').textContent = Math.round(feed);
    $('rtDepth').textContent = fx(depth, 2);
    $('rtPasses').textContent = String(passes);

    $('rtFormula').textContent =
      'feed = ' + rpm + ' × ' + flutes + ' × ' + fx(chipTarget, 3) + ' = ' +
      Math.round(feed) + ' mm/min ; depth = 0.5 × ' + dia + ' = ' + fx(depth, 2) + ' mm';

    var box = $('rtMsg');
    if (feed > 6000) {
      box.className = 'msg warn';
      box.textContent = 'التغذية عالية جداً لمعظم الماكينات الصغيرة — اخفض RPM أو عدد الأسنان.';
    } else if (feed < 400) {
      box.className = 'msg warn';
      box.textContent = 'التغذية منخفضة: قد تحترق الحواف أو تبلى الأداة بسرعة.';
    } else {
      box.className = 'msg ok';
      box.textContent = 'نطاق حمل الرقاقة للمادة: ' + cfg.chip[0] + '–' + cfg.chip[1] + ' مم/سن. ابدأ بالنتيجة وعدّل ±15% حسب الصوت والنشارة.';
    }
  }

  /* ═════════════ 4) الطباعة ═════════════ */

  var DEFECTS = {
    stringing: {
      title: 'خيوط بين الأجزاء',
      causes: ['حرارة الفوهة أعلى من اللازم', 'تراجع (Retraction) ضعيف', 'رطوبة في الفتيل'],
      fixes: ['اخفض الحرارة 5–10°م', 'زد مسافة/سرعة التراجع', 'جفّف الفتيل أو استبدله']
    },
    warping: {
      title: 'التواء الأطراف',
      causes: ['تبريد غير متساوٍ', 'سطح غير ساخن', 'انكماش المادة (ABS)'],
      fixes: ['ارفع حرارة السرير', 'أغلق الحصر الحراري', 'استخدم Brim عريضاً أو مادة أقل انكماشاً']
    },
    layer: {
      title: 'انفصال الطبقات',
      causes: ['حرارة منخفضة', 'تدفق ضعيف', 'مروحة تبريد قوية جداً'],
      fixes: ['زد الحرارة 5–10°م', 'زد التدفق 5%', 'قلّل تبريد المروحة']
    },
    elephant: {
      title: 'قدم الفيل',
      causes: ['الفوهة قريبة جداً من السرير', 'حرارة سرير عالية'],
      fixes: ['ارفع Z-offset قليلاً', 'اخفض حرارة السرير 5°م', 'أضف شطفة (Chamfer) في التصميم']
    },
    clog: {
      title: 'انسداد الفوهة',
      causes: ['بقايا كربون', 'حرارة غير مناسبة للمادة', 'رطوبة/غبار'],
      fixes: ['نفّذ Cold Pull', 'أعد معايرة الحرارة', 'نظّف الفوهة بإبرة مخصصة']
    }
  };

  function calcPrinter() {
    var shape = $('prShape').value;
    var a = Math.max(1, num($('prA'), 60));
    var b = Math.max(1, num($('prB'), 40));
    var c = Math.max(1, num($('prC'), 30));

    var V = 0, A = 0; // mm³, mm²
    if (shape === 'cube') {
      V = a * b * c;
      A = 2 * (a * b + a * c + b * c);
    } else if (shape === 'cyl') {
      var r = a / 2;
      V = Math.PI * r * r * c;
      A = 2 * Math.PI * r * r + 2 * Math.PI * r * c;
    } else {
      V = a * b * c;
      A = 2 * (a * b + a * c + b * c);
    }

    var walls = Math.max(1, num($('prWalls'), 2));
    var infill = Math.min(100, Math.max(0, num($('prInfill'), 20))) / 100;
    var density = parseFloat($('prMat').value) || 1.24;
    var flow = Math.max(1, num($('prFlow'), 5));

    var shell = Math.min(V, A * walls * 0.45);
    var infillVol = Math.max(0, (V - shell) * infill);
    var used = shell + infillVol;

    var mass = (used / 1000) * density;               // جم
    var hours = used / flow / 3600;                   // ساعة
    var hoursTxt = hours >= 1
      ? Math.floor(hours) + ' س ' + Math.round((hours % 1) * 60) + ' د'
      : Math.round(hours * 60) + ' د';

    var filamentArea = Math.PI * Math.pow(1.75 / 2, 2); // مم²
    var filLen = (used / filamentArea) / 1000;          // متر

    $('prVol').textContent = fx(V / 1000, 1);
    $('prMass').textContent = fx(mass, 1);
    $('prTime').textContent = hoursTxt;
    $('prFil').textContent = fx(filLen, 2);

    $('prFormula').textContent =
      'V = ' + Math.round(V) + ' mm³ ; shell = ' + Math.round(A) + ' × ' + walls + ' × 0.45 = ' +
      Math.round(shell) + ' ; mass = ' + Math.round(used) + '/1000 × ' + density + ' = ' + fx(mass, 1) + ' g';

    var box = $('prMsg');
    box.className = 'msg ok';
    box.textContent = 'الزمن تقديري بافتراض تدفق ' + flow + ' مم³/ث. الحركات والتسارع يضيفان 10–25%.';
    if (mass > 300) {
      box.className = 'msg warn';
      box.textContent = 'كتلة كبيرة: تحقق من كفاية الفتيل وأعد ترتيب الدعامات قبل الطباعة.';
    }
  }

  function renderDefect() {
    var d = DEFECTS[$('prDefect').value];
    if (!d) return;
    var html = '<h4>الأسباب المرجّحة — ' + d.title + '</h4><ul>';
    d.causes.forEach(function (x) { html += '<li>' + x + '</li>'; });
    html += '</ul><h4>ما تفعله</h4><ul>';
    d.fixes.forEach(function (x) { html += '<li>' + x + '</li>'; });
    html += '</ul>';
    $('diagOut').innerHTML = html;
  }

  /* ═════════════ 5) قائمة الفحص ═════════════ */

  var CHECKS = [
    'العدسة نظيفة وجافة',
    'المرايا مضبوطة (اختبار النقطة)',
    'ماء التبريد بالدرجة الصحيحة',
    'الهواء المساعد يعمل',
    'العادم يسحب الدخان',
    'طفاية CO2 قريبة وصالحة',
    'لا مواد قابلة للاشتعال حول الماكينة',
    'الغطاء مغلق / Interlock يعمل',
    'المادة مثبّتة على الطاولة',
    'صفر Z مضبوط (راوتر)',
    'الاتجاه والوجه الأمامي محددان',
    'الملف يحتوي العدد الصحيح من القطع'
  ];

  function renderChecklist() {
    var list = $('checklistList');
    if (!list) return;
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem('ckbook.checklist') || '{}'); } catch (e) { saved = {}; }

    list.innerHTML = CHECKS.map(function (txt, i) {
      var on = Boolean(saved[i]);
      return '<li class="' + (on ? 'done' : '') + '"><input type="checkbox" data-i="' + i + '"' +
        (on ? ' checked' : '') + '><span>' + txt + '</span></li>';
    }).join('');

    list.querySelectorAll('input').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var i = cb.getAttribute('data-i');
        var st = {};
        try { st = JSON.parse(localStorage.getItem('ckbook.checklist') || '{}'); } catch (e) { st = {}; }
        st[i] = cb.checked;
        localStorage.setItem('ckbook.checklist', JSON.stringify(st));
        cb.closest('li').classList.toggle('done', cb.checked);
        updateCheckCount();
      });
    });

    updateCheckCount();
  }

  function updateCheckCount() {
    var done = document.querySelectorAll('#checklistList input:checked').length;
    var el = $('chkDone');
    if (el) el.textContent = done + '/' + CHECKS.length;
  }

  /* ═════════════ 6) تقدم القراءة ═════════════ */

  function initProgress() {
    var sections = document.querySelectorAll('section');
    var bar = $('progressBar');
    if (!bar || !sections.length) return;

    var seen = new Set();

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          seen.add(e.target.id);
          bar.style.width = Math.round((seen.size / sections.length) * 100) + '%';
        }
      });
    }, { threshold: 0.35 });

    sections.forEach(function (s) { io.observe(s); });
  }

  /* ═════════════ التشغيل ═════════════ */

  function bind() {
    ['lzMat', 'lzThick', 'lzPower', 'lzPct'].forEach(function (id) {
      $(id).addEventListener('input', calcLaser);
      $(id).addEventListener('change', calcLaser);
    });

    ['kfDesign', 'kfMeasured'].forEach(function (id) {
      $(id).addEventListener('input', calcKerf);
    });

    ['rtMat', 'rtDia', 'rtFlutes', 'rtRpm', 'rtThick'].forEach(function (id) {
      $(id).addEventListener('input', calcRouter);
      $(id).addEventListener('change', calcRouter);
    });

    ['prShape', 'prA', 'prB', 'prC', 'prWalls', 'prLayer', 'prInfill', 'prMat', 'prFlow'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', calcPrinter);
      el.addEventListener('change', function () {
        toggleShape();
        calcPrinter();
      });
    });

    $('prDefect').addEventListener('change', renderDefect);

    calcLaser();
    calcKerf();
    calcRouter();
    calcPrinter();
    renderDefect();
    renderChecklist();
    toggleShape();
    initProgress();
  }

  function toggleShape() {
    var shape = $('prShape').value;
    var fB = $('fB');
    if (!fB) return;
    fB.style.display = shape === 'cyl' ? 'none' : '';
    var bLabel = $('prB').previousElementSibling;
    if (bLabel && shape === 'cyl') bLabel.textContent = '—';
    else if (bLabel) bLabel.textContent = 'العرض (مم)';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
