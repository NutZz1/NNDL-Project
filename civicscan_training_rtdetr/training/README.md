# CivicScan — Model Training

End-to-end training, evaluation and reporting for the CivicScan urban decay
detector. Pure PyTorch. Three architectures share one dataset, one loss-masking
scheme, one training loop and one evaluation protocol, so the three runs can be
compared against each other rather than against three different setups.

Dataset comes from `civicscan-model/data_pipeline` — 8 classes, 8 sources,
32,260 images, 48,292 annotations, group-aware 70/15/15 split at seed 42.

---

## 0. What is in here

```
training/
├── README.md                  this file
├── README_MEMBER.md           your model, your steps, your deliverables
├── requirements-train.txt
├── configs/
│   ├── base.yaml              shared: paths, seed, eval protocol, schedule
│   ├── rfdetr.yaml            Member 1
│   ├── rtdetr.yaml            Member 3 — identical to rfdetr except backbone
│   └── yolov11.yaml           Member 2
├── civicscan/
│   ├── schema.py              locked 8-class taxonomy, mirrors the data pipeline
│   ├── masking.py             valid_categories masking primitives
│   ├── autoconfig.py          GPU detection -> variant/resolution/batch/AMP
│   ├── data/                  dataset, transforms, collate, class weights
│   ├── models/                rfdetr, rtdetr, yolov11, losses, matcher, boxes
│   └── engine/                train loop, masked COCO eval, CSV logger
└── scripts/
    ├── verify_env.py          run FIRST
    ├── test_masking.py        run SECOND — 7 assertions, must all pass
    ├── train.py               the training run
    ├── evaluate_test.py       final test-split eval, run ONCE
    ├── profile_model.py       params, GFLOPs, latency, FPS, VRAM
    └── make_figures.py        F1-F8 and T1/T2 from the three CSVs
```

---

## 1. The one thing that must not be got wrong

Every image carries `valid_categories`: the classes its **source dataset** is
capable of annotating. A TACO image is annotated for litter only. It almost
certainly also contains road cracks, which nobody labelled.

If classification loss is computed over all 8 classes on that image, every
correct crack prediction is punished as a false positive, and the model is
actively trained not to detect cracks in litter-like scenes.

So classification loss, the background term, the Hungarian matcher and the
TaskAligned assigner are all masked per image. `scripts/test_masking.py` proves
it with 7 assertions. **Run it before every real training run.** If it fails,
every number the run produces is invalid.

Box regression is not masked — it is only computed on matched ground truth,
which is valid by construction.

Evaluation is masked too: a prediction of class *k* on an image where *k* is
invalid is neither a true nor a false positive, it is discarded. This is a
non-standard protocol and must be stated in the report.

---

## 2. Setup

Windows, Python 3.11, NVIDIA GPU. Install PyTorch from the CUDA index first,
then the rest.

```bash
cd civicscan-model/training
python -m venv .venv
.venv\Scripts\activate

pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements-train.txt

python -c "import torch; print(torch.cuda.is_available(), torch.version.cuda)"
```

`pycocotools` needs a C compiler on Windows. If it fails to build, install
`pycocotools-windows` instead, or install Microsoft C++ Build Tools.

---

## 3. Get the dataset

The split JSONs are **not in git** — 34 MB, regenerated deterministically.
Follow `data_pipeline/README.md` steps 0-2. Seed 42 reproduces exactly:

| Split | Images | Annotations |
|---|---:|---:|
| train | 22,870 | 34,155 |
| val | 4,718 | 7,136 |
| test | 4,672 | 7,001 |

Then edit `configs/base.yaml` so `train_json`, `val_json`, `test_json`,
`image_root` and `class_weights` point at your local copies. `image_root` is
the directory the `file_name` fields in the JSON are relative to.

---

## 4. Verify before training

```bash
python scripts/verify_env.py --model rfdetr        # your model here
python scripts/test_masking.py
```

The first prints your GPU, checks the three split JSONs against the expected
counts, and verifies every annotation's `category_id` is inside its image's
`valid_categories`. It writes `runs/env_report.json` — send that to the team.

The second must print `7/7 passed`. Do not train if it does not.

---

## 5. Train

```bash
python scripts/train.py --config configs/rfdetr.yaml
```

Nothing hardware-specific needs setting. `autoconfig.py` reads your GPU's VRAM
and picks the variant, resolution, batch size, gradient accumulation, AMP dtype
(bf16 on RTX 30xx/40xx, fp16 below) and dataloader worker count:

| VRAM | Tier | RF-DETR | RT-DETR | YOLOv11 |
|---|---|---|---|---|
| ≥23 GB | xl | base @644 bs8 | rtdetr-l @644 bs8 | yolo11m @640 bs32 |
| ≥15 GB | lg | base @560 bs4 | rtdetr-l @560 bs4 | yolo11s @640 bs24 |
| ≥11 GB | md | small @560 bs4 | rtdetr-l @560 bs4 | yolo11s @640 bs16 |
| ≥7 GB | sm | small @560 bs2 | rtdetr-l @560 bs2 | yolo11s @640 bs8 |
| ≥5 GB | xs | nano @448 bs2 | rtdetr-r18 @448 bs2 | yolo11n @512 bs8 |
| <5 GB | tiny | nano @392 bs1 | rtdetr-r18 @392 bs1 | yolo11n @512 bs4 |

