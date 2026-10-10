// Small server-rendered SVG charts for the business dashboard. No scripts, no external libraries. Each chart has a text
// alternative (role="img" with aria-label) and sits next to a table with the same numbers. null values (not measured)
// are drawn as gaps, never as zero.
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString('en-GB'));

// Daily series as columns. points: [{ day, n }]. Long ranges are summed into weeks so each column stays readable.
export function columns(points, { label = '', height = 150, color = 'var(--biz-a)' } = {}) {
  let pts = points;
  if (pts.length > 120) {
    const weeks = [];
    for (let i = 0; i < pts.length; i += 7) { const w = pts.slice(i, i + 7); const known = w.filter((p) => p.n != null); weeks.push({ day: w[0].day, n: known.length ? known.reduce((a, p) => a + p.n, 0) : null }); }
    pts = weeks;
  }
  const W = 720, H = height, pad = 22, max = Math.max(1, ...pts.map((p) => p.n || 0));
  const bw = (W - pad * 2) / Math.max(1, pts.length);
  const bars = pts.map((p, i) => {
    if (p.n == null) return `<rect x="${(pad + i * bw).toFixed(1)}" y="${H - pad - 3}" width="${Math.max(1, bw - 1).toFixed(1)}" height="3" fill="var(--biz-line)"><title>${esc(p.day)}: not measured</title></rect>`;
    const h = Math.max(p.n ? 2 : 0, ((H - pad * 2) * p.n) / max);
    return `<rect x="${(pad + i * bw).toFixed(1)}" y="${(H - pad - h).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${color}"><title>${esc(p.day)}: ${fmt(p.n)}</title></rect>`;
  }).join('');
  const total = pts.reduce((a, p) => a + (p.n || 0), 0);
  const first = pts[0] ? pts[0].day : '', last = pts.length ? pts[pts.length - 1].day : '';
  return `<svg class="biz-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${label}: ${fmt(total)} in total from ${first} to ${last}${pts !== points ? ', by week' : ', by day'}`)}" preserveAspectRatio="none">
    <line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="var(--biz-line)"/>${bars}
    <text x="${pad}" y="${H - 6}" class="biz-axis">${esc(first)}</text><text x="${W - pad}" y="${H - 6}" text-anchor="end" class="biz-axis">${esc(last)}</text>
    <text x="${pad}" y="14" class="biz-axis">max ${fmt(max)}</text></svg>`;
}

// Horizontal bars for a ranked list. rows: [[label, n]].
export function bars(rows, { label = '', max: cap = 12, money = null } = {}) {
  const list = rows.slice(0, cap);
  if (!list.length) return '<p class="biz-empty">None in this period.</p>';
  const max = Math.max(1, ...list.map(([, n]) => Math.abs(n)));
  return `<ul class="biz-bars" aria-label="${esc(label)}">${list.map(([l, n]) => `<li><span class="biz-bar-l">${esc(l)}</span><span class="biz-bar-t"><i style="width:${Math.max(1, Math.round((Math.abs(n) / max) * 100))}%"></i></span><b>${money ? money(n) : fmt(n)}</b></li>`).join('')}</ul>`;
}
