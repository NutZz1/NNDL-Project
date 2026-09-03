# CivicScan — Data Pipeline Implementation Status

_Last updated: 4 Sep 2026 — bridge-deck source added, two manhole labels remapped,
illegal-dumping formally declined; merged dataset re-validated clean._

Member A's data engineering module (dataset acquisition → conversion → merge →
validate → split) runs end to end on the real downloads.

---

## Current numbers

Merged dataset: **32,260 images / 48,292 annotations** across **8 sources**.
`validate_schema.py` passes with **zero errors and zero warnings**.

| Source | Images | Annotations | Status |
|---|---:|---:|---|
| RDD2022 (India + Japan) | 15,522 | 19,934 | unchanged |
| TrashTrail | 3,343 | 11,081 | unchanged |
| Crackseg9k | 4,813 | 7,013 | unchanged |
| TACO | 1,499 | 4,858 | unchanged |
| **BridgeDeckCsust** | **2,582** | **2,219** | **NEW** |
| **RoboflowManholeJinggai** | 2,157 | **2,064** | **remapped** — was 1,274 |
| RoboflowManhole | 1,427 | 951 | unchanged |
| RoboflowManholeG8rvh | 917 | 172 | unchanged |

### Class balance, before and after

"Before" = the 968-image-TACO / unrestricted-Crackseg9k state two rounds ago.

| Class | Before | Now | Change |
|---|---:|---:|---|
| litter | 2,982 (5.5%) | **15,939 (33.01%)** | 5.3x |
| crack_structural | 30,301 (55.9%) | **9,232 (19.12%)** | -70% |
| crack_alligator | 7,031 (13.0%) | 7,031 (14.56%) | — |
| crack_longitudinal | 4,751 (8.8%) | 4,751 (9.84%) | — |
| pothole | 4,654 (8.6%) | 4,654 (9.64%) | — |
| crack_transverse | 3,498 (6.5%) | 3,498 (7.24%) | — |
| manhole_damaged | 662 (1.2%) | **2,435 (5.04%)** | 3.7x |
| manhole_missing | 289 (0.53%) | **752 (1.56%)** | 2.6x |
| **total** | 54,168 | **48,292** | -10.8% |

"Before" is the state at the start of this cleanup programme. Every class now
sits between 1.6% and 33%.

Raw and capped loss weights are identical — the spread now fits inside the
10x-median cap.

### Splits (group-aware, 70/15/15, seed 42)

| Split | Images | Annotations |
|---|---:|---:|
| train | 22,870 | 34,155 |
| val | 4,718 | 7,136 |
| test | 4,672 | 7,001 |

No image-id overlap; all 8 classes present in all 3 splits (thinnest:
`manhole_missing` at 543 / 105 / 104).

---

## Sources added, and why these ones

Roboflow Universe is dominated by re-uploads. Every candidate was hash-tested
against what we already had before forking anything (64-bit dHash, distance
<= 8 = same photo through re-encoding).

| Candidate | Overlap with our data | Outcome |
|---|---|---|
| `taco-2we3b/taco-litter` | superset of our 968 | **forked, replaces TACO** |
| `andrew-watson-yz64n/trash-trail-litter` | 0/16 | **forked** |
| `manhole-projet/manhole-g8rvh` | 2/78 (3%) | **forked** |
| `123-g4ip5/-rqltz` (井盖) | 17/40 (42%) | **forked, deduped on import** |
| `test-iqa6e/manhole-e0p0b` | **58/58 identical** | rejected |
| `memetor/manhole-734ej` | 35/40 (88%) | rejected |
| ~20 `circle/good/broke/lose/uncovered` listings | one origin dataset | rejected |
| `cc2/taco-ycyyg` | 1,211 imgs / 57 classes | rejected, incomplete |
| `test-ihtix/taco-trash`, `catholic-university/…-ponja` | marine/underwater | rejected, wrong domain |

**Different taxonomy does not mean different photos.** `manhole-e0p0b`
advertises a completely different class set (`Displaced`/`Tilted`) and is a
pixel-identical re-annotation of photos we already own. It remains useful as
a free relabel of our existing images if we ever want a finer hazard
taxonomy — but it adds no imagery.

### Replace vs merge for TACO

