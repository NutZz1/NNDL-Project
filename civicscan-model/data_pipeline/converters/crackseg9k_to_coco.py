"""
Converts Crackseg9k (pixel mask PNGs) into the unified schema.

This is the one converter that PRESERVES segmentation, per the locked
decision to keep pixel masks for the crack_structural class rather than
flattening to boxes only — Member C needs this for real-world crack
length/width severity calibration, and Member B may use it for a
conditional segmentation head.

CONFIRMED layout of the actual Harvard Dataverse download (dataverse_files.zip
-> Final-Dataset-Vol1.zip + Final-Dataset-Vol2.zip, extracted side by side):

    Crackseg9k_root/
        Final-Dataset-Vol1/
            Images/                 5413 x 400x400 .png
            Final_Masks/
                Masks/              9159 x 400x400 .png   <- GROUND TRUTH
                Heads/              9159 x 480x480 .png   <- NOT ground truth
                train.txt, test.txt (the paper's own split; ignored here, we
                                     do our own group-aware split later)
        Final-Dataset-Vol2/
            Images-2/               3746 x 400x400 .png

Two traps in that layout, both handled below:
  1. The images are split across TWO volumes but the masks all live in Vol1,
     so every volume has to be indexed before matching.
  2. Final_Masks/Heads/ holds a file for EVERY mask filename, at a different
     resolution (480x480) and visibly noisy — viewing one next to its
     Images/ + Masks/ counterpart shows it is a model prediction/feature
     map, not an annotation. Never point this converter at Heads/.

Masks are not strictly binary: they are anti-aliased greyscale spanning the
full 0-255 range (~1-2% of pixels above threshold on a cracked image,
essentially 0 on a noncrack_* negative), so we threshold rather than compare
against 255.

Threshold / min-area defaults were MEASURED, not guessed. Counting how many
images still yield a component, per subset:

    subset        t=127,a=20   t=64,a=20   t=32,a=20   t=127,a=5
    cracktree200     8/175       161/175     174/175     175/175 (18.7 ann/img)
    noncrack         0/300         0/300       0/300       0/300
    CRACK500       200/200       200/200     200/200     200/200
    Rissbilder     197/200       199/200     199/200     198/200

  - t=127 (the geometric "50% pixel coverage" point) silently destroyed
    cracktree200: its cracks are ~1px wide, so after thresholding they break
    into components smaller than the 20px floor. 167 of 175 images would
    have been written out as crack-free — false negatives, the worst
    possible label noise.
  - Dropping the area floor to 5px rescues them but shatters every crack
    into ~19 fragment annotations per image, which is worse supervision.
  - t=64 keeps 92% of cracktree200, roughly halves Rissbilder's
    over-fragmentation (13.4 -> 8.3 annotations per image, i.e. fewer,
    longer, correctly-joined crack instances), and still yields ZERO
    annotations on the noncrack_* negatives.
  - t=32 recovers the last 13 cracktree200 images but visibly dilates every
    crack (mean component area on Rissbilder goes 182 -> 648 px), which
    would bias Member C's crack-width severity calibration.

Hence threshold=64, min_pixel_area=20.

An image whose mask has real signal but yields no surviving component is
NOT written out as a negative — it is dropped, because we know it was
annotated as cracked and keeping it would teach the model that a cracked
surface is background. Only masks that are blank up to the threshold
(the noncrack_* subset, whose masks are either all-zero or carry a few
single-digit noise values) are kept as true negatives.

Requires: opencv-python, numpy, pillow
    pip install opencv-python-headless numpy pillow --break-system-packages

Usage:
    python crackseg9k_to_coco.py --root /path/to/Crackseg9k_root \
        --out /path/to/output/crackseg9k_unified.json \
        --img-out-prefix crackseg9k_
"""

import argparse
import json
from pathlib import Path
import sys
from collections import defaultdict

sys.path.append(str(Path(__file__).resolve().parent.parent))
from schema import CATEGORY_NAME_TO_ID, source_domain_for, new_unified_dataset_dict
from utils.id_allocator import image_id_offset, annotation_id_offset, LocalCounter

SOURCE = "Crackseg9k"

