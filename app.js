(function () {
  "use strict";
  document.documentElement.classList.add("js");

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- sticky bar ---------- */
  var bar = document.getElementById("topbar");
  var onScroll = function () { bar.classList.toggle("is-stuck", window.scrollY > 8); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- mobile nav ---------- */
  var menuBtn = document.getElementById("menuBtn");
  var mobileNav = document.getElementById("mobileNav");
  menuBtn.addEventListener("click", function () {
    var open = menuBtn.getAttribute("aria-expanded") === "true";
    menuBtn.setAttribute("aria-expanded", String(!open));
    mobileNav.hidden = open;
  });
  mobileNav.addEventListener("click", function (e) {
    if (e.target.tagName === "A") { mobileNav.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
  });

  /* ---------- scroll reveal (never leaves content hidden) ---------- */
  var items = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
  var revealAll = function () { items.forEach(function (el) { el.classList.add("is-in"); }); };
  if (reduce || !("IntersectionObserver" in window)) {
    revealAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        entry.target.style.transitionDelay = Math.min(i * 70, 210) + "ms";
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
    window.setTimeout(revealAll, 1400);
  }

  /* ============================================================
     منصة sizing calculator — indicative monthly cost, SAR
     ============================================================ */
  var RATE = {
    computePerTB: 34,     /* حوسبة لكل تيرابايت مستوعَبة شهريًا */
    computePerPipe: 280,  /* حوسبة لكل خط معالجة */
    computePerUser: 12,   /* حوسبة استعلامات لكل مستخدم */
    storagePerTB: 96,     /* تخزين باحتفاظ 12 شهرًا */
    licensePerUser: 82,   /* مقاعد تحليلات لكل مستخدم */
    licensePerPipe: 45,   /* فهرسة + جودة + تتبّع أصل لكل خط */
    engBase: 9000,        /* أساس الهندسة المُدارة */
    engPerPipe: 320,
    engPerTB: 60
  };
  var ENV = {
    cloud:  { label: "سحابي خاص",     infra: 1.00, eng: 1.00 },
    hybrid: { label: "هجين",          infra: 1.15, eng: 1.10 },
    onprem: { label: "داخلي بالكامل", infra: 1.28, eng: 1.20 }
  };
  var RANGE = 0.15;

  var out = document.getElementById("calcOut");
  var form = document.getElementById("calcForm");
  var elTB = document.getElementById("tb");
  var elPipes = document.getElementById("pipes");
  var elUsers = document.getElementById("users");

  var v = {
    env: document.getElementById("oEnv"),
    total: document.getElementById("oTotal"),
    compute: document.getElementById("oCompute"),
    storage: document.getElementById("oStorage"),
    license: document.getElementById("oLicense"),
    eng: document.getElementById("oEng"),
    range: document.getElementById("oRange"),
    unit: document.getElementById("oUnit"),
    year: document.getElementById("oYear"),
    cap: document.getElementById("oCap"),
    bars: {
      compute: document.getElementById("sCompute"),
      storage: document.getElementById("sStorage"),
      license: document.getElementById("sLicense"),
      eng: document.getElementById("sEng")
    }
  };

  var nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  var sar = function (n) { return nf.format(n) + " SAR"; };

  function readNum(el, fallback) {
    var n = parseFloat(el.value);
    if (!isFinite(n) || n < 0) return 0;
    return n;
  }

  function currentEnv() {
    var checked = form.querySelector('input[name="env"]:checked');
    return ENV[checked ? checked.value : "cloud"];
  }

  function share(part, whole) {
    return whole > 0 ? Math.max(1, Math.round((part / whole) * 100)) : 0;
  }

  function render() {
    var tb = readNum(elTB);
    var pipes = readNum(elPipes);
    var users = readNum(elUsers);
    var env = currentEnv();

    var compute = Math.round((tb * RATE.computePerTB + pipes * RATE.computePerPipe + users * RATE.computePerUser) * env.infra);
    var storage = Math.round(tb * RATE.storagePerTB * env.infra);
    var license = Math.round((users * RATE.licensePerUser + pipes * RATE.licensePerPipe) * env.infra);
    var eng = Math.round((RATE.engBase + pipes * RATE.engPerPipe + tb * RATE.engPerTB) * env.eng);

    var total = compute + storage + license + eng;
    var low = Math.round(total * (1 - RANGE));
    var high = Math.round(total * (1 + RANGE));

    v.env.textContent = env.label;
    v.total.textContent = total ? nf.format(total) : "—";
    v.compute.textContent = sar(compute);
    v.storage.textContent = sar(storage);
    v.license.textContent = sar(license);
    v.eng.textContent = sar(eng);
    v.range.textContent = total ? nf.format(low) + " – " + nf.format(high) : "—";
    v.unit.textContent = total && tb ? nf.format(Math.round(total / tb)) + " SAR / TB" : "—";
    v.year.textContent = total ? sar(total * 12) : "—";

    v.bars.compute.style.width = share(compute, total) + "%";
    v.bars.storage.style.width = share(storage, total) + "%";
    v.bars.license.style.width = share(license, total) + "%";
    v.bars.eng.style.width = share(eng, total) + "%";

    var cap;
    if (!total) {
      cap = "أدخل حجم البيانات وعدد الخطوط والمستخدمين لبدء الاحتساب.";
    } else if (tb < 5) {
      cap = "على هذا الحجم الصغير يهيمن بند الهندسة المُدارة على التقدير؛ عمليًا يبدأ المسار الأول بـ <bdi>6</bdi> أسطر معالجة على الأقل ويرتفع نصيب الحوسبة والتخزين مع نمو البيانات.";
    } else if (env.label === "هجين") {
      cap = "البيئة الهجينة تُضيف معامل <bdi>1.15</bdi> على البنية التحتية مقابل التشغيل الموازي ونقل البيانات بين الميدان والسحابة، ومعامل <bdi>1.10</bdi> على الهندسة لإدارة بيئتين.";
    } else if (env.label === "داخلي بالكامل") {
      cap = "البيئة الداخلية تُضيف معامل <bdi>1.28</bdi> على البنية التحتية بدلًا من الفاتورة السحابية المتغيرة — التقدير يفترض إهلاك العتاد على <bdi>4</bdi> سنوات ولا يشمل شراءه مرة واحدة.";
    } else if (total > 200000) {
      cap = "تجاوز التقدير <bdi>200,000</bdi> ريال شهريًا: على هذا الحجم تُبرَم اتفاقيات مؤسسية مع المورّدين وتخفض بندي الحوسبة والتراخيص عادةً بين <bdi>18%</bdi> و<bdi>34%</bdi>.";
    } else {
      cap = "التقدير يفترض منطقة سحابية واحدة داخل المملكة، وتشغيلًا مجدولًا كل <bdi>15</bdi> دقيقة، وضغطًا بنسبة <bdi>3:1</bdi> في المستودع. غير شامل ضريبة القيمة المضافة <bdi>15%</bdi>.";
    }
    v.cap.innerHTML = cap;

    if (!reduce) {
      out.classList.add("is-flash");
      window.setTimeout(function () { out.classList.remove("is-flash"); }, 240);
    }
  }

  [elTB, elPipes, elUsers].forEach(function (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  Array.prototype.forEach.call(form.querySelectorAll('input[name="env"]'), function (r) {
    r.addEventListener("change", render);
  });
  form.addEventListener("submit", function (e) { e.preventDefault(); });
  render();
})();
