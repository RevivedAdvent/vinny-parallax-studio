"""Build one eight-frame contact sheet per basic-tier preset from actual rendered PNGs."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/camera-lab-basic'
report = json.loads((OUT / 'lab-report.json').read_text())
assert report['complete'] and report['pass']
FRAMES = [0, 8, 20, 32, 44, 56, 63, 71]

def font(size):
    for name in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()

for preset in report['presets']:
    width, margin, gap, label = 440, 24, 16, 30
    height = width * 9 // 16
    rows = 4
    canvas = Image.new('RGB', (width * 2 + margin * 2 + gap, 86 + rows * (height + label + gap)), '#101711')
    draw = ImageDraw.Draw(canvas)
    draw.text((margin, 18), f'CAMERA LAB BASIC / {preset["id"]}', font=font(22), fill='#e9eddc')
    draw.text((margin, 51), 'Actual 1920×1080 PNGs · 24 fps · 72 frames · holds at 0-7 and 64-71 · camera-only', font=font(12), fill='#a8b59a')
    for i, frame in enumerate(FRAMES):
        image = Image.open(OUT / preset['id'] / 'frames' / f'{preset["id"]}-{frame:04}.png').convert('RGB')
        assert image.size == (1920, 1080)
        x = margin + (i % 2) * (width + gap)
        y = 86 + (i // 4) * 2 * (height + label + gap) + ((i // 2) % 2) * (height + label + gap) if False else 86 + (i // 2) * (height + label + gap)
        canvas.paste(image.resize((width, height), Image.Resampling.LANCZOS), (x, y))
        draw.text((x, y + height + 8), f'F{frame:02}  |  {frame / 24:.3f}s  |  coverage PASS', font=font(12), fill='#d3dfc3')
    out = OUT / f'{preset["id"]}-contact-sheet.jpg'
    canvas.save(out, quality=94, subsampling=0)
    print(f'{out.name}: {canvas.width}x{canvas.height}')
print('BASIC CONTACT SHEETS COMPLETE.')
