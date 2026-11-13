// Logbook layouts (src/app/formats.js, data/logbook.json destinations[].layout; road to #1, 13 Nov 2026): an Excel
// export arranged like each body's own logbook fields. Every file says it is Wavelength's arrangement, not an official
// form, and that the body has not reviewed or endorsed it. Training references never carry patient data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LB = JSON.parse(readFileSync(new URL('../data/logbook.json', import.meta.url), 'utf8'));
const load = (f) => { const win = {}; new Function('window', readFileSync(new URL(`../src/app/${f}`, import.meta.url), 'utf8').replace(/\}\)\(typeof window[^;]*;\s*$/, '})(window);'))(win); return win; };
const F = load('formats.js').WLFormats;
const ENG = load('progress.js').WLProgress.create(LB);
const SUP = Object.fromEntries(LB.supervision.map((s) => [s.id, s.label]));
const DEST = Object.fromEntries(LB.destinations.map((d) => [d.id, d]));

const scan = (o) => ({ id: Math.random().toString(36).slice(2), date: '2026-11-01', setting: 'Intensive care', supervision: 'direct', supervisor: 'Dr A Mentor', indication: 'Shocked, LV function?', findings: {}, ...o });
const entries = [
  scan({ type: 'cardiac', findings: { views: ['PLAX', 'PSAX', 'A4C'], lv: 'Severely impaired' }, signoff: { status: 'confirmed', name: 'Dr B Trainer', role: 'Consultant', at: '2026-11-02T10:00:00Z', code: 'SO-ABCD-1234' }, reflection: 'Struggled with the subcostal view.' }),
  scan({ type: 'cardiac', date: '2026-11-03', setting: 'Healthy volunteer', supervision: 'mentored' }),
  scan({ type: 'lung', date: '2026-11-04', supervision: 'independent' }),
  scan({ type: 'msk', date: '2026-11-05' }),
];
const ctx = (o = {}) => ({
  PATHS: ENG.PATHS, TYPES: ENG.TYPES, supLabel: (id) => SUP[id] || '',
  signoffState: (e) => { const so = e.signoff || {}; return { label: so.status === 'confirmed' ? 'Signed off' : 'Not sent', by: so.name ? `${so.name}, ${so.role}` : '', on: so.at ? so.at.slice(0, 10) : '', code: so.code || '' }; },
  modulesFor: (p, l) => ENG.modulesFor(p, l, {}), moduleStats: (pw, m, l) => ENG.moduleStats(m, l, {}, []),
  assessments: [], account: { name: 'Test Learner' }, profile: { grade: 'ST4' }, from: '1 Nov 2026', to: '30 Nov 2026', generated: '2026-11-13', reflections: true, ...o,
});
const sheet = (out, name) => out.sheets.find((s) => s.name === name);

test('RCEM, FAMUS, FUSIC and RCoA/RA-UK each have a layout naming its sources, with known columns only', () => {
  const known = new Set(['n', 'ref', 'date', 'type', 'module', 'setting', 'age', 'sex', 'indication', 'findings', 'overall', 'quality', 'interpretation', 'outcome', 'impact', 'supervision', 'counts', 'supervisor', 'signoff', 'signedBy', 'signedOn', 'signoffCode', 'rating', 'volunteer', 'reflection', 'images', 'blank', 'block', 'planA']);
  for (const id of ['rcem', 'famus', 'fusic', 'rcoa']) {
    const d = DEST[id];
    assert.ok(d.layout && d.body && d.steps.length, id);
    assert.ok(d.layout.source && d.layout.source.length > 60, `${id} names the documents its columns follow`);
    for (const [h, src] of d.layout.columns) assert.ok(known.has(src) || /^f\.\w+$/.test(src), `${id}: ${h} -> ${src}`);
    assert.ok(d.layout.columns.some((c) => c[1] === 'ref'), `${id} has a training reference`);
    assert.ok(!d.layout.columns.some((c) => /patient|hospital number|nhs number|date of birth/i.test(c[0])), `${id} asks for no patient identifiers`);
  }
});

