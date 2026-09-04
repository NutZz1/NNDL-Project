# Training Guide — Member 3 — RT-DETR

Your model is the **experimental control**. That is a real job, not a spare-tyre
job — read Step 7 before you start, because the control argument is the whole
point of your section in the report.

Your model is also the heaviest of the three, at roughly 42 million parameters.
It needs 8 GB of VRAM or more to run at full size.

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

Unzip `civicscan_training_rtdetr.zip` inside the `civicscan-model` folder.

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
    │   ├── rtdetr.yaml         your model's settings — DO NOT TOUCH
    │   ├── rfdetr.yaml
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

### A warning specific to you

**Do not change anything in `configs/rtdetr.yaml`.**

That file is deliberately identical to `configs/rfdetr.yaml` apart from the
model name and the backbone learning rate. Same decoder, same 300 queries, same
matcher costs, same loss weights, same number of epochs.

That sameness is not laziness. It is your entire experiment. If you "improve" a
setting there because it looks like it could be better, you destroy the control
and your section of the report loses its point.

---

## Step 5 — Check your setup

```bash
python scripts/verify_env.py --model rtdetr
```

This prints your GPU, checks the three JSON files have the right counts,
confirms the dataset is intact, and writes `runs/env_report.json`.

**Look at the VRAM number it prints, and tell your group immediately.**

| Your VRAM | What you get | What it means |
|---|---|---|
| 8 GB or more | `rtdetr-l` (ResNet-50) | Good. This is the intended setup. |
| 5–7 GB | `rtdetr-r18` (ResNet-18) | Smaller backbone. Your control is weaker — you must say so in the report. |
| under 5 GB | `rtdetr-r18` at 392px | Much weaker. Tell the team; you may need to swap GPUs with someone. |

Send `runs/env_report.json` to your group chat.

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

### An extra detail that applies to your model

Your decoder has 6 layers, and **all six are supervised during training** (this
is called auxiliary loss — it helps the model converge). The masking has to be
applied to all six, not just the final one. If it were applied only to the last
layer, five sixths of the protection would silently disappear and nobody would
see an error message.

This is already handled correctly in the code. Just do not change it. It is
worth one sentence in your report as an observation.

**If this test fails, everything you train afterwards is worthless.** Stop and
tell the team.

---

## Step 7 — Understand your job before you run it

This is the section you will lead your report with. Read it properly.

Compare these three pairings:

| Comparison | What it actually tells you |
|---|---|
| RF-DETR vs YOLOv11 | **Nothing clean.** Backbone, head, label assignment, pretraining and NMS all differ at once. If RF-DETR wins, you cannot say which of the five caused it. |
| **RF-DETR vs your RT-DETR** | **The backbone.** Everything else is held identical. |
| Your RT-DETR vs YOLOv11 | Transformer head vs CNN head, both sitting on CNN backbones. |

Your model holds the decoder, the 300 queries, the matcher, the loss weights,
the image size, the batch size, the schedule and the masking exactly the same
as Member 1's RF-DETR. The **only** thing that changes is the backbone and
encoder.

That is what turns "the vision transformer helped" from an opinion into a
statement that can actually be proved or disproved. Without you, the project's
central research question has no valid answer.

This is your contribution. Being the control is not a lesser role — it is the
part that makes the other two results mean anything.

---

## Step 8 — Train

```bash
python scripts/train.py --config configs/rtdetr.yaml
```

You do not need to set batch size, image size or anything else. The code reads
how much memory your GPU has and picks them — and it deliberately picks the
*same* values RF-DETR gets at that memory level, so the control holds.

The first time you run this, it downloads ResNet-50 ImageNet weights
automatically through torchvision.

Training stops automatically when the model stops improving. This takes hours.
Do not close the terminal. Turn off sleep mode on the laptop.

### If it runs out of memory

The code catches this, lowers the settings, and retries — up to 3 times,
recorded in `runs/rtdetr/vram_ladder.json`.

**If that happens, tell Member 1 immediately.** Your settings no longer match
theirs, which means the control is broken and the RF-DETR vs RT-DETR comparison
becomes approximate rather than exact. It is recoverable — you just have to
report it honestly — but only if you notice.

### There is no resume

If the run crashes, you start over. `runs/rtdetr/last.pt` can be evaluated but
not continued.

---

## Step 9 — Final evaluation. Run this ONCE.

```bash
python scripts/evaluate_test.py --config configs/rtdetr.yaml --ckpt runs/rtdetr/best.pt --no-mask-eval

python scripts/profile_model.py --config configs/rtdetr.yaml
```

