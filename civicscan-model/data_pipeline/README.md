# CivicScan — Data Pipeline

CivicScan detects urban infrastructure decay — road cracks, potholes,
structural cracks on buildings and bridges, street litter, and damaged or
missing manhole covers — from vehicle-mounted street imagery. This module is
the data engineering half: it converts eight independently-sourced public
datasets, each with its own format and class vocabulary, into **one unified
COCO-format dataset with an extended schema** that makes it safe to train a
single detector across sources that annotate different, non-overlapping class
sets. Its output is the train/val/test splits and loss weights that Member B's
training work consumes.

**Detailed decision log:** [`docs/implementation.md`](docs/implementation.md)
**Formal write-up:** [`docs/reports/dataset_construction_report.md`](docs/reports/dataset_construction_report.md)

---

## Status

| | |
|---|---|
| Sources | 8 |
| Images | 32,260 |
| Annotations | 48,292 |
| Largest class share | 33.01% (`litter`) |
| Smallest class share | 1.56% (`manhole_missing`) |
| `validate_schema.py` | **passing — 0 errors, 0 warnings** |
| Splits | train 22,870 / val 4,718 / test 4,672 images |

---

## Class taxonomy — LOCKED

Do **not** renumber, add, or remove classes without team agreement. Category
ids are referenced directly by downstream configs, and `valid_categories` on
every image is built from them.

| id | Class | Domain |
|---:|---|---|
| 1 | `crack_longitudinal` | road_damage |
| 2 | `crack_transverse` | road_damage |
| 3 | `crack_alligator` | road_damage |
| 4 | `pothole` | road_damage |
| 5 | `crack_structural` | structural_damage |
| 6 | `litter` | civic_waste |
| 7 | `manhole_damaged` | hazard |
| 8 | `manhole_missing` | hazard |

### Class balance

| Class | Annotations | Share |
|---|---:|---:|
| `litter` | 15,939 | 33.01% |
| `crack_structural` | 9,232 | 19.12% |
| `crack_alligator` | 7,031 | 14.56% |
| `crack_longitudinal` | 4,751 | 9.84% |
| `pothole` | 4,654 | 9.64% |
| `crack_transverse` | 3,498 | 7.24% |
| `manhole_damaged` | 2,435 | 5.04% |
| `manhole_missing` | 752 | 1.56% |
| **Total** | **48,292** | **100%** |

---

## `valid_categories` — the one correctness requirement

**Training code MUST respect this field.** It is the single most important
thing to get right in this dataset.

Every image carries `valid_categories`: the list of class ids that the image's
*source dataset* is capable of annotating — regardless of whether those classes
appear in that particular image. RDD2022 images carry `[1,2,3,4]`, TACO and
TrashTrail carry `[6]`, Crackseg9k and BridgeDeckCsust carry `[5]`, the manhole
sources carry `[7,8]`.

This matters because **absence of a label does not mean absence of the object.**
A TACO image full of litter almost certainly also contains road cracks — they
were simply never annotated, because TACO is a litter dataset. If you compute
loss over all 8 classes on that image, every correct crack prediction is
punished as a false positive, and the model is actively trained *not* to detect
cracks on litter-like scenes.

The fix is per-source loss masking: **for each image, compute classification
loss only over the class ids in its `valid_categories`, and ignore predictions
for every other class.** Objectness and box regression are unaffected. The
validator enforces on every run that each annotation's `category_id` appears in
its image's `valid_categories`, so the field can be trusted.

---

## Environment

Windows · Python 3.11.9 · NVIDIA RTX 4060 (**8 GB VRAM**)

```bash
python -m venv .venv
.venv\Scripts\activate

pip install -r requirements-data.txt
```

