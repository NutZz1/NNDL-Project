"""
Perceptual image hashing, used for cross-source and within-source dedup.

Why this exists: Roboflow Universe is full of re-uploads. Measured overlap
against our existing sources:

    test-iqa6e/manhole-e0p0b       58/58 sampled images identical  (rejected)
    memetor/manhole-734ej          35/40                            (rejected)
    123-g4ip5/-rqltz               17/40  -> 42% duplicate          (kept, dedup)
    manhole-projet/manhole-g8rvh    2/78  ->  3% duplicate          (kept)
    taco-2we3b/taco-litter         33/60  -> superset of our pull   (replaces it)

A duplicate photo that lands in two sources is worse than a wasted image:
the group-aware splitter keys on filename, so the same photo can end up in
train AND test, silently inflating reported mAP. Every multi-source
converter therefore dedups.

dHash (difference hash) is used rather than a cryptographic hash because
these are re-encodings: the same photo arrives resized, recompressed, and
sometimes re-oriented. dHash is stable under all three. Distance <= 8 bits
out of 64 was calibrated on known-identical pairs, which scored 0-1.
"""

import numpy as np
from PIL import Image

# Bits (of 64) that may differ before two images are considered different
# photos. Known re-encodings of one photo measured 0-1; unrelated photos
# measured >= 20.
DEFAULT_THRESHOLD = 8


def dhash(image, size: int = 8) -> bytes:
    """64-bit difference hash of a PIL image or an image path."""
    if not hasattr(image, "convert"):
        with Image.open(image) as im:
            return dhash(im, size)
    grey = np.asarray(
        image.convert("L").resize((size + 1, size), Image.LANCZOS),
        dtype=np.int16,
    )
    return np.packbits((grey[:, 1:] > grey[:, :-1]).flatten()).tobytes()


def hamming(a: bytes, b: bytes) -> int:
    return sum(bin(x ^ y).count("1") for x, y in zip(a, b))


class DuplicateIndex:
    """
    Holds hashes of already-accepted images and answers "have I seen this
    photo before?".

    Linear scan: at our scale (tens of thousands of images) this is fast
    enough and keeps the code honest. Swap for a BK-tree if a source ever
    reaches six figures.
    """

    def __init__(self, threshold: int = DEFAULT_THRESHOLD):
        self.threshold = threshold
        self._entries = []          # list[(label, hash)]
        self._exact = {}            # hash -> label, fast path

    def __len__(self):
        return len(self._entries)

    def add(self, label: str, h: bytes):
        self._entries.append((label, h))
        self._exact.setdefault(h, label)

    def add_image(self, label: str, path):
        self.add(label, dhash(path))

    def add_directory(self, directory, exts=(".jpg", ".jpeg", ".png", ".JPG", ".PNG"),
                      predicate=None):
        """
        Index every image under `directory` (recursively). Returns count.

        `predicate(path) -> bool` narrows what gets indexed. Needed because a
        source directory can hold images we deliberately excluded from the
        dataset: Crackseg9k's Images/ folders still contain the road-pavement
        subsets we dropped, and deduping a new source against images that are
        NOT in our data would discard usable annotations for no benefit.
        """
        from pathlib import Path
        n = 0
        for p in sorted(Path(directory).rglob("*")):
            if p.suffix in exts and p.is_file() and (predicate is None or predicate(p)):
                try:
                    self.add_image(str(p), p)
                    n += 1
                except Exception as e:
                    print(f"[dedup] [warn] could not hash {p}: {e}")
        return n

    def find(self, h: bytes):
        """Returns (label, distance) of the closest match within threshold, else None."""
        hit = self._exact.get(h)
        if hit is not None:
            return hit, 0
        best = None
        for label, existing in self._entries:
            d = hamming(h, existing)
            if d <= self.threshold and (best is None or d < best[1]):
                best = (label, d)
                if d == 0:
                    break
        return best
