// Draws the schematic illustrations for Learn posts as SVG.
// Run: node tools/learn-figures.mjs  (writes to content/learn/images/)
// Schematics only. Swap for real scans and photos when available.
import fs from 'fs';
const OUT = 'content/learn/images';
fs.mkdirSync(OUT, { recursive: true });

const C = { navy: '#0F1E33', deep: '#0A1526', teal: '#2A7F8A', light: '#7FC4CC', cream: '#F7F5F0', sand: '#EDEAE3', ink: '#1F6670', slate: '#3C4A5E' };
const FONT = "'DM Sans', 'Helvetica Neue', Arial, sans-serif";
const W = 1200, H = 750;

const defs = `<defs>
  <filter id="sp" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.55 1.25" numOctaves="2" seed="7" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1" result="g"/>
    <feComposite in="g" in2="SourceGraphic" operator="arithmetic" k1="2.1" k2="0" k3="0" k4="0" result="m"/>
    <feGaussianBlur in="m" stdDeviation="0.7"/>
  </filter>
  <filter id="soft"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="glow" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.teal}"/></marker>
  <marker id="ahl" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${C.light}"/></marker>
</defs>`;

const svg = (bg, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${title}">
<title>${title}</title>${defs}
<rect width="${W}" height="${H}" fill="${bg}"/>
${body}
</svg>`;

const pill = (label, kind) => {
  const s = { before: [C.sand, C.navy], after: [C.teal, '#fff'], move: [C.navy, C.cream] }[kind];
  const w = label.length * 13 + 44;
  return `<g transform="translate(40 36)"><rect width="${w}" height="40" rx="20" fill="${s[0]}"/><text x="${w / 2}" y="26.5" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="600" letter-spacing="3" fill="${s[1]}">${label}</text></g>`;
};

// Label with leader line, on dark scans
const tag = (x, y, tx, ty, text, anchor = 'start', col = C.light) => `<g font-family="${FONT}" font-size="22" font-weight="500" fill="${col}">
  <line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}" stroke="${col}" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="4" fill="${col}"/>
  <text x="${anchor === 'end' ? tx - 10 : tx + 10}" y="${ty + 7}" text-anchor="${anchor}">${text}</text></g>`;

// Label on light panels
const note = (x, y, text, anchor = 'start', col = C.slate, size = 22, weight = 500) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${col}">${text}</text>`;

const caption = (text, dark = true) => `<text x="${W - 40}" y="${H - 30}" text-anchor="end" font-family="${FONT}" font-size="17" letter-spacing="1" fill="${dark ? '#6F7F95' : '#8A94A3'}">${text}</text>`;

// Phased array sector: apex at (cx, top), radius r, half angle a (deg)
const sector = (cx, top, r, a) => {
  const rad = (a * Math.PI) / 180;
  const x1 = cx - r * Math.sin(rad), y1 = top + r * Math.cos(rad), x2 = cx + r * Math.sin(rad);
  return `M${cx - 14} ${top} L${x1} ${y1} A${r} ${r} 0 0 0 ${x2} ${y1} L${cx + 14} ${top} Z`;
};
// Curvilinear sector
const curvi = (cx, cy, r0, r1, a) => {
  const rad = (a * Math.PI) / 180, s = Math.sin(rad), c = Math.cos(rad);
  return `M${cx - r0 * s} ${cy + r0 * c} A${r0} ${r0} 0 0 0 ${cx + r0 * s} ${cy + r0 * c} L${cx + r1 * s} ${cy + r1 * c} A${r1} ${r1} 0 0 1 ${cx - r1 * s} ${cy + r1 * c} Z`;
};

const scan = (clipPath, inner) => `<clipPath id="fan"><path d="${clipPath}"/></clipPath>
<path d="${clipPath}" fill="#05080D"/>
<g clip-path="url(#fan)"><g filter="url(#sp)">${inner}</g></g>
<path d="${clipPath}" fill="none" stroke="#24344D" stroke-width="1.5"/>`;

