# Training Guide — Member 2 — YOLOv11

You are training the CNN baseline. It is the lightest of the three models, so
it suits the smaller GPU.

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

Unzip `civicscan_training_yolov11.zip` inside the `civicscan-model` folder.

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
    │   ├── yolov11.yaml        your model's settings
    │   ├── rfdetr.yaml
    │   └── rtdetr.yaml
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

Do not change anything else in `base.yaml`. Do not change `configs/yolov11.yaml`.
Do not open anything inside `civicscan/`.

---

## Step 5 — Check your setup

```bash
python scripts/verify_env.py --model yolov11
```

This prints your GPU, checks the three JSON files have the right counts,
confirms the dataset is intact, and writes `runs/env_report.json`.

**Send `runs/env_report.json` to your group chat, and tell them exactly how
much VRAM your GPU has** — it is printed at the top of the output. That number
decides which model size you get, and whether the final three-way comparison in
the report is fair.

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

### Why this is harder in your model than in the other two

The other two members use a Hungarian matcher, which pairs one prediction to
one object. Easy to mask — there is one cost table to patch.

Your model uses a **TaskAligned assigner**, which is one-to-many: it looks at
every grid cell and every one of the 8 classes at the same time, scores them
all with `score^alpha × IoU^beta`, and picks the top 10. The masking has to
happen *before* that pick. If it happened after, an invalid class would already
have won grid cells and the protection would be bypassed entirely.

Tests 3 and 5 in `test_masking.py` check exactly this. Quote their result in
your report — that is your evidence.

**If it fails, everything you train afterwards is worthless.** Stop and tell
the team.

---

## Step 7 — Train

```bash
python scripts/train.py --config configs/yolov11.yaml
```

You do not need to set batch size, image size or anything else. The code reads
how much memory your GPU has and picks them for you:

| Your VRAM | Model you get | Image size | Batch |
|---|---|---|---|
| 4 GB | yolo11n | 512 | 4 |
| 6 GB | yolo11n | 512 | 8 |
| 8 GB | yolo11s | 640 | 8 |
| 12 GB | yolo11s | 640 | 16 |

Gradient accumulation makes the effective batch 16 in every case, so the
optimizer sees the same batch regardless of your card.

The default is 100 epochs, which is more than the other two members get. That
is because your model trains **from scratch** — there are no pretrained weights
for a from-scratch reimplementation, while RF-DETR and RT-DETR both start from
pretrained backbones. This is a real disadvantage and it must be stated in your
report.

Training stops automatically when the model stops improving. This takes hours.
Do not close the terminal. Turn off sleep mode on the laptop.

If it is taking too long, cut it down:

```bash
python scripts/train.py --config configs/yolov11.yaml --epochs 60
```

and write down that you did.

### If it runs out of memory

The code catches this, lowers the settings, and retries — up to 3 times,
recorded in `runs/yolov11/vram_ladder.json`. If it still fails, set the values
yourself:

```bash
python scripts/train.py --config configs/yolov11.yaml --batch 4 --resolution 512
```

### There is no resume

If the run crashes, you start over. `runs/yolov11/last.pt` can be evaluated but
not continued.

---

## Step 8 — Final evaluation. Run this ONCE.

```bash
python scripts/evaluate_test.py --config configs/yolov11.yaml --ckpt runs/yolov11/best.pt --no-mask-eval

python scripts/profile_model.py --config configs/yolov11.yaml
```

**Run the first command only one time, at the very end.**

The test set is a final exam. Model selection already happened on the
validation set during training. If you keep running the test set and report
your best score, the score means nothing — you have just fitted to the test
set, which is one of the most basic mistakes in machine learning.

The second command matters more for you than for anyone else. It measures
speed (FPS), size (parameters, GFLOPs) and memory. Your model's entire argument
is that it is small and fast enough to actually run on a camera bolted to a
garbage truck. You need those numbers.

---

## Step 9 — Files to hand to the group

From `runs/yolov11/`:

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
- 20 screenshots of predictions: 10 where it worked, 10 where it failed
- a short note (about 200 words) on anything you changed and why

`best.pt` is large — share it by link, not through git.

---

## Step 10 — What to write in the report

`README_MEMBER.md` has your architecture diagram, your full settings table and
your novelty claim written out. Use it.

Your sections:

1. **Why YOLOv11.** It is the speed floor and the deployment-realistic option.
   CivicScan is meant to run on cameras mounted on municipal vehicles, so
   latency and model size are not side issues. It is also the CNN arm of the
   project's central question: do transformer detectors actually help on thin,
   small urban defects, or does a well-tuned CNN match them for a fraction of
   the cost?
2. **Architecture diagram.** Redraw it neatly. Show the CSP backbone with C3k2
   blocks, SPPF, C2PSA, the PAN-FPN neck and the decoupled head. Do not paste
   the text version.
3. **Settings table**, filled in with the real numbers from `profile.json`.
4. **Training curves** — loss going down, mAP going up, best epoch marked.
5. **Per-class accuracy.** Note that `manhole_missing` only has 104 instances
   in the test set, so its number will jump around between runs.
6. **Your strongest section: the speed argument.** If your accuracy is only a
   little below RF-DETR but you run three times faster on a fraction of the
   memory, then *you* are the model that should actually be deployed. Make that
   argument explicitly, with the FPS and parameter numbers from `profile.json`.
   Do not bury it.
7. **Your novelty claim:** masking inside a one-to-many assigner. Explain the
   difference from the Hungarian case (Step 6) and quote the test results.
8. **Failure modes** from your 20 screenshots. Look for: wet road reflections
   read as cracks, shadow edges read as cracks, tar patches read as potholes,
   drain gratings read as manholes.

### Things you must state honestly

- **You trained from scratch and the other two did not.** RF-DETR starts from
  DINOv2 self-supervised weights, RT-DETR from ImageNet supervised weights, you
  from random initialisation. Part of any accuracy gap is that, not the
  architecture. Write it down plainly. A reviewer who spots this before you
  mention it will not trust anything else in your section.
- This is a reimplementation in plain PyTorch, not the official Ultralytics
  YOLOv11. Your absolute mAP will be lower than published figures. What the
  project claims is the *relative* comparison between the three models.
- Evaluation is masked, which is not the standard COCO protocol. Report both
  numbers and explain why.

### One more thing to mention: mosaic augmentation

The original project plan proposed using **mosaic** augmentation — stitching
four images into one — as a way to create multi-domain training frames. A
mosaic tile could pair a road quadrant with a litter quadrant, producing the
kind of mixed scene that no real source image contains.

**It is deliberately not implemented.** Each of the four images has a different
`valid_categories` mask, so the composed image needs per-quadrant masking. Get
that subtly wrong and you reintroduce exactly the contamination the whole
project exists to prevent — silently, with no error message.

You have two options:

1. Report the augmentation set as implemented (scale-crop, horizontal flip,
   colour jitter) and list mosaic as future work with the reason above. Safe
   and perfectly defensible.
2. Implement per-quadrant masking properly, add a new assertion to
   `test_masking.py` proving it works, and claim it as extra novelty. Higher
   risk, better payoff.

Do not enable mosaic without the per-quadrant mask.

---

## The three rules

1. If `test_masking.py` does not print `7/7 passed`, stop. Nothing after it is
   valid.
2. Run `evaluate_test.py` exactly once, at the very end.
3. Never edit anything inside `civicscan/`. All three of you run identical code
   — that is the only reason the three results can be compared at all.