The mirror is a **superset**: 33 of 60 sampled mirror images hash-match our
Flickr pull, and the 27 misses carry TACO's own filenames — they are exactly
the dead links `download.py` could never fetch. So the mirror **replaces**
the 968-image pull (`output/taco_unified.json` overwritten in place, old file
kept as `taco_unified_OLD_flickr968.json.bak`). Merging both would have
double-counted ~968 photos and could have placed one photo in both train and
test. `source_dataset` stays `"TACO"` and reuses id block 1, so nothing
downstream that stored a TACO id has to change.

Note: the export carries **4,858** annotations, ~74 MORE than the official
release's 4,784 (likely uploader edits or polygon-to-box splitting).
Roboflow's class-count API reports 4,782; the export file is the authority.

### Class mappings

All Roboflow class mappings live in one auditable table,
`converters/roboflow_sources.py`. Decisions taken:

| Source | Mapping |
|---|---|
| TACO (59 classes) | all → `litter` (locked taxonomy) |
| TrashTrail (8 classes) | all 8 → `litter`, listed explicitly so a new class in a future export is caught rather than swallowed |
| RoboflowManhole | `Broken`,`Lose` → damaged; `Uncovered` → missing; `Good` skipped |
| RoboflowManholeG8rvh | `broke` → damaged; `uncover` → missing; `good` skipped |
| RoboflowManholeJinggai | `broke`,`lose` → damaged; `uncovered`,**`open`** → missing; `good`,`raised`,`load`,`0`,`1`,`2` skipped |

**Two judgement calls, both reversible in that one file. Both were
subsequently confirmed when the class scope was set to buildings and walls:**

- **`open` → `manhole_missing`** (495 instances). Sample images show a cover
  slid aside leaving an open hole. The hazard is the hole, so it reads as
  missing even though a cover is physically present nearby.
- **`raised` (426) and `load` (559) skipped.** A cover proud of the road
  surface is a real hazard but is neither damaged nor missing; adding it to
  either would blur that class. `load` could not be interpreted from
  full-frame previews at all.

---

## Deduplication — new, and load-bearing

`utils/imagehash.py` (dHash + `DuplicateIndex`) is now used by every
multi-source converter. Without it, duplicate photos would enter the merge
and scatter across train/val/test, silently inflating reported mAP.

| Source | Images dropped | Why |
|---|---:|---|
| RoboflowManholeJinggai | **1,435 of 3,592 (40%)** | matched `well*` photos in the original manhole source, plus internal repeats |
| TrashTrail | 315 of 3,658 (9%) | near-duplicate CCTV frames |
| RoboflowManholeG8rvh | 89 of 1,006 (9%) | mix of cross-source and internal repeats |
| BridgeDeckCsust | 390 of 2,972 (13%) | at threshold **3**, not 8 — see the bridge section for the measured distance distribution behind that choice |

The 井盖 drop rate (40%) matched the 42% predicted from a 40-image sample.

### TrashTrail is partly fixed-CCTV footage

Discovered via the dedup pass, not the preview: many TrashTrail images carry
burned-in timestamps and a "Camera 01" watermark, with pairs seconds apart
(`12:48:54` vs `12:49:02`) in which a person has moved while the litter has
not. Consequences:

- `capture_context` is `"unknown"`, NOT `"handheld"` — the source is a mix of
  CCTV and hand-held and carries no per-image metadata to separate them.
- Filename-sequence grouping alone is **not sufficient**: near-duplicate
  frames appear under non-adjacent numbers (`IMG_8575` vs `IMG_0018`). The
  perceptual dedup is what actually keeps those frames out of two splits.
- Distance histogram of the 315 drops: 24 at <=2 (true duplicates), 98 at
  3-6 (same scene seconds apart), 155 at 7-8 (mostly same scene, with some
  genuine false positives on low-texture road surfaces). Threshold kept at 8
  on the grounds that losing ~9% of one source beats leaking near-identical
  frames into test. Tune with the threshold in `utils/imagehash.py`.

---

## Bridge-deck data added — BridgeDeckCsust

`crack_structural` had no bridge data at all: SDNET2018, Crackseg9k's only
bridge-deck source, is absent from our download. The class was 87.0% one
subset (Rissbilder wall façades). A Universe survey found one candidate
visibly showing real bridge structure — girders, soffits, bearing seats,
box-girder interiors, underside-of-deck views.

Source: `csustcv/bridge-detection-p4vmv` (2,972 images, 9,363 annotations,
CC BY 4.0), forked to `bridge-detection-p4vmv-otawr`.