const files = {};

// ---------------- 1. Lung: bat sign ----------------
const LX = 330, LW = 540, LT = 110, LB = 690; // linear image box
const linearBox = `M${LX} ${LT} H${LX + LW} V${LB} H${LX} Z`;
const softTissue = `
  <rect x="${LX}" y="${LT}" width="${LW}" height="160" fill="#5E6670"/>
  <path d="M${LX} ${LT + 46} C${LX + 180} ${LT + 40} ${LX + 360} ${LT + 54} ${LX + LW} ${LT + 46}" stroke="#A9B0B8" stroke-width="5" fill="none"/>
  <path d="M${LX} ${LT + 96} C${LX + 200} ${LT + 104} ${LX + 380} ${LT + 90} ${LX + LW} ${LT + 100}" stroke="#9AA2AB" stroke-width="4" fill="none"/>
  <rect x="${LX}" y="${LT + 50}" width="${LW}" height="44" fill="#3C434C"/>`;

files['lung-before.svg'] = svg(C.deep, `
${scan(linearBox, `${softTissue}
  <rect x="${LX}" y="${LT + 160}" width="${LW}" height="60" fill="#454C55"/>
  <path d="M${LX} ${LT + 224} C${LX + 160} ${LT + 212} ${LX + 380} ${LT + 212} ${LX + LW} ${LT + 226}" stroke="#F2F4F6" stroke-width="13" fill="none"/>`)}
<path d="M${LX} ${LT + 224} C${LX + 160} ${LT + 212} ${LX + 380} ${LT + 212} ${LX + LW} ${LT + 226}" stroke="#FFFFFF" stroke-width="5" fill="none" filter="url(#glow)" clip-path="url(#fan)"/>
${pill('BEFORE', 'before')}
${tag(LX + 300, LT + 216, LX + LW + 40, LT + 170, 'Bright line')}
${tag(LX + 420, LT + 420, LX + LW + 40, LT + 420, 'Black below')}
${tag(LX + 120, LT + 70, LX - 40, LT + 70, 'Chest wall', 'end')}
${note(LX - 40, LT + 300, 'Pleura or rib?', 'end', C.light, 24, 600)}
${note(LX - 40, LT + 334, 'You cannot tell.', 'end', '#9FB0C4', 22)}
${caption('Schematic · probe lying along a rib')}`, 'Before: probe along a rib. One bright line with black shadow below it, so pleura and rib cannot be told apart.');

const rib = (cx) => `<path d="M${cx - 80} ${LT + 168} Q${cx} ${LT + 128} ${cx + 80} ${LT + 168}" stroke="#F4F6F8" stroke-width="12" fill="none"/>
  <path d="M${cx - 82} ${LT + 170} Q${cx} ${LT + 132} ${cx + 82} ${LT + 170} L${cx + 92} ${LB} L${cx - 92} ${LB} Z" fill="#06090E"/>`;
