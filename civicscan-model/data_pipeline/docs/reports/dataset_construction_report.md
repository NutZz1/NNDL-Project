# CivicScan — Dataset Construction Report

**Building, cleaning and validating an eight-class detection dataset for urban
infrastructure decay from vehicle-mounted street imagery.**

Prepared by Member A (data engineering) · 4 September 2026
Repository: `civicScan` · `civicscan-model/data_pipeline`

> Markdown source of record. A formatted Word version of the same content is at
> `docs/CivicScan_Dataset_Construction_Report.docx`.

---

## 1. Executive summary

Eight independent sources were converted into a single unified COCO-format
dataset of **32,260 images and 48,292 annotations** across eight classes. The
schema validator passes with zero errors and zero warnings.

The headline result is not growth. The dataset contains roughly 11% *fewer*
annotations than it did at the start of this work, because four rounds of
cleaning removed more incorrect and duplicated data than the new sources
added. The meaningful result is distribution: the largest class fell from
55.9% to 33.0% of the dataset, and the smallest rose from 0.53% to 1.56%.
Every class now sits between 1.6% and 33%.

Four defects were found that had been silently corrupting the data, including
a train/test leakage bug and a mask threshold that was converting 167
annotated images into false negatives. A perceptual-hashing dedup stage was
introduced after discovering that public dataset repositories are dominated by
re-uploads; it has since blocked 2,229 duplicate images from entering the
merge.

---

## 2. Dataset at a glance

| Measure | At start | Now |
|---|---:|---:|
| Sources | 4 | 8 |
| Images | 27,061 | 32,260 |
| Annotations | 54,168 | 48,292 |
| Largest class share | 55.9% | 33.0% |
| Smallest class share | 0.53% | 1.56% |
| Validator status | passing | passing (0 errors, 0 warnings) |

### 2.1 Sources

| Source | Class fed | Images | Annotations |
|---|---|---:|---:|
| RDD2022 (India + Japan) | 4 road classes | 15,522 | 19,934 |
| TrashTrail | litter | 3,343 | 11,081 |
| Crackseg9k | crack_structural | 4,813 | 7,013 |
| TACO | litter | 1,499 | 4,858 |
| BridgeDeckCsust | crack_structural | 2,582 | 2,219 |
| RoboflowManholeJinggai | 2 hazard classes | 2,157 | 2,064 |
| RoboflowManhole | 2 hazard classes | 1,427 | 951 |
| RoboflowManholeG8rvh | 2 hazard classes | 917 | 172 |
| **Total** | | **32,260** | **48,292** |

A substantial share of images carry zero annotations by design: 5,995 RDD2022
frames with no in-taxonomy damage, 1,434 crack-free wall images, and manhole
frames whose only object was an intact cover. These are deliberate negatives
for false-positive suppression.

### 2.2 Class balance

| Class | Domain | At start | Now | Share |
|---|---|---:|---:|---:|
| `litter` | civic_waste | 2,982 | 15,939 | 33.01% |
| `crack_structural` | structural_damage | 30,301 | 9,232 | 19.12% |
| `crack_alligator` | road_damage | 7,031 | 7,031 | 14.56% |
| `crack_longitudinal` | road_damage | 4,751 | 4,751 | 9.84% |
| `pothole` | road_damage | 4,654 | 4,654 | 9.64% |
| `crack_transverse` | road_damage | 3,498 | 3,498 | 7.24% |
| `manhole_damaged` | hazard | 662 | 2,435 | 5.04% |
| `manhole_missing` | hazard | 289 | 752 | 1.56% |
| **Total** | | **54,168** | **48,292** | **100%** |

Raw and capped inverse-frequency loss weights are now identical: the spread
finally fits inside the 10× median cap, so the cap is no longer doing any work.

### 2.3 Splits

Group-aware 70/15/15, seed 42. No image-id overlap; all eight classes present
in all three splits.

| Split | Images | Annotations | `manhole_missing` |
|---|---:|---:|---:|
| train | 22,870 | 34,155 | 543 |
| val | 4,718 | 7,136 | 105 |
| test | 4,672 | 7,001 | 104 |

---

## 3. Pipeline architecture

Each source has its own converter producing a unified COCO file; the files are
then merged, validated, split and profiled. The unified schema is standard
COCO (`images`, `annotations`, `categories`) plus six extension fields on
every image.

