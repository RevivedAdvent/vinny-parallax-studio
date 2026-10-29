"""Normalize registered crops; never inpaint, extend, or edit the original files."""
from pathlib import Path
from PIL import Image
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'public/assets/scene-01'
DEST = ROOT / 'public/assets/scene-01-normalized'
DEST.mkdir(parents=True, exist_ok=True)
positions = {'background.png': (0, 0), 'jungle.png': (0, 0), 'vinny.png': (68, 185), 'foreground.png': (0, 0), 'reference.png': (0, 0)}
manifest = {'sourceArtboard': [1363, 768], 'outputArtboard': [1920, 1080], 'method': 'registered RGBA composite, then Lanczos resize; no inpainting', 'layers': []}
for name, offset in positions.items():
    source = SRC / name
    image = Image.open(source).convert('RGBA')
    registered = Image.new('RGBA', (1363, 768), (0, 0, 0, 0))
    registered.alpha_composite(image, offset)
    normalized = registered.resize((1920, 1080), Image.Resampling.LANCZOS)
    repair = None
    if name == 'background.png':
        alpha = normalized.getchannel('A')
        if alpha.getextrema()[0] == 0:
            raise ValueError('Valley contains fully transparent holes; supply a clean plate. Refusing to invent RGB.')
        rgb_before = hashlib.sha256(normalized.convert('RGB').tobytes()).hexdigest()
        repair = {'operation': 'make existing backplate RGB opaque; no RGB edits', 'priorAlphaRange': list(alpha.getextrema()), 'affectedPixels': normalized.width * normalized.height - alpha.histogram()[255], 'rgbSHA256Before': rgb_before}
        normalized.putalpha(255)
        repair['rgbSHA256After'] = hashlib.sha256(normalized.convert('RGB').tobytes()).hexdigest()
        assert repair['rgbSHA256After'] == rgb_before
    normalized.save(DEST / name)
    manifest['layers'].append({'file': name, 'nativeSize': list(image.size), 'offset': list(offset), 'alphaRepair': repair, 'sourceSHA256': hashlib.sha256(source.read_bytes()).hexdigest(), 'normalizedSHA256': hashlib.sha256((DEST / name).read_bytes()).hexdigest()})
(DEST / 'registration.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Normalized {len(positions)} registered copies in {DEST}')