# Sub-dataset inventory, taken from the actual filenames in our download
# (every filename starts with its sub-dataset name) and cross-checked by
# eyeballing a contact sheet of 4 images per family with the mask overlaid.
#
#   surface="road"       -> close-range asphalt/concrete PAVEMENT shots.
#       These are the same physical defect RDD2022 annotates as
#       crack_longitudinal / crack_transverse / crack_alligator, just from
#       much closer range. They are the domain-gap risk the team flagged:
#       they enter our taxonomy as crack_structural, so the model can see
#       near-identical pixels under two different labels.
#       Still included by default (the locked decision is to keep Crackseg9k
#       separate rather than merge it into the road classes) — use
#       --exclude-subsets to drop them if the team decides otherwise.
#   surface="structural" -> walls, plaster, masonry, tiles. No overlap with
#       the RDD2022 road classes.
#
# capture_context is limited to schema.VALID_CAPTURE_CONTEXTS. These are all
# close-range surface photographs, so "handheld" is the honest tag for every
# family except GAPS384, which comes from a vehicle-mounted road-scanning
# rig (a downward line-scan camera, NOT a windshield dashcam view).
#
# The third field is how many filename tokens after the prefix identify the
# SOURCE PHOTO (the rest are crop coordinates); split_dataset.py needs this
# to keep patches cut from one photo inside one split.
CRACKSEG_SUBSETS = {
    # prefix                           (surface,      capture_context, n_id_tokens)
    #
    # `surface` records what the subset actually photographs, verified by
    # eyeballing a 24-image contact sheet per subset (saved under
    # docs/crackseg9k_subset_samples/). It drives the default exclusion list.
    #
    # CivicScan's crack_structural class means structural damage to
    # BUILDINGS, BRIDGES AND WALLS. Anything else is excluded:
    #
    #   "road"    close-range asphalt/concrete PAVEMENT. Same physical defect
    #             RDD2022 labels as crack_longitudinal/transverse/alligator,
    #             but Crackseg9k gives no crack-type distinction, so these
    #             cannot be remapped into the road classes either — they can
    #             only be dropped.
    #   "mixed"   photographs BOTH pavement and wall/render at macro range,
    #             with no context in frame and no filename signal to tell
    #             them apart. Not separable from our extracted data.
    #   "indoor"  indoor finishes (floor/wall tiling). Neither road nor
    #             building structure, and never visible from a street-level
    #             vehicle camera.
    #   "structural" walls, plaster, render, masonry — the class definition.
    #
    "CRACK500_IMG":                    ("road",       "handheld",      1),
    "CRACK500":                        ("road",       "handheld",      2),
    "GAPS384_train":                   ("road",       "static_camera", 1),
    "GAPS384_test":                    ("road",       "static_camera", 1),
    "cracktree200":                    ("road",       "handheld",      1),
    "CFD":                             ("road",       "handheld",      1),
    # DeepCrack: the published dataset is described as "concrete and asphalt
    # pavement". Our contact sheet confirms both surface types are present at
    # macro range with no distinguishing context, and the filenames
    # (DeepCrack_11111, DeepCrack_IMG11-1) carry no surface label. Cannot be
    # sub-split; excluded because ambiguity should resolve AGAINST inclusion
    # in a class defined as buildings/bridges/walls.
    "DeepCrack_IMG":                   ("mixed",      "handheld",      1),
    "DeepCrack":                       ("mixed",      "handheld",      1),
    # Indoor floor and wall tiling (bathroom/kitchen), several frames showing
    # skirting boards and sanitary fittings. Not structural damage to a
    # building, bridge or wall in the sense this class means.
    "Ceramic":                         ("indoor",     "handheld",      1),
    # --- the keepers: buildings and walls ---
    "Rissbilder_for_Florian":          ("structural", "handheld",      1),
    "Volker":                          ("structural", "handheld",      1),
    # Crack-free concrete/block/stone walls. Zero annotations by design;
    # retained as true negatives on exactly the surface type we detect on.
    "noncrack_noncrack_concrete_wall": ("structural", "handheld",      1),
    # The Masonry subset ships as single-letter prefixes (a_/b_/c_/d_/h_),
    # e.g. "a_0_10.png" = source image 0, patch 10. Confirmed brick masonry
    # with mortar joints and window frames.
    "a": ("structural", "handheld", 1),
    "b": ("structural", "handheld", 1),
    "c": ("structural", "handheld", 1),
    "d": ("structural", "handheld", 1),
    "h": ("structural", "handheld", 1),
}

