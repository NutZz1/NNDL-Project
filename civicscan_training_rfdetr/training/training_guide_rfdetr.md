# Training Guide — Member 1 — RF-DETR

You are training the main model of the project. Use the biggest GPU available
(the RTX 4060).

This guide assumes you have never done this before. Follow it top to bottom.
Do not skip steps 5 and 6 — everything else depends on them.

---

## Before you begin

One person in the team must have already created the dataset splits. If that
has not happened yet, wait — you cannot start without them.

That person runs this once, in `civicscan-model/data_pipeline`:

```bash
python validate_schema.py --dataset output/merged.json
python split_dataset.py --dataset output/merged.json --out-dir output/splits --val-frac 0.15 --test-frac 0.15 --seed 42
python class_balance_stats.py --dataset output/splits/train.json --out output/class_weights.json
```

and then shares two folders with you:

| Folder | Size | What it is |
|---|---|---|
| `output/splits/` | ~34 MB | `train.json`, `val.json`, `test.json` |
| `raw_dataset/` | ~30 GB | the actual photographs |

The splits must contain exactly these counts. If they do not, tell the team and
do not start training.

| File | Images | Annotations |
|---|---:|---:|
| `train.json` | 22,870 | 34,155 |
| `val.json` | 4,718 | 7,136 |
| `test.json` | 4,672 | 7,001 |

---

## Step 1 — Unzip your bundle

Unzip `civicscan_training_rfdetr.zip` inside the `civicscan-model` folder.

You should end up with this:

```
civicscan-model/
├── data_pipeline/              (this already existed)
└── training/                   (new, from your zip)
    ├── README.md               general reference
    ├── README_MEMBER.md        your model in detail
    ├── training_guide.md       this file
    ├── requirements-train.txt
    ├── configs/
    │   ├── base.yaml           <-- the ONLY file you will edit
    │   ├── rfdetr.yaml         your model's settings
    │   ├── rtdetr.yaml
    │   └── yolov11.yaml
    ├── civicscan/              the code. Never edit anything in here.
    └── scripts/
        ├── verify_env.py
        ├── test_masking.py
        ├── train.py
        ├── evaluate_test.py
        ├── profile_model.py
        └── make_figures.py
```

---

## Step 2 — Put the dataset somewhere and write down the paths

Copy the two folders you received onto your disk. Anywhere is fine, but write
down the full paths — you need them in Step 4.

Example:

```
D:\civicscan\splits\train.json
D:\civicscan\splits\val.json
D:\civicscan\splits\test.json
D:\civicscan\raw_dataset\
D:\civicscan\class_weights.json
```

---

## Step 3 — Install the software

```bash
cd civicscan-model/training

python -m venv .venv
.venv\Scripts\activate

pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements-train.txt
```

The `--index-url` part is important. Without it, pip installs a version of
PyTorch that cannot use your GPU.

Check it worked:

```bash
python -c "import torch; print(torch.cuda.is_available(), torch.version.cuda)"
```

It must print `True` and a CUDA version number. If it prints `False`, uninstall
torch (`pip uninstall torch torchvision`) and redo the `--index-url` line.

If `pycocotools` fails to install with a compiler error, run
`pip install pycocotools-windows` instead.

---

## Step 4 — Edit exactly one file

Open `configs/base.yaml`. Change only these five lines to your real paths:

```yaml
train_json: "D:/civicscan/splits/train.json"
val_json: "D:/civicscan/splits/val.json"
test_json: "D:/civicscan/splits/test.json"
image_root: "D:/civicscan/raw_dataset"
class_weights: "D:/civicscan/class_weights.json"
```

Two rules:

- Use forward slashes `/` even on Windows. Backslashes break YAML.
- `image_root` is the folder that the image names inside the JSON are measured
  from. If the JSON says `RDD2022/India/00123.jpg`, then `image_root` must be
  the folder that *contains* the `RDD2022` folder.

Do not change anything else in `base.yaml`. Do not change `configs/rfdetr.yaml`.
Do not open anything inside `civicscan/`.

---

## Step 5 — Check your setup

```bash
python scripts/verify_env.py --model rfdetr
```

This prints your GPU, checks the three JSON files have the right counts,
confirms the dataset is intact, and writes `runs/env_report.json`.

**Send `runs/env_report.json` to your group chat.** It records which settings
your GPU chose. If you and Member 3 end up with different settings, the
comparison in the report is not fair — and you need to know that now, not after
four days of training.

If it prints FAIL, stop. Fix the problem before continuing.

---

## Step 6 — Test the most important part of the whole project

```bash
python scripts/test_masking.py
```

It must print **`7/7 passed`**.

### What this is actually testing

Your dataset was built from 8 different public sources. Each source only
labelled the classes it cared about. A litter dataset labelled the litter and
completely ignored the cracks in the same photograph — not because there were
no cracks, but because nobody was looking for them.

Now imagine training normally. The model looks at a litter photo, correctly
spots a crack, and gets punished for it, because there is no crack label in
that photo. Do that a few thousand times and the model learns to stop finding
cracks whenever the scene looks like a litter photo.

The fix is called masking: for each photo, only compute the loss over the
classes that photo's *source dataset* was capable of labelling. Everything else
is ignored — not counted as right, not counted as wrong.

This test proves the masking is switched on and working. **If it fails,
everything you train afterwards is worthless.** Stop and tell the team.

---

## Step 7 — Run the ablation FIRST

This is your special job, and it is the most important experiment in the whole
project. Do it **before** the long training run.

Two short runs, 20 epochs each:

