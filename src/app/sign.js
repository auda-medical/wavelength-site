// Supervisor pages: sign-off by link (/app/sign/#token), assessment by link (/app/assess/#token) and public
// verification (/app/verify/?code=). Text follows the visitor's browser language when a translation exists.
(function () {
  var C = window.WL_LOGBOOK, TYPES = {}; C.types.forEach(function (t) { TYPES[t.id] = t; });
  var SUP = {}; C.supervision.forEach(function (s) { SUP[s.id] = s.label; });
  var F = window.WLForms;
  var LOCALES = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', it: 'it-IT', pl: 'pl-PL', ar: 'ar', ru: 'ru-RU', zh: 'zh-CN' };
  var LANG = 'en', L = {};
  function T(s, v) { var t = typeof L[s] === 'string' && L[s] ? L[s] : s; if (v) t = t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); return t; }
  function N(n, one, other) { var tr = L[other]; if (tr && typeof tr === 'object') { var pr = window.Intl && Intl.PluralRules ? new Intl.PluralRules(LOCALES[LANG]).select(n) : (n === 1 ? 'one' : 'other'); return (tr[pr] || tr.other).replace('{n}', n); } return T(n === 1 ? one : other, { n: n }); }
  var root = document.getElementById('root'), lede = document.getElementById('lede'), head = document.getElementById('h');
  var esc = F.esc;
  function fmt(iso) { return iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString(LOCALES[LANG], { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function val(v) { return Array.isArray(v) ? v.map(function (x) { return T(x); }).join(', ') : typeof v === 'string' ? T(v) : v; }
  function post(url, d) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(d) }).then(function (r) { return r.json(); }); }
  function err(msg) { return '<div class="err">' + esc(T(msg)) + '</div>'; }

  function pearlCta() { return '<div class="card"><h3 style="margin-bottom:6px">' + esc(T('One ultrasound Pearl a week')) + '</h3><p class="small muted" style="margin-bottom:12px">' + esc(T('Free practical scanning tips for clinicians who scan, supervise or teach. Optional, and you can leave at any time.')) + '</p><a class="btn ghost block" href="/subscribe/?utm_source=verify&amp;utm_medium=web">' + esc(T('Get the weekly Pearl')) + '</a><p class="small muted" style="margin-top:12px">' + esc(T('Do you supervise scanning?')) + ' <a href="/faculty/join/?utm_source=verify&amp;utm_medium=web">' + esc(T('Teach with us')) + '</a> · <a href="/app/?utm_source=verify#/signup">' + esc(T('Supervise in the free app')) + '</a></p></div>'; }

  function evidenceHtml(r) {
    var n = function (v) { return v === '' || v == null ? '' : String(v); };
    var dl = function (k, v) { return v ? '<dt>' + esc(T(k)) + '</dt><dd>' + esc(v) + '</dd>' : ''; };
    var own = false;
    var paths = (r.pathways || []).map(function (p) {
      var rows = p.modules.map(function (m) {
        if (m.ownTarget) own = true;
        var tracked = m.total || m.supTarget || (m.assessments || []).length;
        var status = m.met ? '<span class="chip green">' + esc(T('Met')) + '</span>' : tracked ? '<span class="chip amber">' + esc(T('In progress')) + '</span>' : '';
        var nums = T('Scans {a} · Supervised {b} · Signed off {c}', { a: m.counted + (m.total ? ' / ' + m.total : ''), b: m.supervised + (m.supTarget ? ' / ' + m.supTarget : ''), c: m.signed });
        var extra = (m.rules || []).filter(function (x) { return x.min; }).concat((m.assessments || [])).map(function (x) { return '<span style="white-space:nowrap">' + esc(T(x.label)) + ' ' + x.n + '/' + x.min + (x.n >= x.min ? ' ✓' : '') + '</span>'; }).join(' · ');
        return '<div class="evmod"><div class="row"><b class="grow">' + esc(T(m.label)) + (m.ownTarget ? ' *' : '') + '</b>' + status + '</div><p class="small">' + esc(nums) + '</p>' + (extra ? '<p class="small muted">' + extra + '</p>' : '') + '</div>';
      }).join('');
      return '<div class="card"><h3>' + esc(p.name || p.label) + '</h3>' + (rows || '<p class="small muted">' + esc(T('No modules.')) + '</p>') + '<p class="small muted" style="margin-top:8px">' + esc(T('Targets from: {src}', { src: p.source || '' })) + ' ' + esc(T('Checked {date}.', { date: fmt(p.checked) })) + '</p></div>';
    }).join('');
    var codes = function (list, title) { return (list || []).length ? '<div class="card"><h3>' + esc(T(title)) + '</h3><p class="small muted">' + esc(T('Open any code to see who signed and when.')) + '</p><p style="line-height:2">' + list.map(function (c) { return '<a class="chip" href="/app/verify/?code=' + encodeURIComponent(c) + '">' + esc(c) + '</a>'; }).join(' ') + '</p></div>' : ''; };
    return '<div class="ok"><b>' + esc(T('Genuine summary.')) + '</b> ' + esc(T('Wavelength created this from {name}\'s synced logbook on {date}.', { name: r.learner, date: fmt(r.createdAt) })) + '</div>' +
      '<div class="card"><div class="detail"><dl>' + dl('Code', r.code) + dl('Learner', r.learner) + dl('Grade or role', r.grade) + dl('Organisation', r.organisation) + dl('Period', T('{from} to {to}', { from: fmt(r.from), to: fmt(r.to) })) + dl('Prepared for', r.destinationLabel ? T(r.destinationLabel) : '') + dl('Scans', n(r.scans) + (r.signedOnly ? ' (' + T('signed off only') + ')' : '')) + dl('Directly supervised', n(r.supervised)) + dl('Signed off by a supervisor', n(r.signed)) + dl('Assessments judged competent', r.assessmentsPassed != null ? n(r.assessmentsPassed) : '') + dl('First and last scan', r.firstScan ? T('{from} to {to}', { from: fmt(r.firstScan), to: fmt(r.lastScan) }) : '') + '</dl></div></div>' +
      paths + (own ? '<p class="small muted">' + esc(T('* The learner set their own target for this module, which differs from the curriculum figure.')) + '</p>' : '') +
      codes(r.signoffCodes, 'Sign-offs') + codes(r.assessmentCodes, 'Assessments') +
      '<p class="small muted">' + esc(T('Counts, sign-offs and assessments come from the server copy of the learner\'s logbook at the time shown, not from the exported file. Wavelength holds no patient identifiers and no scan images. Supervisor accreditation is as each supervisor stated it. The accrediting body or training programme decides what evidence it accepts.')) + '</p>';
  }
  function assessmentVerifyHtml(r) {
    var dl = function (k, v) { return v ? '<dt>' + esc(T(k)) + '</dt><dd>' + esc(v) + '</dd>' : ''; };
    return '<div class="ok"><b>' + esc(T('Genuine assessment.')) + '</b> ' + esc(T('This record exists in the Wavelength logbook.')) + '</div><div class="card"><div class="detail"><dl>' + dl('Code', r.code) + dl('Learner', r.learner) + dl('Pathway', r.pathway) + dl('Module', T(r.module)) + dl('Type', T(r.type)) + dl('Outcome', T(r.outcome)) + dl('Assessed', fmt(r.assessedOn)) + dl('Assessor', r.assessor + (r.role ? ', ' + r.role : '')) + dl('Accreditation stated', r.accreditation ? T(r.accreditation) : '') + dl('Method', r.method === 'in-person' ? T('In person, signed on the learner\'s device') : r.method === 'dashboard' ? T('From the assessor\'s own Wavelength account') : T('By secure link')) + '</dl></div></div><p class="small muted">' + esc(T('Wavelength records who assessed and when. The assessor\'s accreditation is as they stated it. The logbook holds no patient identifiers.')) + '</p>';
  }

  function verifyPage() {
    var code = new URLSearchParams(location.search).get('code') || '';
    lede.textContent = T('Check a supervisor sign-off (SO-), an assessment (AS-) or a verified logbook summary (EV-) from a Wavelength export.');
    var form = '<form id="vf" method="get"><div class="field"><label for="c">' + esc(T('Code')) + '</label><input id="c" name="code" type="text" placeholder="SO-XXXX-XXXX · AS-XXXX-XXXX · EV-XXXX-XXXX" value="' + esc(code) + '" autocapitalize="characters" required></div><button class="btn teal block">' + esc(T('Verify')) + '</button></form>';
    if (!code) { root.innerHTML = form; return; }
    fetch('/api/app/verify?code=' + encodeURIComponent(code)).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) { root.innerHTML = err(res.error) + form; return; }
      if (res.kind === 'evidence') { head.textContent = T('Verified summary'); lede.textContent = ''; root.innerHTML = evidenceHtml(res) + pearlCta() + form; return; }
      if (res.kind === 'assessment') { head.textContent = T('Verified assessment'); lede.textContent = ''; root.innerHTML = assessmentVerifyHtml(res) + pearlCta() + form; return; }
      var basis = { witnessed: T('Witnessed the scan'), reviewed: T('Reviewed the images'), both: T('Witnessed the scan and reviewed the images') };
      root.innerHTML = '<div class="ok"><b>' + esc(T('Genuine sign-off.')) + '</b> ' + esc(T('This record exists in the Wavelength logbook.')) + '</div><div class="card"><div class="detail"><dl><dt>' + esc(T('Code')) + '</dt><dd>' + esc(res.code) + '</dd><dt>' + esc(T('Learner')) + '</dt><dd>' + esc(res.learner) + '</dd><dt>' + esc(T('Signed by')) + '</dt><dd>' + esc(res.supervisor) + (res.role ? ', ' + esc(res.role) : '') + '</dd>' + (res.accreditation ? '<dt>' + esc(T('Accreditation stated')) + '</dt><dd>' + esc(T(res.accreditation)) + '</dd>' : '') + '<dt>' + esc(T('Method')) + '</dt><dd>' + esc(res.method === 'in-person' ? T('In person, signed on the learner\'s device') : res.method === 'dashboard' ? T('From the supervisor\'s own Wavelength account') : T('By secure link')) + (res.handSigned ? ', ' + esc(T('signed by hand')) : '') + '</dd>' + (res.basis ? '<dt>' + esc(T('Basis')) + '</dt><dd>' + esc(basis[res.basis]) + '</dd>' : '') + '<dt>' + esc(T('Signed')) + '</dt><dd>' + esc(fmt(res.signedAt)) + '</dd><dt>' + esc(T('Scans confirmed')) + '</dt><dd>' + esc(T('{n} of {m}', { n: res.confirmed, m: res.entries.length })) + '</dd></dl></div></div>' +
        '<div class="card"><h3 style="margin-bottom:8px">' + esc(T('Scans in this sign-off')) + '</h3>' + res.entries.map(function (e) { return '<div class="row" style="padding:6px 0;border-top:1px solid var(--line);font-size:14px"><span class="grow">' + esc(T((TYPES[e.type] || {}).label || e.type)) + ', ' + esc(fmt(e.date)) + '</span><span class="chip ' + (e.decision === 'confirmed' ? 'green' : 'amber') + '">' + esc(e.decision === 'confirmed' ? T('Confirmed') : e.decision === 'query' ? T('Queried') : T('Not reviewed')) + '</span></div>'; }).join('') + '</div>' +
        '<p class="small muted">' + esc(T('Wavelength records who signed and when. The supervisor\'s accreditation is as they stated it. The logbook holds no patient identifiers.')) + '</p>' + pearlCta() + form;
    });
  }

  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function showImages(res, byEntry, token, keyStr) {
    var stamp = T('Review copy') + ' · ' + res.learner + ' · ' + new Date().toLocaleDateString(LOCALES[LANG], { day: 'numeric', month: 'short', year: 'numeric' });
    crypto.subtle.importKey('raw', unb64u(keyStr), 'AES-GCM', false, ['decrypt']).then(function (key) {
      Object.keys(byEntry).forEach(function (entry) {
        var box = root.querySelector('[data-imgs="' + entry + '"]'); if (!box) return;
        Promise.all(byEntry[entry].map(function (im) {
          return fetch('/api/app/signoff/image?t=' + encodeURIComponent(token) + '&entry=' + encodeURIComponent(entry) + '&n=' + im.n).then(function (r) { if (!r.ok) throw new Error('gone'); return r.arrayBuffer(); }).then(function (buf) {
            var u = new Uint8Array(buf);
            return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12), additionalData: new TextEncoder().encode(res.code + ':' + entry + ':' + im.n) }, key, u.slice(12));
          }).then(function (plain) {
            if (im.kind === 'clip') {
              var wrap = document.createElement('div'); wrap.className = 'review-clip';
              var v = document.createElement('video'); v.src = URL.createObjectURL(new Blob([plain], { type: im.type || 'video/mp4' })); v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.controls = true; v.setAttribute('playsinline', ''); v.setAttribute('controlsList', 'nodownload noremoteplayback'); v.disablePictureInPicture = true; v.oncontextmenu = function (ev) { ev.preventDefault(); };
              var mark = document.createElement('span'); mark.className = 'review-mark'; mark.textContent = stamp;
              wrap.appendChild(v); wrap.appendChild(mark);
              return wrap;
            }
            return createImageBitmap(new Blob([plain], { type: 'image/jpeg' })).then(function (bmp) {
              var cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.className = 'review-img';
              var g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
              var fs = Math.max(14, Math.round(cv.width / 40)); g.font = '600 ' + fs + 'px DM Sans, system-ui, sans-serif'; g.textBaseline = 'bottom';
              var w = g.measureText(stamp).width; g.fillStyle = 'rgba(15,30,51,.7)'; g.fillRect(0, cv.height - fs * 1.8, w + fs, fs * 1.8); g.fillStyle = '#fff'; g.fillText(stamp, fs / 2, cv.height - fs * 0.4);
              g.save(); g.globalAlpha = 0.14; g.translate(cv.width / 2, cv.height / 2); g.rotate(-Math.PI / 7); g.font = '600 ' + fs * 2 + 'px DM Sans, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(T('REVIEW COPY'), 0, 0); g.restore();
              cv.oncontextmenu = function (ev) { ev.preventDefault(); };
              return cv;
            });
          });
        })).then(function (els) { box.innerHTML = ''; els.forEach(function (c) { box.appendChild(c); }); })
          .catch(function () { box.innerHTML = '<p class="small err">' + esc(T('These images could not be opened. The link may be incomplete. Ask the learner to send it again.')) + '</p>'; });
      });
    }).catch(function () { root.querySelectorAll('[data-imgs]').forEach(function (b) { b.innerHTML = '<p class="small err">' + esc(T('These images could not be opened. The link may be incomplete.')) + '</p>'; }); });
  }
  function entryHtml(e, opts) {
    var t = TYPES[e.type] || { label: e.type, fields: [] }, f = e.findings || {};
    var findings = t.fields.filter(function (fd) { return f[fd.id] != null && f[fd.id] !== ''; }).map(function (fd) { return '<dt>' + esc(T(fd.label)) + '</dt><dd>' + esc(val(f[fd.id])) + (fd.unit ? ' ' + fd.unit : '') + '</dd>'; }).join('');
    var r = function (k, v, raw) { return v ? '<dt>' + esc(T(k)) + '</dt><dd>' + esc(raw ? v : val(v)) + '</dd>' : ''; };
    var imgNote = opts.shared ? ' · ' + N(opts.shared, '{n} image below', '{n} images below') : e.imageCount ? ' · ' + N(e.imageCount, '{n} image on the learner\'s phone', '{n} images on the learner\'s phone') : '';
    return '<div class="card"><div class="row" style="margin-bottom:8px"><div class="grow"><b>' + esc(T(t.label)) + '</b><p class="small muted" style="margin:0">' + esc(fmt(e.date)) + ' · ' + esc(T(SUP[e.supervision] || '')) + (e.supervisor ? ' · ' + esc(e.supervisor) : '') + esc(imgNote) + '</p></div>' + (opts.decide ? '<select data-dec="' + esc(e.id) + '" style="width:auto;min-height:40px;font-size:14px"><option value="confirmed">' + esc(T('Confirm')) + '</option><option value="query">' + esc(T('Query')) + '</option></select>' : '') + '</div><div class="detail"><dl>' + r('Setting', e.setting) + r('Indication', e.indication, true) + findings + r('Overall', e.overall) + r('Image quality', e.quality) + r('Interpretation', e.interpretation, true) + r('Confirmed by', e.confirmation) + r('Impact', e.impact, true) + '</dl></div>' + (opts.shared ? '<div class="review-imgs" data-imgs="' + esc(e.id) + '"><p class="small muted">' + esc(T('Decrypting images…')) + '</p></div>' : '') + (opts.decide ? F.ratingHtml(C, T, e.id) : '') + '</div>';
  }

  function signPage() {
    var frag = location.hash.slice(1).split('.'), token = frag[0], keyStr = frag[1] || '';
    history.replaceState(null, '', location.pathname); // keep the token out of history and screenshots of the address bar
    head.textContent = T('Sign off scans');
    if (!token) { root.innerHTML = err('This link is incomplete. Ask the learner to send it again.'); return; }
    fetch('/api/app/signoff/view?t=' + encodeURIComponent(token)).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) { root.innerHTML = '<div class="' + (res.done ? 'ok' : 'err') + '">' + esc(T(res.error)) + '</div>'; return; }
      var shared = keyStr && window.crypto && crypto.subtle ? (res.images || []) : [];
      var byEntry = {}; shared.forEach(function (i) { (byEntry[i.entry] = byEntry[i.entry] || []).push(i); });
      lede.textContent = T('{name} asks you to confirm {scans} from their ultrasound logbook.', { name: res.learner, scans: N(res.entries.length, '{n} scan', '{n} scans') });
      var intro = shared.length ? '<p class="small muted">' + esc(T('The learner shared {n} for review. They were encrypted on the learner\'s phone and only this link opens them. They are for review only: do not save, screenshot or forward them. They delete when you sign.', { n: N(shared.length, '{n} image', '{n} images') })) + '</p>' : '<p class="small muted">' + esc(T('You see the written record only. Images stay on the learner\'s phone, so review them with the learner or on the ultrasound machine before you confirm.')) + '</p>';
      root.innerHTML = intro + '<p class="small muted">' + esc(T('Rate image quality and diagnostic accuracy for each scan if you wish: green good, amber acceptable with minor issues, red not acceptable.')) + '</p>' + res.entries.map(function (e) { return entryHtml(e, { decide: true, shared: (byEntry[e.id] || []).length }); }).join('') +
        '<form id="sf">' + F.assessorHtml(T, { name: res.supervisorName }) +
        '<div class="field"><span class="lab">' + esc(T('How you know')) + '</span><div class="seg"><input type="radio" name="basis" id="bw" value="witnessed" checked><label for="bw">' + esc(T('I watched the scan')) + '</label><input type="radio" name="basis" id="br" value="reviewed"><label for="br">' + esc(T('I reviewed the images')) + '</label><input type="radio" name="basis" id="bb" value="both"><label for="bb">' + esc(T('Both')) + '</label></div></div>' +
        '<div class="field"><label for="em">' + esc(T('Your email (optional)')) + '</label><input id="em" name="email" type="email"></div>' +
        '<div class="field"><label for="cm">' + esc(T('Comment for the learner (optional)')) + '</label><textarea id="cm" name="comment"></textarea></div>' +
        '<div class="field"><span class="lab">' + esc(T('Your signature')) + '</span><p class="small muted" style="margin:0 0 6px">' + esc(T('Sign with your finger, or your mouse on a computer.')) + '</p><canvas class="sigpad" data-sig></canvas><button type="button" class="link small" data-sigclr>' + esc(T('Clear')) + '</button></div>' +
        '<label class="check"><input type="checkbox" name="confirm" value="1" required><span>' + esc(T('I witnessed or reviewed these scans as stated, and my decisions above are accurate.')) + '</span></label>' +
        '<div class="err" hidden style="margin-top:12px"></div><div class="btns"><button class="btn teal block">' + esc(T('Submit sign-off')) + '</button></div></form>';
      var f = document.getElementById('sf'), pad = F.bindSig(root);
      if (shared.length) { var br = document.getElementById('br'); if (br) br.checked = true; showImages(res, byEntry, token, keyStr); }
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; });
        var e2 = f.querySelector('.err'); e2.hidden = true;
        if (!d.name || !d.role || !d.confirm) { e2.textContent = T('Enter your name and role and tick the confirmation.'); e2.hidden = false; return; }
        if (pad.empty()) { e2.textContent = T('Sign in the box.'); e2.hidden = false; return; }
        d.signature = pad.data(); d.token = token; d.decisions = {}; root.querySelectorAll('[data-dec]').forEach(function (s) { d.decisions[s.dataset.dec] = s.value; });
        d.ratings = F.readRatings(root);
        var b = f.querySelector('button.teal'); b.disabled = true; b.textContent = T('Submitting…');
        post('/api/app/signoff/complete', d).then(function (r) {
          if (!r.ok) throw new Error(T(r.error || 'Could not submit.'));
          lede.textContent = '';
          root.innerHTML = '<div class="ok"><b>' + esc(T('Thank you.')) + '</b> ' + esc(T('Your sign-off is recorded with code {code}. The learner sees it in their logbook straight away.', { code: r.code })) + '</div><p class="small muted">' + esc(T('Anyone can check it at thewavelength.co.uk/verify.')) + '</p>' + pearlCta() + '<a class="btn ghost block" href="/">' + esc(T('Visit Wavelength')) + '</a>';
        }).catch(function (ex) { b.disabled = false; b.textContent = T('Submit sign-off'); e2.textContent = ex.message; e2.hidden = false; });
      });
    });
  }

  function assessPage() {
    var token = location.hash.slice(1);
    history.replaceState(null, '', location.pathname);
    head.textContent = T('Ultrasound assessment');
    if (!token) { root.innerHTML = err('This link is incomplete. Ask the learner to send it again.'); return; }
    fetch('/api/app/assessment/view?t=' + encodeURIComponent(token)).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) { root.innerHTML = '<div class="' + (res.done ? 'ok' : 'err') + '">' + esc(T(res.error)) + '</div>'; return; }
      var kind = (C.assessmentKinds || []).find(function (k) { return k.id === res.kind; }) || { label: res.kind, help: '' };
      lede.textContent = T('{name} asks you to complete a {kind} for {module}.', { name: res.learner, kind: T(kind.label).toLowerCase(), module: res.pathwayLabel + ' ' + T(res.moduleLabel) });
      root.innerHTML = '<p class="small muted">' + esc(T(kind.help)) + '</p>' + (res.entries.length ? '<p class="eyebrow">' + esc(T('Scans the learner attached')) + '</p>' + res.entries.map(function (e) { return entryHtml(e, {}); }).join('') : '') +
        '<form id="af">' + F.assessmentHtml(C, T, { kind: res.kind, topics: res.topics, learnerReflection: (res.data || {}).learnerReflection, pre: { name: res.supervisorName } }) +
        '<div class="field"><label for="em">' + esc(T('Your email (optional)')) + '</label><input id="em" name="email" type="email"></div>' +
        '<div class="err" hidden style="margin-top:12px"></div><div class="btns"><button class="btn teal block">' + esc(T('Submit assessment')) + '</button></div></form>';
      var f = document.getElementById('af'), pad = F.bindSig(root);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); var d = F.readAssessment(C, f), e2 = f.querySelector('.err'); e2.hidden = true;
        if (!d.name || !d.role || !d.confirm) { e2.textContent = T('Enter your name and role and tick the confirmation.'); e2.hidden = false; return; }
        if (!d.outcome) { e2.textContent = T('Choose the outcome of the assessment.'); e2.hidden = false; return; }
        if (pad.empty()) { e2.textContent = T('Sign in the box.'); e2.hidden = false; return; }
        d.signature = pad.data(); d.token = token;
        var b = f.querySelector('button.teal'); b.disabled = true; b.textContent = T('Submitting…');
        post('/api/app/assessment/complete', d).then(function (r) {
          if (!r.ok) throw new Error(T(r.error || 'Could not submit.'));
          lede.textContent = '';
          root.innerHTML = '<div class="ok"><b>' + esc(T('Thank you.')) + '</b> ' + esc(T('Your assessment is recorded with code {code}. The learner sees it in their logbook straight away.', { code: r.code })) + '</div><p class="small muted">' + esc(T('Anyone can check it at thewavelength.co.uk/verify.')) + '</p>' + pearlCta() + '<a class="btn ghost block" href="/">' + esc(T('Visit Wavelength')) + '</a>';
        }).catch(function (ex) { b.disabled = false; b.textContent = T('Submit assessment'); e2.textContent = ex.message; e2.hidden = false; });
      });
    });
  }

  function start() {
    var page = document.body.dataset.page;
    if (page === 'verify') verifyPage(); else if (page === 'assess') assessPage(); else signPage();
  }
  var want = ((navigator.languages || [navigator.language || 'en'])[0] || 'en').slice(0, 2).toLowerCase();
  try { want = localStorage.getItem('wl-lang') || want; } catch (e) { /* blocked */ }
  if (!LOCALES[want] || want === 'en') { start(); return; }
  var s = document.createElement('script'); s.src = '/app/i18n/' + want + '.js?v=' + (window.WL_BUILD || '');
  s.onload = function () { LANG = want; L = window.WL_I18N || {}; document.documentElement.lang = LOCALES[want]; document.documentElement.dir = want === 'ar' ? 'rtl' : 'ltr'; start(); };
  s.onerror = start; document.head.appendChild(s);
})();
