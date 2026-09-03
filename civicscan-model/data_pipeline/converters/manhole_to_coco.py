"""
Converts the Roboflow Universe manhole-cover detection set into the unified
schema. Roboflow exports typically offer either COCO JSON or YOLO .txt
format at export time — this script handles BOTH, pick with --format.

Expected input for --format coco (either layout works):
    manhole_root/                     # flat export
        _annotations.coco.json
        *.jpg
    manhole_root/                     # Roboflow's default split export
        train/_annotations.coco.json + *.jpg
        valid/_annotations.coco.json + *.jpg
        test/_annotations.coco.json  + *.jpg

    When the split layout is detected, ALL splits are read into one unified
    file — we do our own group-aware splitting later in split_dataset.py, so
    Roboflow's random split is deliberately discarded (keeping it would mean
    inheriting a random split we already decided is leakage-prone).

Expected input for --format yolo:
    manhole_root/
        images/*.jpg
        labels/*.txt        (YOLO format: class_id cx cy w h, normalized 0-1)
        data.yaml           (defines class_id -> name mapping — Roboflow
                              always includes this; read it to build the map)

This file now handles THREE manhole sources. The original export below is
read by this file's own reader; the two later Roboflow forks
(--source manhole_g8rvh / manhole_jinggai) go through the shared
converters/roboflow_common.py reader, with every class mapping declared in
converters/roboflow_sources.py so all of them can be audited in one place.

CONFIRMED against the actual download ("Manhole Cover Dataset YOLO.v4i.coco",
Roboflow Universe project create-dataset-for-yolo/manhole-cover-dataset-yolo,
v4, CC BY 4.0): the categories list is
    0 Broken-Lose-Uncovered-Good   (Roboflow's dummy supercategory row)
    1 Broken   2 Good   3 Lose   4 Uncovered
See ROBOFLOW_CLASS_MAP below for how each maps into our taxonomy.

Usage:
    python manhole_to_coco.py --root /path/to/manhole_root --format coco \
        --out /path/to/output/manhole_unified.json --img-out-prefix manhole_
"""

import argparse
import json
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parent.parent))
from schema import CATEGORY_NAME_TO_ID, source_domain_for, new_unified_dataset_dict
from utils.id_allocator import image_id_offset, annotation_id_offset, LocalCounter
from utils.bbox import clip_bbox, ClipStats

SOURCE = "RoboflowManhole"

# Left-hand side = Roboflow's original class name (case-sensitive, exactly
# as it appears in _annotations.coco.json), right-hand side = our unified
# class name, or None to skip that class.
ROBOFLOW_CLASS_MAP = {
    # CONFIRMED class names from this download's _annotations.coco.json
    # (all three splits carry an identical categories list).
    #
    # "Broken"    -> cover present but cracked / collapsed, hole exposed.
    # "Lose"      -> cover present but displaced / not seated in its frame
    #                (verified by eye on sample crops: tilted or slid-off
    #                covers, not open holes). A loose cover is a damaged,
    #                hazardous cover — NOT a missing one — so it maps to
    #                manhole_damaged. This is the one judgement call in this
    #                map; flip it here if the team disagrees.
    # "Uncovered" -> open hole, no cover at all -> manhole_missing.
    # "Good"      -> intact cover, not a hazard -> skipped (no annotation).
    #                The image is still kept, so intact covers appear in
    #                training as unlabelled background rather than being
    #                absent entirely.
    "Broken": "manhole_damaged",
    "Lose": "manhole_damaged",
    "Uncovered": "manhole_missing",
    "Good": None,
    # Roboflow emits a dummy category 0 named after every class joined
    # together; it is never used by real annotations, but map it explicitly
    # so it can never be mistaken for an unknown class.
    "Broken-Lose-Uncovered-Good": None,
}

# Roboflow's default split layout. Order is fixed so image ids are
# deterministic across reruns.
ROBOFLOW_SPLIT_DIRS = ["train", "valid", "test"]


def _find_coco_sources(root_dir: Path):
    """
    Returns [(image_dir, annotations_json_path, split_name), ...].
    Handles both the flat export and Roboflow's train/valid/test layout.
    """
    flat = root_dir / "_annotations.coco.json"
    if flat.exists():
        return [(root_dir, flat, "")]

    found = []
    for split in ROBOFLOW_SPLIT_DIRS:
        j = root_dir / split / "_annotations.coco.json"
        if j.exists():
            found.append((root_dir / split, j, split))
    if not found:
        raise FileNotFoundError(
            f"No _annotations.coco.json found in {root_dir} or in its "
            f"{ROBOFLOW_SPLIT_DIRS} subfolders."
        )
    return found


