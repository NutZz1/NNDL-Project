"""
Shared bbox clipping.

Every converter that denormalizes or copies source coordinates can emit a box
that pokes outside the image, and validate_schema.py rejects those. Two
different causes, both real in our data:

  - Float noise: RDD2022's YOLO labels denormalize to x = -0.0003 on 4 boxes.
    Nothing is wrong with the annotation, it is just arithmetic.
  - Genuinely out-of-frame annotations: 7 TACO boxes start up to 1.3 px above
    the top edge, because the original annotator dragged past the border.

Both are fixed the same way — clamp to the image rectangle — but they must be
distinguishable in the run summary, so clip_bbox reports how far it moved
things and callers print a summary. A box clipped by a large amount is worth
looking at by hand; a box clipped by 0.0003 px is not.
"""

# Overshoot below this many pixels is pure floating-point noise, not an
# annotation that genuinely ran off the edge of the image.
FLOAT_NOISE_PX = 0.01


def clip_bbox(x, y, w, h, img_w, img_h, min_size=1e-6):
    """
    Clamp a COCO [x, y, w, h] box to the image rectangle.

    Returns (bbox, overshoot) where bbox is the clipped [x, y, w, h] (or None
    if the box lies entirely outside the image, or collapses to zero size),
    and overshoot is how many pixels the worst edge stuck out before
    clipping (0.0 if the box was already inside).
    """
    x0, y0 = x, y
    x1, y1 = x + w, y + h

    overshoot = max(-x0, -y0, x1 - img_w, y1 - img_h, 0.0)

    x0 = min(max(x0, 0.0), img_w)
    y0 = min(max(y0, 0.0), img_h)
    x1 = min(max(x1, 0.0), img_w)
    y1 = min(max(y1, 0.0), img_h)

    new_w, new_h = x1 - x0, y1 - y0
    if new_w <= min_size or new_h <= min_size:
        return None, overshoot
    return [x0, y0, new_w, new_h], overshoot


class ClipStats:
    """Counts what clip_bbox did, so a converter can report it in one line."""

    def __init__(self):
        self.noise = 0        # clipped by less than FLOAT_NOISE_PX
        self.real = 0         # clipped by a visible amount
        self.dropped = 0      # box was entirely outside the image
        self.worst = 0.0

    def record(self, bbox, overshoot):
        if overshoot <= 0.0:
            return
        self.worst = max(self.worst, overshoot)
        if bbox is None:
            self.dropped += 1
        elif overshoot < FLOAT_NOISE_PX:
            self.noise += 1
        else:
            self.real += 1

    def summary(self) -> str:
        if not (self.noise or self.real or self.dropped):
            return "all boxes already inside image bounds"
        return (f"clipped {self.noise} boxes for float noise (<{FLOAT_NOISE_PX}px), "
                f"{self.real} that genuinely ran off the edge, dropped "
                f"{self.dropped} entirely-outside boxes; worst overshoot "
                f"{self.worst:.3f}px")
