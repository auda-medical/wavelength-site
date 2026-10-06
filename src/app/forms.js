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
      '<div class="field"><label for="as-g">' + esc(T('Registration number')) + '</label><input id="as-g" name="registration" type="text" value="' + esc(pre.registration || '') + '" placeholder="' + esc(T('GMC, NMC or HCPC')) + '"></div>' +
      '<div class="field"><label for="as-a">' + esc(T('Accreditation')) + '</label><select id="as-a" name="accreditation"><option value="">' + esc(T('Choose')) + '</option>' + ACCRED.map(function (a) { return '<option value="' + esc(a) + '">' + esc(T(a)) + '</option>'; }).join('') + '</select></div>';
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
  // A typed signature for signers who cannot draw on a touch screen. The typed name is drawn onto a white canvas in a
  // handwriting-style font and sent as a PNG like a drawn signature, with signatureKind 'typed' so the record says so.
  var SIG_FONT = '"Segoe Script", "Bradley Hand", "Snell Roundhand", "Apple Chancery", "Brush Script MT", "URW Chancery L", cursive';
  function typedSigData(name) {
    var cv = document.createElement('canvas'); cv.width = 600; cv.height = 170;
    var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    var size = 64; g.font = size + 'px ' + SIG_FONT;
    while (size > 18 && g.measureText(name).width > cv.width - 40) { size -= 2; g.font = size + 'px ' + SIG_FONT; }
    g.fillStyle = '#0F1E33'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(name, cv.width / 2, cv.height / 2);
    return cv.toDataURL('image/png');
  }
  // Broad name match: ignores case, punctuation and titles, and accepts either name containing the other's words.
  var TITLE_WORDS = { dr: 1, doctor: 1, prof: 1, professor: 1, mr: 1, mrs: 1, ms: 1, miss: 1, mx: 1, sir: 1 };
  function nameWords(s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(function (w) { return w && !TITLE_WORDS[w]; }); }
  function namesMatch(a, b) {
    var x = nameWords(a), y = nameWords(b); if (!x.length || !y.length) return true;
    var has = function (list, w) { return list.some(function (v) { return v === w || (w.length === 1 && v.charAt(0) === w); }); };
    return x.every(function (w) { return has(y, w); }) || y.every(function (w) { return has(x, w); });
  }
  // Binds the signature field in scope: the drawing pad plus "Type my name instead". T translates (optional).
  // Returns { clear, empty, data, kind, emptyError }: kind() is 'typed' or 'drawn', and data() is a PNG data URL either way.
  function bindSig(scope, T) {
    T = T || function (x) { return x; };
    var cv = scope.querySelector('[data-sig]'); if (!cv) return null;
    var pad = sigPad(cv); var c = scope.querySelector('[data-sigclr]'); if (c) c.onclick = pad.clear;
    var typed = false, form = cv.closest('form'), nameIn = form && form.querySelector('input[name="name"]');
    var uid = 'sigt' + Math.random().toString(36).slice(2, 8);
    var box = document.createElement('div'); box.className = 'sigtyped'; box.hidden = true;
    box.innerHTML = '<label for="' + uid + '">' + esc(T('Type your full name as your signature')) + '</label><input id="' + uid + '" type="text" autocomplete="off" autocapitalize="words" spellcheck="false" maxlength="120"><p class="hint">' + esc(T('Recorded as a typed signature.')) + '</p><p class="sigtyped-warn small" hidden>' + esc(T('This differs from the name you entered above. Check it is your own full name.')) + '</p>';
    var tog = document.createElement('button'); tog.type = 'button'; tog.className = 'link small sigtoggle'; tog.textContent = T('Type my name instead');
    var anchor = c || cv; anchor.parentNode.insertBefore(box, anchor.nextSibling); box.parentNode.insertBefore(tog, box.nextSibling);
    var input = box.querySelector('input'), warn = box.querySelector('.sigtyped-warn');
    var check = function () { var v = input.value.trim(); warn.hidden = !(typed && v.length >= 2 && nameIn && nameIn.value.trim() && !namesMatch(v, nameIn.value)); };
    input.addEventListener('input', check); if (nameIn) nameIn.addEventListener('input', check);
    tog.onclick = function () {
      typed = !typed; cv.hidden = typed; if (c) c.hidden = typed; box.hidden = !typed;
      tog.textContent = typed ? T('Draw instead') : T('Type my name instead');
      if (typed) { check(); input.focus(); } else pad.clear();
    };
    return {
      clear: function () { pad.clear(); input.value = ''; check(); },
      empty: function () { return typed ? input.value.trim().length < 2 : pad.empty(); },
      data: function () { return typed ? typedSigData(input.value.trim()) : pad.data(); },
      kind: function () { return typed ? 'typed' : 'drawn'; },
      emptyError: function () { return typed ? T('Type your full name as your signature, at least two letters.') : T('Sign in the box.'); },
    };
  }

  root.WLForms = { esc: esc, ACCRED: ACCRED, ratingHtml: ratingHtml, readRatings: readRatings, assessorHtml: assessorHtml, assessmentHtml: assessmentHtml, readAssessment: readAssessment, sigPad: sigPad, bindSig: bindSig, namesMatch: namesMatch };
})(window);
