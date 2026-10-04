"""Render the app's code-drawn bottle icon. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parents[1] / "public"
SCALE = 4
image = Image.new("RGB", (512 * SCALE, 512 * SCALE), "#fff8ef")
draw = ImageDraw.Draw(image)


def box(coords):
    return tuple(round(value * SCALE) for value in coords)


def rounded(coords, radius, fill, outline=None, width=0):
    draw.rounded_rectangle(box(coords), radius * SCALE, fill=fill,
                           outline=outline, width=width * SCALE)


ink = "#d94f5e"
# Keep the bottle within the central safe area for maskable app icons.
rounded((174, 193, 338, 392), 38, "#ffffff", ink, 10)
rounded((229, 121, 283, 183), 25, "#ffe8a3", ink, 10)
rounded((179, 164, 333, 207), 15, "#ffd6c9", ink, 10)
for y in (234, 257, 280):
    draw.line(box((195, y, 214, y)), fill="#f49ca5", width=7 * SCALE)


def bezier(p0, p1, p2, p3):
    points = []
    for step in range(41):
        t = step / 40
        points.append(tuple((1-t)**3 * p0[i] + 3*(1-t)**2*t * p1[i]
                            + 3*(1-t)*t*t * p2[i] + t**3 * p3[i]
                            for i in (0, 1)))
    return points


heart = []
for curve in (
    ((266, 277), (233, 241), (207, 281), (237, 308)),
    ((237, 308), (245, 316), (257, 327), (266, 334)),
    ((266, 334), (275, 327), (287, 316), (295, 308)),
    ((295, 308), (325, 281), (299, 241), (266, 277)),
):
    heart.extend(bezier(*curve))
draw.polygon([box(point) for point in heart], fill="#ef6f7a")

for name, size in (
    ("milk-tracker-192.png", 192),
    ("milk-tracker-512.png", 512),
    ("milk-tracker-maskable-512.png", 512),
    ("apple-touch-icon.png", 180),
    ("logo192.png", 192),
    ("logo512.png", 512),
):
    image.resize((size, size), Image.Resampling.LANCZOS).save(PUBLIC / name)
favicon = image.resize((256, 256), Image.Resampling.LANCZOS)
for name in ("milk-tracker.ico", "favicon.ico"):
    favicon.save(PUBLIC / name, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64)])
print("Generated PWA, Apple home screen, and browser icons in", PUBLIC)
