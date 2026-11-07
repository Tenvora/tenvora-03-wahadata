/* ═══════════════════════════════════════════════════════════════════════
   واحة داتا — محرك القياسات الحيّة (Live Telemetry)
   حلقة requestAnimationFrame واحدة · كل مهمة لها سقف تحديث · لا setInterval
   ولا setTimeout · لا طلبات شبكة إطلاقًا · البيانات تجريبية بالكامل.
   ═══════════════════════════════════════════════════════════════════════ */
function boot() {
  "use strict";

  var root = document.documentElement;
  var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduce = mqReduce.matches;
  var paused = false;
  var pageVisible = !document.hidden;

  /* ── ENGINE : one rAF loop, per-task fps ceilings ───────────────────── */
  var Engine = {
    tasks: [],
    raf: 0,
    time: 0,
    last: 0,
    add: function (task) {
      task.acc = 0;
      task.dead = false;
      task.active = task.active !== false;
      this.tasks.push(task);
      this.start();
      return task;
    },
    start: function () {
      if (this.raf || paused || !pageVisible || !this.tasks.length) return;
      var self = this;
      this.last = 0;
      this.raf = requestAnimationFrame(function (n) { self.frame(n); });
    },
    stop: function () {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    },
    frame: function (now) {
      this.raf = 0;
      if (!this.tasks.length || paused || !pageVisible) return;
      var step = this.last ? Math.min(0.06, (now - this.last) / 1000) : 0.016;
      this.last = now;
      this.time += step;
      for (var i = this.tasks.length - 1; i >= 0; i--) {
        var t = this.tasks[i];
        if (t.dead) { this.tasks.splice(i, 1); continue; }
        if (!t.active) continue;
        var min = 1 / (t.fps || 60);
        t.acc += step;
        if (t.acc < min) continue;
        var dt = t.acc;
        t.acc = 0;
        t.tick(this.time, dt);
      }
      var self = this;
      this.raf = requestAnimationFrame(function (n) { self.frame(n); });
    },
    /* motion off → freeze every task in its finished state */
    settle: function () {
      for (var i = 0; i < this.tasks.length; i++) {
        var t = this.tasks[i];
        if (t.finalize) { try { t.finalize(); } catch (e) {} }
      }
    }
  };

  /* ── UTILITIES ───────────────────────────────────────────────────────── */
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }

  function inView(node, cb, threshold) {
    if (!("IntersectionObserver" in window)) { cb(true); return null; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { cb(e.isIntersecting, e); });
    }, { rootMargin: "0px 0px -8% 0px", threshold: threshold || 0.08 });
    io.observe(node);
    return io;
  }

  /* continuous tasks sleep when their own section leaves the viewport */
  function gate(node, task) {
    if (!node || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { task.active = e.isIntersecting; });
    }, { threshold: 0 });
    io.observe(node);
  }

  /* ── 1. COUNTERS : count-up, then gentle live drift ──────────────────── */
  qsa("[data-countup]").forEach(function (el, idx) {
    var target = parseFloat(el.getAttribute("data-target")) || 0;
    var dec = parseInt(el.getAttribute("data-decimals"), 10) || 0;
    var amp = target > 0 ? Math.max(target * 0.004, Math.pow(10, -dec) * 1.5) : 0;

    function write(v) { el.textContent = v.toFixed(dec); }
    function settle() { write(target); }
    write(reduce || paused ? target : 0);

    inView(el, function (seen) {
      if (!seen || el.dataset.ran === "1") return;
      el.dataset.ran = "1";
      if (reduce || paused) { settle(); return; }

      var dur = 1.05 + (idx % 4) * 0.12, p = 0;
      Engine.add({
        fps: 60,
        label: "counter",
        tick: function (t, dt) {
          p = clamp(p + dt / dur, 0, 1);
          write(target * easeOut(p));
          if (p >= 1) { this.dead = true; settle(); drift(); }
        },
        finalize: settle
      });

      function drift() {
        if (reduce) return;
        var task = Engine.add({
          fps: 3,
          label: "drift",
          tick: function (t) { write(target + Math.sin(t * 0.8 + idx) * amp); },
          finalize: settle
        });
        gate(el.parentNode, task);
      }
    });
  });

  /* ── 2. SPARKLINE : draws itself, then streams new samples ───────────── */
  (function spark() {
    var line = qs("#sparkLine"), area = qs("#sparkArea"), head = qs("#sparkHead");
    if (!line || !area || !head) return;
    var W = 320, H = 104, PAD = 10, N = 24;
    var data = [];
    for (var i = 0; i < N; i++) data.push(0.28 + 0.02 * i + Math.sin(i * 0.7) * 0.08);

    function build() {
      /* RTL-aware time axis: the oldest sample sits at the right, "now" arrives at the left */
      var usable = W - PAD * 2, d = "";
      for (var i = 0; i < N; i++) {
        var x = W - PAD - (i * usable) / (N - 1);
        var y = H - PAD - data[i] * (H - PAD * 2);
        d += (i ? " L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
      }
      line.setAttribute("d", d);
      area.setAttribute("d", d + " L" + PAD + "," + (H - 2) + " L" + (W - PAD) + "," + (H - 2) + " Z");
      head.setAttribute("cx", PAD);
      head.setAttribute("cy", (H - PAD - data[data.length - 1] * (H - PAD * 2)).toFixed(1));
    }
    build();

    inView(line, function (seen) {
      if (!seen || line.dataset.ran === "1") return;
      line.dataset.ran = "1";
      if (reduce || paused) return;                 /* static path already drawn */
      var len = line.getTotalLength ? line.getTotalLength() : 600;
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      var t0 = 0;
      Engine.add({
        fps: 60,
        label: "spark-draw",
        tick: function (t) {
          if (t0 === 0) t0 = t;
          var p = clamp((t - t0) / 1.5, 0, 1);
          line.style.strokeDashoffset = len * (1 - easeOut(p));
          if (p >= 1) {
            line.style.strokeDasharray = "none";
            line.style.strokeDashoffset = 0;
            this.dead = true;
            stream();
          }
        },
        finalize: function () {
          line.style.strokeDasharray = "none";
          line.style.strokeDashoffset = 0;
        }
      });

      function stream() {
        var acc = 0;
        gate(line.ownerSVGElement, Engine.add({
          fps: 3,
          label: "spark-live",
          tick: function (t, dt) {
            acc += dt;
            if (acc < 1.1) return;
            acc = 0;
            var nxt = clamp(data[data.length - 1] + (Math.random() - 0.48) * 0.16, 0.18, 0.96);
            data.shift();
            data.push(nxt);
            build();
          }
        }));
      }
    });
  })();

  /* ── 3. GAUGE : arc fills, needle settles, radar wedge sweeps ────────── */
  (function gauge() {
    var svg = qs("#gauge"), arc = qs("#gaugeValue"), needle = qs("#gaugeNeedle"), sweep = qs("#gaugeSweep");
    if (!svg || !arc || !needle) return;
    var C = 2 * Math.PI * 50, P = 0.992;
    arc.style.strokeDasharray = C;
    arc.style.strokeDashoffset = reduce ? C * (1 - P) : C;

    inView(svg, function (seen) {
      if (!seen || svg.dataset.ran === "1") return;
      svg.dataset.ran = "1";
      if (reduce) { arc.style.strokeDashoffset = C * (1 - P); return; }
      var t0 = 0;
      Engine.add({
        fps: 60,
        label: "gauge",
        tick: function (t) {
          if (t0 === 0) t0 = t;
          var p = clamp((t - t0) / 1.8, 0, 1), e = easeOut(p);
          arc.style.strokeDashoffset = C * (1 - P * e);
          needle.setAttribute("transform", "rotate(" + (P * e * 360) + " 65 65)");
          if (p >= 1) {
            this.dead = true;
            needle.setAttribute("transform", "rotate(" + P * 360 + " 65 65)");
            if (sweep) radar();
          }
        },
        finalize: function () {
          arc.style.strokeDashoffset = C * (1 - P);
          needle.setAttribute("transform", "rotate(" + P * 360 + " 65 65)");
        }
      });
      function radar() {
        if (!sweep) return;
        gate(svg, Engine.add({
          fps: 30,
          label: "radar",
          tick: function (t) {
            sweep.setAttribute("transform", "rotate(" + ((t * 72) % 360) + " 65 65)");
          }
        }));
      }
    });
  })();

  /* ── 4. HEAT GRID : staggered wave across capped cell count ──────────── */
  (function heat() {
    var host = qs("#heat");
    if (!host) return;
    var COLS = 20, ROWS = 3, cells = [], frag = document.createDocumentFragment();
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var i = document.createElement("i");
        if (r === 1 && c > 11 && c < 17) i.style.background = "var(--amber)";
        cells.push({ el: i, base: 0.18 + Math.random() * 0.3, col: c, row: r });
        frag.appendChild(i);
      }
    }
    host.appendChild(frag);                               /* 60 cells, hard cap */

    var paint = function (t) {
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        var wave = 0.5 + 0.5 * Math.sin(t * 1.15 - c.col * 0.34 + c.row * 0.55);
        c.el.style.opacity = (0.07 + (c.base * 0.35 + wave * 0.55)).toFixed(3);
      }
    };
    paint(0.6);

    inView(host, function (seen) {
      if (!seen || host.dataset.ran === "1") return;
      host.dataset.ran = "1";
      if (reduce || paused) return;
      gate(host, Engine.add({ fps: 14, label: "heat", tick: paint }));
    });
  })();

  /* ── 5. TICKER : rAF marquee, mirrored for RTL ───────────────────────── */
  (function ticker() {
    var track = qs("#tickerTrack");
    if (!track) return;
    var EVENTS = [
      ["STREAM", "اكتمل تدفّق أجهزة الاستشعار — 1.4M سجل", ""],
      ["BATCH", "مزامنة 38 مصدرًا من نظام التخطيط دون أخطاء", ""],
      ["QUALITY", "فحص الجودة: 99.6% من السجلات مطابقة", ""],
      ["SCHEDULE", "إعادة تشغيل مهمة مجدولة تلقائيًا", "warn"],
      ["SCADA", "وصلة حقل جديدة في محطة توزيع", ""],
      ["MODEL", "تحديث نموذج الإنذار المبكر — دورة 14", ""],
      ["GOVERN", "تصنيف 12 حقلًا جديدًا كبيانات تشغيلية", ""],
      ["COST", "خفض تكلفة الحوسبة 3.2% هذا الأسبوع", ""],
      ["LAKEHOUSE", "بناء نسخة مؤرّخ زمني للربع الحالي", ""],
      ["ACCESS", "تدقيق صلاحيات إدارات الصيانة", "warn"],
      ["REPORT", "لوحة الغرفة الصفراء محدّثة — تأخير 6 ثوانٍ", ""],
      ["PIPELINE", "أنبوب الطاقات المتجددة في وضع الانتظار", "bad"]
    ];
    function itemHtml(ev) {
      var s = document.createElement("div");
      s.className = "ticker__item" + (ev[2] ? " ticker__item--" + ev[2] : "");
      var m = document.createElement("span");
      m.className = "mono";
      m.setAttribute("dir", "ltr");
      m.textContent = ev[0];
      s.appendChild(m);
      s.appendChild(document.createTextNode(ev[1]));
      return s;
    }
    for (var pass = 0; pass < 2; pass++) EVENTS.forEach(function (ev) { track.appendChild(itemHtml(ev)); });

    var half = 0, x = 0;
    function measure() {
      half = track.scrollWidth / 2 || 1;
    }
    measure();
    window.addEventListener("resize", measure, { passive: true });

    Engine.add({
      fps: 60,
      label: "ticker",
      active: !reduce,
      tick: function (t, dt) {
        if (paused || reduce) { track.style.transform = "translateX(0px)"; return; }
        x += dt * 52;                                   /* rightward = RTL-correct */
        if (half && x >= half) x -= half;
        track.style.transform = "translateX(" + x.toFixed(2) + "px)";
      },
      finalize: function () { track.style.transform = "translateX(0px)"; }
    });
  })();

  /* ── 6. ARCHITECTURE : pulses travelling the connectors ──────────────── */
  (function arch() {
    var svg = qs("#archSvg");
    var host = qs(".arch");
    var dots = qsa(".pulse");
    if (!svg || !host || !dots.length) return;
    var geo = [];
    dots.forEach(function (d) {
      var p = document.getElementById(d.getAttribute("data-path"));
      if (p && p.getTotalLength) geo.push({ el: d, path: p, len: p.getTotalLength() });
    });
    if (!geo.length) return;

    var SPEED = 62;
    geo.forEach(function (g) { g.el.setAttribute("cx", "-20"); });

    inView(host, function (seen) {
      if (!seen || svg.dataset.ran === "1") return;
      svg.dataset.ran = "1";
      if (reduce || paused) return;                     /* dots stay parked off-canvas */
      var task = Engine.add({
        fps: 40,
        label: "arch-dots",
        tick: function (t) {
          for (var i = 0; i < geo.length; i++) {
            var g = geo[i];
            var prog = ((t * SPEED) + i * g.len * 0.33) % g.len;
            var pt = g.path.getPointAtLength(prog);
            g.el.setAttribute("cx", pt.x.toFixed(1));
            g.el.setAttribute("cy", pt.y.toFixed(1));
          }
        },
        finalize: function () {
          for (var i = 0; i < geo.length; i++) geo[i].el.setAttribute("cx", "-20");
        }
      });
      gate(host, task);
    });
  })();

  /* ── 7. NAV STRIP : clock, equalizer, signal bars, ambient sweep ─────── */
  (function strip() {
    var clock = qs("#clock"), eq = qsa("#eq i"), bars = qsa(".bar b"), phase = [];
    for (var i = 0; i < eq.length; i++) phase.push(Math.random() * 6.28);

    if (!reduce && eq.length) {
      Engine.add({
        fps: 20,
        label: "eq",
        tick: function (t) {
          for (var i = 0; i < eq.length; i++) {
            var v = 0.22 + 0.78 * Math.abs(Math.sin(t * 2.1 + phase[i]));
            eq[i].style.transform = "scaleY(" + v.toFixed(3) + ")";
          }
          for (var b = 0; b < bars.length; b++) {
            bars[b].style.opacity = (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.9 - b))).toFixed(2);
          }
        },
        finalize: function () {
          for (var i = 0; i < eq.length; i++) eq[i].style.transform = "scaleY(0.55)";
        }
      });
      Engine.add({
        fps: 24,
        label: "sweep",
        tick: function (t) {
          var h = window.innerHeight || 800;
          var y = ((t * 26) % (h + 420)) - 320;
          root.style.setProperty("--sweep", y.toFixed(1) + "px");
        },
        finalize: function () { root.style.setProperty("--sweep", "-320px"); }
      });
    }

    if (clock) {
      var showTime = function () {
        var d = new Date();
        var two = function (n) { return (n < 10 ? "0" : "") + n; };
        clock.textContent = "KHBR " + two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds());
      };
      showTime();
      Engine.add({ fps: 2, label: "clock", tick: showTime, finalize: showTime });
    }
  })();

  /* ── 8. DECODE : scramble-lock the Latin reference codes ─────────────── */
  (function decode() {
    var pool = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#/%$";
    qsa("[data-decode]").forEach(function (el) {
      var final = el.getAttribute("data-decode");
      if (reduce || paused) return;
      inView(el, function (seen) {
        if (!seen || el.dataset.ran === "1") return;
        el.dataset.ran = "1";
        var t0 = 0;
        Engine.add({
          fps: 22,
          label: "decode",
          tick: function (t) {
            if (t0 === 0) t0 = t;
            var p = clamp((t - t0) / 0.85, 0, 1);
            var lock = Math.floor(p * final.length), out = "";
            for (var i = 0; i < final.length; i++) {
              var ch = final.charAt(i);
              if (i < lock || ch === " " || ch === "@" || ch === "." || ch === "+" || ch === "-") out += ch;
              else out += pool.charAt(Math.floor(Math.random() * pool.length));
            }
            el.textContent = out;
            if (p >= 1) { this.dead = true; el.textContent = final; }
          },
          finalize: function () { el.textContent = final; }
        });
      });
    });
  })();

  /* ── 9. ACCORDION : keyboard-operable, height-animated ───────────────── */
  (function accordion() {
    var triggers = qsa(".acc-trigger");
    if (!triggers.length) return;
    var status = qs("#tracksStatus");

    function panelOf(tr) { return document.getElementById(tr.getAttribute("aria-controls")); }
    function innerOf(p) { return p.firstElementChild; }

    function open(tr) {
      var p = panelOf(tr);
      tr.setAttribute("aria-expanded", "true");
      p.removeAttribute("inert");
      p.style.height = innerOf(p).offsetHeight + "px";
      say(tr);
    }
    function close(tr) {
      var p = panelOf(tr);
      tr.setAttribute("aria-expanded", "false");
      p.style.height = "0px";
      p.setAttribute("inert", "");
    }
    function say(tr) {
      if (status) status.textContent = "مسار العمل المفتوح حاليًا: " + tr.getAttribute("data-track") + ".";
    }

    triggers.forEach(function (tr, i) {
      var p = panelOf(tr);
      if (tr.getAttribute("aria-expanded") === "true") {
        p.removeAttribute("inert");
        p.style.height = innerOf(p).offsetHeight + "px";
      } else {
        p.style.height = "0px";
        if (!p.hasAttribute("inert")) p.setAttribute("inert", "");
      }
      tr.addEventListener("click", function () {
        var isOpen = tr.getAttribute("aria-expanded") === "true";
        triggers.forEach(function (o) { if (o !== tr && o.getAttribute("aria-expanded") === "true") close(o); });
        if (isOpen) { tr.setAttribute("aria-expanded", "false"); panelOf(tr).style.height = "0px"; panelOf(tr).setAttribute("inert", ""); }
        else open(tr);
      });
      tr.addEventListener("keydown", function (e) {
        var k = e.key, next = -1;
        if (k === "ArrowDown") next = (i + 1) % triggers.length;
        else if (k === "ArrowUp") next = (i - 1 + triggers.length) % triggers.length;
        else if (k === "Home") next = 0;
        else if (k === "End") next = triggers.length - 1;
        if (next > -1) { e.preventDefault(); triggers[next].focus(); }
      });
    });

    /* late-loading webfont changes line wrapping: re-measure the open panel */
    function reflow() {
      triggers.forEach(function (tr) {
        if (tr.getAttribute("aria-expanded") === "true") {
          panelOf(tr).style.height = innerOf(panelOf(tr)).offsetHeight + "px";
        }
      });
    }
    window.addEventListener("resize", reflow, { passive: true });
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(reflow);
    }
  })();

  /* ── 10. NAV : mobile sheet + motion toggle ──────────────────────────── */
  (function nav() {
    var burger = qs("#burger"), links = qs("#primary-nav"), toggle = qs("#motionToggle");
    if (burger && links) {
      var setSheet = function (on) {
        burger.setAttribute("aria-expanded", String(on));
        links.classList.toggle("is-open", on);
      };
      burger.addEventListener("click", function () {
        setSheet(burger.getAttribute("aria-expanded") !== "true");
      });
      links.addEventListener("click", function (e) {
        if (e.target.closest("a")) setSheet(false);
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && burger.getAttribute("aria-expanded") === "true") { setSheet(false); burger.focus(); }
      });
    }

    var label = qs(".motion-toggle__label");
    function apply(state, persist) {
      paused = state;
      root.classList.toggle("motion-off", state);
      if (toggle) {
        toggle.setAttribute("aria-pressed", String(state));
        if (label) label.textContent = state ? "تشغيل الحركة" : "إيقاف الحركة";
      }
      if (state) { Engine.settle(); Engine.stop(); }
      else Engine.start();
      if (persist) { try { localStorage.setItem("waha-motion", state ? "off" : "on"); } catch (e) {} }
    }
    var stored = null;
    try { stored = localStorage.getItem("waha-motion"); } catch (e) {}
    if (toggle) toggle.addEventListener("click", function () { apply(!paused, true); });
    if (stored === "off") apply(true, false);
    else if (reduce) apply(true, false);
  })();

  /* ── 11. REVEALS : GSAP + ScrollTrigger, IntersectionObserver fallback ── */
  (function reveals() {
    var items = qsa(".reveal");
    if (!items.length) return;
    if (reduce) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var g = window.gsap, st = window.ScrollTrigger;
    if (g && st) {
      try {
        g.registerPlugin(st);
        items.forEach(function (el, i) {
          g.fromTo(el,
            { autoAlpha: 0, y: 22 },
            {
              autoAlpha: 1, y: 0, duration: 0.75, ease: "power2.out",
              delay: (i % 3) * 0.06,
              scrollTrigger: { trigger: el, start: "top 90%", once: true }
            });
        });
        return;
      } catch (e) { /* fall through to the observer below */ }
    }
    items.forEach(function (el) {
      inView(el, function (seen) { if (seen) el.classList.add("is-in"); });
    });
  })();

  /* ── 12. LIFECYCLE : no leaked loops when the tab sleeps ─────────────── */
  document.addEventListener("visibilitychange", function () {
    pageVisible = !document.hidden;
    if (pageVisible && !paused) { Engine.start(); } else { Engine.stop(); }
  });
  if (mqReduce.addEventListener) {
    mqReduce.addEventListener("change", function (e) {
      reduce = e.matches;
      root.classList.toggle("motion-off", reduce);
      if (reduce) { Engine.settle(); Engine.stop(); } else Engine.start();
    });
  }
}

try {
  boot();
} catch (err) {
  /* الحركة إضافةٌ تجميلية لا شرط لعرض المحتوى: لا يُترك شيء مخفيًا */
  document.documentElement.classList.remove("js");
  if (window.console) window.console.warn("واحة داتا — القياسات الحيّة معطّلة:", err);
}
