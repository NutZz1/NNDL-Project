# Member 1 — RF-DETR (vision transformer)

**Your model is the primary one.** Read `README.md` for setup; this file is
your model, your commands, your deliverables and your report content.

Run this on the largest GPU available. If your card is 8 GB you will land on
tier `sm`: RF-DETR-Small at 560px, batch 2, accumulation 8.

---

## Commands

```bash
python scripts/verify_env.py --model rfdetr
python scripts/test_masking.py                       # must print 7/7 passed

python scripts/train.py --config configs/rfdetr.yaml

python scripts/evaluate_test.py --config configs/rfdetr.yaml \
    --ckpt runs/rfdetr/best.pt --no-mask-eval
python scripts/profile_model.py --config configs/rfdetr.yaml
```

Plus the ablation, which is yours and is the most important experiment in the
project:

```bash
python scripts/train.py --config configs/rfdetr.yaml --epochs 20 --run-dir runs/abl_mask_on
python scripts/train.py --config configs/rfdetr.yaml --epochs 20 --no-masking --run-dir runs/abl_mask_off
```

First run downloads DINOv2 weights from torch.hub — needs internet, a few
hundred MB, cached afterwards. `--no-pretrained` trains from scratch if the
download fails, but say so in the report; the result will be much worse.

---

## Architecture

```
Input 560x560x3   (multiple of 14, the ViT patch size)
   |
DINOv2 ViT-S/14 backbone, self-supervised on LVD-142M
   patch embed 14x14 -> 40x40 = 1600 tokens
   12 blocks x [ MHSA(6 heads) -> MLP ]
   intermediate layers {3, 7, 11} extracted
   |
3-level pyramid: reshape tokens to 384x40x40, then avgpool /2 and /4
   |
1x1 conv + GroupNorm -> 256-d at three scales, + level embedding
   |
DETR decoder, 6 layers, 300 learnable queries
   self-attn -> multi-head cross-attn over concatenated multi-scale tokens -> FFN
   |
class head (8 logits)          box head (MLP, cxcywh, sigmoid)
   |
MASKED Hungarian matching  ->  Focal(0.25, 2) x2 + L1 x5 + GIoU x2
   aux losses on all 5 earlier decoder layers, each masked identically
   |
NMS-free
```

## Profile for the report

| Field | Value |
|---|---|
| Backbone | DINOv2 ViT-S/14, self-supervised (LVD-142M) |
| Embed dim | 384 backbone / 256 decoder |
| Decoder | 6 layers, 8 heads, FFN 1024 |
| Queries | 300 |
| Input | 560x560 (tier-dependent) |
| Optimizer | AdamW |
| LR | 1e-4 head, 1.5e-5 backbone |
| Weight decay | 1e-4 |
| Schedule | 3-epoch warmup, cosine to 1% |
| Batch | 2 x accum 8 = 16 effective |
| Epochs | 60, patience 10 |
| Loss | 2*Focal + 5*L1 + 2*GIoU, class-weighted, masked |
| Grad clip | 0.1 |
| EMA | decay 0.9998 |
| Post-processing | none (NMS-free) |
| Params | read from `profile.json` |

---

## Your novelty claim

**Masked Hungarian matching for training a single detector on disjoint,
non-overlapping label sets.**

Eight public datasets annotate different, non-overlapping class subsets. No
image is labelled for all 8 classes. Standard DETR training would punish every
correct prediction of an unannotated class as a false positive. Two masking
points make it valid: the matcher's cost matrix (an invalid class can never be
matched to a query) and the classification loss including its background term.

`runs/abl_mask_on` vs `runs/abl_mask_off` is the evidence. Report the delta.
If it is small, say so — an honest null result on your own contribution is
worth more than a claim the numbers do not support.

## Why RF-DETR was chosen

Global self-attention spans the whole frame, which suits long thin defects — a
longitudinal crack can run across most of the image, and a CNN's local
receptive field has to stitch it together across layers. DINOv2's
self-supervised pretraining also transfers better to small datasets than
supervised ImageNet features. Whether either advantage actually materialises is
what F8 (AP vs object size) and the RF-DETR vs RT-DETR comparison test.

## What to write up

1. Justification above, in your own words.
2. The architecture diagram — redraw it, do not paste the ASCII.
3. The profile table with real params/GFLOPs/latency from `profile.json`.
4. F1-F5 convergence curves and the best epoch.
5. Per-class AP, with `manhole_missing` flagged as unstable (104 test instances).
6. **T4, the masking ablation** — your headline result.
7. The masked-vs-unmasked eval gap from `--no-mask-eval`.
8. Failure modes from your 20 qualitative images: wet-road reflections, shadow
   edges, tar patches, drain gratings.
