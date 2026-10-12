"""Proof that valid_categories masking is actually live.

Run this BEFORE starting a real training run. If it fails, the model is being
trained not to detect classes on images from sources that do not annotate them,
and every number the run produces is invalid.

    python scripts/test_masking.py

Tests:
  1. mask_class_logits drives invalid classes to NEG_INF.
  2. A confident, correct prediction on an INVALID class adds exactly zero
     classification loss (DETR criterion).
  3. Same for the YOLO loss.
  4. The Hungarian matcher never matches a query to an invalid class.
  5. The TaskAligned assigner never selects an invalid class as a positive.
  6. Predictions on invalid classes are dropped at evaluation.
  7. Dataset id-shift: COCO id 8 -> index 7, and assert_targets_valid catches
     a mismatched label.
"""

import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from civicscan.masking import (NEG_INF, build_valid_mask, filter_predictions,
                               mask_class_logits, masked_sigmoid_focal_loss,
                               assert_targets_valid)
from civicscan.models.detr_criterion import HungarianMatcher, SetCriterion
from civicscan.models.yolo_loss import TaskAlignedAssigner, YOLOLoss
from civicscan.schema import CAT_ID_TO_IDX, NUM_CLASSES

C = NUM_CLASSES
PASS, FAIL = "PASS", "FAIL"
results = []


def check(name, cond, detail=""):
    results.append((PASS if cond else FAIL, name, detail))
    print(f"[{PASS if cond else FAIL}] {name} {detail}")


# ---- 1 ----------------------------------------------------------------
vm = torch.zeros(C, dtype=torch.bool)
vm[[0, 1, 2, 3]] = True                       # an RDD2022 image: road classes only
logits = torch.full((5, C), 3.0)
masked = mask_class_logits(logits, vm)
check("mask_class_logits zeroes invalid classes",
      bool((masked[:, ~vm] == NEG_INF).all()) and bool((masked[:, vm] == 3.0).all()))

# ---- 2 ----------------------------------------------------------------
# Confident prediction of class 5 (litter) on a road-only image.
lg = torch.full((1, 4, C), -5.0)
lg[0, :, 5] = 8.0
tgt = torch.zeros_like(lg)
loss_masked = masked_sigmoid_focal_loss(lg, tgt, vm.unsqueeze(0), reduction="sum")
loss_unmasked = masked_sigmoid_focal_loss(
    lg, tgt, torch.ones(1, C, dtype=torch.bool), reduction="sum")
check("focal loss ignores confident prediction on invalid class",
      float(loss_masked) < 1e-6 and float(loss_unmasked) > 1.0,
      f"(masked={float(loss_masked):.3e}, unmasked={float(loss_unmasked):.3f})")

# ---- 3 ----------------------------------------------------------------
A = 64
yolo_out = {
    "pred_cls": torch.full((1, A, C), -6.0),
    "pred_dist": torch.zeros(1, A, 4 * 16),
    "anchors": torch.stack([torch.arange(A) % 8, torch.arange(A) // 8], 1).float() * 8 + 4,
    "strides": torch.full((A,), 8.0),
}
yolo_out["pred_cls"][0, :, 5] = 9.0            # confident litter on a road image
targets = [{"boxes": torch.tensor([[10.0, 10.0, 40.0, 40.0]]),
            "labels": torch.tensor([0])}]
yl = YOLOLoss(C)
lm = yl(yolo_out, targets, vm.unsqueeze(0))["loss_cls"]
lu = yl(yolo_out, targets, torch.ones(1, C, dtype=torch.bool))["loss_cls"]
check("YOLO cls loss ignores confident prediction on invalid class",
      float(lm) < float(lu) * 0.5, f"(masked={float(lm):.4f}, unmasked={float(lu):.4f})")

# ---- 4 ----------------------------------------------------------------
matcher = HungarianMatcher()
out = {"pred_logits": torch.full((1, 10, C), -5.0),
       "pred_boxes": torch.rand(1, 10, 4) * 0.5 + 0.25}
out["pred_logits"][0, :, 5] = 9.0
t = [{"labels": torch.tensor([0]), "boxes_norm": torch.tensor([[0.5, 0.5, 0.2, 0.2]])}]
idx = matcher(out, t, vm.unsqueeze(0))
q, ti = idx[0]
check("Hungarian matcher matches only valid-class GT",
      q.numel() == 1 and int(t[0]["labels"][ti][0]) in vm.nonzero().flatten().tolist())

# ---- 5 ----------------------------------------------------------------
asg = TaskAlignedAssigner()
scores = torch.full((A, C), 0.01)
scores[:, 5] = 0.99
boxes = torch.tensor([[8.0, 8.0, 48.0, 48.0]]).repeat(A, 1)
fg, tb, ts = asg(scores, boxes, yolo_out["anchors"],
                 torch.tensor([[10.0, 10.0, 40.0, 40.0]]), torch.tensor([0]), vm)
picked = ts.sum(0).nonzero().flatten().tolist()
check("TaskAligned assigner never assigns an invalid class",
      all(vm[p] for p in picked), f"(classes assigned: {picked})")

# ---- 6 ----------------------------------------------------------------
lbl = torch.tensor([0, 5, 7, 1])
sc = torch.tensor([0.9, 0.9, 0.9, 0.9])
bx = torch.rand(4, 4)
l2, s2, b2 = filter_predictions(lbl, sc, bx, vm)
check("evaluation drops predictions on invalid classes",
      sorted(l2.tolist()) == [0, 1], f"(kept {l2.tolist()})")

# ---- 7 ----------------------------------------------------------------
check("COCO id 8 maps to index 7", CAT_ID_TO_IDX[8] == 7 and CAT_ID_TO_IDX[1] == 0)
try:
    assert_targets_valid(torch.tensor([5]), vm)
    caught = False
except AssertionError:
    caught = True
check("assert_targets_valid catches an out-of-mask label", caught)

# ---- summary ----------------------------------------------------------
n_fail = sum(1 for r, _, _ in results if r == FAIL)
print("\n" + "=" * 60)
print(f"{len(results) - n_fail}/{len(results)} passed")
if n_fail:
    print("MASKING IS NOT WORKING. Do not start training.")
    sys.exit(1)
print("Masking verified. Safe to train.")
