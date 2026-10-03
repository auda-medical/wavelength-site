// Builds the Wavelength Academy certificate template.
//   npm i --no-save pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1
//   node tools/certificate/make-template.mjs
// Writes worker/cert-template.bin (the PDF with every fixed element: frame, logo, wordmark,
// headings, labels, signature, footer) and worker/cert-template.json (where the personal
// details go and how to encode each character). The Worker stamps in name, module, score,
// CPD, date and code by appending one small content stream, so a certificate takes well
// under a millisecond to make. Run this again after changing the design.
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const FONTS = path.join(ROOT, 'worker/fonts');
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const C = { navy: '#0F1E33', teal: '#2A7F8A', tealInk: '#1F6670', light: '#7FC4CC', cream: '#F7F5F0', line: '#DCD7CC', slate: '#3C4A5E' };
const col = (h) => rgb(...hex(h));

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
doc.setTitle('Wavelength Academy certificate');
doc.setAuthor('Wavelength');
doc.setCreator('thewavelength.co.uk');
doc.setProducer('Wavelength');
const files = { serif: 'serif.ttf', serifSemi: 'serif-semi.ttf', serifItalic: 'serif-italic.ttf', sans: 'sans.ttf', sansMedium: 'sans-medium.ttf', sansSemi: 'sans-semi.ttf' };
const f = {};
for (const [k, file] of Object.entries(files)) f[k] = await doc.embedFont(fs.readFileSync(path.join(FONTS, file)), { subset: true });

const W = 841.89, H = 595.28, cx = W / 2;
const page = doc.addPage([W, H]);
const text = (s, font, size, x, y, color = C.navy, opts = {}) => {
  const sp = opts.spacing || 0;
  const w = font.widthOfTextAtSize(s, size) + sp * Math.max(0, s.length - 1);
  const left = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
  if (!sp) page.drawText(s, { x: left, y, size, font, color: col(color) });
  else { let px = left; for (const ch of s) { page.drawText(ch, { x: px, y, size, font, color: col(color) }); px += font.widthOfTextAtSize(ch, size) + sp; } }
};

// Frame and background
page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: col(C.cream) });
page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: col(C.teal), borderWidth: 1.2 });
page.drawRectangle({ x: 28, y: 28, width: W - 56, height: H - 56, borderColor: col(C.line), borderWidth: 0.6 });
for (let i = 0; i < 6; i++) page.drawSvgPath('M 0 0 C 60 -18 120 18 180 0 S 300 -18 360 0', { x: W - 420, y: H - 104 - i * 7, borderColor: col(C.light), borderWidth: 0.5, borderOpacity: 0.5 - i * 0.07 });

// Logo: thin circle with the amplitude W, wordmark and tagline
const lx = 64, ly = H - 92, r = 22, s = (r * 2) / 64;
page.drawCircle({ x: lx + r, y: ly + r, size: r, borderColor: col(C.navy), borderWidth: 1.1 });
page.drawSvgPath('M7.4 18.2 C9.2 30.8 11 46.4 15.2 46.4 C21.2 46.4 25.4 20.6 32 20.6 C38.6 20.6 42.8 46.4 48.8 46.4 C53 46.4 54.8 30.8 56.6 18.2', { x: lx + 2, y: ly + r * 2 - 2, scale: s * 0.92, borderColor: col(C.teal), borderWidth: 3.2, borderLineCap: 1 });
text('WAVELENGTH', f.sansMedium, 17, lx + r * 2 + 14, ly + 21, C.navy, { spacing: 4.6 });
text('TUNE IN · GAIN CLARITY', f.sansMedium, 7, lx + r * 2 + 15, ly + 7, C.teal, { spacing: 2.2 });
text('WAVELENGTH ACADEMY', f.sansSemi, 8.5, W - 64, ly + 16, C.tealInk, { align: 'right', spacing: 2.6 });

// Fixed wording
text('Certificate of completion', f.serif, 44, cx, H - 178, C.navy, { align: 'center' });
page.drawLine({ start: { x: cx - 36, y: H - 196 }, end: { x: cx + 36, y: H - 196 }, thickness: 1.2, color: col(C.teal) });
text('This certifies that', f.sans, 12, cx, H - 228, C.slate, { align: 'center' });
page.drawLine({ start: { x: cx - 220, y: H - 284 }, end: { x: cx + 220, y: H - 284 }, thickness: 0.6, color: col(C.line) });
text('has completed the Wavelength Academy e-learning module', f.sans, 12, cx, H - 310, C.slate, { align: 'center' });

const bw = 176, gap = 14, bx0 = cx - (bw * 3 + gap * 2) / 2, by = 132;
['CPD', 'Completed', 'Certificate number'].forEach((k, i) => {
  const x = bx0 + i * (bw + gap);
  page.drawRectangle({ x, y: by, width: bw, height: 50, color: rgb(1, 1, 1), borderColor: col(C.line), borderWidth: 0.6 });
  page.drawRectangle({ x, y: by, width: 2.4, height: 50, color: col(C.teal) });
  text(k.toUpperCase(), f.sansSemi, 6.8, x + 14, by + 32, C.tealInk, { spacing: 1.6 });
});

