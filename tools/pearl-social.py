# Link-preview images (1200x630) for each Pearl, used as og:image on the Pearl page.
# LinkedIn, WhatsApp, Slack and others show this card when someone shares a Pearl link.
# Run after adding a pearl or changing its title or graphic: python3 tools/pearl-social.py
# Left: navy panel with the Pearl title. Right: the panel-one illustration, framed with the
# same crop settings as tools/pearl-thumbs.py.
import glob, os, re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'content/learn')
OUT = os.path.join(SRC, 'images/social')
FONTS = os.path.join(ROOT, 'worker/fonts')
# Read DEFAULT and CROP from tools/pearl-thumbs.py so both tools frame the same illustration.
_cfg = open(os.path.join(ROOT, 'tools/pearl-thumbs.py')).read()
DEFAULT = eval(re.search(r'^DEFAULT = (\(.*?\))$', _cfg, re.M).group(1))
CROP = eval(re.search(r'^CROP = (\{[\s\S]*?^\})', _cfg, re.M).group(1))

W, H, PANEL = 1200, 630, 600
NAVY, TEAL, CREAM, LIGHT = (10, 21, 38), (127, 196, 204), (247, 245, 240), (176, 190, 204)
serif = lambda s: ImageFont.truetype(os.path.join(FONTS, 'serif-semi.ttf'), s)
sans = lambda s: ImageFont.truetype(os.path.join(FONTS, 'sans-semi.ttf'), s)


def front(text):
    fm = re.match(r'^---\n([\s\S]*?)\n---', text)
    meta = {}
    for line in fm.group(1).split('\n'):
        if ':' in line:
            k, v = line.split(':', 1)
            meta[k.strip()] = v.strip().strip('"\'')
    return meta


def wrap(draw, text, font, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=font) <= width:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


os.makedirs(OUT, exist_ok=True)
made = 0
for f in sorted(glob.glob(os.path.join(SRC, '*.md'))):
    text = open(f, encoding='utf8').read()
    meta = front(text)
    m = re.search(r'/learn/images/([a-z0-9-]+-pearl\.webp)', text)
    slug = meta.get('slug') or re.sub(r'^\d{4}-\d{2}(-\d{2})?-', '', os.path.basename(f)[:-3])
    if not m:
        continue
    name = m.group(1)
    g = Image.open(os.path.join(SRC, 'images', name)).convert('RGB')
    gw, gh = g.size
    x0, x1, cy = CROP.get(name, DEFAULT)
    # Keep the thumbnail's height (16:10 of the crop width) so the frame stays inside panel one,
    # and narrow the width to the right-hand panel's shape, centred on the same illustration.
    tw = (x1 - x0) * gw
    ch = round(tw * 10 / 16)
    cw = round(ch * (W - PANEL) / H)
    left = max(0, min(round(x0 * gw + (tw - cw) / 2), gw - cw))
    top = max(0, min(round(cy * gh - ch / 2), gh - ch))
    art = g.crop((left, top, left + cw, top + ch)).resize((W - PANEL, H), Image.LANCZOS)

    im = Image.new('RGB', (W, H), NAVY)
    im.paste(art, (PANEL, 0))
    d = ImageDraw.Draw(im)
    d.text((64, 64), 'WAVELENGTH PEARL', font=sans(22), fill=TEAL)
    title = meta.get('title', '')
    size = 58
    while size > 34:
        font = serif(size)
        lines = wrap(d, title, font, PANEL - 128)
        if len(lines) <= 4:
            break
        size -= 4
    y = (H - len(lines) * size * 1.12) / 2
    for line in lines:
        d.text((64, y), line, font=font, fill=CREAM)
        y += size * 1.12
    d.text((64, H - 64 - 22), 'thewavelength.co.uk', font=sans(22), fill=LIGHT)
    d.rectangle((64, H - 108, 104, H - 105), fill=TEAL)
    im.save(os.path.join(OUT, slug + '.jpg'), 'JPEG', quality=82, optimize=True, progressive=True)
    made += 1
print(f'{made} social images in {OUT}')