# Subsets excluded by default under the buildings/bridges/walls definition.
# Passed to --exclude-subsets in the documented run command.
NON_STRUCTURAL_SUBSETS = [k for k, v in CRACKSEG_SUBSETS.items()
                          if v[0] in ("road", "mixed", "indoor")]


# Longest prefix first so "CRACK500_IMG" wins over "CRACK500" and
# "GAPS384_train" over a bare "GAPS384".
_SUBSET_PREFIXES = sorted(CRACKSEG_SUBSETS, key=len, reverse=True)


def subset_of(stem: str):
    """'CRACK500_20160222_080850_1281_361' -> 'CRACK500'. None if unknown."""
    for p in _SUBSET_PREFIXES:
        if stem == p or stem.startswith(p + "_"):
            return p
    return None


def index_images(root_dir: Path, image_ext: str):
    """
    Maps stem -> image path across every volume. The download splits images
    over Vol1/Images and Vol2/Images-2, so match any directory whose name
    starts with "Images" and does not sit under Final_Masks.
    """
    index = {}
    duplicates = []
    for img_dir in sorted(root_dir.rglob("Images*")):
        if not img_dir.is_dir() or "Final_Masks" in img_dir.parts:
            continue
        for p in img_dir.glob("*" + image_ext):
            if p.stem in index:
                duplicates.append(p.stem)
            index[p.stem] = p
    return index, duplicates


def find_mask_dir(root_dir: Path) -> Path:
    """
    Locates Final_Masks/Masks. Deliberately never returns Final_Masks/Heads:
    Heads holds a same-named file per mask but is a noisy 480x480 model
    output, not ground truth — see module docstring.
    """
    candidates = [d for d in root_dir.rglob("Masks")
                  if d.is_dir() and d.parent.name == "Final_Masks"]
    if not candidates:
        candidates = [d for d in root_dir.rglob("masks") if d.is_dir()]
    if not candidates:
        raise FileNotFoundError(
            "No Final_Masks/Masks directory under " + str(root_dir) +
            " — check that both Final-Dataset-Vol*.zip volumes are extracted here."
        )
    return sorted(candidates)[0]


# Connected components whose bounding boxes come within this many pixels are
# emitted as ONE annotation. See merge_component_clusters() for why.
DEFAULT_MERGE_MARGIN = 8