| Field | Purpose |
|---|---|
| `source_dataset` | Which source the image came from; drives per-source behaviour downstream |
| `source_domain` | Supercategory tag (road_damage, structural_damage, civic_waste, hazard) |
| `valid_categories` | Every class the source is capable of annotating — enables per-source loss masking |
| `capture_context` | handheld / vehicle_windshield / static_camera / drone / unknown |
| `geo` | Null for all training data; populated only by the live deployment pipeline |
| `license` | Per-image license string |

`valid_categories` is the critical field. The validator enforces that every
annotation's category appears in its image's `valid_categories`, which is what
makes it safe to train one detector on sources that annotate different,
non-overlapping class sets.

### 3.1 Design decisions

- **Namespaced ID blocks.** Each source reserves a 10-million-wide id block, so
  converters can run independently without collision. Verified: zero id
  collisions across all eight sources.
- **Group-aware splitting, never random.** Sources derived from video or photo
  sequences put near-duplicate frames in both train and test under random
  splitting, inflating reported mAP. Each source has its own grouping rule.
- **Segmentation preserved only where it earns its place.** Crackseg9k carries
  7,013 polygon annotations because bounding boxes are a weak proxy for crack
  severity; every other source is bbox-only.
- **Class mappings live in one auditable config, never inline.** All
  Roboflow-derived mappings sit in `converters/roboflow_sources.py` so any
  mapping question is answerable without reading conversion code.

---

## 4. Work carried out

### 4.1 Round 1 — hazard classes

`manhole_missing` stood at 289 instances (0.53%), too thin for a hazard class
where recall matters. A survey of public listings found the category dominated
by re-uploads of a single origin dataset. Every candidate was perceptually
hashed against existing holdings before forking.

One listing advertising a completely different taxonomy proved pixel-identical
to photos already held on 58 of 58 samples — different class names, same
photographs. Two genuinely independent sources were added instead.

### 4.2 Round 2 — litter

TACO's own downloader retrieves images from live Flickr URLs and had recovered
only 968 of 1,500; the remainder are dead links from a 2019-era collection. A
pre-mirrored copy restored the full set. It **replaced** the partial pull
rather than being merged alongside it, since merging would have double-counted
roughly 968 photographs and could have placed one photograph in both train and
test.

A second, independent litter source was added, taking the class from 2,982 to
15,939 annotations.

### 4.3 Round 3 — structural cracks

Two independent problems were found in the same source. First, 41% of it was
close-range road pavement sitting in a class defined as buildings, bridges and
walls — the same physical defect that other classes already cover, which would
have taught the model contradictory labels. Those subsets were excluded after
classifying every subset from sampled contact sheets (retained in
`docs/crackseg9k_subset_samples/`).

Second, connected-component extraction was counting mask *gaps* rather than
cracks: a single hairline crack fading against wall render returned nine or
more components, each becoming its own annotation. Annotation counts were
measuring mask quality, not defect counts. Proximity-based merging reduced the
worst subset from 6.99 to 2.23 annotations per image.

### 4.4 Round 4 — bridge data and label review

`crack_structural` contained no bridge data at all and was 87.0% a single
subset of wall façades. A bridge-inspection source was added after confirming
it shows real bridge structure — girders, soffits, bearing seats and
underside-of-deck views — bringing single-subset concentration down to 66.1%.

Separately, three manhole labels were reviewed against crops of the *actual
annotation boxes* rather than full frames. Two labels previously skipped were
found to represent genuine defects and were remapped, raising
`manhole_damaged` from 1,645 to 2,435.

---

## 5. Defects found and fixed

Each of the following was silently corrupting data before it was caught.

| Defect | Impact if unfixed |
|---|---|
| Split grouping collapsed to two groups | The grouping key put every RDD2022 image into one group per country, placing an entire country in the test split. Now country plus 100-frame buckets: 231 groups, largest 80 images. |
| Mask threshold erased a subset | At the original threshold, 167 of 175 images in one subset converted to "no crack" — their 1-pixel cracks fell below the area floor. 167 false negatives, the worst possible label noise. |
| Wrong ground-truth directory | The source ships a folder of same-named files at a different resolution that is a model output, not an annotation. The converter now refuses to read it. |
| Components counted gaps, not cracks | One continuous crack produced nine or more annotations, so a model correctly finding the whole crack scored as several misses, and severity scoring saw nine short cracks instead of one long one. |
| Out-of-bounds boxes | Annotations extended past the image edge and failed validation. Now clamped, with floating-point noise reported separately from genuine overshoots. |
| Validator performance | The per-annotation cross-check scanned every image, roughly 5×10⁸ comparisons on the merged set. Now a single lookup table; runs in seconds. |

