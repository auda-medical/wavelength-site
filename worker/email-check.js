// Catching a mistyped email address before an invitation goes to nobody (12 Nov 2026, owner).
// A learner typed her supervisor's NHS address as "...@nhs.ner" and earlier "firas.sbou-auda@nhs.net". The invitation
// was "sent", reached no one, and nothing told either side. Two checks run before an invitation is saved:
// - suggestDomain: a domain one or two letters away from a common email provider ("nhs.ner", "gmial.com") is held back
//   with a suggestion. The learner can keep the address as typed (confirmed: true), because a rare real domain may sit
//   close to a common one.
// - domainAccepts: a DNS lookup (Cloudflare DNS over HTTPS). A domain with no mail server and no address at all cannot
//   receive email, so the invitation is refused. Any failure of the lookup itself lets the invitation through: the
//   check must never block a real address.
export const COMMON_DOMAINS = [
  'nhs.net', 'nhs.scot', 'wales.nhs.uk', 'hscni.net', 'nhs.uk',
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk', 'msn.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'mail.com', 'gmx.com',
  'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net', 'protonmail.com', 'proton.me',
];

// Real providers one or two letters from a common one (audit, 12 Nov 2026): never questioned.
export const REAL_NEAR = ['live.ca', 'live.fr', 'live.nl', 'live.ie', 'hotmail.ca', 'hotmail.fr', 'hotmail.de', 'hotmail.es', 'hotmail.it', 'yahoo.ca', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'yahoo.ie', 'email.com', 'gmail.co.uk', 'aol.co.uk', 'me.uk', 'mail.ru', 'gmx.de', 'gmx.net', 'web.de', 'hse.ie', 'gov.uk', 'ac.uk', 'nhs.wales'];

// Edit distance with adjacent swaps (Damerau-Levenshtein, optimal string alignment).
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// The common domain the typed one most likely meant, or null when it is itself common or not close to any.
export function suggestDomain(domain) {
  const dom = String(domain || '').toLowerCase().trim();
  if (!dom || COMMON_DOMAINS.includes(dom) || REAL_NEAR.includes(dom)) return null;
  // A trust domain such as "nhs.net" with an extra label is real ("xyz.nhs.uk"): only whole-domain slips are caught.
  let best = null, bestD = 3;
  for (const c of COMMON_DOMAINS) {
    const lim = c.length <= 7 ? 1 : 2;
    const k = distance(dom, c);
    if (k <= lim && k < bestD) { best = c; bestD = k; }
  }
  return best;
}

// true: the domain has a mail server or an address; false: it does not exist or has neither; null: unknown.
export async function domainAccepts(domain, fetcher = fetch) {
  const ask = async (type) => {
    const r = await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
      headers: { Accept: 'application/dns-json' },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined,
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (typeof j.Status !== 'number') return null;
    if (j.Status === 3) return 'nx';
    if (j.Status !== 0) return null;
    return (j.Answer || []).some((a) => a.type === (type === 'MX' ? 15 : 1)) ? 'yes' : 'none';
  };
  try {
    const mx = await ask('MX');
    if (mx === 'yes') return true;
    if (mx === 'nx') return false;
    if (mx === null) return null;
    const a = await ask('A');
    if (a === 'yes') return true;
    return a === null ? null : false;
  } catch { return null; }
}
