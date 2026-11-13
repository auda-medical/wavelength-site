// Wavelength logbook layouts (road to #1, 13 Nov 2026): an Excel export laid out the way each body's own logbook or
// summary record is laid out, so a learner can hand it over or copy it across without retyping.
// Plain script like progress.js: the app loads it with a <script> tag; tests run it with new Function.
// A layout lives on a destination in data/logbook.json ("layout"). Each layout is Wavelength's own arrangement of the
// body's published fields: it is never an official form, and the About sheet says so in every file.
//
// layout = {
//   name:        shown on the export screen ("FUSIC logbook layout")
//   file:        file name stem ("Wavelength-FUSIC-logbook")
//   sheets:      "module" (one sheet per pathway module, scans of that module only) or "all" (one Logbook sheet)
//   supervision: { direct, mentored, independent } the body's own words for the three supervision categories
//   columns:     [[header, source, width?], ...]; sources below
//   notes:       lines added to the About sheet (what the body still needs on its own forms)
//   assessments: true to add an Assessments sheet (DOPS, triggered assessments, ACT)
// }
// Sources: n (row number in the sheet), ref (training reference: the module code and row number, never patient data),
// date, type, module, setting, age, sex, indication, findings (every finding, "Label: value"), f.<field id> (one finding),
// overall, quality, interpretation, outcome (confirmed by and agreement), impact, supervision (in the body's words),
// counts (whether the scan counts towards the body's numbers), supervisor, signoff (status), signedBy, signedOn,
// signoffCode, volunteer (Yes when the setting is a healthy volunteer), reflection, images.
(function (root) {
  'use strict';
  var Q = { g: 'Good', a: 'Acceptable', r: 'Not acceptable' };
  function clean(v) { return v == null ? '' : Array.isArray(v) ? v.join(', ') : v; }
  function sheetName(s, used) {
    var n = String(s).replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
    var base = n, i = 2; while (used[n]) { n = (base.slice(0, 28) + ' ' + i++); } used[n] = 1; return n;
  }
  // ctx: { C (config), PATHS, TYPES, supLabel(id), signoffState(e), modulesFor(pid, list), moduleStats(pw, m, list),
  //        assessments (signed, in range), account, profile, from, to, generated, evidence }
  function build(dest, pid, list, ctx) {
    var L = dest && dest.layout; if (!L) throw new Error('No layout for this destination');
    var pw = ctx.PATHS[pid] || ctx.PATHS[dest.pathway];
    var mods = pw ? ctx.modulesFor(pw.id, list) : [];
    var used = {}, sheets = [];
    var supWords = L.supervision || {};
    var counts = function (e) { return e.supervision === 'independent' && supWords.independentCounts !== true ? 'No' : 'Yes'; };
    var modOf = function (e) { var m = mods.find(function (x) { return x.types.indexOf(e.type) >= 0; }); return m ? m.label : ''; };
    var code = function (m) { return (m && (m.code || m.label) || 'SCAN').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase(); };
    var cell = function (src, e, i, m) {
      var t = ctx.TYPES[e.type] || { fields: [] }, f = e.findings || {}, so = ctx.signoffState(e);
      if (src.indexOf('f.') === 0) { var fd = t.fields.find(function (x) { return x.id === src.slice(2); }); var v = f[src.slice(2)]; return v == null || v === '' ? '' : clean(v) + (fd && fd.unit ? ' ' + fd.unit : ''); }
      switch (src) {
        case 'n': return i + 1;
        case 'ref': return code(m) + '-' + String(i + 1).padStart(3, '0');
        case 'date': return e.date || '';
        case 'type': return t.label || e.type;
        case 'module': return m ? m.label : modOf(e);
        case 'setting': return clean(e.setting);
        case 'age': return clean(e.age);
        case 'sex': return clean(e.sex);
        case 'indication': return clean(e.indication);
        case 'findings': return t.fields.filter(function (x) { return f[x.id] != null && f[x.id] !== ''; }).map(function (x) { return x.label + ': ' + clean(f[x.id]) + (x.unit ? ' ' + x.unit : ''); }).join('; ');
        case 'overall': return clean(e.overall);
        case 'quality': return clean(e.quality);
        case 'interpretation': return clean(e.interpretation);
        case 'outcome': return [e.confirmation, e.concordant].filter(Boolean).join(', ');
        case 'impact': return clean(e.impact);
        case 'supervision': return supWords[e.supervision] || ctx.supLabel(e.supervision) || '';
        case 'counts': return counts(e);
        case 'supervisor': return clean(e.supervisor);
        case 'signoff': return so.label;
        case 'signedBy': return so.by;
        case 'signedOn': return so.on;
        case 'signoffCode': return so.code;
        case 'rating': return so.rating ? [so.rating.image ? 'Image ' + Q[so.rating.image] : '', so.rating.accuracy ? 'Accuracy ' + Q[so.rating.accuracy] : ''].filter(Boolean).join(', ') : '';
        case 'volunteer': return e.setting === 'Healthy volunteer' ? 'Yes' : 'No';
        case 'reflection': return ctx.reflections === false ? '' : clean(e.reflection);
        case 'images': return (e.images || []).length;
        default: return '';
      }
    };
    var cols = L.columns.filter(function (c) { return c[1] !== 'reflection' || ctx.reflections !== false; });
    var head = cols.map(function (c) { return c[0]; }), widths = cols.map(function (c) { return c[2] || 16; });
    var table = function (rows, m) { return [head].concat(rows.map(function (e, i) { return cols.map(function (c) { return cell(c[1], e, i, m); }); })); };
    // Summary first: the body's modules, numbers and where the learner stands.
    var sum = [['Module', 'Scans logged', 'Counted', 'Target', (supWords.direct || 'Directly supervised'), 'Supervised target', 'Signed off', 'Status']];
    mods.forEach(function (m) { var s = ctx.moduleStats(pw, m, list); sum.push([m.label, s.logged != null ? s.logged : s.counted, s.counted, s.total || '', s.supervised, s.sup || '', s.signed, s.met ? 'Target met' : (s.needs && s.needs.length ? s.needs.join(', ') + ' needed' : '')]); });
    sheets.push({ name: sheetName('Summary', used), rows: sum, widths: [30, 12, 10, 8, 20, 16, 10, 44] });
    if (L.sheets === 'module' && mods.length) {
      mods.forEach(function (m) {
        var rows = list.filter(function (e) { return m.types.indexOf(e.type) >= 0 && (e.exclude || []).indexOf(m.id) < 0; });
        if (rows.length) sheets.push({ name: sheetName(m.label, used), rows: table(rows, m), widths: widths });
      });
      var other = list.filter(function (e) { return !mods.some(function (m) { return m.types.indexOf(e.type) >= 0; }); });
      if (other.length) sheets.push({ name: sheetName('Other scans', used), rows: table(other, null), widths: widths });
    } else {
      sheets.push({ name: sheetName('Logbook', used), rows: table(list, null), widths: widths });
    }
    if (L.assessments && ctx.assessments && ctx.assessments.length) sheets.push({ name: sheetName('Assessments', used), rows: [['Code', 'Date', 'Module', 'Type', 'Outcome', 'Assessor']].concat(ctx.assessments.map(function (a) { return [a.code, a.date, a.module, a.kind, a.outcome, a.assessor]; })), widths: [16, 11, 30, 30, 36, 30] });
    var acc = ctx.account || {}, prof = ctx.profile || {};
    var about = [[L.name, ''], ['Name', acc.name || ''], ['Grade or role', prof.grade || acc.role || ''], ['Registration', prof.registration || ''], ['Period', ctx.from + ' to ' + ctx.to], ['Scans', list.length], ['Generated', ctx.generated || ''],
      ['Verified summary', ctx.evidence ? ctx.evidence.code : 'Not created'], ['Check it at', ctx.evidence ? ctx.evidence.link : ''],
      ['About this file', 'Wavelength arranged this file to follow the fields ' + (dest.body || 'the body') + ' publishes for its logbook. It is not an official document of ' + (dest.body || 'the body') + ', and ' + (dest.body || 'the body') + ' has not reviewed or endorsed it. Whether it is accepted is for ' + (dest.body || 'the body') + ', your supervisors and your training programme.'],
      ['Training references', 'Each scan has a training reference (module code and number), never a patient identifier.'],
      ['Patient data', 'This record holds no patient identifiers.']].concat((L.notes || []).map(function (n, i) { return [i ? '' : 'Still needed', n]; }));
    sheets.push({ name: sheetName('About', used), rows: about, widths: [22, 90] });
    return { sheets: sheets, name: (L.file || 'Wavelength-logbook') + '-' + (ctx.generated || '') + '.xlsx' };
  }
  root.WLFormats = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
