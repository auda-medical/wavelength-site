// Supervisor verification for display (window.WLVerified, October 2026 supervisor QA), kept apart from app.js so the
// rules can be tested in Node. The server owns every state (worker/verification/status.js sends `verification`);
// this file only reads it, and maps the fields an older Worker sends onto the same shape so that nothing claims more
// than the server said. Strings stay in app.js, which translates them with T().
//
// The shape:
//   { state, verified, approved: [{ pathway, pathwayLabel, role, roleLabel, allModules, modules: [{ id, label }],
//     verifiedOn, reviewOn, grace }], reviewOn, pending: [{ kind, status, since, label }], credentials, lapse,
//     blocked, graceUntil }
// One rule above all: verified is true only when the server says a current approval exists. Pending items are
// listed beside it, never inside the approved groups.
(function (root) {
  'use strict';

  var STATES = ['verified', 'renewal_review', 'paused', 'more_info', 'pending', 'revoked', 'expired', 'withdrawn', 'rejected', 'none', 'not_verified'];
  function clean(v) {
    if (!v || typeof v !== 'object' || STATES.indexOf(v.state) < 0) return null;
    var verified = (v.state === 'verified' || v.state === 'renewal_review') && v.verified === true;
    return {
      state: v.state, verified: verified,
      approved: verified && Array.isArray(v.approved) ? v.approved.filter(function (g) { return g && g.pathway; }) : [],
      reviewOn: v.reviewOn || null,
      pending: Array.isArray(v.pending) ? v.pending.filter(function (p) { return p && p.kind; }) : [],
      credentials: verified && Array.isArray(v.credentials) ? v.credentials : [],
      lapse: v.lapse || null, blocked: !!v.blocked, graceUntil: v.graceUntil || null
    };
  }

  // "Thoracic (FAMUS pathway)" or "All modules (FAMUS pathway)", as 1.0.12 Workers send `areas`, into groups. The
  // role is not in those labels, so the group says only "approved" (role null).
  function groupsFromAreas(areas) {
    var by = {}, order = [];
    (areas || []).forEach(function (a) {
      var m = /^(.*) \((.+) pathway\)$/.exec(String(a || ''));
      var pw = m ? m[2] : '', mod = m ? m[1] : String(a || '');
      if (!by[pw]) { by[pw] = { pathway: pw || 'other', pathwayLabel: pw, role: null, roleLabel: null, allModules: false, modules: [], verifiedOn: null, reviewOn: null }; order.push(pw); }
      if (/^All modules$/.test(mod)) by[pw].allModules = true; else by[pw].modules.push({ id: mod, label: mod });
    });
    return order.map(function (k) { return by[k]; });
  }

  // The supervisor's own status screen: GET /api/app/supervisor.
  function fromSupervisor(P) {
    if (!P) return null;
    var v = clean(P.verification);
    if (v) return v;
    var st = P.standing, a = P.application;
    var cur = st === 'active' || st === 'renewal_review';
    var state = cur ? (st === 'active' ? 'verified' : 'renewal_review') : st === 'applying' ? (a && a.status === 'more_info' ? 'more_info' : a && a.status === 'draft' ? 'none' : 'pending') : st === 'none' ? 'none' : st;
    if (STATES.indexOf(state) < 0) state = 'none';
    var pending = [];
    if (a) pending.push({ kind: a.status === 'draft' ? 'draft' : a.kind === 'renewal' ? 'renewal' : 'application', status: a.status, since: a.submittedAt || null });
    var approved = [];
    if (cur) {
      // 1.0.12 Workers send each approval with a label but not its role: group by pathway.
      var g = groupsFromAreas(P.areas);
      approved = g.length ? g : [];
      var on = (P.approvals || []).filter(function (x) { return x.current; }).map(function (x) { return String(x.lastRenewedAt || x.approvedAt || '').slice(0, 10); }).filter(Boolean).sort();
      approved.forEach(function (x) { x.verifiedOn = on[on.length - 1] || null; x.reviewOn = P.reviewOn || null; });
    }
    return { state: state, verified: cur, approved: approved, reviewOn: cur ? P.reviewOn || null : null, pending: pending, credentials: [], lapse: P.lapse || null, blocked: !!P.blocked, graceUntil: null };
  }

  // One linked supervisor, from the learner's side: GET /api/app/supervisors. Only the 'approved' stage is verified.
  function fromLink(s) {
    if (!s) return null;
    var v = clean(s.verification);
    if (v) return v.verified ? v : { state: 'not_verified', verified: false, approved: [], reviewOn: null, pending: [], credentials: [] };
    var stage = s.stage || (s.state === 'active' ? 'approved' : '');
    if (stage !== 'approved') return { state: 'not_verified', verified: false, approved: [], reviewOn: null, pending: [], credentials: [] };
    return { state: s.renewal ? 'renewal_review' : 'verified', verified: true, approved: groupsFromAreas(s.areas), reviewOn: null, pending: [], credentials: [] };
  }

  // Pending items worth telling a verified supervisor about. A draft they have not sent is theirs to finish or
  // discard; it is shown, but never as "under review".
  function pendingShown(v) { return v ? v.pending.filter(function (p) { return p.kind !== 'credential' || v.verified; }) : []; }

  // Where More info opens: an anchored pop-up when there is room beside the button (desktop, an unfolded Fold), a
  // bottom sheet otherwise (phones, a folded Fold, landscape phones with little height).
  function placement(w, h) { return w >= 760 && h >= 520 ? 'popover' : 'sheet'; }
  // The pop-up's position: below the button when it fits, otherwise above, always inside the viewport by 12 px.
  function popoverAt(rect, size, view) {
    var gap = 8, edge = 12;
    var left = Math.min(Math.max(edge, rect.left), Math.max(edge, view.w - size.w - edge));
    var below = rect.bottom + gap, above = rect.top - gap - size.h;
    var top = below + size.h <= view.h - edge ? below : above >= edge ? above : Math.max(edge, view.h - size.h - edge);
    return { left: Math.round(left), top: Math.round(top), side: top >= rect.bottom ? 'below' : 'above' };
  }

  var api = { clean: clean, fromSupervisor: fromSupervisor, fromLink: fromLink, groupsFromAreas: groupsFromAreas, pendingShown: pendingShown, placement: placement, popoverAt: popoverAt, STATES: STATES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WLVerified = api;
})(typeof window !== 'undefined' ? window : this);