**Crack only.** Of its 11 classes, only `Crack` (2,332) and `crack` (201) map
to `crack_structural`. `Spall`, `Rust`, `Efflorescence`, `Rebar` and
`Scaling` are genuine structural damage but are NOT cracks; folding them in
would repeat exactly the category error the previous round removed. `defect`
(2,248) is unspecific and cannot be assumed to be a crack. Every case and
spelling duplicate (`defectww`, `defectwww`, `Spallingw`) is listed
explicitly in `converters/roboflow_sources.py` so the filter is auditable
and a new upstream class is caught as unknown rather than swallowed.

Result: **2,582 images / 2,219 annotations**, taking `crack_structural` from
7,013 to **9,232**.

### Per-subset breakdown of crack_structural

| Subset | Annotations | Share |
|---|---:|---:|
| Rissbilder_for_Florian | 6,101 | **66.1%** (was 87.0%) |
| BridgeDeckCsust (bridge) | 2,219 | 24.0% |
| Volker | 512 | 5.5% |
| Masonry `a` | 350 | 3.8% |
| Masonry `c`/`h`/`b`/`d` | 50 | 0.6% |

### CAVEAT — bridge coverage is one inspection campaign

**`crack_structural` bridge coverage derives from a single inspection
campaign and must not be assumed to generalise across bridge types,
materials, or lighting conditions.** The imagery shows one lighting setup,
one photographer's conventions, and what appears to be a small number of
physical structures.

The Rissbilder concentration improving from 87.0% to 66.1% is a real but
**modest** improvement, not a fix. It trades single-subset concentration for
two-subset concentration: 90% of the class is now two sources rather than
one. Do not present the percentage movement as the class being diversified.
Anyone reporting on this model should describe `crack_structural` as covering
building façades, walls and masonry, plus bridge structure from one
inspection campaign.

### Dedup threshold: 3, not the pipeline default of 8

Bridge and wall crack close-ups look alike, so this source is deduplicated at
import against the kept Crackseg9k structural photos (4,814 indexed). Two
findings changed how:

1. **Index filtering is required.** Crackseg9k's `Final_Masks/Masks` and
   `Final_Masks/Heads` hold PNGs with the SAME stems as the photos, so a
   subset-name predicate alone indexes binary masks and noisy model outputs.
   `crackseg_kept_only()` now excludes `Final_Masks` explicitly.
2. **The default threshold discarded real data.** Measured nearest-neighbour
   distances from all 2,972 bridge images to the indexed photos:

   ```
   distance:  0    1    2    3    4    5    6    7    8  ...  15   16
   count:     1   12   28   25   46   46   50   82   96  ... 335  329
   ```

   There is no separated duplicate cluster. A true-duplicate population
   spikes at 0-1 then gaps — as it did for the manhole sources, where
   matches landed at distance 0. Here counts rise smoothly into a bulk at
   15-16, so anything above ~2 is the shoulder of "different photographs of
   grey concrete". At threshold 8, 690 of 2,972 images (23%) were discarded,
   almost all genuine distinct bridge photographs. At 3: **390 dropped**.

**Known limitation this leaves open:** near-duplicate frames *within* this
source are no longer all caught either, and `split_dataset.py` groups it per
image, so a pair of near-identical campaign frames can land either side of
the train/test line. Accepted deliberately — the alternative costs an order
of magnitude more real data.

## Crackseg9k restricted to buildings, bridges and walls

`crack_structural` means structural damage to BUILDINGS, BRIDGES AND WALLS.
Crackseg9k was assembled for generic crack segmentation, so much of it is not
that. There are no per-subset folders — all 9,159 images sit flat in two
`Images` directories and subset identity comes only from filename prefixes.
Each subset was classified from a 24-image contact sheet
(`docs/crackseg9k_subset_samples/`).

| Subset | Images | Anns | Surface | Decision |
|---|---:|---:|---|---|
| Rissbilder_for_Florian | 2,735 | 19,105 | painted concrete facades, render | **keep** |
| noncrack_…_concrete_wall | 1,411 | 0 | walls, blockwork, stone cladding | **keep** (negatives) |
| Volker | 427 | 621 | plaster/render walls | **keep** |
| Masonry (`a`/`b`/`c`/`d`/`h`) | 240 | 499 | brick walls, mortar, window frames | **keep** |
| CRACK500 | 3,065 | 6,074 | asphalt pavement | exclude — road |
| GAPS384_train/test | 383 | 1,159 | asphalt with lane markings | exclude — road |
| cracktree200 | 161 | 592 | pavement, tyre marks, road paint | exclude — road |
| CFD | 118 | 248 | urban asphalt | exclude — road |
| CRACK500_IMG | 61 | 106 | asphalt pavement | exclude — road |
| DeepCrack + DeepCrack_IMG | 443 | 1,564 | **mixed** pavement AND wall at macro range | exclude — see below |
| Ceramic | 100 | 333 | indoor bathroom/kitchen tiling | exclude — see below |

