"""Decode delivery assets, verify hashes, audio headroom and loop boundary. Not listening QA."""
from pathlib import Path
import hashlib
import json
import subprocess
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'evidence/expedition-20261113'
OUT.mkdir(parents=True, exist_ok=True)
report = {'scope': 'Real image/audio decoding; not Creator import, playback or listening QA', 'images': {}, 'audio': {}}
manifest = json.loads((ROOT / 'assets/resources/scenery/expedition-art.json').read_text())
for item in manifest['assets']:
    path = ROOT / item['path']
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        assert list(image.size) == item['size']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256']
    report['images'][path.name] = {'size': item['size'], 'sha256': item['sha256'], 'bytes': path.stat().st_size}
music = json.loads((ROOT / 'assets/resources/audio/music-manifest.json').read_text())
for name, spec in music['tracks'].items():
    path = ROOT / f'assets/resources/audio/music-{name}.ogg'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == spec['sha256']
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '2', '-ar', '22050', 'pipe:1'])
    samples = np.frombuffer(raw, '<f4').reshape(-1, 2)
    peak = float(np.max(np.abs(samples))); rms = float(np.sqrt(np.mean(samples ** 2)))
    seconds = len(samples) / 22050; seam = float(np.max(np.abs(samples[0] - samples[-1])))
    assert abs(seconds - spec['seconds']) < .05
    assert peak < .9 and .08 < rms < .12 and seam < .025
    assert path.stat().st_size < 600000
    report['audio'][name] = {'decodedSeconds': seconds, 'peak': peak, 'rms': rms, 'seamStep': seam, 'bytes': path.stat().st_size}
(OUT / 'asset-qa.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