---

## 6. Duplicate detection

Public dataset repositories are dominated by re-uploads, and a duplicate
photograph is worse than a wasted one: the group-aware splitter keys on
filename, so the same photograph can land in both train and test. A
perceptual-hash stage (64-bit difference hash) now runs at import on every
multi-source class.

| Source | Images blocked | Cause |
|---|---:|---|
| RoboflowManholeJinggai | 1,435 of 3,592 (40%) | same photographs as an existing manhole source |
| BridgeDeckCsust | 390 of 2,972 (13%) | cross-source and within-source repeats |
| TrashTrail | 315 of 3,658 (9%) | near-duplicate fixed-camera frames |
| RoboflowManholeG8rvh | 89 of 1,006 (9%) | cross-source and internal repeats |
| **Total blocked** | **2,229** | |

The threshold is not uniform, and deliberately so. For the bridge source, the
default distance discarded 23% of the images: the measured nearest-neighbour
distribution showed no separated duplicate cluster, only a smooth rise into a
bulk of unrelated grey-concrete photographs. A tighter threshold was used
there, and the full distribution recorded in the converter so the choice is
auditable.

---

## 7. Known limitations

These are stated rather than smoothed over; several exist precisely because the
headline metrics would otherwise read better than the data warrants.

- **Bridge coverage is one inspection campaign.** It should not be assumed to
  generalise across bridge types, materials or lighting. Concentration
  improving from 87.0% to 66.1% is a real but modest gain — 90% of the class is
  now two sources rather than one. `crack_structural` should be described as
  building façades, walls and masonry plus bridge structure from a single
  campaign, not as general structural damage.
- **`litter` is now the largest class at 33.01%.** The dominance problem moved
  rather than disappeared.
- **One litter source is substantially fixed-CCTV footage**, with burned-in
  timestamps and frames seconds apart. Its 11,081 annotations represent
  materially fewer independent scenes than the count implies.
- **Near-duplicate bridge frames can cross the split boundary**, a consequence
  of the deliberately tighter dedup threshold for that source.
- **The TACO mirror carries about 74 more annotations than the official
  release** and 1,499 of its 1,500 images. Unexplained; not investigated
  further.
- **RDD2022 frame grouping is bucketed, not sequence-exact:** the filenames
  carry no drive identifier, so roughly 230 bucket boundaries across 15,522
  images can place adjacent frames in different splits.
- **A pile-level illegal-dumping source was evaluated and declined.** Its box
  granularity contradicts the per-item convention of the `litter` class, and it
  would break the downstream cluster-based dumping detection by design. It
  remains the best viewpoint match found and would only be worth revisiting if
  a ninth class with its own annotation scheme were formally added.

---

## 8. Licensing

All eight sources confirmed from the source of record.

| Source | License | Confirmed from |
|---|---|---|
| RDD2022 | CC BY-SA 4.0 | project README |
| TACO | annotations CC BY 4.0; per-image terms vary | project site; 466 images are ODbL, carried per image |
| Crackseg9k | CC0 1.0 | Harvard Dataverse metadata |
| TrashTrail | CC BY 4.0 | repository listing |
| BridgeDeckCsust | CC BY 4.0 | repository listing |
| RoboflowManhole | CC BY 4.0 | README shipped in the export |
| RoboflowManholeG8rvh | CC BY 4.0 | repository listing |
| RoboflowManholeJinggai | CC BY 4.0 | repository listing |

---

## 9. Handoff

| Artefact | Contents |
|---|---|
| `output/splits/train.json` | 22,870 images / 34,155 annotations |
| `output/splits/val.json` | 4,718 images / 7,136 annotations |
| `output/splits/test.json` | 4,672 images / 7,001 annotations |
| `output/class_weights.json` | raw and capped inverse-frequency loss weights |
| `docs/implementation.md` | decisions, reasoning and before/after figures |
| `docs/crackseg9k_subset_samples/` | contact sheets behind the subset classifications |

The split files are **not tracked in git** (34 MB combined) — regenerate them
with the documented commands in `README.md`. `class_weights.json` **is**
tracked.

Every annotation's category is inside its image's `valid_categories`, enforced
by the validator on every run, so per-source loss masking is safe to rely on.
