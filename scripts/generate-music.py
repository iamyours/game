"""Original, deterministic fantasy loops. Synthesized notes only; no third-party recordings.
Reproduce with Python/numpy + ffmpeg. Wrapped note/reverb tails make full-length loops.
"""
from pathlib import Path
import json
import hashlib
import subprocess
import tempfile
import wave
import numpy as np

OUT = Path(__file__).resolve().parent.parent / 'assets/resources/audio'
RATE = 22050
TRACKS = {
    'storm': (88, 50, .68, [0, 7, 10, 5], [0, 7, 12, 14, 10, 7, 5, 3]),
    'frost': (76, 57, .40, [0, 5, 3, 7], [12, 7, 14, 10, 7, 3, 5, 7]),
    'ember': (96, 48, .83, [0, 8, 5, 7], [0, 3, 7, 12, 10, 7, 3, 5]),
    'boss': (112, 45, 1., [0, 0, 5, 7], [0, 7, 12, 7, 3, 10, 7, 5]),
}
report = {}
for name, (bpm, root, intensity, chords, motif) in TRACKS.items():
    rng = np.random.default_rng(20261113 + root)
    beat = 60 / bpm
    count = round(beat * 64 * RATE)
    mix = np.zeros((count, 2), np.float64)
    def add(note, at, duration, gain, instrument='pluck', pan=0):
        t = np.arange(round(duration * RATE)) / RATE
        freq = 440 * 2 ** ((note - 69) / 12)
        attack = np.minimum(1, t / (.12 if instrument == 'pad' else .008))
        if instrument == 'pad':
            env = attack * np.minimum(1, np.maximum(0, duration - t) / .45)
            value = (np.sin(2 * np.pi * freq * t) + .25 * np.sin(2 * np.pi * freq * 2.003 * t)) * env
        elif instrument == 'bell':
            value = (np.sin(2 * np.pi * freq * t) + .25 * np.sin(2 * np.pi * freq * 2.76 * t)) * np.exp(-t * 2.8) * attack
        else:
            value = (np.sin(2 * np.pi * freq * t) + .32 * np.sin(2 * np.pi * freq * 2 * t) + .12 * np.sin(2 * np.pi * freq * 3 * t)) * np.exp(-t * 5) * attack
        value *= gain
        idx = (round(at * RATE) + np.arange(len(t))) % count
        np.add.at(mix[:, 0], idx, value * np.sqrt((1 - pan) / 2))
        np.add.at(mix[:, 1], idx, value * np.sqrt((1 + pan) / 2))
    for bar in range(16):
        degree = chords[(bar // 2) % 4]
        for interval in [0, 3 if degree != 7 else 4, 7]:
            add(root + degree + interval, bar * 4 * beat, 4.4 * beat, .048, 'pad', (interval - 3) / 12)
        for pos in range(8):
            note = root + 12 + [0, 7, 12, 7, 3, 7, 10, 7][pos] + degree
            add(note, (bar * 4 + pos / 2) * beat, beat * 1.7, .065 if name != 'frost' else .04, pan=(-1 if pos % 2 else 1) * .35)
        # Leave breathing room between melodic phrases; the second half answers the first.
        if bar % 4 != 3:
            for pos in [0, 1.5, 3]:
                note = root + 24 + motif[(bar * 3 + int(pos * 2)) % len(motif)]
                add(note, (bar * 4 + pos) * beat, 2.5 * beat, .075, 'bell', .15)
        for pos in ([0, 2] if name != 'boss' else [0, 1.5, 2, 3.5]):
            t = np.arange(round(.24 * RATE)) / RATE
            drum = np.sin(2 * np.pi * (72 * t + 2.2 * (1 - np.exp(-t * 35)))) * np.exp(-t * 18)
            idx = (round((bar * 4 + pos) * beat * RATE) + np.arange(len(t))) % count
            mix[idx] += drum[:, None] * .16 * intensity
        for pos in range(8):
            t = np.arange(round(.055 * RATE)) / RATE
            noise = rng.uniform(-1, 1, len(t)) * np.exp(-t * 90)
            idx = (round((bar * 4 + pos / 2) * beat * RATE) + np.arange(len(t))) % count
            mix[idx] += noise[:, None] * .028 * intensity
    # Quiet crossed stereo reflections, all circular rather than clipped at the loop boundary.
    dry = mix.copy()
    for delay, gain in [(.23, .18), (.41, .11), (.67, .06)]:
        mix += np.roll(dry[:, ::-1], round(delay * RATE), axis=0) * gain
    # Match perceived level between tracks, retaining ample headroom for impact cues.
    mix *= min(.82 / np.max(np.abs(mix)), .10 / np.sqrt(np.mean(mix ** 2)))
    blend = round(.004 * RATE)
    bridge = np.linspace(mix[-blend].copy(), mix[blend - 1].copy(), blend * 2)
    mix[-blend:] = bridge[:blend]; mix[:blend] = bridge[blend:]
    pcm = np.clip(mix * 32767, -32768, 32767).astype('<i2')
    with tempfile.TemporaryDirectory() as temp:
        wav = Path(temp) / 'loop.wav'
        with wave.open(str(wav), 'wb') as f:
            f.setnchannels(2); f.setsampwidth(2); f.setframerate(RATE); f.writeframes(pcm.tobytes())
        target = OUT / f'music-{name}.ogg'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-c:a', 'libvorbis', '-q:a', '4', str(target)], check=True)
    report[name] = {'bpm': bpm, 'bars': 16, 'seconds': count / RATE, 'channels': 2,
                    'peak': float(np.max(np.abs(mix))), 'rms': float(np.sqrt(np.mean(mix ** 2))),
                    'seamStep': float(np.max(np.abs(mix[0] - mix[-1]))), 'bytes': target.stat().st_size,
                    'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
(OUT / 'music-manifest.json').write_text(json.dumps({'original': True, 'sampleRate': RATE, 'tracks': report}, indent=2) + '\n')
print(json.dumps(report, indent=2))