```bash
python scripts/train.py --config configs/rfdetr.yaml --epochs 20 --run-dir runs/abl_mask_on

python scripts/train.py --config configs/rfdetr.yaml --epochs 20 --no-masking --run-dir runs/abl_mask_off
```

The first run is normal. The second deliberately switches off the masking you
just tested in Step 6.

When both finish, open these two files:

```
runs/abl_mask_on/summary.json
runs/abl_mask_off/summary.json
```

Compare the value called `best_val_mAP5095` in each.

### Why this matters

The team spent a huge amount of effort merging 8 disjoint datasets and building
the `valid_categories` system. This experiment is the *only* evidence that the
effort was worth it. Without it, the masking is just a claim.

Do it early. If the difference turns out to be small, you want to discover that
in week 1, not the night before submission. And if it is small — report it
honestly. An honest null result on your own contribution is worth far more than
a claim your numbers do not support.

---

## Step 8 — The real training run

```bash
python scripts/train.py --config configs/rfdetr.yaml
```

You do not need to set batch size, image size or anything else. The code reads
how much memory your GPU has and picks them for you. On an 8 GB card you will
get RF-DETR-Small at 560 pixels, batch size 2, with gradient accumulation so
the effective batch is 16.

The first time you run this, it downloads the DINOv2 backbone weights from the
internet — a few hundred megabytes. It is cached afterwards.

Training stops automatically when the model stops improving. This takes hours.
Do not close the terminal. Turn off sleep mode on the laptop.

### If it runs out of memory

The code catches this, lowers the settings, and retries — up to 3 times. It
records what happened in `runs/rfdetr/vram_ladder.json`.

If it still fails after that, set the values yourself:

```bash
python scripts/train.py --config configs/rfdetr.yaml --batch 1 --resolution 448
```

Write down that you did this. It goes in the report.

### There is no resume

If the run crashes, you start over. `runs/rfdetr/last.pt` can be evaluated but
not continued.

---

## Step 9 — Final evaluation. Run this ONCE.

```bash
python scripts/evaluate_test.py --config configs/rfdetr.yaml --ckpt runs/rfdetr/best.pt --no-mask-eval

python scripts/profile_model.py --config configs/rfdetr.yaml
```

**Run the first command only one time, at the very end.**

The test set is a final exam. Model selection already happened on the
validation set during training. If you keep running the test set and report
your best score, the score means nothing — you have just fitted to the test
set, which is one of the most basic mistakes in machine learning.

The `--no-mask-eval` flag also reports the unmasked numbers. The gap between
masked and unmasked is itself worth a sentence in your report.

---

## Step 10 — Files to hand to the group

From `runs/rfdetr/`:

| File | What it holds |
|---|---|
| `config.json` | every setting used |
| `autoconfig.json` | which GPU settings were chosen |
| `train_log.csv` | metrics for every epoch |
| `summary.json` | best epoch, epochs run |
| `test_eval.json` | your final test numbers |
| `profile.json` | parameters, GFLOPs, speed, memory |
| `vram_ladder.json` | only exists if you hit out-of-memory |

Also send:

- `runs/env_report.json`
- both ablation folders from Step 7
- 20 screenshots of predictions: 10 where it worked, 10 where it failed
- a short note (about 200 words) on anything you changed and why

`best.pt` is large — share it by link, not through git.

---

## Step 11 — What to write in the report

`README_MEMBER.md` has your architecture diagram, your full settings table and
your novelty claim written out. Use it.

Your sections:

1. **Why RF-DETR.** A transformer looks at the whole image at once, so a long
   thin crack running across the frame is a single thing to it. A CNN sees
   small local patches and has to stitch it together layer by layer. Also,
   DINOv2's self-supervised pretraining transfers better to small datasets than
   ordinary supervised ImageNet features.
2. **Architecture diagram.** Redraw it neatly in draw.io or on paper. Do not
   paste the text version from `README_MEMBER.md`.
3. **Settings table**, filled in with the real numbers from `profile.json`.
4. **Training curves** — loss going down, mAP going up, best epoch marked.
5. **Per-class accuracy.** Note that `manhole_missing` only has 104 instances
   in the test set, so its number will jump around between runs. Say that
   rather than presenting it as solid.
6. **The ablation result from Step 7.** This is your headline. Lead with it.
7. **The masked vs unmasked gap** from `--no-mask-eval`.
8. **Failure modes** from your 20 screenshots. Look for: wet road reflections
   read as cracks, shadow edges read as cracks, tar patches read as potholes,
   drain gratings read as manholes.

### Things you must state honestly

- This is a reimplementation in plain PyTorch, not the official Roboflow
  RF-DETR checkpoint. Your absolute mAP will be lower than published figures.
  What the project claims is the *relative* comparison between the three
  models, not a state-of-the-art number.
- Cross-attention here is standard multi-head attention, not deformable
  attention. Deformable attention needs a compiled CUDA extension, which the
  pure-PyTorch requirement rules out. This costs some accuracy and speed.
- Evaluation is masked, which is not the standard COCO protocol. Report both
  numbers and explain why.
- Your model starts from pretrained DINOv2 weights. Member 2's YOLO starts from
  scratch. A raw accuracy gap between you is partly that, not purely
  architecture.

---

## The three rules

1. If `test_masking.py` does not print `7/7 passed`, stop. Nothing after it is
   valid.
2. Run `evaluate_test.py` exactly once, at the very end.
3. Never edit anything inside `civicscan/`. All three of you run identical code
   — that is the only reason the three results can be compared at all.
