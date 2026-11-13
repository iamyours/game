"""Reproduce dry stylized archery cues; no voices, organic samples or third-party audio."""
import math
import random
import struct
import wave
from pathlib import Path
random.seed(20261108)
out = Path(__file__).resolve().parent.parent / 'assets/resources/audio'
out.mkdir(parents=True, exist_ok=True)
for kind, duration in [('shot', .09), ('hit', .08), ('drop', .14)]:
    rate = 22050
    samples = []
    for n in range(int(rate * duration)):
        t = n / rate
        envelope = (1 - t / duration) ** 2
        if kind == 'shot':
            value = .5 * random.uniform(-1, 1) + .5 * math.sin(2 * math.pi * (1500 * t - 5000 * t * t))
        elif kind == 'hit':
            # Dry contact tick over a short low thud. Consume the same RNG sequence as the old cue.
            value = .22 * random.uniform(-1, 1) * math.exp(-t * 110) + .66 * math.sin(2 * math.pi * (155 * t - 320 * t * t))
        else:
            value = .7 * math.sin(2 * math.pi * (190 * t - 250 * t * t)) + random.uniform(-.3, .3)
        samples.append(struct.pack('<h', int(16000 * envelope * value)))
    with wave.open(str(out / (kind + '.wav')), 'wb') as clip:
        clip.setnchannels(1)
        clip.setsampwidth(2)
        clip.setframerate(rate)
        clip.writeframes(b''.join(samples))

for kind, duration in [('hit-heavy', .12), ('hit-critical', .18)]:
    rng = random.Random(20261113 + len(kind))
    samples = []
    for n in range(int(rate * duration)):
        t = n / rate
        thud = .6 * math.sin(2 * math.pi * (110 * t - 200 * t * t)) * math.exp(-t * 34)
        tick = .17 * rng.uniform(-1, 1) * math.exp(-t * 135)
        chime = 0 if kind == 'hit-heavy' else .19 * (math.sin(2 * math.pi * 880 * t) + .45 * math.sin(2 * math.pi * 1320 * t)) * math.exp(-t * 28)
        envelope = min(1, t / .0015) * (1 - t / duration) ** 2
        samples.append(struct.pack('<h', int(16000 * envelope * (thud + tick + chime))))
    with wave.open(str(out / (kind + '.wav')), 'wb') as clip:
        clip.setnchannels(1); clip.setsampwidth(2); clip.setframerate(rate)
        clip.writeframes(b''.join(samples))