Gradient accumulation is solved automatically to an effective batch of 16 on
every tier, so the optimizer sees the same batch regardless of card. RF-DETR
and RT-DETR are pinned to the same resolution and batch at every tier — that
identity is the experimental control and must not be broken.

If it still OOMs, the loop catches it, drops one tier, and retries up to three
times, recording what happened in `runs/<model>/vram_ladder.json`.

Manual overrides if you need them:

```bash
python scripts/train.py --config configs/rfdetr.yaml \
    --gpu 1 --batch 1 --resolution 448 --variant nano --epochs 40
```

Resume is not implemented. `last.pt` is written every epoch, so a crashed run
can be evaluated but not continued.

### The ablation

One extra short run, and it is the single most important experiment in the
project — it is the only evidence that the data pipeline's central design
decision was worth making.

```bash
python scripts/train.py --config configs/rfdetr.yaml --epochs 20 --run-dir runs/abl_mask_on
python scripts/train.py --config configs/rfdetr.yaml --epochs 20 --no-masking --run-dir runs/abl_mask_off
```

Run it early. If masking shows no effect, you want to know in week 1.

---

## 6. Evaluate and profile

```bash
python scripts/evaluate_test.py --config configs/rfdetr.yaml --ckpt runs/rfdetr/best.pt
python scripts/profile_model.py --config configs/rfdetr.yaml
```

**Touch `test.json` once, at the very end.** Model selection is on `val.json`.
Evaluating on test repeatedly and picking the best number is test-set fitting
and invalidates the result.

`--no-mask-eval` additionally reports the unmasked numbers. The gap between
masked and unmasked is itself worth a line in the report.

---

## 7. Figures and tables

Collect all three members' `runs/<model>/` folders into one directory, then:

```bash
python scripts/make_figures.py --runs figures --out figures/out
```

Produces F1 train loss, F2 val loss, F3 val mAP with the best epoch marked,
F4 loss components, F5 LR schedule, per-class AP bars, F8 AP-vs-object-size,
and T1/T2 as `tables.md`.

F6 (PR curves), F7 (confusion matrix) and F9 (qualitative grid) need
per-detection data rather than the epoch CSV and are not generated here.

---

## 8. Convergence criterion

Applied identically to all three runs, so "converged" means the same thing for
everyone:

> val mAP@50-95 improves by less than 0.002 absolute over 10 consecutive
> epochs, **and** val loss has not risen for 10 epochs.

A hard early stop also fires after 25 epochs with no mAP improvement. Best
checkpoint is selected by val mAP@50-95, never by val loss.

---

## 9. What to hand back

| File | From |
|---|---|
| `runs/<model>/config.json` | training |
| `runs/<model>/autoconfig.json` | the resolved hardware config |
| `runs/<model>/train_log.csv` | per-epoch metrics, one schema for all three |
| `runs/<model>/summary.json` | best epoch, epochs run |
| `runs/<model>/test_eval.json` | final test evaluation |
| `runs/<model>/profile.json` | params, GFLOPs, latency, FPS, VRAM |
| `runs/<model>/vram_ladder.json` | only if OOM backoff fired |
| `runs/env_report.json` | verify_env output |
| `best.pt` | share by link, not git |
| 20 qualitative images | 10 successes, 10 failures |
| 200-word note | what you changed and why |

---

## 10. Honest caveats to carry into the report

These are the things a reviewer will ask about. State them rather than being
caught by them.

- **These are reimplementations.** The architectures, losses and assigners
  follow the published designs, but they are not the official Roboflow RF-DETR
  or Ultralytics YOLOv11 checkpoints. Absolute mAP will be below published
  numbers. The *relative* comparison is what this project claims.
- **Cross-attention is standard multi-head, not deformable.** Deformable
  attention needs a CUDA extension; this is pure PyTorch. Cost: slower
  convergence, more memory.
- **Pretraining is not matched.** RF-DETR starts from DINOv2 self-supervised
  weights, RT-DETR from ImageNet-supervised weights, YOLOv11 from scratch. A
  raw mAP gap therefore does not isolate architecture. The data pipeline README
  already flags this. RF-DETR vs RT-DETR is the closer comparison because the
  head is identical, but the pretraining corpus still differs.
- **Evaluation is masked**, which is non-standard. Report both numbers.
- **`manhole_missing` has 104 test instances.** Its per-class AP will swing
  considerably between runs. Report it with that caveat, not as a stable value.
- **Crackseg9k polygons are used as boxes.** Segmentation is not trained, so
  all three models see identical targets.
- **`crack_structural` is 66% wall façades and 24% one bridge campaign.** Do
  not claim general structural-damage coverage.
- **One litter source is largely fixed-CCTV footage**, so its annotation count
  overstates the number of independent scenes.
- **If two members end on different VRAM tiers**, the comparison is not
  resolution-controlled. `autoconfig.json` records the tier for every run —
  put it in T1 as a visible column and address it in the discussion.