PyTorch must be installed with the CUDA 12.8 build rather than the default
CPU/older-CUDA wheel:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
```

Verify with `python -c "import torch; print(torch.cuda.is_available(), torch.version.cuda)"`.

> **Note:** `requirements-train.txt` does not exist yet — training dependencies
> (RF-DETR, Ultralytics, etc.) are Member B's to pin. Only
> `requirements-data.txt` is present in the repo.

---

## Reproducing the dataset

### Step 0 — obtain the raw sources (they are NOT in git)

None of the source imagery is tracked. Download or fork each source first, then
point the converters at the local paths.

| Source | Where to get it |
|---|---|
| RDD2022 | Kaggle mirror `aliabdelmenam/rdd-2022` (India + Japan only) |
| TACO | Roboflow Universe `taco-2we3b/taco-litter` — a pre-mirrored copy. **Do not** use TACO's own `download.py`; its Flickr links are dead and it recovers only 968 of 1,500 images |
| TrashTrail | Roboflow Universe `andrew-watson-yz64n/trash-trail-litter` |
| Crackseg9k | Harvard Dataverse `doi:10.7910/DVN/EGIEBY` — `Final-Dataset-Vol1` + `Vol2`, extracted side by side |
| BridgeDeckCsust | Roboflow Universe `csustcv/bridge-detection-p4vmv` |
| RoboflowManhole | Roboflow Universe `create-dataset-for-yolo/manhole-cover-dataset-yolo` |
| RoboflowManholeG8rvh | Roboflow Universe `manhole-projet/manhole-g8rvh` |
| RoboflowManholeJinggai | Roboflow Universe `123-g4ip5/-rqltz` |

Roboflow sources are forked into the team workspace and exported as **COCO,
auto-orient on, no augmentation** — augmentation would duplicate images and
corrupt the class-balance figures.

### Step 1 — convert each source

```bash
python converters/rdd2022_kaggle_to_coco.py --root <RDD_SPLIT> \
    --out output/rdd2022_unified.json --countries Japan India --splits train val

python converters/crackseg9k_to_coco.py --root <Crackseg9k> \
    --out output/crackseg9k_unified.json \
    --exclude-subsets CRACK500_IMG,CRACK500,GAPS384_train,GAPS384_test,cracktree200,CFD,DeepCrack_IMG,DeepCrack,Ceramic

python converters/taco_to_coco.py --format roboflow --root <taco_export> \
    --out output/taco_unified.json
python converters/trash_trail_to_coco.py --root <trash_trail_export> \
    --out output/trash_trail_unified.json
python converters/bridge_to_coco.py --root <bridge_export> \
    --out output/bridge_unified.json --dedup-against <Crackseg9k>

# manhole — ORDER MATTERS, each dedups against the ones before it
python converters/manhole_to_coco.py --format coco --root <manhole_export> \
    --out output/manhole_unified.json
python converters/manhole_to_coco.py --source manhole_g8rvh --format coco \
    --root <g8rvh_export> --out output/manhole_g8rvh_unified.json \
    --dedup-against <manhole_export>
python converters/manhole_to_coco.py --source manhole_jinggai --format coco \
    --root <jinggai_export> --out output/manhole_jinggai_unified.json \
    --dedup-against <manhole_export> <g8rvh_export>
```

### Step 2 — merge, validate, split, profile

```bash
python merge_datasets.py --inputs \
    output/rdd2022_unified.json output/taco_unified.json \
    output/trash_trail_unified.json output/crackseg9k_unified.json \
    output/bridge_unified.json output/manhole_unified.json \
    output/manhole_g8rvh_unified.json output/manhole_jinggai_unified.json \
    --out output/merged.json

python validate_schema.py --dataset output/merged.json      # must report 0 errors

python split_dataset.py --dataset output/merged.json --out-dir output/splits \
    --val-frac 0.15 --test-frac 0.15 --seed 42

python class_balance_stats.py --dataset output/splits/train.json \
    --out output/class_weights.json
