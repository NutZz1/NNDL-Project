"""Per-class loss weights from data_pipeline/output/class_weights.json.

The file keys weights by COCO category id (1..8) as strings. They are remapped
to 0-indexed model order here. Raw and capped are currently identical in the
repo (the spread fits inside the 10x median cap).
"""

import json

import torch

from ..schema import CAT_ID_TO_IDX, NUM_CLASSES


def load_class_weights(path, key="capped_loss_weights_by_category_id",
                       normalize=True, device=None):
    with open(path, "r") as f:
        d = json.load(f)
    if key not in d:
        raise KeyError(f"{key} not in {path}; keys present: {sorted(d)}")
    w = torch.ones(NUM_CLASSES, dtype=torch.float32)
    for cid, val in d[key].items():
        idx = CAT_ID_TO_IDX.get(int(cid))
        if idx is not None:
            w[idx] = float(val)
    if normalize:
        w = w / w.mean()
    return w.to(device) if device else w


def load_class_counts(path, key="counts_by_category_id"):
    with open(path, "r") as f:
        d = json.load(f)
    c = torch.zeros(NUM_CLASSES, dtype=torch.long)
    for cid, val in d[key].items():
        idx = CAT_ID_TO_IDX.get(int(cid))
        if idx is not None:
            c[idx] = int(val)
    return c
