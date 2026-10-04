// Wavelength progress engine: one copy of the target logic, used by the app (browser) and the Worker (evidence summaries,
// supervisor dashboard). Plain script so it loads with a <script> tag; the Worker imports it for its side effect.
// Rules: { label, min | max, match | any, not }. match: every key must match. any: a list of match objects, one is enough.
// not: a match object that excludes the entry. Keys 'f.<field>' read a finding; other keys read the entry.
// Module assessments: [{ kind, label, min, outcomes }] count structured assessments recorded in the app.
(function (root) {
  'use strict';
  function matches(e, match) {
    return Object.keys(match || {}).every(function (k) {
      var v = k.indexOf('f.') === 0 ? (e.findings || {})[k.slice(2)] : e[k];
      if (Array.isArray(v)) return v.some(function (x) { return match[k].indexOf(x) >= 0; });
      return match[k].indexOf(v) >= 0;
    });
  }
  function hit(e, r) {
    var ok = r.any ? r.any.some(function (m) { return matches(e, m); }) : matches(e, r.match);
    if (ok && r.not && matches(e, r.not)) ok = false;
    return ok;
  }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : (b || a + 's')); }

  // entries: live logbook entries. targets: learner overrides { modId: { total, supervised } }. assessments: recorded assessments.
  function moduleStats(mod, entries, targets, assessments) {
    var t = (targets || {})[mod.id] || {};
    var curriculumTotal = mod.total || 0, curriculumSup = mod.supervised || 0;
    var total = t.total != null ? Number(t.total) || 0 : curriculumTotal;
    var sup = t.supervised != null ? Number(t.supervised) || 0 : curriculumSup;
    var list = entries.filter(function (e) { return mod.types.indexOf(e.type) >= 0 && (e.exclude || []).indexOf(mod.id) < 0 && (!mod.filter || hit(e, mod.filter)); });
    var over = 0;
    var rules = (mod.rules || []).map(function (r) {
      var n = list.filter(function (e) { return hit(e, r); }).length;
      if (r.max != null && n > r.max) over += n - r.max;
      return { label: r.label, n: n, min: r.min || null, max: r.max != null ? r.max : null };
    });
    var counted = Math.max(0, list.length - over);
    var supervised = list.filter(function (e) { return e.supervision === 'direct'; }).length;
    var mentored = list.filter(function (e) { return e.supervision === 'mentored'; }).length;
    var reflections = list.filter(function (e) { return e.reflection && String(e.reflection).trim().length > 20; }).length;
    var signed = list.filter(function (e) { return e.signoff && e.signoff.status === 'confirmed'; }).length;
    var asmts = (mod.assessments || []).map(function (a) {
      var n = (assessments || []).filter(function (x) { return x.module === mod.id && x.kind === a.kind && (!a.outcomes || a.outcomes.indexOf(x.outcome) >= 0); }).length;
      return { kind: a.kind, label: a.label, n: n, min: a.min || 1 };
    });
    var parts = [];
    if (total) parts.push(Math.min(1, counted / total));
    if (sup) parts.push(Math.min(1, supervised / sup));
    if (mod.reflections) parts.push(Math.min(1, reflections / mod.reflections));
    rules.forEach(function (r) { if (r.min) parts.push(Math.min(1, r.n / r.min)); });
    asmts.forEach(function (a) { parts.push(Math.min(1, a.n / a.min)); });
    var frac = parts.length ? Math.min.apply(null, parts) : (list.length ? 1 : 0);
    var met = !!parts.length && frac >= 1;
    // Gaps: what is still missing, as structured items so each language can word them.
    var gaps = [];
    if (total > counted) gaps.push({ k: 'scans', n: total - counted });
    if (sup > supervised) gaps.push({ k: 'supervised', n: sup - supervised });
    if (mod.reflections && mod.reflections > reflections) gaps.push({ k: 'reflections', n: mod.reflections - reflections });
    rules.forEach(function (r) { if (r.min && r.n < r.min) gaps.push({ k: 'rule', n: r.min - r.n, label: r.label }); });
    asmts.forEach(function (a) { if (a.n < a.min) gaps.push({ k: 'assessment', n: a.min - a.n, label: a.label }); });
    var needs = gaps.map(function (g) {
      if (g.k === 'scans') return plural(g.n, 'more scan');
      if (g.k === 'supervised') return g.n + ' more supervised';
      if (g.k === 'reflections') return plural(g.n, 'more reflection');
      return g.n + ' more ' + g.label.toLowerCase();
    });
    return {
      mod: mod, id: mod.id, label: mod.label, list: list, logged: list.length, counted: counted, total: total, sup: sup, supTarget: sup,
      supervised: supervised, mentored: mentored, reflections: reflections, reflectionTarget: mod.reflections || 0, signed: signed,
      rules: rules, assessments: asmts, frac: frac, percent: Math.round(100 * frac), main: total ? Math.min(1, counted / total) : 0,
      met: met, colour: met ? 'green' : frac >= 1 / 3 ? 'amber' : 'red', need: Math.max(0, total - counted), gaps: gaps, needs: needs,
      ownTarget: (t.total != null && Number(t.total) !== curriculumTotal) || (t.supervised != null && Number(t.supervised) !== curriculumSup),
      curriculumTotal: curriculumTotal, curriculumSup: curriculumSup
    };
  }

  function create(C) {
    var TYPES = {}; C.types.forEach(function (t) { TYPES[t.id] = t; });
    var PATHS = {}; C.pathways.forEach(function (p) { PATHS[p.id] = p; });
    function modulesFor(pid, entries, targets) {
      var pw = PATHS[pid]; if (!pw) return [];
      if (pid !== 'general') return pw.modules;
      var seen = {}; entries.forEach(function (e) { seen[e.type] = 1; });
      Object.keys(targets || {}).forEach(function (k) { if (k.indexOf('gen-') === 0 && targets[k] && targets[k].total) seen[k.slice(4)] = 1; });
      return Object.keys(seen).filter(function (t) { return TYPES[t]; }).map(function (t) { return { id: 'gen-' + t, label: TYPES[t].label, types: [t], total: 0 }; });
    }
    function pathway(pid, entries, profile, assessments, today) {
      var pw = PATHS[pid]; profile = profile || {};
      var stats = modulesFor(pid, entries, profile.targets).map(function (m) { return moduleStats(m, entries, profile.targets, assessments); });
      var win = null;
      if (pw.windowFrom) {
        var rel = entries.filter(function (e) { return pw.modules.some(function (m) { return m.types.indexOf(e.type) >= 0; }) && (pw.windowFrom === 'firstScan' || e.supervision === 'direct'); }).map(function (e) { return e.date; }).sort();
        var start = (profile.windowStart || {})[pid] || rel[0];
        if (start) {
          var d0 = new Date(start + 'T12:00:00'), end = new Date(d0.getTime()); end.setDate(end.getDate() + pw.windowDays);
          var now = today ? new Date(today + 'T12:00:00') : new Date();
          win = { start: start, end: end.toISOString().slice(0, 10), day: Math.round((now - d0) / 864e5), days: pw.windowDays };
        }
      }
      return { pw: pw, stats: stats, win: win };
    }
    return { TYPES: TYPES, PATHS: PATHS, matches: matches, hit: hit, moduleStats: moduleStats, modulesFor: modulesFor, pathway: pathway };
  }
  root.WLProgress = { create: create, matches: matches, hit: hit, moduleStats: moduleStats };
})(typeof window !== 'undefined' ? window : globalThis);
