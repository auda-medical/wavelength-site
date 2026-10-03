// Minimal Markdown for Learn posts. Supports front matter, ## and ### headings,
// paragraphs, - and 1. lists, > callouts, images, **bold**, *italic* and [links](url).
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy" decoding="async">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a class="text-link" href="${u}"${/^https?:/.test(u) ? ' rel="noopener"' : ''}>${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

// Quiz question block:
//   ?? Question text
//   - wrong option
//   + correct option
//   : explanation shown after answering
// Questions are collected separately from the post body and shown on the post's test page.
// Works without JavaScript: the answer sits in a <details> the reader opens.
let quizCount = 0;
function quiz(lines) {
  const n = ++quizCount;
  const q = lines[0].slice(3).trim();
  const opts = lines.filter((l) => /^[-+] /.test(l)).map((l) => ({ ok: l[0] === '+', text: l.slice(2).trim() }));
  const why = lines.filter((l) => /^: /.test(l)).map((l) => l.slice(2).trim()).join(' ');
  const letters = 'abcdefgh';
  const right = opts.findIndex((o) => o.ok);
  return `<div class="quiz" data-quiz id="q${n}"><p class="quiz-q"><span class="quiz-n">Question ${n}</span>${inline(q)}</p>
<ol class="quiz-opts">${opts.map((o, i) => `<li><button type="button" class="quiz-opt"${o.ok ? ' data-correct' : ''}><span class="quiz-l">${letters[i]}</span><span>${inline(o.text)}</span></button></li>`).join('')}</ol>
<details class="quiz-why"><summary>Show answer</summary><p><strong>Answer ${letters[right]}.</strong> ${inline(why)}</p></details></div>`;
}

function parse(src) {
  quizCount = 0;
  const meta = {};
  let body = src.replace(/\r\n/g, '\n');
  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    fm[1].split('\n').forEach((line) => {
      const i = line.indexOf(':');
      if (i > 0) {
        let v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        if (v === 'true') v = true; else if (v === 'false') v = false;
        meta[line.slice(0, i).trim()] = v;
      }
    });
    body = body.slice(fm[0].length);
  }
  const out = [];
  const questions = [];
  const blocks = body.split(/\n\s*\n/);
  for (const raw of blocks) {
    const b = raw.trim();
    if (!b) continue;
    const lines = b.split('\n');
    if (/^\?\? /.test(b)) questions.push(quiz(lines));
    else if (/^### /.test(b)) out.push(`<h3>${inline(b.slice(4))}</h3>`);
    else if (/^## /.test(b)) out.push(`<h2>${inline(b.slice(3))}</h2>`);
    else if (lines.every((l) => /^[-*] /.test(l))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`);
    else if (lines.every((l) => /^\d+\. /.test(l))) out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`);
    else if (lines.every((l) => /^>/.test(l))) {
      const text = lines.map((l) => l.replace(/^>\s?/, '')).join(' ');
      const m = text.match(/^\*\*([^*]+)\*\*\s*(.*)$/);
      out.push(`<aside class="callout">${m ? `<p class="callout-title">${esc(m[1])}</p><p>${inline(m[2])}</p>` : `<p>${inline(text)}</p>`}</aside>`);
    } else if (/^!\[/.test(b) && lines.length === 1) {
      const m = b.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      out.push(m ? `<figure><a href="${m[2]}" target="_blank" rel="noopener" aria-label="Open full size"><img src="${m[2]}" alt="${esc(m[1])}" loading="lazy" decoding="async"></a>${m[1] ? `<figcaption>${esc(m[1])}</figcaption>` : ''}</figure>` : `<p>${inline(b)}</p>`);
    } else out.push(`<p>${inline(lines.join(' '))}</p>`);
  }
  return { meta, html: out.join('\n'), questions };
}

module.exports = { parse };