test('the FUSIC layout: one sheet per module, the body\'s supervision words, volunteer and views columns', () => {
  const out = F.build(DEST.fusic, 'fusic', entries, ctx());
  assert.deepEqual(out.sheets.map((s) => s.name), ['Summary', 'Heart', 'Lung', 'Other scans', 'About']);
  const heart = sheet(out, 'Heart');
  const col = (h) => heart.rows[0].indexOf(h);
  assert.equal(heart.rows.length, 3, 'header and two heart scans');
  assert.equal(heart.rows[1][col('Training reference')], 'HEAR-001');
  assert.equal(heart.rows[1][col('Views obtained')], 'PLAX, PSAX, A4C');
  assert.equal(heart.rows[1][col('Supervision')], 'Directly supervised');
  assert.equal(heart.rows[2][col('Supervision')], 'Unsupervised, reviewed');
  assert.equal(heart.rows[2][col('Healthy volunteer')], 'Yes');
  assert.equal(heart.rows[1][col('Sign-off code')], 'SO-ABCD-1234');
  const lung = sheet(out, 'Lung');
  assert.equal(lung.rows[1][lung.rows[0].indexOf('Counts towards FUSIC')], 'No', 'an unreviewed scan does not count');
  const sum = sheet(out, 'Summary');
  assert.equal(sum.rows[0][4], 'Directly supervised');
  assert.ok(sum.rows.some((r) => r[0] === 'Heart' && r[1] === 2));
  assert.match(out.name, /^Wavelength-FUSIC-logbook-2026-11-13\.xlsx$/);
});

test('every layout file says it is not an official form and claims no endorsement', () => {
  for (const id of ['rcem', 'famus', 'fusic']) {
    const out = F.build(DEST[id], DEST[id].pathway, entries, ctx());
    const about = sheet(out, 'About').rows.map((r) => r.join(' ')).join('\n');
    assert.match(about, /not an official/, id);
    assert.match(about, /has not reviewed or endorsed it/, id);
    assert.match(about, /no patient identifiers/, id);
    assert.doesNotMatch(JSON.stringify(out.sheets), /approved by|accredited by|endorsed by (RCEM|the Society|the Intensive)/i, id);
  }
});

test('FAMUS uses supervised and mentored; RCEM counts independent scans and keeps modalities', () => {
  const famus = F.build(DEST.famus, 'famus', entries, ctx());
  const th = famus.sheets.find((s) => /Thoracic/.test(s.name));
  assert.ok(th, famus.sheets.map((s) => s.name).join());
  assert.equal(th.rows[1][th.rows[0].indexOf('Supervised or mentored')], 'Not supervised or mentored');
  assert.equal(th.rows[1][th.rows[0].indexOf('Counts towards FAMUS')], 'No');
  const rcem = F.build(DEST.rcem, 'rcem', entries, ctx());
  assert.ok(rcem.sheets.length >= 3);
});

test('reflections can be left out; sheet names stay within Excel\'s rules', () => {
  const out = F.build(DEST.fusic, 'fusic', entries, ctx({ reflections: false }));
  assert.ok(!sheet(out, 'Heart').rows[0].includes('Reflection'));
  for (const s of out.sheets) assert.ok(s.name.length <= 31 && !/[[\]:*?/\\]/.test(s.name), s.name);
});