def convert_from_coco(root_dir: Path, out_path: Path, img_out_prefix: str):
    sources = _find_coco_sources(root_dir)

    dataset = new_unified_dataset_dict()
    img_counter = LocalCounter(image_id_offset(SOURCE))
    ann_counter = LocalCounter(annotation_id_offset(SOURCE))
    domain = source_domain_for(SOURCE)
    valid_categories = sorted(
        {CATEGORY_NAME_TO_ID[v] for v in ROBOFLOW_CLASS_MAP.values() if v is not None}
    )

    n_anns, skipped, unknown = 0, {}, {}
    per_split = {}
    clip_stats = ClipStats()
    wh_by_new_id = {}

    for img_dir, src_json, split_name in sources:
        with open(src_json) as f:
            rf = json.load(f)

        rf_cat_id_to_name = {c["id"]: c["name"] for c in rf["categories"]}

        # Roboflow restarts image/annotation ids at 0 in every split file, so
        # the remap below must be rebuilt per split — reusing one dict across
        # splits would silently merge different images that share an id.
        rf_img_id_to_new = {}
        split_imgs, split_anns = 0, 0

        for img in rf["images"]:
            new_id = img_counter.next()
            rf_img_id_to_new[img["id"]] = new_id
            wh_by_new_id[new_id] = (img["width"], img["height"])
            # Keep the split folder in the flattened name: Roboflow filenames
            # already carry a content hash, but this keeps every unified
            # file_name traceable back to the exact file on disk.
            stem = f"{split_name}_{img['file_name']}" if split_name else img["file_name"]
            dataset["images"].append({
                "id": new_id,
                "file_name": f"{img_out_prefix}{stem}",
                "width": img["width"],
                "height": img["height"],
                "source_dataset": SOURCE,
                "source_domain": domain,
                "valid_categories": valid_categories,
                # CONFIRMED by eye on sample images: these are close-range
                # street-level phone photos of individual covers (several
                # carry phone camera watermarks), not dashcam frames.
                "capture_context": "handheld",
                "geo": {"lat": None, "lon": None},
                "license": "RoboflowManhole_CC_BY_4.0",
            })
            split_imgs += 1

        for ann in rf["annotations"]:
            rf_name = rf_cat_id_to_name.get(ann["category_id"])
            if rf_name not in ROBOFLOW_CLASS_MAP:
                # A class we've never seen — louder than a deliberate skip,
                # because it means the export changed under us.
                unknown[rf_name] = unknown.get(rf_name, 0) + 1
                continue
            mapped = ROBOFLOW_CLASS_MAP[rf_name]
            if mapped is None:
                skipped[rf_name] = skipped.get(rf_name, 0) + 1
                continue
            if ann["image_id"] not in rf_img_id_to_new:
                continue
            x, y, w, h = ann["bbox"]
            if w <= 0 or h <= 0:
                continue
            new_image_id = rf_img_id_to_new[ann["image_id"]]
            img_w, img_h = wh_by_new_id[new_image_id]
            bbox, overshoot = clip_bbox(x, y, w, h, img_w, img_h)
            clip_stats.record(bbox, overshoot)
            if bbox is None:
                continue
            dataset["annotations"].append({
                "id": ann_counter.next(),
                "image_id": new_image_id,
                "category_id": CATEGORY_NAME_TO_ID[mapped],
                "bbox": bbox,
                "segmentation": None,
                "area": bbox[2] * bbox[3],
                "iscrowd": 0,
            })
            n_anns += 1
            split_anns += 1

        per_split[split_name or "(flat)"] = (split_imgs, split_anns)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(dataset, f)

    print(f"[Manhole/COCO] Done. {len(dataset['images'])} images, {n_anns} "
          f"annotations written to {out_path}")
    print(f"[Manhole/COCO] bbox bounds: {clip_stats.summary()}")
    for split_name, (n_i, n_a) in per_split.items():
        print(f"[Manhole/COCO]   {split_name:8s} images={n_i:5d} kept_annotations={n_a:5d}")
    if skipped:
        print(f"[Manhole/COCO] Deliberately skipped (mapped to None): {skipped}")
    if unknown:
        print(f"[Manhole/COCO] *** UNKNOWN classes not in ROBOFLOW_CLASS_MAP: "
              f"{unknown} — the export's categories changed, update the map.")


