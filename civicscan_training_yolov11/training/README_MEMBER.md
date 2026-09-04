# Member 2 — YOLOv11 (CNN baseline)

Read `README.md` for setup; this file is your model, your commands, your
deliverables and your report content.

Yours is the lightest model, so it suits the smaller GPU. On a 4 GB card you
will land on tier `tiny` (yolo11n at 512px, batch 4); on 6 GB, `xs`; on 8 GB,
`sm` (yolo11s at 640px, batch 8).

---

## Commands

```bash
python scripts/verify_env.py --model yolov11
python scripts/test_masking.py                       # must print 7/7 passed

python scripts/train.py --config configs/yolov11.yaml

python scripts/evaluate_test.py --config configs/yolov11.yaml \
    --ckpt runs/yolov11/best.pt --no-mask-eval
python scripts/profile_model.py --config configs/yolov11.yaml
```

100 epochs by default because there are no pretrained weights. If wall-clock
time is a problem, cut to 60 with `--epochs 60` and record that you did.

---

## Architecture

```
Input 640x640x3
   |  Backbone
 Conv(3->c1, s2)
 Conv(s2) -> C3k2                     -> /4
 Conv(s2) -> C3k2 x2                  -> P3 /8
 Conv(s2) -> C3k2 x2                  -> P4 /16
 Conv(s2) -> C3k2 -> SPPF -> C2PSA    -> P5 /32
   |  Neck (PAN-FPN)
 P5 -up-> cat P4 -C3k2-> -up-> cat P3 -C3k2-> N3
 N3 -conv s2-> cat P4 -C3k2-> N4
 N4 -conv s2-> cat P5 -C3k2-> N5
   |  Decoupled heads at N3/N4/N5
 cls branch: Conv-Conv-Conv1x1 -> 8 logits
 reg branch: Conv-Conv-Conv1x1 -> 4 x 16 DFL bins
   |
 MASKED TaskAlignedAssigner (top-k=10, alpha 0.5, beta 6.0)
 loss = 7.5*CIoU + 0.5*BCE(masked) + 1.5*DFL
   |
 batched NMS @ IoU 0.7
```

Anchor-free: every grid cell predicts a distance-to-box distribution, decoded
by the DFL integral over 16 bins.

## Profile for the report

| Field | Value |
|---|---|
| Variant | yolo11s (tier-dependent) |
| Backbone | CSP with C3k2 blocks, SPPF, C2PSA attention |
| Neck | PAN-FPN, three scales /8 /16 /32 |
| Head | Decoupled cls + DFL regression, anchor-free |
| reg_max | 16 |
| Input | 640x640 (tier-dependent) |
| Optimizer | SGD, momentum 0.937, Nesterov |
| LR | 0.01, cosine to 1%, 3-epoch warmup |
| Weight decay | 5e-4 (not applied to norm/bias) |
| Batch | 8 x accum 2 = 16 effective |
| Epochs | 100, hard patience 25 |
| Loss weights | box 7.5, cls 0.5, dfl 1.5 |
| Assigner | TaskAligned, top-k 10, masked |
| Pretrained | **none — trained from scratch** |
| Post-processing | NMS, IoU 0.7 |
| Params | read from `profile.json` |

---

## Your novelty claim

**Masking inside a one-to-many assigner.**

The DETR models mask a one-to-one Hungarian matcher, which is comparatively
easy — one cost matrix, one place to patch. TaskAligned assignment is
one-to-many and vectorised over all anchors at once: the alignment metric
`score^alpha * IoU^beta` has to be zeroed on invalid classes *before* the top-k
selection, or an invalid class wins anchors and the masking is defeated
downstream. Then the BCE, positives and background alike, is masked separately.

Show it works: `scripts/test_masking.py` tests 3 and 5 cover exactly this.
Quote the numbers in the report.

## Note on mosaic augmentation

The earlier project plan proposed mosaic as a cross-domain frame synthesiser —
pairing a road quadrant with a litter quadrant to produce the multi-domain
frames no real source image contains. **It is not implemented here**, because
composing four images with four different `valid_masks` requires per-quadrant
masking, and getting that subtly wrong reintroduces exactly the false-positive
contamination the whole project is built to avoid.

Options, in order of preference:
1. Report the augmentation set as implemented (scale-crop, flip, colour jitter)
   and note mosaic as future work with the reason. Safe and defensible.
2. Implement per-quadrant masking properly, prove it with a new assertion in
   `test_masking.py`, and claim it. Higher risk, better novelty.

Do not enable mosaic without the per-quadrant mask.

## Why YOLOv11 was chosen

It is the speed floor and the deployment-realistic option. CivicScan is meant
to run on cameras mounted on municipal vehicles, so latency and model size are
not secondary. It is also the CNN arm of the project's central research
question: do transformer detectors actually help on thin, small urban defects,
or does a well-tuned CNN match them at a fraction of the cost?

If your mAP lands within a couple of points of RF-DETR at three times the FPS,
**that is the deployment recommendation** regardless of who wins the table.
Make that argument explicitly.

## What to write up

1. Justification above, in your own words.
2. The architecture diagram — redraw it.
3. The profile table with real params/GFLOPs/latency from `profile.json`.
4. F1-F5 convergence curves and the best epoch.
5. Per-class AP, with `manhole_missing` flagged as unstable.
6. **The latency/FPS/VRAM argument** — this is your strongest section.
7. The from-scratch confound: you have no pretrained weights and the other two
   do. Any gap is partly that, not purely architecture. State it plainly.
8. Failure modes from your 20 qualitative images.