def merge_component_clusters(components, margin: int):
    """
    Groups connected components into crack instances.

    THE PROBLEM. cv2.connectedComponents counts blobs, not cracks. A single
    hairline crack across a wall fades in and out against the render, so its
    mask arrives in pieces: one continuous crack in Rissbilder routinely
    returns 9+ separate components, each of which used to become its own
    annotation. The annotation count then measured how gappy the mask was
    rather than how many cracks were present, which (a) let one subset
    dominate the class weight, (b) chopped boxes mid-crack so a model that
    correctly found the whole crack scored as several misses, and (c) handed
    Member C nine short cracks instead of one long one, when length is the
    severity signal.

    THE FIX. Union components whose bounding boxes fall within `margin`
    pixels of each other. This is proximity-based, NOT one-per-image: two
    cracks on opposite sides of a frame stay separate instances. On the
    illustrated example it yields 9 components -> 2 instances.

    WHY NOT the alternatives, all measured on a 1,130-image sample:
      - morphological closing made things WORSE on thin subsets: cracktree200
        went 260 -> 1,320 annotations at k=7, because the erode half of the
        close severs 1px hairlines that dilate had unevenly thickened.
      - MIN_PIXEL_AREA=50 erased cracktree200 almost entirely (260 -> 4),
        the same silent-false-negative failure as the old 127 threshold.
      - one-instance-per-image fuses genuinely distinct cracks into a single
        near-full-frame box.

    COST, measured over 500 kept-subset images: boxes/image 6.21 -> 2.29,
    crack pixels as a share of box area 16.6% -> 11.7%. That cost is small
    because a thin diagonal crack's axis-aligned box is ~85% background at
    ANY granularity — tight boxes are not available for this shape, which is
    exactly why the segmentation masks are preserved. The polygons are
    untouched by this merge: a merged instance carries the union of its
    components' polygons as a multi-part segmentation, and its `area` stays
    the true crack pixel count, never the box area. Member C's length/width
    severity scoring is therefore unaffected.

    `components` is a list of (polygons, bbox, area) with bbox in
    [x, y, w, h]. Returns the same shape, merged. margin <= 0 disables.
    """
    if margin <= 0 or len(components) < 2:
        return components

    def rect(b):
        return [b[0], b[1], b[0] + b[2], b[1] + b[3]]

    items = [(rect(b), polys, area) for polys, b, area in components]
    changed = True
    while changed:
        changed = False
        out = []
        while items:
            cur_r, cur_p, cur_a = items.pop()
            merged_any = True
            while merged_any:
                merged_any = False
                rest = []
                for r, pl, a in items:
                    if (cur_r[0] - margin <= r[2] and r[0] - margin <= cur_r[2] and
                            cur_r[1] - margin <= r[3] and r[1] - margin <= cur_r[3]):
                        cur_r = [min(cur_r[0], r[0]), min(cur_r[1], r[1]),
                                 max(cur_r[2], r[2]), max(cur_r[3], r[3])]
                        cur_p = cur_p + pl      # multi-part segmentation
                        cur_a += a              # true crack pixels, not box area
                        merged_any = changed = True
                    else:
                        rest.append((r, pl, a))
                items = rest
            out.append((cur_r, cur_p, cur_a))
        items = out

    return [(p_, [r[0], r[1], r[2] - r[0], r[3] - r[1]], a) for r, p_, a in items]