Two calls made on the team's behalf, both reversible by editing one line of
`CRACKSEG_SUBSETS` in `converters/crackseg9k_to_coco.py`:

- **DeepCrack excluded.** The published dataset is "concrete and asphalt
  pavement"; our contact sheet shows both surface types at macro range with
  no context in frame, and the filenames carry no surface label, so it cannot
  be sub-split. Ambiguity resolves AGAINST inclusion in a class defined as
  buildings/bridges/walls.
- **Ceramic excluded.** Indoor floor and wall tiling, several frames showing
  skirting boards and sanitary fittings. Not structural damage to a building
  in any sense a street-level vehicle camera encounters.

**Two facts worth carrying into the report:**

1. **`Sdnet` is not in this download.** Zero filenames match `sdnet`/`deck`/
   `pave`. The concern about SDNET2018's bridge-deck / wall / pavement splits
   being bundled is moot — there is nothing to sub-split.
2. **No bridge data survives.** SDNET2018 was the only bridge-deck source in
   Crackseg9k's nominal 10, and it is absent. `crack_structural` is therefore
   trained on **walls and facades only, no bridges**. That is a sourcing gap,
   not something label cleaning can fix.

Run command:

```bash
python converters/crackseg9k_to_coco.py --root path/to/Crackseg9k     --out output/crackseg9k_unified.json     --exclude-subsets CRACK500_IMG,CRACK500,GAPS384_train,GAPS384_test,cracktree200,CFD,DeepCrack_IMG,DeepCrack,Ceramic
```

`converters/crackseg9k_to_coco.NON_STRUCTURAL_SUBSETS` holds this list, and
the converter prints it when non-structural subsets are present.

## Crackseg9k over-fragmentation — RESOLVED

`cv2.connectedComponents` counts blobs, not cracks. A single hairline crack
fades in and out against wall render, so its mask arrives in pieces: one
continuous crack in Rissbilder routinely returned 9+ components, each of
which became its own annotation. The annotation count was measuring how
gappy the mask was, not how many cracks were present. Consequences: one
subset dominated the class weight, boxes were chopped mid-crack so a model
that correctly found the whole crack scored as several misses, and Member C
received nine short cracks instead of one long one when length is the
severity signal.

Two things checked first, both negative:

- **The converter already used `connectivity=8`.** The suspected
  4-connectivity bug did not exist.
- Fragmentation was almost entirely **Rissbilder at 6.99 anns/image**, 94%
  of the restricted `crack_structural` count.

Options measured on a 1,130-image stratified sample:

| Approach | Anns/image | vs before | Verdict |
|---|---:|---:|---|
| per component (old) | 4.37 | 100% | replaced |
| morphological close k=3 / k=7 | 3.63 / 3.61 | 83% | rejected |
| MIN_PIXEL_AREA=50 | 3.30 | 76% | rejected |
| **bbox-merge, 8px** | **1.86** | **43%** | **ADOPTED** |
| bbox-merge, 16px | 1.54 | 35% | available via flag |
| one instance per image | 0.99 | 23% | rejected |

**Morphological closing is actively harmful** and must not be re-attempted:
on cracktree200 it *increased* annotations 260 -> 612 -> 1,155 -> 1,320
(k=3/5/7), because the erode half of the close severs 1px hairlines that
dilate had unevenly thickened. `MIN_PIXEL_AREA=50` erased cracktree200
almost entirely (260 -> 4), the same silent-false-negative failure as the
old 127 threshold.

**Adopted: `merge_component_clusters()`** unions components whose bounding
boxes fall within `--merge-margin` pixels (default 8) into one crack
instance. It is proximity-based, NOT one-per-image: two cracks on opposite
sides of a frame remain separate instances. On the illustrated example it
gives 9 components -> 2 instances.

A merged instance carries the **union of its components' polygons as a
multi-part segmentation** and its `area` remains the **true crack pixel
count**, never the box area — so mask geometry and Member C's length/width
severity scoring are untouched. `--merge-margin 0` restores the old
per-component behaviour without a code change.

Measured cost over 500 kept-subset images: boxes/image 6.21 -> 2.29, crack
pixels as a share of box area 16.6% -> 11.7%. That cost is small because a
thin diagonal crack's axis-aligned box is ~85% background at ANY
granularity; tight boxes are not available for this shape, which is exactly
why the masks are preserved.