```

**The split is deterministic.** `--seed 42` with the default grouping
parameters (`--rdd-sequence-bucket 100`, `--trashtrail-sequence-bucket 25`,
`--crackseg-group patch`) reproduces the same splits reported above. It is
group-aware, never random: sources derived from photo sequences would otherwise
put near-duplicate frames in both train and test and inflate reported mAP.

---

## What is tracked in git, and what is not

**Read this before going looking for a dataset file that isn't there.**

| Tracked | Not tracked |
|---|---|
| All pipeline source code | All raw source imagery and archives |
| `docs/implementation.md`, `docs/reports/` | `output/merged.json` and every `*_unified.json` |
| `docs/crackseg9k_subset_samples/` (1.7 MB, 13 sheets) | **`output/splits/{train,val,test}.json`** |
| `output/class_weights.json`, `output/class_balance_merged.json` | Model weights / checkpoints |
| `requirements-data.txt` | Generated HTML/PDF report views |

The three split files total **34 MB** (`train.json` alone is 24.8 MB, inflated
by Crackseg9k's 7,013 segmentation polygons), so they are regenerated rather
than committed. Run the Step 1–2 commands above; `--seed 42` reproduces them.

`output/class_weights.json` **is** committed — it is small and needed directly
for loss-weighted training.

---

## Directory map

```
data_pipeline/
├── README.md                    ← you are here
├── schema.py                    single source of truth: taxonomy, schema shape,
│                                  per-source valid_categories, licenses
├── merge_datasets.py            combine per-source JSONs, check id collisions
├── validate_schema.py           enforces the valid_categories invariant
├── split_dataset.py             group-aware 70/15/15 split (seed 42)
├── class_balance_stats.py       per-class counts + loss weights
├── converters/
│   ├── roboflow_sources.py      ** ALL Roboflow class mappings, one table **
│   ├── roboflow_common.py       shared Roboflow COCO reader + dedup
│   ├── rdd2022_kaggle_to_coco.py
│   ├── rdd2022_to_coco.py       (official VOC release; unused, kept for reference)
│   ├── crackseg9k_to_coco.py    masks -> polygons, subset exclusion, defragmentation
│   ├── taco_to_coco.py          --format roboflow (default) | official
│   ├── trash_trail_to_coco.py
│   ├── bridge_to_coco.py        crack-only filter, tighter dedup threshold
│   └── manhole_to_coco.py       3 manhole sources via --source
├── utils/
│   ├── id_allocator.py          namespaced 10M-wide id block per source
│   ├── bbox.py                  clamp boxes to image bounds
│   └── imagehash.py             perceptual dedup (dHash + DuplicateIndex)
├── docs/
│   ├── implementation.md        full decision log
│   ├── reports/                 formal write-up
│   └── crackseg9k_subset_samples/   contact sheets behind subset decisions
└── output/                      generated; only the two small JSONs are tracked
```

---

## Known limitations

Summary only — full detail in [`docs/implementation.md`](docs/implementation.md).

- **Bridge coverage is one inspection campaign.** `crack_structural` is 66%
  wall façades and 24% a single bridge campaign, so 90% of the class is two
  sources. Do not claim general structural-damage coverage.
- **`litter` is now the largest class (33%)** — the dominance problem moved
  rather than disappeared — and one of its two sources is substantially
  fixed-CCTV footage, so its annotation count overstates the number of
  independent scenes.
- **`manhole_missing` evaluation will be noisy.** Only 105 val / 104 test
  instances, so per-class AP on it will swing considerably between runs. Report
  it with that caveat rather than as a stable number.
- **RF-DETR vs YOLO will not be a controlled comparison** unless pretraining is
  matched. The two differ in pretraining corpus and scale as well as
  architecture, so a raw mAP gap does not isolate architecture. Document the
  confound rather than presenting the winner as an architectural result.
- **RDD2022 split grouping is bucketed, not sequence-exact** — roughly 230
  bucket boundaries across 15,522 images where adjacent frames can split.

---

## Handoff to Member B

The dataset is final as of this branch. Expected next steps:

1. **RF-DETR + YOLO baseline training** on `output/splits/train.json`,
   validated on `val.json`. Keep `test.json` untouched until the end.
2. **Per-source loss masking** — see the `valid_categories` section above. This
   is a correctness requirement, not an optimisation.
3. **Per-class AP evaluation**, not just overall mAP. The classes differ by
   more than 20x in frequency, so a single mAP number will be dominated by
   `litter` and `crack_structural`.

**Loss weighting:** [`output/class_weights.json`](output/class_weights.json)
carries both raw and capped inverse-frequency weights, computed on the train
split. Raw and capped are currently identical — the spread now fits inside the
10x median cap. Treat them as a starting point and tune empirically; over-
correcting rare-class weights can destabilise early training.

**VRAM constraint — 8 GB.** This will not fit a default RF-DETR training config
at full resolution. Expect to need some combination of: small batch size with
gradient accumulation, AMP / mixed precision, a smaller RF-DETR variant
(nano/small rather than base), and reduced input resolution. Budget time for
this — it is the most likely source of early friction.

Questions about any conversion decision should be answerable from
[`docs/implementation.md`](docs/implementation.md); if it isn't there, ask
Member A rather than inferring it from the code.