**Run the first command only one time, at the very end.**

The test set is a final exam. Model selection already happened on the
validation set during training. If you keep running the test set and report
your best score, the score means nothing — you have just fitted to the test
set, which is one of the most basic mistakes in machine learning.

---

## Step 10 — Prove the control actually held

This is your evidence, and it goes straight into the report.

Open two files side by side:

- `runs/rtdetr/autoconfig.json` — yours
- `runs/rfdetr/autoconfig.json` — ask Member 1 for it

Fill in this table:

| Field | Yours (RT-DETR) | Member 1's (RF-DETR) | Same? |
|---|---|---|---|
| `resolution` | | | |
| `batch` | | | |
| `accum` | | | |
| `queries` | | | |
| `epochs` | | | |

**If all five match:** your comparison is valid. Put this filled-in table in
the report — it is the proof that the control held.

**If any differ:** say clearly in the report that the RF-DETR vs RT-DETR
comparison is approximate, state which field differed and by how much, and
explain why (usually a VRAM difference between the two machines). Do not hide
it. An honest limitation is far better than a claim that falls apart when
someone checks.

---

## Step 11 — Files to hand to the group

From `runs/rtdetr/`:

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
- the filled-in control table from Step 10
- 20 screenshots of predictions: 10 where it worked, 10 where it failed
- a short note (about 200 words) on anything you changed and why

`best.pt` is large — share it by link, not through git.

---

## Step 12 — What to write in the report

`README_MEMBER.md` has your architecture diagram, your full settings table and
your novelty claim written out. Use it.

Your sections, in this order:

1. **Lead with the control argument from Step 7.** Include the three-way
   comparison table. This is your main contribution — do not bury it under the
   architecture description.
2. **Architecture diagram.** Redraw it neatly. Draw the two encoder pieces
   explicitly:
   - **AIFI** applies self-attention to the smallest feature map only (C5,
     stride 32), because that is where attention is cheap — there are few
     tokens to attend over.
   - **CCFF** does all the rest of the multi-scale fusion with ordinary
     convolutions, top-down then bottom-up.
   This is a genuine design idea in its own right: it is a different answer to
   the same question RF-DETR asks, which is *how much attention does a detector
   actually need?* Report it on its own terms, not only as a baseline.
3. **Settings table**, filled in with the real numbers from `profile.json`.
4. **Training curves** — loss going down, mAP going up, best epoch marked.
5. **The Step 10 verification table.** This is your evidence that the control
   held.
6. **The three-way attribution table from Step 7**, filled in with your actual
   numbers.
7. **Per-class accuracy.** Note that `manhole_missing` only has 104 instances
   in the test set, so its number will jump around between runs.
8. **Failure modes** from your 20 screenshots. Look for: wet road reflections
   read as cracks, shadow edges read as cracks, tar patches read as potholes,
   drain gratings read as manholes.

### Things you must state honestly

- **The control is tight but not perfect.** Even with an identical head,
  RF-DETR's backbone was pretrained self-supervised on DINOv2's LVD-142M, while
  yours was pretrained supervised on ImageNet-1k. The pretraining corpus and
  objective still differ. Your comparison is far tighter than RF-DETR vs YOLO,
  but it is not a laboratory-clean isolation of "ViT vs CNN". Say so.
- This is a reimplementation in plain PyTorch, not the official RT-DETR
  release. Your absolute mAP will be lower than published figures. What the
  project claims is the *relative* comparison between the three models.
- Cross-attention here is standard multi-head attention, not deformable
  attention. Deformable attention needs a compiled CUDA extension, which the
  pure-PyTorch requirement rules out.
- Evaluation is masked, which is not the standard COCO protocol. Report both
  numbers and explain why.

### An optional extra result, if you have time

Your model supervises all 6 decoder layers with auxiliary losses. You can test
whether that matters by setting `aux_loss: false` in `configs/rtdetr.yaml`,
running a short 20-epoch job into a separate `--run-dir`, and comparing.

If you do this, **change the setting back afterwards** and note in the report
that it was an ablation on a separate run, not your main configuration.

---

## The three rules

1. If `test_masking.py` does not print `7/7 passed`, stop. Nothing after it is
   valid.
2. Run `evaluate_test.py` exactly once, at the very end.
3. Never edit anything inside `civicscan/`, and never edit
   `configs/rtdetr.yaml`. All three of you run identical code — that is the
   only reason the three results can be compared at all, and in your case it is
   the experiment itself.