Result: Rissbilder 19,105 -> 6,101 annotations (6.99 -> 2.23 per image);
Crackseg9k overall 20,225 -> 7,013.

## Small garbage dumps — DECLINED

`development-outcomex/illegal-dumping` (2,231 images) was evaluated and
**declined**. Recorded here so it is not re-surfaced without this context.

Why it was attractive: it is **vehicle-mounted kerbside imagery** — the
truck's bodywork is visible across the bottom of every frame — which makes
it the closest viewpoint match to CivicScan's actual deployment of anything
found across the whole Universe survey.

Why it was declined anyway, on two independent grounds:

1. **Box granularity conflict.** Its boxes are pile-level (`dump`,
   `rubbish`, `mattress`, `tyre`, `trolley`, `furniture`, `pallet`), which
   contradicts `litter`'s established per-item convention from TACO and
   TrashTrail. A dumped mattress and a cigarette butt would both become one
   `litter` box — contradictory supervision inside a single class.
2. **It breaks Member C's design.** `illegal_dumping` is defined as *a
   cluster of litter detections*. A pile trained as a single box yields ONE
   detection, not a cluster, so the aggregation rule would never fire on the
   exact cases it exists to catch.

Revisit only if a 9th class with its own pile-level annotation scheme is
ever formally added to the taxonomy. Absent that, the viewpoint advantage
does not outweigh corrupting an existing class definition.

Other pile-level candidates surveyed at the same time and not pursued:
`cartodx/waste-street-view` (2,584, per-item boxes — the one option
compatible with `litter` today), `new-workspace-gawfk/garbage-rrcun`
(13,053), `myspace-vwrde/garbage-dumping-detection` (2,499),
`personal-projects/street-waste-vh6jc` (2,133),
`dump-bmqo7/dump-1htom` (rejected, half its sampled images unannotated),
`daminiprashantvichare/garbage-djz5n` (rejected, license null).

## Manhole label remaps — RoboflowManholeJinggai

Three labels on this source were reviewed against crops of the ACTUAL
annotation boxes. Full-frame previews had been inconclusive because these
images often contain several covers, so the frame does not reveal which one
carries the label.

| Label | Instances (pre-dedup) | Was | Now |
|---|---:|---|---|
| `load` | 509 | skipped | **`manhole_damaged`** |
| `raised` | 424 | skipped | **`manhole_damaged`** |
| `open` | 495 | `manhole_missing` | unchanged |

**`load` → manhole_damaged.** The crops show the inverse of `raised`: covers
sunken or settled below road level, ringed by cracked and crumbling asphalt,
several sitting in visible craters with rutted collars. It is not a load
rating and not a property of an intact cover.
*Open note:* the label name is most likely a mistranslation — plausibly 塌陷
(collapse/subsidence) or 下沉 (sinking) — but this was never resolved. The
mapping rests on the image evidence, not on the word.

**`raised` → manhole_damaged.** Covers standing proud of the surrounding
surface: raised concrete collars, protruding above pavement, tilted up on one
edge with a clear step. None read as "domed but flush and driveable".
*Accepted noise:* roughly a quarter sit in grass verges, soil or newly-poured
plinths rather than the carriageway. The label is mapped wholesale and
deliberately NOT split by surface context — a raised cover in a verge is
still a pedestrian trip hazard.

**`open` — confirmed, unchanged.** Crops show the cover lifted off or slid
aside with the hole exposed, matching the `Uncovered` -> `manhole_missing`
logic used by the other manhole sources. Two caveats, neither blocking:

- *Redundancy, future cleanup candidate:* this source's own `uncovered`
  (405) describes the same physical state as `open` (495) — two labels for
  one condition, both correctly landing on `manhole_missing`. Deliberately
  NOT consolidated in this round; out of scope, not blocking.
- *Maintenance in progress:* a minority of `open` instances show workers
  actively lifting a cover. That is not a fault condition, and it is not
  separable from the labels.

Effect: `manhole_damaged` 1,645 -> **2,435**, `manhole_missing` unchanged at
752. The gain is +790 rather than the +933 the raw instance counts suggest,
because 1,435 of Jinggai's 3,592 images (40%) were already blocked as
duplicates of the original manhole source — the 509/424 figures count
annotations on those duplicate images too. Post-dedup the labels contribute
446 and 344.

## Earlier fixes (still current)

