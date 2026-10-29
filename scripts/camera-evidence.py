"""Create Phase 1 review artifacts from actual PNG outputs; no artwork/frames are synthesized."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageStat
import hashlib
import json
import math
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/camera-phase1'
manifest = json.loads((OUT / 'manifest.json').read_text())
assert manifest['complete'] and len(manifest['frames']) == 576
assert all(f['coverage']['uncoveredPixels'] == 0 for f in manifest['frames'])
FRAMES = [0, 60, 120, 143, 240, 360, 383, 480, 527, 575]
(OUT / 'samples').mkdir(exist_ok=True)

def font(size):
    for name in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()

def sheet(frames, width, name, title):
    margin, gap, label = 24, 16, 34
    height = width * 9 // 16
    rows = math.ceil(len(frames) / 2)
    canvas = Image.new('RGB', (width * 2 + margin * 2 + gap, 86 + rows * (height + label + gap)), '#101711')
    draw = ImageDraw.Draw(canvas)
    draw.text((margin, 18), title, font=font(22), fill='#e9eddc')
    draw.text((margin, 51), 'Actual 1920×1080 PNGs · 24 fps · 1.15 baseline · camera-only · no visual approval claimed', font=font(12), fill='#a8b59a')
    for i, frame in enumerate(frames):
        image = Image.open(OUT / 'frames' / f'{frame:04}.png').convert('RGB')
        assert image.size == (1920, 1080)
        x = margin + (i % 2) * (width + gap)
        y = 86 + (i // 2) * (height + label + gap)
        canvas.paste(image.resize((width, height), Image.Resampling.LANCZOS), (x, y))
        pose = manifest['frames'][frame]['transforms'][-1]
        text = f'F{frame:03}  |  {frame / 24:.3f}s  |  near scale {pose["scale"]:.5f}  |  coverage PASS'
        draw.text((x, y + height + 9), text, font=font(12), fill='#d3dfc3')
    canvas.save(OUT / name, quality=94, subsampling=0)
    return {'path': name, 'width': canvas.width, 'height': canvas.height, 'frames': frames}

for frame in FRAMES:
    shutil.copyfile(OUT / 'frames' / f'{frame:04}.png', OUT / 'samples' / f'frame-{frame:04}.png')
sheets = [sheet(FRAMES, 576, 'contact-sheet.jpg', 'PHASE 1 / FRAME-INDEXED CAMERA PROOF'),
          sheet([0, 575], 960, 'start-end-contact-sheet.jpg', 'PHASE 1 / BASELINE → FINAL HOLD')]

def corner(pose, x, y):
    angle = math.radians(pose['roll'])
    x, y = x * pose['scale'], y * pose['scale']
    return (pose['x'] + x * math.cos(angle) - y * math.sin(angle), pose['y'] + x * math.sin(angle) + y * math.cos(angle))

max_step = 0
for a, b in zip(manifest['frames'], manifest['frames'][1:]):
    for pa, pb in zip(a['transforms'], b['transforms']):
        for x in [-960, 960]:
            for y in [-540, 540]:
                aa, bb = corner(pa, x, y), corner(pb, x, y)
                max_step = max(max_step, math.hypot(bb[0] - aa[0], bb[1] - aa[1]))

registration = json.loads((ROOT / 'public/assets/scene-01-normalized/registration.json').read_text())
for layer in registration['layers']:
    assert hashlib.sha256((ROOT / 'public/assets/scene-01' / layer['file']).read_bytes()).hexdigest() == layer['sourceSHA256']
    assert hashlib.sha256((ROOT / 'public/assets/scene-01-normalized' / layer['file']).read_bytes()).hexdigest() == layer['normalizedSHA256']
repair = registration['layers'][0]['alphaRepair']
assert repair['rgbSHA256Before'] == repair['rgbSHA256After']
legacy_main_hash = hashlib.sha256((ROOT / 'src/legacy-main.ts').read_bytes()).hexdigest()
old_hashes = (ROOT / 'output/camera-phase0/source-hashes-before.txt').read_text().splitlines()
old_main = next(line.split()[0] for line in old_hashes if line.endswith('src/main.ts'))
assert legacy_main_hash == old_main

metadata = {}
for name in ['camera-core.mp4', 'browser-preview.webm']:
    data = subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,codec_type,width,height,avg_frame_rate,nb_read_frames:format=duration', '-of', 'json', str(OUT / name)], text=True)
    metadata[name] = json.loads(data)
    (OUT / (name + '-metadata.json')).write_text(json.dumps(metadata[name], indent=2))
decoded = OUT / 'decoded-samples'
decoded.mkdir(exist_ok=True)
if not (decoded / '0010.png').exists():
    expression = '+'.join(f'eq(n,{f})' for f in FRAMES)
    subprocess.run(['ffmpeg', '-v', 'error', '-n', '-i', str(OUT / 'camera-core.mp4'), '-vf', f"select='{expression}'", '-vsync', '0', '-frames:v', '10', str(decoded / '%04d.png')], check=True)
compression = []
for i, frame in enumerate(FRAMES):
    master = Image.open(OUT / 'frames' / f'{frame:04}.png').convert('RGB')
    encoded = Image.open(decoded / f'{i + 1:04}.png').convert('RGB')
    diff = ImageStat.Stat(ImageChops.difference(master, encoded))
    mae = sum(diff.mean) / 3
    mse = sum(v * v for v in diff.rms) / 3
    psnr = 10 * math.log10(255 * 255 / mse) if mse else 999
    assert mae < 5 and psnr > 30, f'Unexpected MP4 mismatch at frame {frame}: MAE={mae}, PSNR={psnr}'
    compression.append({'frame': frame, 'meanAbsoluteError8Bit': mae, 'psnrDb': psnr})
(OUT / 'mp4-sample-comparisons.json').write_text(json.dumps(compression, indent=2))
mp4 = metadata['camera-core.mp4']
assert len(mp4['streams']) == 1 and mp4['streams'][0]['codec_type'] == 'video'
assert mp4['streams'][0]['nb_read_frames'] == '576' and mp4['format']['duration'] == '24.000000'
assert all(manifest['frames'][f]['sha256'] == manifest['frames'][0]['sha256'] for f in range(25))
assert all(manifest['frames'][f]['sha256'] == manifest['frames'][575]['sha256'] for f in range(503, 576))
preview_sha = hashlib.sha256((OUT / 'preview-frame-120.png').read_bytes()).hexdigest()
assert preview_sha == manifest['frames'][120]['sha256']
summary = {'pass': True, 'coverage': {'frames': 576, 'uncoveredPixels': 0}, 'checks': manifest['checks'],
           'previewFrame120MatchesMaster': True, 'baselineFrames0Through24Identical': True, 'finalFrames503Through575Identical': True,
           'maxProjectedCornerStepPixelsPerFrame': max_step, 'contactSheets': sheets,
           'normalizedBackplateRepair': repair, 'originalAssetsMatchRegistrationHashes': True,
           'legacyMainMatchesPhase0Hash': True, 'metadata': metadata, 'mp4SampleComparisons': compression, 'mp4Bytes': (OUT / 'camera-core.mp4').stat().st_size,
           'mp4SHA256': hashlib.sha256((OUT / 'camera-core.mp4').read_bytes()).hexdigest(),
           'visualMotionApproval': 'Not verified: image-review service failed; no human continuous-playback review.'}
(OUT / 'evidence-summary.json').write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