const pleuraY = LT + 196;
files['lung-after.svg'] = svg(C.deep, `
${scan(linearBox, `${softTissue}
  <rect x="${LX}" y="${LT + 160}" width="${LW}" height="${LB - LT - 160}" fill="#4A525C"/>
  <rect x="${LX}" y="${pleuraY + 8}" width="${LW}" height="${LB - pleuraY}" fill="#3A414A"/>
  <path d="M${LX} ${pleuraY + 200} H${LX + LW}" stroke="#868F99" stroke-width="7"/>
  <path d="M${LX} ${pleuraY + 400} H${LX + LW}" stroke="#646C76" stroke-width="6"/>
  ${rib(LX + 90)}${rib(LX + LW - 90)}
  <path d="M${LX + 150} ${pleuraY} H${LX + LW - 150}" stroke="#F4F6F8" stroke-width="9"/>`)}
<path d="M${LX + 160} ${pleuraY} H${LX + LW - 160}" stroke="#FFFFFF" stroke-width="3" filter="url(#glow)"/>
${pill('AFTER', 'after')}
${tag(LX + 90, LT + 150, LX - 40, LT + 128, 'Rib', 'end')}
${tag(LX + LW - 90, LT + 150, LX + LW + 40, LT + 128, 'Rib')}
${tag(LX + 270, pleuraY, LX + LW + 40, pleuraY + 70, 'Pleural line')}
${tag(LX + 260, pleuraY + 200, LX + LW + 40, pleuraY + 200, 'A-line')}
${tag(LX + 90, LT + 360, LX - 40, LT + 360, 'Rib shadow', 'end')}
<g stroke="${C.light}" stroke-width="2" fill="none" opacity=".85">
  <path d="M${LX + 205} ${pleuraY - 26} H${LX + LW - 205}" marker-start="url(#ahl)" marker-end="url(#ahl)"/>
</g>
${note(W / 2, pleuraY - 40, 'Look for sliding here', 'middle', C.light, 20, 600)}
${caption('Schematic · probe across two ribs, the bat sign')}`, 'After: probe across two ribs. Two rib shadows with the pleural line between them, slightly deeper than the rib surface: the bat sign.');

// Light panels: chest outline
const chest = `<g fill="none" stroke="${C.navy}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M520 70 C520 120 500 140 420 160 C330 185 290 220 280 300 L266 650"/>
  <path d="M680 70 C680 120 700 140 780 160 C870 185 910 220 920 300 L934 650"/>
  <path d="M600 210 V560" stroke-dasharray="2 10" stroke-width="2.5" opacity=".5"/>
  <path d="M420 178 C470 168 540 182 596 190" stroke-width="2.5" opacity=".55"/>
  <path d="M780 178 C730 168 660 182 604 190" stroke-width="2.5" opacity=".55"/>
</g>`;
const ribsL = [235, 300, 365, 430, 495].map((y, i) => `<path d="M${590} ${y} C${520} ${y + 6} ${400} ${y + 18} ${310 - i * 4} ${y + 60}" fill="none" stroke="${C.navy}" stroke-width="2" opacity=".28"/>`).join('');
const ribsR = [235, 300, 365, 430, 495].map((y, i) => `<path d="M${610} ${y} C${680} ${y + 6} ${800} ${y + 18} ${890 + i * 4} ${y + 60}" fill="none" stroke="${C.navy}" stroke-width="2" opacity=".28"/>`).join('');

const probeLin = (x, y, rot, ghost = false) => `<g transform="translate(${x} ${y}) rotate(${rot})" ${ghost ? 'opacity=".45"' : ''}>
  <rect x="-22" y="-62" width="44" height="124" rx="12" fill="${ghost ? 'none' : C.navy}" stroke="${C.navy}" stroke-width="3" ${ghost ? 'stroke-dasharray="7 7"' : ''}/>
  <rect x="-16" y="-58" width="32" height="10" rx="3" fill="${ghost ? 'none' : C.light}"/>
  <circle cx="0" cy="-74" r="7" fill="${C.teal}"/>
</g>`;

