// Stamps a learner's details onto the certificate template (worker/cert-template.bin).
// No PDF library at run time: it appends one content stream and an updated page object
// as a standard PDF incremental update, so it costs well under a millisecond.

const ascii = (s) => new TextEncoder().encode(s);

function encode(meta, fontKey, text) {
  const map = meta.fonts[fontKey].map;
  let hexs = '', width = 0;
  for (const ch of String(text)) {
    let e = map[ch.codePointAt(0)];
    if (!e) {
      // Fall back to the plain letter for characters outside the embedded fonts (ł to l).
      const plain = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').replace('ł', 'l').replace('Ł', 'L');
      e = map[plain.codePointAt(0)];
    }
    if (!e) continue;
    hexs += e[0];
    width += e[1];
  }
  return { hexs, width: width / 1000 };
}

function place(meta, slot, text) {
  const s = meta.slots[slot];
  const { hexs, width } = encode(meta, s.font, text);
  let size = s.size;
  while (size > s.min && width * size > s.maxWidth) size -= 0.5;
  const w = width * size;
  const x = s.align === 'center' ? s.x - w / 2 : s.align === 'right' ? s.x - w : s.x;
  return `BT ${meta.fonts[s.font].res} ${size} Tf ${s.color.join(' ')} rg 1 0 0 1 ${x.toFixed(2)} ${s.y.toFixed(2)} Tm <${hexs}> Tj ET`;
}

// d: { name, module, score, cpdHours, date (YYYY-MM-DD), code }
export function stampCertificate(template, meta, d) {
  const tpl = new Uint8Array(template);
  const hours = Number(d.cpdHours);
  const unit = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const date = new Date(d.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const stream = [
    place(meta, 'name', d.name),
    place(meta, 'module', d.module),
    place(meta, 'scoreLine', `and passed the final assessment with a score of ${d.score}%.`),
    place(meta, 'cpd', `${unit(hours, 'hour', 'hours')} · ${unit(hours, 'credit', 'credits')}`),
    place(meta, 'date', date),
    place(meta, 'code', d.code),
    place(meta, 'codeFooter', `Code ${d.code}`),
  ].join('\n');

  const dyn = meta.size; // new object number
  const parts = [];
  let offset = tpl.length;
  const add = (s) => { const b = ascii(s); parts.push(b); offset += b.length; };
  add('\n');
  const dynAt = offset;
  add(`${dyn} 0 obj\n<< /Length ${ascii(stream).length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  const pageAt = offset;
  add(`${meta.page.num} 0 obj\n${meta.page.dict.replace('__DYN__', `${dyn} 0 R`)}\nendobj\n`);
  const xrefAt = offset;
  const pad = (n) => String(n).padStart(10, '0');
  add(`xref\n0 1\n0000000000 65535 f \n${meta.page.num} 1\n${pad(pageAt)} 00000 n \n${dyn} 1\n${pad(dynAt)} 00000 n \n`);
  add(`trailer\n<< /Size ${dyn + 1} /Root ${meta.root} /Info ${meta.info} /Prev ${meta.startxref} >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(offset);
  out.set(tpl, 0);
  let p = tpl.length;
  for (const b of parts) { out.set(b, p); p += b.length; }
  return out;
}
