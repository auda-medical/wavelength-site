// Wavelength shared form pieces for the app (/app/), the sign-off page (/app/sign/) and the assessment page (/app/assess/):
// the structured assessment form, the per-scan quality rating, and the signature pad.
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ACCRED = ['RCEM-approved ultrasound supervisor', 'FAMUS mentor', 'FAMUS supervisor', 'FUSIC mentor', 'FUSIC supervisor', 'EUSEM ultrasound faculty', 'ACEM credentialed sonologist', 'CPoCUS IP examiner', 'Emergency ultrasound director', 'Consultant sonographer', 'Other'];

  // Traffic-light rating for one scan: image quality and diagnostic accuracy.
  function ratingHtml(C, T, id, cur) {
    cur = cur || {};
    var row = function (k, label) {
      return '<div class="rate"><span>' + esc(T(label)) + '</span><div class="seg tl">' + C.qualityScale.map(function (q, i) {
        var rid = 'r' + k + id + i;
        return '<input type="radio" name="rt-' + k + '-' + esc(id) + '" id="' + rid + '" value="' + q.id + '"' + (cur[k] === q.id ? ' checked' : '') + '><label for="' + rid + '" class="tl-' + q.id + '" title="' + esc(T(q.label)) + '"><i></i>' + esc(T(q.label)) + '</label>';
      }).join('') + '</div></div>';
    };
    return '<div class="rating" data-rating="' + esc(id) + '">' + row('image', 'Image quality') + row('accuracy', 'Diagnostic accuracy') + '</div>';
  }
  function readRatings(scope) {
    var out = {};
    Array.prototype.forEach.call(scope.querySelectorAll('[data-rating]'), function (box) {
      var id = box.getAttribute('data-rating'), r = {};
      ['image', 'accuracy'].forEach(function (k) { var c = box.querySelector('input[name="rt-' + k + '-' + id + '"]:checked'); if (c) r[k] = c.value; });
      if (r.image || r.accuracy) out[id] = r;
    });
    return out;
  }

  // Assessor details shared by sign-off and assessment forms.
  function assessorHtml(T, pre) {
    pre = pre || {};
    return '<div class="field"><label for="as-n">' + esc(T('Your name')) + '</label><input id="as-n" name="name" type="text" value="' + esc(pre.name || '') + '" required autocomplete="off"></div>' +
      '<div class="field"><label for="as-r">' + esc(T('Role')) + '</label><input id="as-r" name="role" type="text" value="' + esc(pre.role || '') + '" placeholder="' + esc(T('For example consultant in emergency medicine')) + '" required></div>' +
      '<div class="two"><div class="field"><label for="as-g">' + esc(T('Professional registration number')) + '</label><input id="as-g" name="registration" type="text" value="' + esc(pre.registration || '') + '"></div>' +
      '<div class="field"><label for="as-a">' + esc(T('Accreditation')) + '</label><select id="as-a" name="accreditation"><option value="">' + esc(T('Choose')) + '</option>' + ACCRED.map(function (a) { return '<option value="' + esc(a) + '">' + esc(T(a)) + '</option>'; }).join('') + '</select></div></div>';
  }

  // The structured assessment form. opts: { kind, topics, date, hideAssessor, pre, learnerReflection }
  function assessmentHtml(C, T, opts) {
    opts = opts || {};
    var scale = C.assessmentScale;
    var dom = C.assessmentDomains.map(function (d) {
      return '<div class="dom"><b>' + esc(T(d.label)) + '</b><p class="hint">' + esc(T(d.help)) + '</p><div class="seg">' + scale.map(function (s, i) {
        var id = 'd-' + d.id + '-' + i;
        return '<input type="radio" name="dom-' + d.id + '" id="' + id + '" value="' + esc(s) + '"><label for="' + id + '">' + esc(T(s)) + '</label>';
      }).join('') + '</div></div>';
    }).join('');
    var outs = C.assessmentOutcomes.filter(function (o) { return opts.kind === 'formative' || o.id !== 'feedback'; });
    var today = new Date(); var iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return (opts.learnerReflection ? '<div class="card"><p class="eyebrow">' + esc(T('Learner\'s note')) + '</p><p style="white-space:pre-wrap;margin:0">' + esc(opts.learnerReflection) + '</p></div>' : '') +
      '<div class="two"><div class="field"><label for="as-d">' + esc(T('Date of assessment')) + '</label><input id="as-d" name="date" type="date" max="' + iso + '" value="' + esc(opts.date || iso) + '"></div>' +
      '<div class="field"><label for="as-t">' + esc(T('Focus or topic (optional)')) + '</label>' + (opts.topics && opts.topics.length ? '<select id="as-t" name="topic"><option value="">' + esc(T('Choose')) + '</option>' + opts.topics.map(function (t) { return '<option value="' + esc(t) + '">' + esc(T(t)) + '</option>'; }).join('') + '</select>' : '<input id="as-t" name="topic" type="text">') + '</div></div>' +
      '<div class="card domains"><p class="eyebrow">' + esc(T('Performance in each domain')) + '</p>' + dom + '</div>' +
      '<div class="field"><span class="lab">' + esc(T('Outcome')) + '</span><div class="seg col">' + outs.map(function (o, i) { return '<input type="radio" name="outcome" id="oc' + i + '" value="' + o.id + '"><label for="oc' + i + '">' + esc(T(o.label)) + '</label>'; }).join('') + '</div></div>' +
      '<div class="field"><label for="as-s">' + esc(T('What went well')) + '</label><textarea id="as-s" name="strengths"></textarea></div>' +
      '<div class="field"><label for="as-v">' + esc(T('What to develop')) + '</label><textarea id="as-v" name="development"></textarea></div>' +
      '<div class="field"><label for="as-p">' + esc(T('Agreed actions')) + '</label><textarea id="as-p" name="actions" style="min-height:70px"></textarea></div>' +
      (opts.hideAssessor ? '' : assessorHtml(T, opts.pre)) +
      '<div class="field"><span class="lab">' + esc(T('Signature')) + '</span><canvas class="sigpad" data-sig></canvas><button type="button" class="link small" data-sigclr>' + esc(T('Clear')) + '</button></div>' +
      '<label class="check"><input type="checkbox" name="confirm" value="1" required><span>' + esc(T('I observed or reviewed this learner\'s scanning as recorded, and this assessment is accurate.')) + '</span></label>';
  }
  function readAssessment(C, form) {
    var d = {}; new FormData(form).forEach(function (v, k) { d[k] = v; });
    d.domains = {}; C.assessmentDomains.forEach(function (x) { if (d['dom-' + x.id]) d.domains[x.id] = d['dom-' + x.id]; delete d['dom-' + x.id]; });
    return d;
  }

  function sigPad(cv) {
    var g, drawn = false, last = null;
    var size = function () { cv.width = cv.clientWidth || 300; cv.height = cv.clientHeight || 150; g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = '#0F1E33'; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; drawn = false; };
    setTimeout(size, 30);
    var pt = function (e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', function (e) { e.preventDefault(); cv.setPointerCapture(e.pointerId); last = pt(e); });
    cv.addEventListener('pointermove', function (e) { if (!last) return; var p = pt(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; drawn = true; });
    cv.addEventListener('pointerup', function () { last = null; });
    return { clear: size, empty: function () { return !drawn; }, data: function () { return cv.toDataURL('image/png'); } };
  }
  function bindSig(scope) {
    var cv = scope.querySelector('[data-sig]'); if (!cv) return null;
    var pad = sigPad(cv); var c = scope.querySelector('[data-sigclr]'); if (c) c.onclick = pad.clear;
    return pad;
  }

  root.WLForms = { esc: esc, ACCRED: ACCRED, ratingHtml: ratingHtml, readRatings: readRatings, assessorHtml: assessorHtml, assessmentHtml: assessmentHtml, readAssessment: readAssessment, sigPad: sigPad, bindSig: bindSig };
})(window);