files['lung-move.svg'] = svg(C.cream, `
${chest}${ribsL}${ribsR}
${probeLin(470, 330, 80, true)}
${probeLin(470, 330, 0)}
<path d="M560 318 A92 92 0 0 0 498 248" fill="none" stroke="${C.teal}" stroke-width="4" marker-end="url(#ah)"/>
${pill('THE MOVE', 'move')}
<g>
  ${note(952, 250, 'Turn the probe 90°', 'start', C.navy, 24, 600)}
  ${note(952, 284, 'so it crosses two ribs.', 'start', C.slate, 22)}
  ${note(952, 360, 'Marker to the head', 'start', C.navy, 24, 600)}
  ${note(952, 394, '(the teal dot).', 'start', C.slate, 22)}
  ${note(952, 470, 'Second or third', 'start', C.navy, 24, 600)}
  ${note(952, 504, 'intercostal space,', 'start', C.slate, 22)}
  ${note(952, 534, 'mid-clavicular line.', 'start', C.slate, 22)}
</g>
${note(80, 300, 'Dashed: along', 'start', C.slate, 20)}
${note(80, 326, 'the rib (before)', 'start', C.slate, 20)}
${note(80, 380, 'Solid: across', 'start', C.navy, 20, 600)}
${note(80, 406, 'the ribs (after)', 'start', C.navy, 20, 600)}
${caption('Schematic · patient supine, front of chest', false)}`, 'The move: rotate the linear probe from lying along a rib to crossing two ribs, marker to the head, second or third intercostal space in the mid-clavicular line.');

// ---------------- 2. Subcostal view ----------------
const PX = 560, PT = 92, PR = 600, PA = 42;
const fan = sector(PX, PT, PR, PA);
const liverNear = (h) => `<path d="M0 ${PT} H${W} V${PT + h} C900 ${PT + h + 30} 300 ${PT + h - 30} 0 ${PT + h + 10} Z" fill="#6A727C"/>`;
files['subcostal-before.svg'] = svg(C.deep, `
${scan(fan, `<rect width="${W}" height="${H}" fill="#3B424B"/>
  ${liverNear(250)}
  <path d="M300 ${PT + 280} C420 ${PT + 300} 520 ${PT + 250} 640 ${PT + 290} C730 ${PT + 320} 800 ${PT + 270} 900 ${PT + 300}" stroke="#E8EBEE" stroke-width="10" fill="none"/>
  <path d="M300 ${PT + 290} C420 ${PT + 310} 520 ${PT + 260} 640 ${PT + 300} C730 ${PT + 330} 800 ${PT + 280} 900 ${PT + 310} V${H} H300 Z" fill="#20262E"/>
  <path d="M360 ${PT + 380} H860 M380 ${PT + 470} H840" stroke="#4E565F" stroke-width="5"/>
  <circle cx="470" cy="${PT + 150}" r="18" fill="#141A21"/><circle cx="650" cy="${PT + 120}" r="12" fill="#141A21"/>`)}
${pill('BEFORE', 'before')}
${tag(470, PT + 150, 140, PT + 150, 'Liver', 'end')}
${tag(700, PT + 296, 1000, PT + 240, 'Bowel gas')}
${tag(640, PT + 440, 1000, PT + 420, 'Dirty shadow')}
${note(1000, PT + 500, 'No heart in view', 'start', C.light, 24, 600)}
${caption('Schematic · probe pointing straight back')}`, 'Before: probe held upright, pointing to the back. Liver near the probe, bowel gas and dirty shadow below, no heart.');