def mask_to_polygons_and_bbox(mask_path: Path, threshold: int, min_pixel_area: int,
                              merge_margin: int = DEFAULT_MERGE_MARGIN):
    """
    Reads a mask, returns (width, height, [(polygons, bbox, area), ...],
    mask_max), one tuple per connected component. mask_max is the brightest
    pixel in the raw mask, used by the caller to tell a genuinely blank mask
    (a true negative) from one whose annotated crack was too faint or too
    thin to survive thresholding.

    A single image may hold multiple spatially distinct cracks, and those
    stay separate annotations. Components belonging to ONE crack — the same
    hairline arriving in pieces because the mask fades — are merged into a
    single instance by merge_component_clusters(); see that function for the
    measurements behind it.
    """
    import cv2
    import numpy as np

    mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise FileNotFoundError("Could not read mask: " + str(mask_path))
    height, width = mask.shape

    # Anti-aliased greyscale, not 0/255 — see module docstring for how the
    # default threshold was measured.
    binary = (mask > threshold).astype(np.uint8)
    mask_max = int(mask.max())

    num_labels, labels = cv2.connectedComponents(binary, connectivity=8)

    results = []
    for label_id in range(1, num_labels):  # skip 0 = background
        component_mask = (labels == label_id).astype(np.uint8)
        pixel_area = int(component_mask.sum())
        if pixel_area < min_pixel_area:
            continue

        contours, _ = cv2.findContours(component_mask, cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        polygons = []
        for contour in contours:
            if len(contour) < 3:
                continue
            polygon = contour.flatten().tolist()
            if len(polygon) >= 6:  # need at least 3 points (x,y pairs)
                polygons.append(polygon)
        if not polygons:
            continue

        ys, xs = component_mask.nonzero()
        xmin, xmax = xs.min(), xs.max()
        ymin, ymax = ys.min(), ys.max()
        # +1 so a component only one pixel wide/tall still gets a positive
        # box — the validator rejects w <= 0 or h <= 0.
        bbox = [float(xmin), float(ymin),
                float(xmax - xmin + 1), float(ymax - ymin + 1)]

        results.append((polygons, bbox, float(pixel_area)))

    results = merge_component_clusters(results, merge_margin)

    return width, height, results, mask_max


def convert(root_dir: Path, out_path: Path, img_out_prefix: str,
            image_ext=".png", mask_ext=".png", threshold=64,
            min_pixel_area=20, exclude_subsets=(),
            merge_margin=DEFAULT_MERGE_MARGIN):
    from PIL import Image

    mask_dir = find_mask_dir(root_dir)
    image_index, duplicate_stems = index_images(root_dir, image_ext)
    print("[Crackseg9k] masks: " + str(mask_dir))
    print("[Crackseg9k] indexed %d images with ext %s" % (len(image_index), image_ext))
    if duplicate_stems:
        print("[Crackseg9k] [warn] %d image stems appear in more than one "
              "volume, last one wins: %s" % (len(duplicate_stems), duplicate_stems[:5]))

    dataset = new_unified_dataset_dict()
    img_counter = LocalCounter(image_id_offset(SOURCE))
    ann_counter = LocalCounter(annotation_id_offset(SOURCE))

    valid_categories = [CATEGORY_NAME_TO_ID["crack_structural"]]
    domain = source_domain_for(SOURCE)
    category_id = CATEGORY_NAME_TO_ID["crack_structural"]

    n_images = n_anns = n_no_crack = n_missing_image = n_size_mismatch = 0
    n_excluded = n_dropped_unconvertible = 0
    unknown_subsets = defaultdict(int)
    per_subset = defaultdict(lambda: {"images": 0, "anns": 0, "empty": 0,
                                      "dropped": 0})

    mask_files = sorted(mask_dir.glob("*" + mask_ext))
    if not mask_files:
        print("[error] no mask files found in %s with ext %s" % (mask_dir, mask_ext))
        return

    for i, mask_path in enumerate(mask_files, 1):
        if i % 1000 == 0:
            print("[Crackseg9k]   %d/%d masks processed" % (i, len(mask_files)))

        stem = mask_path.stem
        subset = subset_of(stem)
        if subset is None:
            unknown_subsets[stem.split("_")[0]] += 1
        if subset in exclude_subsets:
            n_excluded += 1
            continue

        img_path = image_index.get(stem)
        if img_path is None:
            n_missing_image += 1
            continue

        width, height, components, mask_max = mask_to_polygons_and_bbox(
            mask_path, threshold, min_pixel_area, merge_margin)

        if not components and mask_max > threshold:
            # The mask carries real annotated signal that no component
            # survived. Writing this out as a negative would be a false
            # negative, so drop the image instead — see module docstring.
            n_dropped_unconvertible += 1
            per_subset[subset or "<unknown>"]["dropped"] += 1
            continue

        with Image.open(img_path) as im:
            img_w, img_h = im.size
        if (img_w, img_h) != (width, height):
            # Polygons are in mask pixel coordinates; a differently-sized
            # image would silently misalign them. Skip loudly rather than
            # ship wrong boxes.
            n_size_mismatch += 1
            print("[Crackseg9k] [warn] size mismatch %s: image %dx%d vs mask "
                  "%dx%d, skipping" % (stem, img_w, img_h, width, height))
            continue

        image_id = img_counter.next()
        surface, capture_context, _ = CRACKSEG_SUBSETS.get(
            subset, ("unknown", "unknown", 1))

        if not components:
            n_no_crack += 1
            per_subset[subset or "<unknown>"]["empty"] += 1
            # Blank mask (checked above) — the noncrack_* subset is
            # deliberately crack-free and those images are useful negatives,
            # so an empty mask must not drop the image.

        for (polygons, bbox, area) in components:
            dataset["annotations"].append({
                "id": ann_counter.next(),
                "image_id": image_id,
                "category_id": category_id,
                "bbox": bbox,
                "segmentation": polygons,
                "area": area,
                "iscrowd": 0,
            })
            n_anns += 1
            per_subset[subset or "<unknown>"]["anns"] += 1

        dataset["images"].append({
            "id": image_id,
            "file_name": img_out_prefix + img_path.name,
            "width": width,
            "height": height,
            "source_dataset": SOURCE,
            "source_domain": domain,
            "valid_categories": valid_categories,
            "capture_context": capture_context,
            "geo": {"lat": None, "lon": None},
            "license": "Crackseg9k_CC0_1.0",
        })
        n_images += 1
        per_subset[subset or "<unknown>"]["images"] += 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(dataset, f)

    print("\n[Crackseg9k] Done. %d images (%d with no components above "
          "threshold, kept as true negatives), %d annotations written to %s"
          % (n_images, n_no_crack, n_anns, out_path))
    if n_missing_image:
        print("[Crackseg9k] %d masks had no matching image" % n_missing_image)
    if n_size_mismatch:
        print("[Crackseg9k] %d skipped for image/mask size mismatch" % n_size_mismatch)
    if n_excluded:
        print("[Crackseg9k] %d masks skipped via --exclude-subsets" % n_excluded)
    if n_dropped_unconvertible:
        print("[Crackseg9k] %d images DROPPED: mask had signal above the "
              "threshold but no component survived --min-pixel-area, so they "
              "could not honestly be kept as negatives" % n_dropped_unconvertible)
    if unknown_subsets:
        print("[Crackseg9k] [warn] filenames matching no known subset prefix "
              "(tagged capture_context=unknown): %s" % dict(unknown_subsets))

    print("\n[Crackseg9k] Per-subset breakdown (surface tag drives the "
          "domain-gap audit):")
    print("  %-34s %-11s %7s %7s %7s %8s"
          % ("subset", "surface", "images", "anns", "empty", "dropped"))
    for name in sorted(per_subset, key=lambda k: -per_subset[k]["images"]):
        surface = CRACKSEG_SUBSETS.get(name, ("unknown",))[0]
        s = per_subset[name]
        print("  %-34s %-11s %7d %7d %7d %8d"
              % (name, surface, s["images"], s["anns"], s["empty"], s["dropped"]))

    road_imgs = sum(v["images"] for k, v in per_subset.items()
                    if CRACKSEG_SUBSETS.get(k, ("",))[0] in ("road", "mixed", "indoor"))
    if road_imgs:
        print("\n[Crackseg9k] NOTE: %d/%d images (%.1f%%) are NOT buildings, "
              "bridges or walls (road pavement, mixed-surface or indoor "
              "finishes) yet are labelled crack_structural. Drop them with:"
              "\n    --exclude-subsets %s"
              % (road_imgs, n_images, 100.0 * road_imgs / max(n_images, 1),
                 ",".join(NON_STRUCTURAL_SUBSETS)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True, help="Crackseg9k root directory")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--img-out-prefix", type=str, default="crackseg9k_")
    ap.add_argument("--image-ext", type=str, default=".png")
    ap.add_argument("--mask-ext", type=str, default=".png")
    ap.add_argument("--threshold", type=int, default=64,
                    help="greyscale value above which a mask pixel counts as crack")
    ap.add_argument("--min-pixel-area", type=int, default=20,
                    help="drop connected components smaller than this many pixels")
    ap.add_argument("--merge-margin", type=int, default=DEFAULT_MERGE_MARGIN,
                    help="merge components whose boxes come within this many "
                         "pixels into one crack instance; 0 disables merging "
                         "and restores one-annotation-per-component")
    ap.add_argument("--exclude-subsets", type=str, default="",
                    help="comma-separated subset prefixes to drop entirely, e.g. "
                         "CRACK500,CRACK500_IMG,GAPS384_train,GAPS384_test,"
                         "cracktree200,CFD to keep only non-road structural cracks")
    args = ap.parse_args()

    excluded = tuple(s.strip() for s in args.exclude_subsets.split(",") if s.strip())
    unknown = [s for s in excluded if s not in CRACKSEG_SUBSETS]
    if unknown:
        ap.error("--exclude-subsets got unknown prefixes %s; valid values: %s"
                 % (unknown, sorted(CRACKSEG_SUBSETS)))

    convert(args.root, args.out, args.img_out_prefix, args.image_ext,
            args.mask_ext, args.threshold, args.min_pixel_area, excluded,
            args.merge_margin)
