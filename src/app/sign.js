// Supervisor sign-off by link (/app/sign/#token) and public verification (/app/verify/?code=).
(function () {
  var C = window.WL_LOGBOOK, TYPES = {}; C.types.forEach(function (t) { TYPES[t.id] = t; });
  var SUP = {}; C.supervision.forEach(function (s) { SUP[s.id] = s.label; });
  var root = document.getElementById('root'), lede = document.getElementById('lede');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(iso) { return iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function post(url, d) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(d) }).then(function (r) { return r.json(); }); }
  var ACCRED = ['RCEM-approved ultrasound supervisor', 'FAMUS mentor', 'FAMUS supervisor', 'FUSIC mentor', 'FUSIC supervisor', 'Consultant sonographer', 'Other'];

  function evidenceHtml(r) {
    var n = function (v) { return v === '' || v == null ? '' : String(v); };
    var dl = function (k, v) { return v ? '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>' : ''; };
    var own = false;
    var paths = (r.pathways || []).map(function (p) {
      var rows = p.modules.map(function (m) {
        if (m.ownTarget) own = true;
        var status = m.met ? '<span class="chip green">Met</span>' : (m.total || m.supTarget) ? '<span class="chip amber">In progress</span>' : '';
        var nums = 'Scans ' + m.counted + (m.total ? ' / ' + m.total : '') + ' · Supervised ' + m.supervised + (m.supTarget ? ' / ' + m.supTarget : '') + ' · Signed off ' + m.signed;
        var path = (m.rules || []).filter(function (x) { return x.min; }).map(function (x) { return '<span style="white-space:nowrap">' + esc(x.label) + ' ' + x.n + '/' + x.min + (x.n >= x.min ? ' ✓' : '') + '</span>'; }).join(' · ');
        return '<div class="evmod"><div class="row"><b class="grow">' + esc(m.label) + (m.ownTarget ? ' *' : '') + '</b>' + status + '</div><p class="small">' + nums + '</p>' + (path ? '<p class="small muted">' + path + '</p>' : '') + '</div>';
      }).join('');
      return '<div class="card"><h3>' + esc(p.name || p.label) + '</h3>' + (rows || '<p class="small muted">No modules.</p>') + '<p class="small muted" style="margin-top:8px">Targets from ' + esc(p.source || '') + ' Checked ' + esc(fmt(p.checked)) + '.</p></div>';
    }).join('');
    return '<div class="ok"><b>Genuine summary.</b> Wavelength created this from ' + esc(r.learner) + '\'s synced logbook on ' + esc(fmt(r.createdAt)) + '.</div>' +
      '<div class="card"><div class="detail"><dl>' + dl('Code', r.code) + dl('Learner', r.learner) + dl('Grade or role', r.grade) + dl('Organisation', r.organisation) + dl('Period', fmt(r.from) + ' to ' + fmt(r.to)) + dl('Prepared for', r.destinationLabel) + dl('Scans', n(r.scans) + (r.signedOnly ? ' (signed off only)' : '')) + dl('Directly supervised', n(r.supervised)) + dl('Signed off by a supervisor', n(r.signed)) + dl('First and last scan', r.firstScan ? fmt(r.firstScan) + ' to ' + fmt(r.lastScan) : '') + '</dl></div></div>' +
      paths + (own ? '<p class="small muted">* The learner set their own target for this module, which differs from the curriculum figure.</p>' : '') +
      ((r.signoffCodes || []).length ? '<div class="card"><h3>Sign-offs</h3><p class="small muted">Open any code to see who signed and when.</p><p style="line-height:2">' + r.signoffCodes.map(function (c) { return '<a class="chip" href="/app/verify/?code=' + encodeURIComponent(c) + '">' + esc(c) + '</a>'; }).join(' ') + '</p></div>' : '') +
      '<p class="small muted">Counts and sign-offs come from the server copy of the learner\'s logbook at the time shown, not from the exported file. Wavelength holds no patient identifiers and no scan images. Supervisor accreditation is as each supervisor stated it. The accrediting body or training programme decides what evidence it accepts.</p>';
  }

  if (document.body.dataset.page === 'verify') {
    var code = new URLSearchParams(location.search).get('code') || '';
    lede.textContent = 'Check a supervisor sign-off (SO-) or a verified logbook summary (EV-) from a Wavelength export.';
    var form = '<form id="vf" method="get"><div class="field"><label for="c">Code</label><input id="c" name="code" type="text" placeholder="SO-XXXX-XXXX or EV-XXXX-XXXX" value="' + esc(code) + '" autocapitalize="characters" required></div><button class="btn teal block">Verify</button></form>';
    if (!code) { root.innerHTML = form; return; }
    fetch('/api/app/verify?code=' + encodeURIComponent(code)).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) { root.innerHTML = '<div class="err">' + esc(res.error) + '</div>' + form; return; }
      if (res.kind === 'evidence') { document.getElementById('h').textContent = 'Verified summary'; lede.textContent = ''; root.innerHTML = evidenceHtml(res) + form; return; }
      root.innerHTML = '<div class="ok"><b>Genuine sign-off.</b> This record exists in the Wavelength logbook.</div><div class="card"><div class="detail"><dl><dt>Code</dt><dd>' + esc(res.code) + '</dd><dt>Learner</dt><dd>' + esc(res.learner) + '</dd><dt>Signed by</dt><dd>' + esc(res.supervisor) + (res.role ? ', ' + esc(res.role) : '') + '</dd>' + (res.accreditation ? '<dt>Accreditation stated</dt><dd>' + esc(res.accreditation) + '</dd>' : '') + '<dt>Method</dt><dd>' + (res.method === 'in-person' ? 'In person, signed on the learner\'s device' : 'By secure link') + (res.handSigned ? ', signed by hand' : '') + '</dd>' + (res.basis ? '<dt>Basis</dt><dd>' + ({ witnessed: 'Witnessed the scan', reviewed: 'Reviewed the images', both: 'Witnessed the scan and reviewed the images' })[res.basis] + '</dd>' : '') + '<dt>Signed</dt><dd>' + esc(fmt(res.signedAt)) + '</dd><dt>Scans confirmed</dt><dd>' + res.confirmed + ' of ' + res.entries.length + '</dd></dl></div></div>' +
        '<div class="card"><h3 style="margin-bottom:8px">Scans in this sign-off</h3>' + res.entries.map(function (e) { return '<div class="row" style="padding:6px 0;border-top:1px solid var(--line);font-size:14px"><span class="grow">' + esc((TYPES[e.type] || {}).label || e.type) + ', ' + esc(fmt(e.date)) + '</span><span class="chip ' + (e.decision === 'confirmed' ? 'green' : 'amber') + '">' + (e.decision === 'confirmed' ? 'Confirmed' : e.decision === 'query' ? 'Queried' : 'Not reviewed') + '</span></div>'; }).join('') + '</div>' +
        '<p class="small muted">Wavelength records who signed and when. The supervisor\'s accreditation is as they stated it. The logbook holds no patient identifiers.</p>' + form;
    });
    return;
  }

  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function showImages(res, byEntry) {
    var stamp = 'Review copy · ' + res.learner + ' · ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    crypto.subtle.importKey('raw', unb64u(keyStr), 'AES-GCM', false, ['decrypt']).then(function (key) {
      Object.keys(byEntry).forEach(function (entry) {
        var box = root.querySelector('[data-imgs="' + entry + '"]'); if (!box) return;
        Promise.all(byEntry[entry].map(function (im) {
          return fetch('/api/app/signoff/image?t=' + encodeURIComponent(token) + '&entry=' + encodeURIComponent(entry) + '&n=' + im.n).then(function (r) { if (!r.ok) throw new Error('gone'); return r.arrayBuffer(); }).then(function (buf) {
            var u = new Uint8Array(buf);
            return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12), additionalData: new TextEncoder().encode(res.code + ':' + entry + ':' + im.n) }, key, u.slice(12));
          }).then(function (plain) { return createImageBitmap(new Blob([plain], { type: 'image/jpeg' })); }).then(function (bmp) {
            var cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.className = 'review-img';
            var g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
            var fs = Math.max(14, Math.round(cv.width / 40)); g.font = '600 ' + fs + 'px DM Sans, system-ui, sans-serif'; g.textBaseline = 'bottom';
            var w = g.measureText(stamp).width; g.fillStyle = 'rgba(15,30,51,.7)'; g.fillRect(0, cv.height - fs * 1.8, w + fs, fs * 1.8); g.fillStyle = '#fff'; g.fillText(stamp, fs / 2, cv.height - fs * 0.4);
            g.save(); g.globalAlpha = 0.14; g.translate(cv.width / 2, cv.height / 2); g.rotate(-Math.PI / 7); g.font = '600 ' + fs * 2 + 'px DM Sans, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText('REVIEW COPY', 0, 0); g.restore();
            cv.oncontextmenu = function (ev) { ev.preventDefault(); };
            return cv;
          });
        })).then(function (cvs) { box.innerHTML = ''; cvs.forEach(function (c) { box.appendChild(c); }); })
          .catch(function () { box.innerHTML = '<p class="small err">These images could not be opened. The link may be incomplete. Ask the learner to send it again.</p>'; });
      });
    }).catch(function () { root.querySelectorAll('[data-imgs]').forEach(function (b) { b.innerHTML = '<p class="small err">These images could not be opened. The link may be incomplete.</p>'; }); });
  }
  var frag = location.hash.slice(1).split('.'), token = frag[0], keyStr = frag[1] || '';
  history.replaceState(null, '', location.pathname); // keep the token out of history and screenshots of the address bar
  if (!token) { root.innerHTML = '<div class="err">This link is incomplete. Ask the learner to send it again.</div>'; return; }
  fetch('/api/app/signoff/view?t=' + encodeURIComponent(token)).then(function (r) { return r.json(); }).then(function (res) {
    if (!res.ok) { root.innerHTML = '<div class="' + (res.done ? 'ok' : 'err') + '">' + esc(res.error) + '</div>'; return; }
    var shared = keyStr && window.crypto && crypto.subtle ? (res.images || []) : [];
    var byEntry = {}; shared.forEach(function (i) { (byEntry[i.entry] = byEntry[i.entry] || []).push(i); });
    lede.textContent = res.learner + ' asks you to confirm ' + res.entries.length + (res.entries.length === 1 ? ' scan' : ' scans') + ' from their ultrasound logbook.';
    var rows = res.entries.map(function (e) {
      var t = TYPES[e.type] || { label: e.type, fields: [] }, f = e.findings || {};
      var findings = t.fields.filter(function (fd) { return f[fd.id] != null && f[fd.id] !== ''; }).map(function (fd) { return '<dt>' + esc(fd.label) + '</dt><dd>' + esc(Array.isArray(f[fd.id]) ? f[fd.id].join(', ') : f[fd.id]) + (fd.unit ? ' ' + fd.unit : '') + '</dd>'; }).join('');
      var r = function (k, v) { return v ? '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>' : ''; };
      return '<div class="card"><div class="row" style="margin-bottom:8px"><div class="grow"><b>' + esc(t.label) + '</b><p class="small muted" style="margin:0">' + esc(fmt(e.date)) + ' · ' + esc(SUP[e.supervision] || '') + (e.supervisor ? ' · ' + esc(e.supervisor) : '') + (byEntry[e.id] ? ' · ' + byEntry[e.id].length + ' image' + (byEntry[e.id].length === 1 ? '' : 's') + ' below' : e.imageCount ? ' · ' + e.imageCount + ' image' + (e.imageCount === 1 ? '' : 's') + ' on the learner\'s phone' : '') + '</p></div><select data-dec="' + esc(e.id) + '" style="width:auto;min-height:40px;font-size:14px"><option value="confirmed">Confirm</option><option value="query">Query</option></select></div><div class="detail"><dl>' + r('Setting', e.setting) + r('Indication', e.indication) + findings + r('Overall', e.overall) + r('Image quality', e.quality) + r('Interpretation', e.interpretation) + r('Confirmed by', e.confirmation) + r('Impact', e.impact) + '</dl></div>' + (byEntry[e.id] ? '<div class="review-imgs" data-imgs="' + esc(e.id) + '"><p class="small muted">Decrypting images…</p></div>' : '') + '</div>';
    }).join('');
    var intro = shared.length ? '<p class="small muted">The learner shared ' + shared.length + (shared.length === 1 ? ' image' : ' images') + ' for review. They were encrypted on the learner\'s phone and only this link opens them. They are for review only: do not save, screenshot or forward them. They delete when you sign.</p>' : '<p class="small muted">You see the written record only. Images stay on the learner\'s phone, so review them with the learner or on the ultrasound machine before you confirm.</p>';
    root.innerHTML = intro + rows +
      '<form id="sf"><div class="field"><label for="n">Your name</label><input id="n" name="name" type="text" value="' + esc(res.supervisorName || '') + '" required></div>' +
      '<div class="field"><label for="ro">Role</label><input id="ro" name="role" type="text" placeholder="For example consultant in emergency medicine" required></div>' +
      '<div class="two"><div class="field"><label for="rg">GMC, NMC or HCPC number</label><input id="rg" name="registration" type="text"></div><div class="field"><label for="ac">Accreditation</label><select id="ac" name="accreditation"><option value="">Choose</option>' + ACCRED.map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select></div></div>' +
'<div class="field"><span class="lab">How you know</span><div class="seg"><input type="radio" name="basis" id="bw" value="witnessed" checked><label for="bw">I watched the scan</label><input type="radio" name="basis" id="br" value="reviewed"><label for="br">I reviewed the images</label><input type="radio" name="basis" id="bb" value="both"><label for="bb">Both</label></div></div>' +
      '<div class="field"><label for="em">Your email (optional)</label><input id="em" name="email" type="email"></div>' +
      '<div class="field"><label for="cm">Comment for the learner (optional)</label><textarea id="cm" name="comment"></textarea></div>' +
      '<div class="field"><span class="lab">Your signature</span><p class="small muted" style="margin:0 0 6px">Sign with your finger, or your mouse on a computer.</p><canvas class="sigpad" id="sig"></canvas><button type="button" class="link small" id="sigclr">Clear</button></div>' +
      '<label class="check"><input type="checkbox" name="confirm" value="1" required><span>I witnessed or reviewed these scans as stated, and my decisions above are accurate.</span></label>' +
      '<div class="err" hidden style="margin-top:12px"></div><div class="btns"><button class="btn teal block">Submit sign-off</button></div></form>';
    var f = document.getElementById('sf');
    if (shared.length) { var br = document.getElementById('br'); if (br) br.checked = true; showImages(res, byEntry); }
    var cv = document.getElementById('sig'), g, drawn = false, last = null;
    var size = function () { cv.width = cv.clientWidth; cv.height = cv.clientHeight; g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.strokeStyle = '#0F1E33'; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; drawn = false; };
    size(); document.getElementById('sigclr').onclick = size;
    var pt = function (e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', function (e) { e.preventDefault(); cv.setPointerCapture(e.pointerId); last = pt(e); });
    cv.addEventListener('pointermove', function (e) { if (!last) return; var p = pt(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; drawn = true; });
    cv.addEventListener('pointerup', function () { last = null; });
    f.addEventListener('submit', function (ev) {
      ev.preventDefault(); var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; });
      var err = f.querySelector('.err'); err.hidden = true;
      if (!d.name || !d.role || !d.confirm) { err.textContent = 'Enter your name and role and tick the confirmation.'; err.hidden = false; return; }
      if (!drawn) { err.textContent = 'Sign in the box.'; err.hidden = false; return; }
      d.signature = cv.toDataURL('image/png');
      d.token = token; d.decisions = {}; root.querySelectorAll('[data-dec]').forEach(function (s) { d.decisions[s.dataset.dec] = s.value; });
      var b = f.querySelector('button'); b.disabled = true; b.textContent = 'Submitting…';
      post('/api/app/signoff/complete', d).then(function (r) {
        if (!r.ok) throw new Error(r.error || 'Could not submit.');
        lede.textContent = '';
        root.innerHTML = '<div class="ok"><b>Thank you.</b> Your sign-off is recorded with code ' + esc(r.code) + '. The learner sees it in their logbook straight away.</div><p class="small muted">Anyone can check it at thewavelength.co.uk/verify.</p><a class="btn ghost block" href="/">Visit Wavelength</a>';
      }).catch(function (ex) { b.disabled = false; b.textContent = 'Submit sign-off'; err.textContent = ex.message; err.hidden = false; });
    });
  });
})();