// Heart, apex to screen right, right heart near the probe
files['subcostal-after.svg'] = svg(C.deep, `
${scan(fan, `<rect width="${W}" height="${H}" fill="#2E343C"/>
  <path d="M0 ${PT} H${W} V${PT + 150} C820 ${PT + 190} 640 ${PT + 230} 420 ${PT + 270} C300 ${PT + 290} 160 ${PT + 300} 0 ${PT + 310} Z" fill="#6E7680"/>
  <g transform="translate(600 ${PT + 395}) rotate(-12)">
    <ellipse cx="0" cy="0" rx="300" ry="168" fill="#7C848D"/>
    <ellipse cx="0" cy="0" rx="300" ry="168" fill="none" stroke="#EEF0F2" stroke-width="9"/>
    <path d="M-190 -112 C-80 -150 110 -130 220 -40 C150 -60 40 -62 -40 -50 C-110 -42 -170 -50 -205 -72 Z" fill="#090C10"/>
    <path d="M-30 -18 C70 -30 190 -24 248 20 C200 70 90 100 -10 96 C-60 94 -80 40 -30 -18 Z" fill="#090C10"/>
    <path d="M-262 -40 C-232 -70 -150 -66 -120 -34 C-100 0 -140 40 -200 36 C-250 30 -280 0 -262 -40 Z" fill="#090C10"/>
    <path d="M-200 64 C-160 40 -90 44 -70 76 C-56 110 -100 140 -150 136 C-200 130 -224 100 -200 64 Z" fill="#090C10"/>
  </g>`)}
${pill('AFTER', 'after')}
${tag(420, PT + 120, 130, PT + 120, 'Liver', 'end')}
${tag(640, PT + 300, 1000, PT + 200, 'Right ventricle')}
${tag(720, PT + 410, 1000, PT + 330, 'Left ventricle')}
${tag(375, PT + 395, 170, PT + 330, 'Right atrium', 'end')}
${tag(430, PT + 520, 170, PT + 470, 'Left atrium', 'end')}
${tag(886, PT + 382, 1000, PT + 460, 'Pericardium')}
${caption('Schematic · subcostal four-chamber view')}`, 'After: probe flat under the ribs. Liver as the window, right ventricle nearest the probe, left ventricle beyond, atria to the left of the screen, pericardium around the heart.');

// Side view of patient lying flat, head to the right
const body = `<g fill="none" stroke="${C.navy}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M60 560 H1140" stroke-width="2" opacity=".35"/>
  <path d="M90 560 C90 470 140 430 230 420 C330 410 420 400 520 392 C560 389 600 384 640 372 C700 352 760 340 840 344 C900 348 940 360 990 372 C1040 384 1100 380 1130 420"/>
</g>`;
const heartSide = `<path d="M860 420 C900 395 960 400 975 440 C990 480 950 515 905 510 C860 505 835 455 860 420 Z" fill="${C.light}" opacity=".55" stroke="${C.teal}" stroke-width="2"/>`;
const probeSide = (x, y, rot, ghost) => `<g transform="translate(${x} ${y}) rotate(${rot})" ${ghost ? 'opacity=".5"' : ''}>
  <path d="M-20 0 Q0 10 20 0 L16 -120 Q0 -130 -16 -120 Z" fill="${ghost ? 'none' : C.navy}" stroke="${C.navy}" stroke-width="3" ${ghost ? 'stroke-dasharray="7 7"' : ''}/>
</g>`;
const hand = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})">
  <path d="M8 -40 C40 -40 66 -60 70 -100 C74 -140 56 -168 26 -170 C10 -170 6 -150 8 -130 Z" fill="${C.sand}" stroke="${C.navy}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M30 -60 C44 -74 52 -96 52 -118 M24 -86 C34 -100 38 -120 36 -140" stroke="${C.navy}" stroke-width="2" fill="none" opacity=".45" stroke-linecap="round"/>