text('Dr Firas Abou-Auda', f.serifItalic, 22, 96, 84, C.navy);
page.drawLine({ start: { x: 96, y: 76 }, end: { x: 300, y: 76 }, thickness: 0.6, color: col(C.slate) });
text('Dr Firas Abou-Auda, Course Director', f.sans, 8.5, 96, 63, C.slate);
text('Wavelength', f.sans, 8.5, 96, 51, C.slate);
text('Verify this certificate', f.sansSemi, 8.5, W - 96, 84, C.tealInk, { align: 'right' });
text('thewavelength.co.uk/elearning/verify/', f.sans, 8.5, W - 96, 71, C.slate, { align: 'right' });
text('Self-directed learning. One CPD credit equals one hour. This certificate records completion of e-learning. It does not confirm competence to scan independently,', f.sans, 6.6, cx, 40, C.slate, { align: 'center' });
text('which needs supervised practice and sign-off in your department. Wavelength is a trading name of Auda Medical Ltd, registered in England and Wales, company 08487817.', f.sans, 6.6, cx, 31.5, C.slate, { align: 'center' });

// Where the personal details go
const slots = {
  name: { font: 'serifItalic', size: 40, min: 18, maxWidth: W - 220, x: cx, y: H - 272, align: 'center', color: C.navy },
  module: { font: 'serifSemi', size: 25, min: 14, maxWidth: W - 200, x: cx, y: H - 342, align: 'center', color: C.navy },
  scoreLine: { font: 'sans', size: 12, min: 9, maxWidth: W - 200, x: cx, y: H - 368, align: 'center', color: C.slate },
  cpd: { font: 'sansMedium', size: 11.5, min: 8, maxWidth: bw - 22, x: bx0 + 14, y: by + 14, align: 'left', color: C.navy },
  date: { font: 'sansMedium', size: 11.5, min: 8, maxWidth: bw - 22, x: bx0 + bw + gap + 14, y: by + 14, align: 'left', color: C.navy },
  code: { font: 'sansMedium', size: 11.5, min: 8, maxWidth: bw - 22, x: bx0 + 2 * (bw + gap) + 14, y: by + 14, align: 'left', color: C.navy },
  codeFooter: { font: 'sans', size: 8.5, min: 6, maxWidth: 260, x: W - 96, y: 58, align: 'right', color: C.slate },
};

// Character tables for the fonts the Worker writes with. Encoding each character here also
// keeps its glyph in the embedded subset, with its width and copy-paste mapping.
const cps = [];
for (let c = 0x20; c <= 0x7e; c++) cps.push(c);
for (let c = 0xa0; c <= 0x17f; c++) cps.push(c);
cps.push(0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x00b7);
const fontsMeta = {};
for (const k of new Set(Object.values(slots).map((x) => x.font))) {
  const ff = f[k];
  const map = {};
  for (const cp of cps) {
    if (!ff.embedder.font.hasGlyphForCodePoint(cp)) continue;
    const ch = String.fromCodePoint(cp);
    const hx = ff.encodeText(ch).toString().replace(/[<>]/g, '');
    map[cp] = [hx, Math.round(ff.widthOfTextAtSize(ch, 1000) * 100) / 100];
  }
  const tag = page.node.newFontDictionary(k, ff.ref);
  fontsMeta[k] = { res: tag.asString(), map };
}

const bytes = await doc.save({ useObjectStreams: false });
const tail = Buffer.from(bytes.slice(-2000)).toString('latin1');
const trailer = tail.slice(tail.lastIndexOf('trailer'));
const size = Number(trailer.match(/\/Size (\d+)/)[1]);
const root = trailer.match(/\/Root (\d+ \d+ R)/)[1];
const info = trailer.match(/\/Info (\d+ \d+ R)/)[1];
const startxref = Number(trailer.match(/startxref\s+(\d+)/)[1]);
const pageDict = page.node.toString().replace(/\/Contents (\[[^\]]*\]|\d+ \d+ R)/, (m, v) => `/Contents [ ${v.replace(/[[\]]/g, '').trim()} __DYN__ ]`);
if (!pageDict.includes('__DYN__')) throw new Error('Page contents not found');

fs.writeFileSync(path.join(ROOT, 'worker/cert-template.bin'), bytes);
const meta = { page: { num: page.ref.objectNumber, dict: pageDict }, size, root, info, startxref, slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { ...v, color: hex(v.color).map((n) => Math.round(n * 1000) / 1000) }])), fonts: fontsMeta };
fs.writeFileSync(path.join(ROOT, 'worker/cert-template.json'), JSON.stringify(meta));
console.log(`Template ${bytes.length} bytes, page object ${page.ref.objectNumber}, next object ${size}`);
