// Source monitoring: the relevant text and the dates and versions of a fetched page or document, so a daily check
// compares what the guidance says, not the site's menus, cookie banners or advertising. Pure functions (tested in
// Node). Nothing here republishes anything: the normalised text is kept only to compare with the next check.

const DROP_BLOCKS = ['script', 'style', 'noscript', 'svg', 'iframe', 'template', 'nav', 'header', 'footer', 'aside', 'form', 'button', 'select'];
const DROP_RE = new RegExp(`<(${DROP_BLOCKS.join('|')})\\b[\\s\\S]*?</\\1>`, 'gi');
// Whole lines that are page furniture rather than guidance.
const BOILERPLATE = [
  // Never words that clinical text uses ("consent", "register", "accept"): a guidance line must not be dropped.
  /cookies?\b.*\b(use|accept|settings|policy|preferences)\b/i, /^accept all/i, /subscribe/i, /newsletter/i, /follow us/i, /share (this|on)/i, /^skip to/i, /back to top/i,
  /^©|copyright|all rights reserved/i, /^print( this page)?$/i, /^(menu|search|log ?in|sign ?in|register|basket|cart|close|home)$/i,
  /registered (charity|company) (no|number)/i, /^page \d+ of \d+$/i, /^(previous|next)$/i, /^read more$/i, /^loading/i,
];
// The same patterns as one expression: one test per line instead of sixteen.
const BOILERPLATE_RE = new RegExp(BOILERPLATE.map((r) => `(?:${r.source})`).join('|'), 'i');
// Main text longer than this is not what a guidance page looks like (the longest real source, ACEM P733, is about
// 23,000 characters): it is reported for checking by hand rather than parsed past the plan's CPU allowance.
export const TEXT_LIMIT = 60000;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', pound: '£', euro: '€', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™', deg: '°', times: '×' };
export function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
// The main content of an HTML page as normalised lines: <main> or <article> when the page has one, without scripts,
// navigation, headers, footers, forms and lines of page furniture; whitespace and typographic quotes made uniform.
export function htmlToText(html) {
  // One pass for all dropped blocks (thirteen separate passes cost four times the CPU on a large page, and the free
  // plan allows 10 ms per run: tools/monitor-cpu.mjs).
  let s = String(html || '').replace(DROP_RE, '\n');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Elements marked as cookie, consent or banner furniture (one level: enough for the common banners).
  s = s.replace(/<(div|section|p)\b[^>]*(?:id|class)="[^"]*(?:cookie|consent|gdpr|banner|newsletter|share|social|breadcrumb|advert|promo)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '\n');
  const main = s.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) || s.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (main && main[1].replace(/<[^>]+>/g, '').trim().length > 200) s = main[1];
  // Official documents the page links to, by file name: a new version of a curriculum pack behind the same link text
  // ("curriculum pack") changes the file name, so it is a change to this page too.
  // Files by name (".pdf") and the ICS's document addresses ("/asset/<id>/"), whose id changes with each new file.
  const docs = [...new Set([...s.matchAll(/<a\b[^>]*href="([^"#?]+\.pdf|[^"#?]*\/asset\/[A-Za-z0-9%-]{8,}\/?)(?:[?#][^"]*)?"/gi)].map((m) => { const f = m[1].replace(/\/$/, '').split('/').pop(); try { return decodeURIComponent(f); } catch { return f; } }))].sort();
  s = s.replace(/<(br|p|div|li|tr|h[1-6]|section|table|ul|ol|dt|dd|blockquote)\b[^>]*>/gi, '\n').replace(/<\/(td|th)>/gi, ' ').replace(/<[^>]+>/g, '');
  // Far too much text to be a guidance page: stop here (the caller reports it for checking by hand).
  if (s.length > TEXT_LIMIT * 4) return null;
  const text = normaliseLines(decode(s));
  return docs.length ? [text, ...docs.map((d) => `${LINKED} ${d}`)].join('\n') : text;
}
export const LINKED = 'Linked document:';
export function normaliseLines(text) {
  const out = [];
  // Character substitutions once for the whole text, then per line (the same result, a third of the CPU).
  const all = String(text).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/ /g, ' ');
  for (let line of all.split(/\r?\n/)) {
    line = line.replace(/\s+/g, ' ').trim();
    if (!line || line.length < 2) continue;
    if (line.length < 160 && BOILERPLATE_RE.test(line)) continue;
    if (out[out.length - 1] !== line) out.push(line);
  }
  return out.join('\n');
}

// Dates as YYYY-MM-DD. "12 March 2026", "March 2026" (first of the month), "2026-03-12", "12/03/2026" (UK order).
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n) => String(n).padStart(2, '0');
export function parseDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})\b/i);
  if (m && MONTHS.indexOf(m[2].toLowerCase()) >= 0) return `${m[3]}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(m[1])}`;
  m = s.match(/\b([a-z]+)\s+(\d{4})\b/i);
  if (m && MONTHS.indexOf(m[1].toLowerCase()) >= 0) return `${m[2]}-${pad(MONTHS.indexOf(m[1].toLowerCase()) + 1)}-01`;
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}
// A version in a title or an address: "v1.5", "version 13", "v13". The address counts only for documents.
export function findVersion(...texts) {
  for (const t of texts) {
    const m = String(t || '').match(/\bversion[\s_-]*(\d+(?:\.\d+)*)\b/i) || String(t || '').match(/(?:^|[\s_\-/(])v(\d+(?:\.\d+)*)(?=[\s_\-/).]|$)/i);
    if (m) return `v${m[1]}`;
  }
  return null;
}
// Publication or revision dates an HTML page states about itself.
export function htmlMeta(html, text) {
  const h = String(html || '');
  const metaDate = (h.match(/<meta[^>]+(?:property|name)="(?:article:modified_time|og:updated_time|dcterms\.modified|last-modified|dc\.date\.modified)"[^>]+content="([^"]+)"/i) || [])[1]
    || (h.match(/<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="(?:article:modified_time|og:updated_time|dcterms\.modified)"/i) || [])[1];
  const stated = (String(text || '').match(/(?:last (?:updated|reviewed|modified)|page updated|updated on|published(?: on)?|review date)\s*:?\s*([0-9]{1,2}(?:st|nd|rd|th)? [A-Za-z]+ [0-9]{4}|[A-Za-z]+ [0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i) || [])[1];
  const title = decode((h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  return { publishedOn: parseDate(stated) || parseDate(metaDate) || null, title, version: findVersion(title) };
}
// The information dictionary of a PDF, read from the raw bytes (no PDF library: uncompressed /Info entries only).
export function pdfMeta(bytes, url = '') {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const take = (a, b) => { let s = ''; for (let i = a; i < b; i++) s += String.fromCharCode(u8[i]); return s; };
  const head = take(0, Math.min(u8.length, 65536)), tail = take(Math.max(0, u8.length - 65536), u8.length);
  const find = (re) => { const m = tail.match(re) || head.match(re); return m ? m[1] : null; };
  const pdfDate = (v) => (v && /^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null);
  const title = find(/\/Title\s*\(([^)]{0,200})\)/);
  const mod = pdfDate(find(/\/ModDate\s*\(D:(\d{8,14})/)), created = pdfDate(find(/\/CreationDate\s*\(D:(\d{8,14})/));
  let file = ''; try { file = decodeURIComponent(new URL(url).pathname.split('/').pop() || ''); } catch { /* none */ }
  return { isPdf: head.startsWith('%PDF'), title, modifiedOn: mod, createdOn: created, publishedOn: mod || created, version: findVersion(title, file) };
}
export async function sha256(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