</g>`;
const beam = (x, y, angDeg, len, col, dash) => {
  const a = (angDeg * Math.PI) / 180;
  return `<line x1="${x}" y1="${y}" x2="${x + len * Math.cos(a)}" y2="${y + len * Math.sin(a)}" stroke="${col}" stroke-width="3" ${dash ? 'stroke-dasharray="8 8"' : ''} marker-end="url(#ah)"/>`;
};

files['subcostal-move.svg'] = svg(C.cream, `
${body}${heartSide}
${probeSide(660, 368, 0, true)}
${beam(660, 378, 90, 150, C.slate, true)}
${probeSide(640, 370, -72)}
${hand(640, 370, -72)}
${beam(652, 378, 8, 230, C.teal, false)}
${pill('THE MOVE', 'move')}
${note(720, 130, 'Hand on top of the probe,', 'start', C.navy, 24, 600)}
${note(720, 164, 'then lay it almost flat on the skin.', 'start', C.slate, 21)}
${note(720, 196, 'Aim under the ribs, towards', 'start', C.slate, 21)}
${note(720, 226, 'the left shoulder.', 'start', C.slate, 21)}
${note(470, 610, 'Dashed: upright, beam goes to the spine', 'start', C.slate, 20)}
${note(470, 642, 'Solid: flat, beam slides under the ribs to the heart', 'start', C.navy, 20, 600)}
${note(918, 545, 'Heart', 'middle', C.ink, 20, 600)}
${note(1080, 330, 'Head', 'middle', C.slate, 18)}
${note(130, 400, 'Feet', 'middle', C.slate, 18)}
${note(692, 330, 'Xiphoid', 'start', C.slate, 18)}
${caption('Schematic · side view, patient supine, knees bent', false)}`, 'The move: overhand grip, probe just below the xiphoid, laid almost flat so the beam passes under the ribs towards the left shoulder and reaches the heart.');

// ---------------- 3. IVC ----------------
const IX = 600, IY = -60, IR0 = 170, IR1 = 800, IA = 34;
const cfan = curvi(IX, IY, IR0, IR1, IA);
const liverBig = `<rect width="${W}" height="${H}" fill="#3A4149"/><path d="M0 0 H${W} V420 C900 440 400 430 0 450 Z" fill="#69717B"/>`;
files['ivc-before.svg'] = svg(C.deep, `
${scan(cfan, `${liverBig}
  <path d="M260 470 C500 462 750 470 960 480" stroke="#EEF0F2" stroke-width="18" fill="none"/>
  <path d="M260 560 C500 552 750 560 960 570" stroke="#EEF0F2" stroke-width="18" fill="none"/>
  <path d="M250 480 C500 472 750 480 970 490 L970 560 C750 550 500 542 250 550 Z" fill="#07090D"/>
  <path d="M640 474 C660 430 700 400 760 380" stroke="#DADEE2" stroke-width="10" fill="none"/>
  <path d="M640 474 C660 440 698 412 760 392" stroke="#07090D" stroke-width="12" fill="none"/>
  <path d="M250 620 H970" stroke="#B9C0C7" stroke-width="12" opacity=".7"/>
  <rect x="250" y="626" width="720" height="200" fill="#151A20"/>`)}
${pill('BEFORE', 'before')}
${tag(420, 470, 250, 380, 'Thick bright wall', 'end')}
${tag(740, 390, 940, 300, 'Branch runs forwards')}
${note(950, 334, '(coeliac or SMA)', 'start', '#9FB0C4', 20)}
${tag(300, 515, 240, 560, 'Stops short of', 'end')}
${note(230, 592, 'the heart', 'end', C.light, 22, 500)}
${tag(820, 622, 1030, 640, 'Spine')}
${note(W - 40, 64, 'This is the aorta, not the IVC', 'end', C.light, 24, 600)}
${caption('Schematic · longitudinal, beam too far left')}`, 'Before: a thick-walled tube with a branch running forwards, stopping short of the heart. This is the aorta, not the inferior vena cava.');

files['ivc-after.svg'] = svg(C.deep, `
${scan(cfan, `${liverBig}
  <path d="M250 300 C330 260 430 280 470 340 C500 400 460 480 390 500 C310 520 230 470 230 400 Z" fill="#07090D"/>
  <path d="M250 300 C330 260 430 280 470 340 C500 400 460 480 390 500 C310 520 230 470 230 400 Z" fill="none" stroke="#B9C0C7" stroke-width="5"/>
  <path d="M450 410 C580 418 760 432 1000 446 L1000 520 C760 506 580 494 450 480 Z" fill="#07090D"/>
  <path d="M450 410 C580 418 760 432 1000 446" stroke="#C9CED3" stroke-width="5" fill="none"/>
  <path d="M450 480 C580 494 760 506 1000 520" stroke="#C9CED3" stroke-width="5" fill="none"/>
  <path d="M530 414 C560 340 620 270 720 220 L740 246 C650 290 600 350 590 416 Z" fill="#07090D"/>
  <path d="M250 640 C500 630 800 640 1000 650" stroke="#9AA1A8" stroke-width="10" opacity=".6"/>`)}
