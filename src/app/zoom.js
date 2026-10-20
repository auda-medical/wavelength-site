// Wavelength image zoom (1.0.24, owner 20 Oct 2026): a supervisor reviewing a scan zooms into the photo where it is.
// Phone: pinch with two fingers to zoom, then drag with one finger to move (one finger on an unzoomed photo still
// scrolls the page). Computer: scroll over the photo to zoom, then drag with the hand to move. Nothing else: no buttons,
// no separate screen. Used by the app (/app/) and the sign-off page (/app/sign/).
(function (root) {
  'use strict';
  var MAX = 8;
  var touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  function css() {
    if (document.getElementById('wl-zoom-css')) return;
    var st = document.createElement('style'); st.id = 'wl-zoom-css';
    st.textContent = '.zoombox{position:relative;overflow:hidden;border-radius:10px;background:#000;touch-action:pan-y}' +
      '.zoombox>canvas{display:block;width:100%;height:auto;transform-origin:0 0;border-radius:0;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}' +
      '.zoombox.zoomed{touch-action:none;cursor:grab}.zoombox.zoomed.drag{cursor:grabbing}';
    document.head.appendChild(st);
  }
  // The one line shown above a scan's photos.
  function hint(T) { T = T || String; return touch ? T('Pinch with two fingers to zoom in, then drag to move.') : T('Scroll over a photo to zoom in, then drag with the hand to move around.'); }
  function bind(cv) {
    css();
    var box = document.createElement('div'); box.className = 'zoombox';
    cv.parentNode ? cv.parentNode.insertBefore(box, cv) : null; box.appendChild(cv);
    var s = 1, x = 0, y = 0;
    function dims() { var r = box.getBoundingClientRect(); return { W: r.width, H: r.height, L: r.left, T: r.top }; }
    function draw() {
      var d = dims();
      s = Math.max(1, Math.min(MAX, s));
      x = Math.min(0, Math.max(d.W - d.W * s, x)); y = Math.min(0, Math.max(d.H - d.H * s, y));
      if (s <= 1.001) { s = 1; x = 0; y = 0; }
      cv.style.transform = s === 1 ? '' : 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
      box.classList.toggle('zoomed', s > 1);
      box.dataset.zoom = s.toFixed(2);
    }
    function zoomAt(ns, px, py) { ns = Math.max(1, Math.min(MAX, ns)); x = px - (px - x) * (ns / s); y = py - (py - y) * (ns / s); s = ns; draw(); }
    // Computer: the wheel zooms around the pointer; dragging moves a zoomed photo.
    box.addEventListener('wheel', function (e) {
      if (!e.deltaY) return;
      if (s === 1 && e.deltaY > 0) return; // scrolling down over an unzoomed photo scrolls the page
      e.preventDefault(); var d = dims(); zoomAt(s * Math.exp(-e.deltaY * 0.0025), e.clientX - d.L, e.clientY - d.T);
    }, { passive: false });
    var drag = null;
    box.addEventListener('mousedown', function (e) { if (s === 1 || e.button !== 0) return; e.preventDefault(); drag = { px: e.clientX, py: e.clientY, x: x, y: y }; box.classList.add('drag'); });
    window.addEventListener('mousemove', function (e) { if (!drag) return; x = drag.x + e.clientX - drag.px; y = drag.y + e.clientY - drag.py; draw(); });
    window.addEventListener('mouseup', function () { if (drag) { drag = null; box.classList.remove('drag'); } });
    // Phone: two fingers pinch; one finger drags only once zoomed in.
    var pin = null, one = null;
    var pt = function (t) { var d = dims(); return [t.clientX - d.L, t.clientY - d.T]; };
    box.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        var a = pt(e.touches[0]), b = pt(e.touches[1]);
        pin = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s: s, x: x, y: y, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; one = null;
      } else if (e.touches.length === 1 && s > 1) { var p = pt(e.touches[0]); one = { px: p[0], py: p[1], x: x, y: y }; }
    }, { passive: true });
    box.addEventListener('touchmove', function (e) {
      if (pin && e.touches.length >= 2) {
        e.preventDefault();
        var a = pt(e.touches[0]), b = pt(e.touches[1]), d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        var ns = Math.max(1, Math.min(MAX, pin.s * d / pin.d));
        x = mx - (pin.mx - pin.x) * (ns / pin.s); y = my - (pin.my - pin.y) * (ns / pin.s); s = ns; draw();
      } else if (one && e.touches.length === 1) {
        e.preventDefault(); var p = pt(e.touches[0]); x = one.x + p[0] - one.px; y = one.y + p[1] - one.py; draw();
      }
    }, { passive: false });
    box.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) pin = null;
      if (e.touches.length === 1 && s > 1) { var p = pt(e.touches[0]); one = { px: p[0], py: p[1], x: x, y: y }; } else if (!e.touches.length) one = null;
    });
    window.addEventListener('resize', draw);
    box.zoomTo = zoomAt;
    return box;
  }
  root.WLZoom = { bind: bind, hint: hint, touch: touch };
})(window);
