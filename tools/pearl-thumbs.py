# Card thumbnails for Pearls and Academy cards, cut from each pearl graphic at 16:10.
# Run after adding or changing a pearl graphic: python3 tools/pearl-thumbs.py
# Default crop: the 3D illustration in the top-right corner of the graphic.
# CROP lists exceptions as (left, right, centre-y), fractions of the graphic, to frame the panel-one illustration.
import glob, os
from PIL import Image
SRC = 'content/learn/images'
OUT = os.path.join(SRC, 'thumbs')
DEFAULT = (0.62, 1.0, 0.12)
CROP = {
    'abscess-pearl.webp': (0.03, 0.31, 0.45),
    'efast-pearl.webp': (0.66, 1.0, 0.17),
    'gallbladder-pearl.webp': (0.03, 0.34, 0.47),
    'gastric-pearl.webp': (0.73, 0.99, 0.20),
    'hydronephrosis-pearl.webp': (0.66, 1.0, 0.12),
    'intubation-pearl.webp': (0.66, 1.0, 0.12),
    'jvp-pearl.webp': (0.66, 1.0, 0.12),
    'pericardial-pleural-pearl.webp': (0.62, 1.0, 0.14),
    'consolidation-pearl.webp': (0.02, 0.25, 0.53),
    'dvt-pearl.webp': (0.02, 0.48, 0.50),
    'five-checks-pearl.webp': (0.0, 0.5, 0.42),
    'lung-pearl.webp': (0.02, 0.33, 0.475),
    'pleural-effusion-pearl.webp': (0.02, 0.25, 0.64),
    'portal-vein-pearl.webp': (0.02, 0.33, 0.55),
    'sbo-pearl.webp': (0.02, 0.33, 0.51),
    'shoulder-pearl.webp': (0.02, 0.42, 0.52),
    'tendon-pearl.webp': (0.02, 0.33, 0.47),
}
os.makedirs(OUT, exist_ok=True)
for f in sorted(glob.glob(os.path.join(SRC, '*-pearl.webp'))):
    name = os.path.basename(f)
    im = Image.open(f).convert('RGB')
    w, h = im.size
    x0, x1, cy = CROP.get(name, DEFAULT)
    cw = round((x1 - x0) * w)
    ch = round(cw * 10 / 16)
    top = max(0, min(round(cy * h - ch / 2), h - ch))
    left = round(x0 * w)
    im.crop((left, top, left + cw, top + ch)).resize((720, 450), Image.LANCZOS).save(os.path.join(OUT, name), 'WEBP', quality=80, method=6)
