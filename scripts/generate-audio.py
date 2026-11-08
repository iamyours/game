"""Reproduce the original short PCM cues; no third-party samples."""
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
            value = .65 * random.uniform(-1, 1) + .35 * math.sin(2 * math.pi * 130 * t)
        else:
            value = .7 * math.sin(2 * math.pi * (190 * t - 250 * t * t)) + random.uniform(-.3, .3)
        samples.append(struct.pack('<h', int(16000 * envelope * value)))
    with wave.open(str(out / (kind + '.wav')), 'wb') as clip:
        clip.setnchannels(1)
        clip.setsampwidth(2)
        clip.setframerate(rate)
        clip.writeframes(b''.join(samples))