- **Split leakage**: RDD2022 grouping collapsed to two groups (one per
  country, a whole country in test). Now country + 100-frame bucket → 231
  groups. Crackseg9k groups by source photo so crops of one photo cannot
  split. TrashTrail groups by sub-collection + 25-frame bucket.
- **Crackseg9k mask threshold**: at 127, 167 of 175 `cracktree200` images
  converted to "no crack". Now 64, measured.
- **`Final_Masks/Heads/` is not ground truth** — a noisy 480x480 model
  output; the converter refuses it.
- **Out-of-bounds boxes** clamped by `utils/bbox.py`, float noise reported
  separately from genuine overshoots.
- **`validate_schema.py`** no longer does a linear image scan per annotation.
- **Roboflow dummy category-0 row** (`supercategory == "none"`) skipped
  generically, so it can never become a real class under `flatten_all_to`.

---

## Licenses — all eight confirmed

| Source | License | Confirmed from |
|---|---|---|
| RDD2022 | CC BY-SA 4.0 | sekilab/RoadDamageDetector README |
| TACO | annotations CC BY 4.0; per-image terms vary | tacodataset.org |
| Crackseg9k | CC0 1.0 | Harvard Dataverse doi:10.7910/DVN/EGIEBY |
| RoboflowManhole | CC BY 4.0 | `README.dataset.txt` in the export |
| TrashTrail | CC BY 4.0 | Universe listing |
| RoboflowManholeG8rvh | CC BY 4.0 | Universe listing |
| RoboflowManholeJinggai | CC BY 4.0 | Universe listing |
| BridgeDeckCsust | CC BY 4.0 | Universe listing for `csustcv/bridge-detection-p4vmv` |

---

## Reproducing

See `README.md` for the full command list. The Roboflow-derived sources are
forks in the `sreepathy-vadakkath-joshy` workspace: `taco-litter-wmiuo`,
`trash-trail-litter-dmsiz`, `manhole-g8rvh-frolw`, `-rqltz-wvcr2`,
`bridge-detection-p4vmv-otawr`, each
exported as COCO at version 1 with auto-orient on and **no augmentation**
(augmentation would duplicate images and corrupt these class-balance
figures).

## Known limitations to document in the report

Checked and re-stated after this round. These are honest caveats, not
rough edges to be tidied away — several exist precisely because the metrics
would otherwise read better than the data warrants.

- **`litter` is now the largest class at 33.01%** (15,939 annotations). The
  dominance problem moved rather than disappeared — it was
  `crack_structural` at 55.9%, now it is litter at a third of the dataset.
- **TrashTrail's annotation count overstates its scene count.** A large
  share of its images carry burned-in timestamps and a "Camera 01" watermark
  — fixed-CCTV frames seconds apart, with a person moving while the litter
  does not. Its 11,081 annotations therefore represent materially fewer
  independent scenes than the number implies.
- **`crack_structural` bridge coverage is one inspection campaign.** See the
  BridgeDeckCsust section: 66.1% of the class is still Rissbilder and 24.0%
  is one bridge campaign, so 90% of it is two sources. Report the class as
  building façades, walls and masonry plus bridge structure from a single
  campaign — not as general structural damage.
- **Near-duplicate bridge frames can cross the split boundary.** The
  BridgeDeckCsust dedup threshold is 3 rather than 8, because 8 discarded
  23% of the source as false positives. Within-source near-duplicates are
  therefore not all caught, and that source is grouped per image.
- **TACO's mirror carries ~74 more annotations than the official release**
  (4,858 vs 4,784) and 1,499 of its 1,500 images. Most likely uploader edits
  or polygon-to-box splitting. Unexplained — not investigated further.
- **RDD2022 frame grouping is bucketed, not sequence-exact.** The filenames
  carry no drive id, so grouping uses country + 100-frame buckets: roughly
  230 bucket boundaries across 15,522 images where adjacent frames can land
  in different splits.
- **Crackseg9k contributes 1,411 crack-free wall images** that carry zero
  annotations by design. Together with 5,995 RDD2022 frames with no
  in-taxonomy damage and the manhole frames whose only object was an intact
  cover, images-with-at-least-one-annotation is well below the 32,260 total.

### Resolved — no longer limitations

- Crackseg9k road-pavement contamination (was 41% of the source): resolved by
  subset exclusion, not still open. `crack_structural` no longer contains
  road pavement.
- Rissbilder component fragmentation: resolved by proximity merging (6.99 ->
  2.23 annotations per image).