def convert_from_yolo(root_dir: Path, out_path: Path, img_out_prefix: str):
    import yaml  # pip install pyyaml --break-system-packages
    from PIL import Image  # pip install pillow --break-system-packages

    with open(root_dir / "data.yaml") as f:
        data_yaml = yaml.safe_load(f)
    yolo_names = data_yaml["names"]  # list, index = class_id
    if isinstance(yolo_names, dict):
        yolo_names = [yolo_names[i] for i in range(len(yolo_names))]

    dataset = new_unified_dataset_dict()
    img_counter = LocalCounter(image_id_offset(SOURCE))
    ann_counter = LocalCounter(annotation_id_offset(SOURCE))
    domain = source_domain_for(SOURCE)
    valid_categories = sorted(
        {CATEGORY_NAME_TO_ID[v] for v in ROBOFLOW_CLASS_MAP.values() if v is not None}
    )

    img_dir = root_dir / "images"
    label_dir = root_dir / "labels"
    n_anns, skipped = 0, {}

    for img_path in sorted(img_dir.glob("*.jpg")):
        label_path = label_dir / (img_path.stem + ".txt")
        with Image.open(img_path) as im:
            width, height = im.size

        image_id = img_counter.next()

        if label_path.exists():
            with open(label_path) as f:
                lines = [l.strip() for l in f if l.strip()]
            for line in lines:
                parts = line.split()
                class_id = int(parts[0])
                cx, cy, w, h = map(float, parts[1:5])
                rf_name = yolo_names[class_id]
                mapped = ROBOFLOW_CLASS_MAP.get(rf_name)
                if mapped is None:
                    skipped[rf_name] = skipped.get(rf_name, 0) + 1
                    continue

                # denormalize YOLO cx,cy,w,h -> absolute xmin,ymin,w,h
                abs_w = w * width
                abs_h = h * height
                xmin = (cx * width) - abs_w / 2
                ymin = (cy * height) - abs_h / 2

                dataset["annotations"].append({
                    "id": ann_counter.next(),
                    "image_id": image_id,
                    "category_id": CATEGORY_NAME_TO_ID[mapped],
                    "bbox": [xmin, ymin, abs_w, abs_h],
                    "segmentation": None,
                    "area": abs_w * abs_h,
                    "iscrowd": 0,
                })
                n_anns += 1

        dataset["images"].append({
            "id": image_id,
            "file_name": f"{img_out_prefix}{img_path.name}",
            "width": width,
            "height": height,
            "source_dataset": SOURCE,
            "source_domain": domain,
            "valid_categories": valid_categories,
            "capture_context": "handheld",
            "geo": {"lat": None, "lon": None},
            "license": "RoboflowManhole_CC_BY_4.0",
        })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(dataset, f)

    print(f"[Manhole/YOLO] Done. {len(dataset['images'])} images, {n_anns} "
          f"annotations written to {out_path}")
    if skipped:
        print(f"[Manhole/YOLO] Skipped classes not in ROBOFLOW_CLASS_MAP: {skipped}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--img-out-prefix", type=str, default="manhole_")
    ap.add_argument("--format", choices=["coco", "yolo"], required=True)
    ap.add_argument("--source", default=None,
                    help="key in converters/roboflow_sources.py, e.g. "
                         "manhole_g8rvh or manhole_jinggai. Omit for the "
                         "original 'Manhole Cover Dataset YOLO' export, "
                         "which uses this file's own reader.")
    ap.add_argument("--dedup-against", type=Path, nargs="*", default=[],
                    help="directories of already-accepted images to dedup "
                         "against. REQUIRED for manhole_jinggai: 42%% of its "
                         "photos duplicate the original manhole source.")
    args = ap.parse_args()

    if args.source:
        # Additional manhole sources are ordinary Roboflow COCO exports and
        # go through the shared reader, so their class mappings live in
        # roboflow_sources.py next to every other Roboflow mapping.
        sys.path.append(str(Path(__file__).resolve().parent))
        from roboflow_sources import get as get_source
        from roboflow_common import convert_roboflow_export
        convert_roboflow_export(get_source(args.source), args.root, args.out,
                                dedup_against=args.dedup_against)
    elif args.format == "coco":
        convert_from_coco(args.root, args.out, args.img_out_prefix)
    else:
        convert_from_yolo(args.root, args.out, args.img_out_prefix)
