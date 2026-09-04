# Member 3 — RT-DETR (the experimental control)

Read `README.md` for setup; this file is your model, your commands, your
deliverables and your report content.

Your model is the heaviest — ResNet-50 backbone, ~42M params. It needs 8 GB or
more at 560px. On a smaller card autoconfig drops you to `rtdetr-r18`; if that
happens, say so in the report, because the control is then weaker.

---

## Commands

```bash
python scripts/verify_env.py --model rtdetr
python scripts/test_masking.py                       # must print 7/7 passed

python scripts/train.py --config configs/rtdetr.yaml

python scripts/evaluate_test.py --config configs/rtdetr.yaml \
    --ckpt runs/rtdetr/best.pt --no-mask-eval
python scripts/profile_model.py --config configs/rtdetr.yaml
```

---

## Architecture

```
Input 560x560x3
   |
ResNet-50, ImageNet-supervised (stem + layer1 frozen)
   -> C3 /8 (512ch), C4 /16 (1024ch), C5 /32 (2048ch)
   |
1x1 conv + BN -> 256-d at each level
   |
Efficient hybrid encoder
   AIFI : multi-head self-attention on C5 ONLY, where the token count is small
   CCFF : CNN cross-scale fusion, top-down then bottom-up over P3/P4/P5
   |
DETR decoder — IDENTICAL to Member 1's:
   6 layers, 300 queries, 8 heads, FFN 1024, same matcher, same losses
   |
MASKED Hungarian matching -> Focal x2 + L1 x5 + GIoU x2, aux on all layers
   |
NMS-free
```

## Profile for the report

| Field | Value |
|---|---|
| Backbone | ResNet-50, ImageNet-1k supervised (V2 weights) |
| Frozen | stem + layer1 |
| Encoder | AIFI (self-attn on C5) + CCFF (CNN cross-scale fusion) |
| Decoder | 6 layers, 8 heads, FFN 1024 — same as RF-DETR |
| Queries | 300 — same as RF-DETR |
| Input | 560x560 — pinned equal to RF-DETR at every VRAM tier |
| Optimizer | AdamW |
| LR | 1e-4 head, 1e-5 backbone |
| Weight decay | 1e-4 |
| Batch | 2 x accum 8 = 16 effective — same as RF-DETR |
| Epochs | 60, patience 10 — same as RF-DETR |
| Loss | 2*Focal + 5*L1 + 2*GIoU, class-weighted, masked — same as RF-DETR |
| Post-processing | none (NMS-free) |
| Params | read from `profile.json` |

---

## Your novelty claim

**You are the control, and the control is the contribution.**

RF-DETR vs YOLOv11 is a confounded comparison: backbone, head, label
assignment, pretraining and post-processing all differ at once. If RF-DETR
wins, nothing follows about vision transformers.

Your model holds the decoder, query count, matcher, loss weights, resolution,
batch, schedule and masking constant and changes only the backbone and encoder.
That turns "the ViT backbone helped" from an assertion into a falsifiable
claim:

| Comparison | What it isolates |
|---|---|
| RF-DETR vs YOLOv11 | nothing cleanly — everything differs |
| **RF-DETR vs RT-DETR** | **the backbone, because the head is identical** |
| RT-DETR vs YOLOv11 | DETR head vs CNN head, both on CNN backbones |

Verify the control actually held before writing it up. Compare
`runs/rfdetr/autoconfig.json` against `runs/rtdetr/autoconfig.json`:
`resolution`, `batch`, `accum`, `queries` and `epochs` must match. If your card
forced a different tier, the control is broken and you must report the
comparison as approximate.

**Residual confound to state:** DINOv2 is self-supervised on LVD-142M, ResNet-50
is supervised on ImageNet-1k. Even with an identical head, pretraining corpus
and objective still differ. The comparison is much tighter than RF-DETR vs
YOLO, but it is not perfectly clean. Say so.

## Why RT-DETR was chosen

Beyond the control role, it is a real architecture with a real design idea: the
hybrid encoder applies attention only at the level where it is cheap (C5, the
smallest feature map) and uses convolutional fusion everywhere else. That is a
different answer to the same question RF-DETR asks — how much attention does a
detector actually need — and it is worth reporting on its own terms, not only
as a baseline.

## What to write up

1. The control argument above — this is your main section, lead with it.
2. The architecture diagram, with AIFI and CCFF drawn explicitly.
3. The profile table with real params/GFLOPs/latency from `profile.json`.
4. F1-F5 convergence curves and the best epoch.
5. **The verification that the control held** — the autoconfig.json comparison.
6. Per-class AP, with `manhole_missing` flagged as unstable.
7. The three-way attribution table above, filled in with your actual numbers.
8. The aux-loss observation: all 6 decoder layers are supervised and masked.
   If you have time, an ablation with `aux_loss: false` in the config is a
   cheap extra result.