test('the app offers the layout only where a destination has one, and loads formats.js', () => {
  const app = readFileSync(new URL('../src/app/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../src/app/index.html', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../src/app/sw.js', import.meta.url), 'utf8');
  assert.match(app, /\{ id: 'layout', label: 'Logbook layout' \}/);
  assert.ok(app.includes(`lb.hidden = !lay; $('label[for="' + lb.id + '"]', f).hidden = !lay;`), 'the seg label is a sibling of its radio, not its parent');
  assert.match(app, /exportLayout\(list, d, evd\)/);
  assert.match(html, /<script src="\/app\/formats\.js\?v=__V__"><\/script>/);
  assert.ok(html.indexOf('formats.js') < html.indexOf('/app/app.js'));
  assert.match(sw, /'\/app\/formats\.js\?v=__V__'/);
});

// Version 2, checked against road-to-number-one report 01 (13 Nov 2026).
test('FUSIC starts with its training logbook table: study number, date, diagnosis, summary of main findings, mentor signature', () => {
  assert.deepEqual(DEST.fusic.layout.columns.slice(0, 5).map((c) => c[0]), ['Study number', 'Date', 'Diagnosis', 'Summary of main findings', 'Mentor or trainer signature']);
  const out = F.build(DEST.fusic, 'fusic', entries, ctx());
  const about = sheet(out, 'About').rows.map((r) => r.join(' ')).join('\n');
  assert.match(about, /Only the Summary Training Record \(STR\) is submitted/);
  assert.match(about, /12 months from first scan to last, inside the 24-month/);
  const sum = sheet(out, 'Summary');
  assert.deepEqual(sum.rows[0].slice(8, 10), ['First scan', 'Last scan']);
  assert.ok(sum.rows.some((r) => r[0] === 'Heart' && r[8] === '2026-11-01' && r[9] === '2026-11-03'));
});

test('FAMUS uses anonymised labels such as DVT1, and says only a registered Supervisor signs the ACT', () => {
  const dvt = [scan({ type: 'dvt', supervision: 'direct' }), scan({ type: 'dvt', date: '2026-11-02', supervision: 'mentored' })];
  const out = F.build(DEST.famus, 'famus', dvt, ctx());
  const s = out.sheets.find((x) => x.name === 'DVT');
  assert.equal(s.rows[1][s.rows[0].indexOf('Anonymised label')], 'DVT1');
  assert.equal(s.rows[2][s.rows[0].indexOf('Anonymised label')], 'DVT2');
  const about = sheet(out, 'About').rows.map((r) => r.join(' ')).join('\n');
  assert.match(about, /Only a Supervisor registered on the FAMUS database signs the Assessment of Completion of Training/);
  assert.match(about, /same label on your report sheet and on the images/);
  assert.doesNotMatch(about, /\b(10|30) (supervised|mentored)\b/, 'no unverified FAMUS numbers in the notes');
});

test('RCEM leaves an entrustment level column to fill and counts reflections per modality', () => {
  const out = F.build(DEST.rcem, 'rcem', [scan({ type: 'aaa', reflection: 'Fanned through the whole aorta to the bifurcation.' }), scan({ type: 'aaa', date: '2026-11-02' })], ctx());
  const aaa = out.sheets.find((x) => x.name === 'AAA');
  assert.equal(aaa.rows[1][aaa.rows[0].indexOf('Entrustment level (1 to 4)')], '');
  const row = sheet(out, 'Summary').rows.find((r) => r[0] === 'AAA');
  assert.equal(row[6], '1 / 5');
});

test('RCoA and RA-UK: nerve blocks only, a summary by block and supervision, Plan A blocks marked, no RCoA numbers', () => {
  const blocks = [
    scan({ type: 'block', findings: { nerve: 'Femoral nerve', side: 'Left', needle: 'In plane' } }),
    scan({ type: 'block', date: '2026-11-02', supervision: 'mentored', findings: { nerve: 'Femoral nerve' } }),
    scan({ type: 'block', date: '2026-11-03', findings: { nerve: 'Other block (name it below)', block: 'Genicular' } }),
    scan({ type: 'fib', date: '2026-11-04', findings: {} }),
    scan({ type: 'aaa', date: '2026-11-05' }),
  ];
  const out = F.build(DEST.rcoa, '', blocks, ctx());
  assert.deepEqual(out.sheets.map((x) => x.name), ['Summary', 'Logbook', 'About']);
  const log = sheet(out, 'Logbook');
  assert.equal(log.rows.length, 5, 'header and four blocks; the AAA scan is left out');
  assert.equal(log.rows[1][log.rows[0].indexOf('Training reference')], 'BLK-001');
  assert.equal(log.rows[1][log.rows[0].indexOf('RA-UK Plan A')], 'Yes');
  assert.equal(log.rows[3][log.rows[0].indexOf('Block')], 'Genicular');
  const fem = sheet(out, 'Summary').rows.find((r) => r[0] === 'Femoral nerve');
  assert.deepEqual(fem.slice(1, 6), ['Yes', 2, 1, 1, 0]);
  const about = sheet(out, 'About').rows.map((r) => r.join(' ')).join('\n');
  assert.match(about, /The RCoA sets no nerve block numbers/);
  assert.match(about, /not an official document of the RCoA or RA-UK/);
});