<g stroke="${C.light}" stroke-width="3" fill="none">
  <line x1="660" y1="429" x2="656" y2="494"/><line x1="646" y1="429" x2="674" y2="429"/><line x1="642" y1="494" x2="670" y2="494"/>
</g>
${pill('AFTER', 'after')}
${tag(350, 390, 170, 280, 'Right atrium', 'end')}
${tag(680, 240, 800, 180, 'Hepatic vein joins')}
${tag(820, 480, 1040, 560, 'IVC, thin wall')}
${tag(658, 461, 760, 600, 'Measure here')}
${note(770, 634, 'about 2 cm from the atrium', 'start', '#9FB0C4', 20)}
${note(110, 160, 'Head', 'start', '#9FB0C4', 20)}
<path d="M100 153 H50" stroke="#9FB0C4" stroke-width="2" marker-end="url(#ahl)"/>
${caption('Schematic · longitudinal, IVC entering the right atrium')}`, 'After: the inferior vena cava runs through the liver into the right atrium, with a hepatic vein joining it. Measure about 2 cm from the atrium.');

const abdomen = `<g fill="none" stroke="${C.navy}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M330 70 C320 200 300 400 326 650"/><path d="M870 70 C880 200 900 400 874 650"/>
  <path d="M340 230 C430 300 520 330 600 250 C680 330 770 300 860 230" stroke-width="2.5" opacity=".5"/>
  <path d="M600 180 V250" stroke-width="2.5" opacity=".5"/>
  <circle cx="600" cy="560" r="7" stroke-width="2.5" opacity=".5"/>
  <path d="M600 250 V700" stroke-dasharray="2 10" stroke-width="2.5" opacity=".4"/>
</g>`;
files['ivc-move.svg'] = svg(C.cream, `
${abdomen}
${probeLin(600, 330, 90, true)}
${probeLin(570, 345, 0)}
<path d="M700 300 A108 108 0 0 0 600 220" fill="none" stroke="${C.teal}" stroke-width="4" marker-end="url(#ah)"/>
${pill('THE MOVE', 'move')}
${note(930, 230, 'Start in the subcostal', 'start', C.navy, 24, 600)}
${note(930, 262, 'view, right atrium', 'start', C.slate, 22)}
${note(930, 290, 'in the centre.', 'start', C.slate, 22)}
${note(930, 370, 'Rotate 90°, marker', 'start', C.navy, 24, 600)}
${note(930, 402, 'to the head.', 'start', C.slate, 22)}
${note(930, 482, 'Tilt slightly to the', 'start', C.navy, 24, 600)}
${note(930, 514, "patient's right.", 'start', C.slate, 22)}
${note(930, 544, 'Keep the atrium in view.', 'start', C.slate, 22)}
${note(70, 300, 'Dashed: subcostal', 'start', C.slate, 20)}
${note(70, 326, 'view (start)', 'start', C.slate, 20)}
${note(70, 380, 'Solid: rotated,', 'start', C.navy, 20, 600)}
${note(70, 406, 'marker up (finish)', 'start', C.navy, 20, 600)}
${note(600, 175, 'Xiphoid', 'middle', C.slate, 18)}
${note(625, 566, 'Umbilicus', 'start', C.slate, 18)}
${caption('Schematic · front of abdomen, patient supine', false)}`, 'The move: from the subcostal four-chamber view, rotate the probe 90 degrees so the marker points to the head, and tilt slightly to the patient\'s right while keeping the right atrium in view.');

for (const [name, s] of Object.entries(files)) fs.writeFileSync(`${OUT}/${name}`, s);
console.log(Object.keys(files).join('\n'));
