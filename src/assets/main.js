(function () {
  window.__wl = true;
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header state
  var header = document.querySelector('.site-header');
  var lastY = 0;
  function onScroll() {
    var y = window.scrollY;
    if (header) {
      header.classList.toggle('scrolled', y > 40);
      header.classList.toggle('hidden', y > 400 && y > lastY && !doc.classList.contains('menu-open'));
    }
    lastY = y;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('mobile-menu');
  function setMenu(open) {
    doc.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    ['main', '.site-footer'].forEach(function (sel) { var el = document.querySelector(sel); if (el) { if (open) el.setAttribute('inert', ''); else el.removeAttribute('inert'); } });
    if (open) { var first = menu.querySelector('a'); if (first) setTimeout(function () { first.focus(); }, 50); }
  }
  if (toggle && menu) {
    if (!('inert' in menu)) { /* older browsers: menu still works */ }
    menu.setAttribute('inert', '');
    toggle.addEventListener('click', function () {
      var open = !doc.classList.contains('menu-open');
      if (open) menu.removeAttribute('inert'); else menu.setAttribute('inert', '');
      setMenu(open);
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.setAttribute('inert', ''); setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && doc.classList.contains('menu-open')) { menu.setAttribute('inert', ''); setMenu(false); toggle.focus(); }
    });
  }

  // Word-by-word headline
  document.querySelectorAll('.split-words').forEach(function (el) {
    if (reduce) return;
    var i = 0;
    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = document.createElement('span'); w.className = 'w';
            var s = document.createElement('span'); s.textContent = part;
            s.style.animationDelay = (0.15 + i * 0.08) + 's'; i++;
            w.appendChild(s); frag.appendChild(w);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1) { walk(n); }
      });
    }
    walk(el);
  });

  // Scroll reveals
  var items = document.querySelectorAll('.reveal, .steps-line');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  // Hero waveform
  var canvas = document.querySelector('canvas.waves');
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext('2d');
    var w, h, dpr, t = 0, visible = true, raf;
    var lines = [
      { amp: 0.20, freq: 1.4, speed: 0.35, phase: 0, color: 'rgba(127,196,204,0.55)', width: 1.6 },
      { amp: 0.15, freq: 2.1, speed: 0.22, phase: 1.3, color: 'rgba(127,196,204,0.28)', width: 1.2 },
      { amp: 0.26, freq: 1.0, speed: 0.18, phase: 2.6, color: 'rgba(42,127,138,0.55)', width: 1.4 },
      { amp: 0.10, freq: 3.0, speed: 0.45, phase: 4.0, color: 'rgba(247,245,240,0.16)', width: 1 },
      { amp: 0.32, freq: 0.7, speed: 0.12, phase: 5.1, color: 'rgba(127,196,204,0.18)', width: 1 }
    ];
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function frame() {
      ctx.clearRect(0, 0, w, h);
      var mid = h * 0.55;
      lines.forEach(function (l) {
        ctx.beginPath();
        for (var x = 0; x <= w; x += 4) {
          var p = x / w;
          var env = Math.sin(Math.PI * p); // fade at edges
          var y = mid + Math.sin(p * Math.PI * 2 * l.freq + t * l.speed + l.phase) * h * l.amp * env
                      + Math.sin(p * Math.PI * 6 + t * l.speed * 1.7) * h * 0.02 * env;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = l.color; ctx.lineWidth = l.width; ctx.stroke();
      });
      t += 0.016;
      if (visible && !reduce) raf = requestAnimationFrame(frame);
    }
    size(); frame();
    window.addEventListener('resize', size);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        visible = e[0].isIntersecting;
        if (visible && !reduce) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
      }).observe(canvas);
    }
  }

  // Pointer glow on course cards
  document.querySelectorAll('.course-card').forEach(function (card) {
    var glow = card.querySelector('.glow');
    if (!glow || reduce) return;
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
      glow.style.background = 'radial-gradient(45% 60% at ' + x + '% ' + y + '%, rgba(42,127,138,.8), transparent 60%), radial-gradient(50% 70% at 0% 100%, rgba(31,74,122,.9), transparent 60%)';
    });
  });

  // Enquiry form: opens the visitor's email app with the details filled in
  document.querySelectorAll('form[data-mailto]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var lines = [];
      data.forEach(function (v, k) { if (k !== 'subject') lines.push(k + ': ' + v); });
      var subject = data.get('subject') || 'Enquiry';
      window.location.href = 'mailto:' + form.getAttribute('data-mailto') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\n'));
    });
  });

  // Show form errors passed back in the address (?error=1)
  if (/[?&]error=1/.test(location.search)) document.querySelectorAll('[data-show-on="error"]').forEach(function (el) { el.hidden = false; });

  // Newsletter: Zoho replies with JSON, so post into a hidden frame and move on to our thank-you page
  document.querySelectorAll('form[data-zoho]').forEach(function (form) {
    var frame = document.querySelector('iframe[name="' + form.getAttribute('target') + '"]');
    var sent = false;
    form.addEventListener('submit', function () {
      sent = true;
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Subscribing…'; }
      setTimeout(function () { if (sent) location.href = '/subscribe/thanks/'; }, 6000);
    });
    if (frame) frame.addEventListener('load', function () { if (sent) { sent = false; location.href = '/subscribe/thanks/'; } });
  });

  // Learn tests: first click marks the answer, opens the explanation and updates the score.
  // A link like /learn/<slug>/test/?q=1&a=b answers question 1 with option b (used by newsletter buttons).
  document.querySelectorAll('[data-test]').forEach(function (test) {
    var quizzes = [].slice.call(test.querySelectorAll('[data-quiz]'));
    var total = quizzes.length, done = 0, right = 0;
    var progress = test.querySelector('[data-progress]'), bar = test.querySelector('[data-bar]'), score = test.querySelector('[data-score]');
    function update() {
      if (progress) progress.textContent = done + ' of ' + total + ' answered';
      if (bar) bar.style.width = (100 * done / total) + '%';
      if (done === total && score) {
        score.hidden = false;
        score.querySelector('[data-right]').textContent = right;
        score.querySelector('[data-message]').textContent = right === total ? 'Full marks. This pearl has stuck.' : right >= total - 1 ? 'Nearly there. Reread the explanation you missed.' : 'Worth another look. Read the pearl again, then retry.';
      }
    }
    function answer(quiz, btn) {
      if (quiz.classList.contains('is-done')) return;
      quiz.classList.add('is-done');
      var ok = btn.hasAttribute('data-correct');
      if (!ok) btn.classList.add('is-wrong');
      var r = quiz.querySelector('[data-correct]');
      if (r) r.classList.add('is-right');
      var why = quiz.querySelector('.quiz-why');
      if (why) why.open = true;
      done++; if (ok) right++;
      update();
      if (done === total && score) setTimeout(function () { score.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 500);
    }
    quizzes.forEach(function (quiz) {
      quiz.addEventListener('click', function (e) { var btn = e.target.closest('.quiz-opt'); if (btn) answer(quiz, btn); });
    });
    var retry = test.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', function () {
      quizzes.forEach(function (q) { q.classList.remove('is-done'); q.querySelectorAll('.quiz-opt').forEach(function (b) { b.classList.remove('is-right', 'is-wrong'); }); var w = q.querySelector('.quiz-why'); if (w) w.open = false; });
      done = 0; right = 0; score.hidden = true; update();
      quizzes[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    var m = location.search.match(/[?&]q=(\d+)&a=([a-h])/);
    if (m && quizzes[+m[1] - 1]) {
      var q = quizzes[+m[1] - 1], btn = q.querySelectorAll('.quiz-opt')['abcdefgh'.indexOf(m[2])];
      if (btn) { answer(q, btn); setTimeout(function () { q.scrollIntoView({ block: 'center' }); }, 300); }
    }
  });

  // Year
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
