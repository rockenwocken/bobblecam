# Usage: python3 tools/make-bubble-bg.py assets/bobblebg.jpg [seed]   (needs numpy + Pillow)
# Paints a dreamy soap-bubble backdrop, 1080x1440, in the style of bobblebg.jpg.
import numpy as np, colorsys, random, sys
from PIL import Image, ImageFilter, ImageDraw

W, H = 1080, 1440
SS = 2  # supersampling for clean edges
rng = random.Random(int(sys.argv[2]) if len(sys.argv) > 2 else 7)
out = sys.argv[1]

# 1) soft colour field: big blurred blobs in pink / cyan / yellow / violet
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
base = np.zeros((H, W, 3), np.float32) + np.array([255, 214, 236], np.float32)
blobs = [((255, 120, 200), 0.18, 0.15, 420), ((80, 220, 255), 0.85, 0.22, 460), ((255, 236, 120), 0.55, 0.48, 400),
         ((150, 110, 255), 0.12, 0.72, 430), ((255, 150, 120), 0.9, 0.7, 380), ((90, 230, 230), 0.4, 0.95, 450),
         ((255, 110, 190), 0.75, 1.0, 360), ((255, 240, 170), 0.2, 0.42, 300)]
for col, cx, cy, r in blobs:
    d2 = ((xx - cx * W) ** 2 + (yy - cy * H) ** 2) / (r * r)
    a = np.exp(-d2 * 1.4)[..., None]
    base = base * (1 - a * 0.85) + np.array(col, np.float32) * a * 0.85
img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).resize((W * SS, H * SS), Image.BICUBIC)

def layer():
    return Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))

def compose(l, blur=0):
    global img
    if blur: l = l.filter(ImageFilter.GaussianBlur(blur * SS))
    img = Image.alpha_composite(img.convert('RGBA'), l).convert('RGB')

# 2) far bokeh: soft, bright out-of-focus light discs (screen-blended, so they glow)
def screen(l, blur):
    global img
    l = l.filter(ImageFilter.GaussianBlur(blur * SS))
    a = np.asarray(img.convert('RGB'), np.float32) / 255
    b = np.asarray(l, np.float32) / 255
    rgb, al = b[..., :3], b[..., 3:4]
    res = 1 - (1 - a) * (1 - rgb * al)
    img = Image.fromarray((res * 255).astype(np.uint8))

l = layer(); d = ImageDraw.Draw(l)
for _ in range(60):
    r = rng.uniform(25, 100) * SS
    x, y = rng.uniform(0, W * SS), rng.uniform(0, H * SS)
    hue = rng.choice([0.92, 0.5, 0.14, 0.78, 0.97, 0.55, 0.12])
    c = tuple(int(v * 255) for v in colorsys.hsv_to_rgb(hue, rng.uniform(0.2, 0.45), 1))
    d.ellipse([x - r, y - r, x + r, y + r], fill=c + (rng.randint(60, 120),))
screen(l, 12)
# warm golden glints, like little lights behind the bubbles
l = layer(); d = ImageDraw.Draw(l)
for _ in range(40):
    r = rng.uniform(5, 16) * SS
    x, y = rng.uniform(0, W * SS), rng.uniform(0, H * SS)
    d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 226, 120, rng.randint(140, 230)))
screen(l, 3)

# 3) soap bubbles: thin iridescent rim, faint fill, highlights
def bubble(cx, cy, r):
    R = int(r * SS)
    size = 2 * R + 8
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    dx, dy = xx - size / 2, yy - size / 2
    dist = np.sqrt(dx * dx + dy * dy) / R
    ang = np.arctan2(dy, dx)
    hue = (ang / (2 * np.pi) + 0.5 + rng.random()) % 1.0
    # rainbow rim colour
    h6 = hue * 6
    rgb = np.stack([np.clip(np.abs(h6 - 3) - 1, 0, 1), np.clip(2 - np.abs(h6 - 2), 0, 1), np.clip(2 - np.abs(h6 - 4), 0, 1)], -1)
    rgb = 0.55 + 0.45 * rgb  # pastel
    rim = np.exp(-((dist - 0.985) / 0.035) ** 2) * 0.95 + np.exp(-((dist - 0.93) / 0.07) ** 2) * 0.35
    inner = np.where(dist < 1, 0.07 + 0.18 * dist ** 6, 0)
    alpha = np.clip(rim + inner, 0, 1) * (dist < 1.04)
    # light bounce on the lower right
    lit = np.exp(-(((dx / R) - 0.45) ** 2 + ((dy / R) - 0.55) ** 2) / 0.05) * (dist < 0.98) * 0.35
    alpha = np.clip(alpha + lit, 0, 1)
    col = rgb * 255 * (1 - lit[..., None]) + 255 * lit[..., None]
    arr = np.dstack([col, alpha[..., None] * 255]).astype(np.uint8)
    b = Image.fromarray(arr, 'RGBA')
    # glossy highlights: a big soft crescent-ish spot and a small sharp one
    hd = ImageDraw.Draw(b)
    hx, hy = size / 2 - 0.42 * R, size / 2 - 0.45 * R
    hd.ellipse([hx - 0.22 * R, hy - 0.12 * R, hx + 0.22 * R, hy + 0.12 * R], fill=(255, 255, 255, 150))
    hd.ellipse([hx + 0.3 * R - 0.06 * R, hy - 0.16 * R - 0.06 * R, hx + 0.3 * R + 0.06 * R, hy - 0.16 * R + 0.06 * R], fill=(255, 255, 255, 220))
    b = b.filter(ImageFilter.GaussianBlur(0.6 * SS))
    return b, (int(cx * SS - size / 2), int(cy * SS - size / 2))

placed = []
def place(n, rmin, rmax, tries=400):
    for _ in range(n):
        for _ in range(tries):
            r = rng.uniform(rmin, rmax)
            x, y = rng.uniform(-0.1 * r, W + 0.1 * r), rng.uniform(-0.1 * r, H + 0.1 * r)
            if all((x - px) ** 2 + (y - py) ** 2 > (r + pr * 0.8) ** 2 for px, py, pr in placed):
                placed.append((x, y, r)); break

place(5, 150, 230)   # big bubbles
place(10, 60, 120)   # medium
place(26, 14, 45)    # small
l = layer()
for x, y, r in sorted(placed, key=lambda p: -p[2]):
    b, pos = bubble(x, y, r)
    l.alpha_composite(b, (max(0, pos[0]), max(0, pos[1])), (max(0, -pos[0]), max(0, -pos[1])))
compose(l)

# 4) sparkles: little 4-point stars and glints
l = layer(); d = ImageDraw.Draw(l)
for _ in range(45):
    x, y = rng.uniform(0, W * SS), rng.uniform(0, H * SS)
    s = rng.uniform(4, 16) * SS
    a = rng.randint(150, 240)
    d.polygon([(x, y - s), (x + s * 0.18, y - s * 0.18), (x + s, y), (x + s * 0.18, y + s * 0.18),
               (x, y + s), (x - s * 0.18, y + s * 0.18), (x - s, y), (x - s * 0.18, y - s * 0.18)], fill=(255, 255, 255, a))
glow = l.filter(ImageFilter.GaussianBlur(4 * SS))
compose(glow); compose(l, blur=0.4)

img.resize((W, H), Image.LANCZOS).save(out, quality=90)
print('saved', out)
