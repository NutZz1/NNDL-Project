"""
Converts the "aliabdelmenam/rdd-2022" Kaggle mirror of RDD2022 into the
unified schema.

This mirror's structure differs from the OFFICIAL RDD2022 release (which
uses Pascal VOC XML in per-country folders) — see rdd2022_to_coco_OFFICIAL.py
if you ever get the official S3/Figshare zips instead. This script is for
the Kaggle mirror specifically:

    RDD_SPLIT/
        train/
            images/*.jpg      (all countries mixed together, e.g.
                                 "Japan_008361.jpg", "India_001528.jpg")
            labels/*.txt      (YOLO format: class_id cx cy w h, normalized)
        val/
            images/*.jpg
            labels/*.txt
        test/
            images/*.jpg      (likely unlabeled — CRDDC test set)

CONFIRMED class mapping (from this mirror's own rdd2022.yaml — verified
directly, not guessed):
    0: longitudinal crack
    1: transverse crack
    2: alligator crack
    3: other corruption   <- NOT in our taxonomy, skipped
    4: Pothole

Country is recovered from the filename prefix (e.g. "Japan_008361.jpg" ->
country="Japan"). This script filters to ONLY India and Japan per the
project's regional-relevance decision — other countries present in the
mirror (Czech, United_States, China_Drone, Norway, etc.) are skipped.

Usage:
    python rdd2022_kaggle_to_coco.py \
        --root "C:\\Users\\sreep\\Downloads\\archiv\\RDD_SPLIT" \
        --out output/rdd2022_unified.json \
        --img-out-prefix rdd2022_ \
        --countries Japan India \
        --splits train val
"""

import argparse
from pathlib import Path
import json
import sys

sys.path.append(str(Path(__file__).resolve().parent.parent))
from schema import CATEGORY_NAME_TO_ID, source_domain_for, new_unified_dataset_dict
from utils.id_allocator import image_id_offset, annotation_id_offset, LocalCounter

SOURCE = "RDD2022"

# CONFIRMED mapping — verified against this mirror's own rdd2022.yaml file,
# not assumed. Do not change without re-verifying against the actual yaml.
KAGGLE_CLASS_ID_TO_NAME = {
    0: "crack_longitudinal",
    1: "crack_transverse",
    2: "crack_alligator",
    3: None,   # "other corruption" — not in our taxonomy, skip
    4: "pothole",
}

# Countries this mirror includes, based on filename prefixes observed in
# testing (Japan, India, Czech, United_States, China_Drone). Only the ones
# passed via --countries are kept; others are silently skipped (not an
# error — we're deliberately not using the full multi-country set).
KNOWN_COUNTRY_PREFIXES = [
    "Japan", "India", "Czech", "United_States", "China_Drone", "China_MotorBike", "Norway"
]


def extract_country(filename: str) -> str:
    """
    'Japan_008361.jpg' -> 'Japan'
    'United_States_004758.jpg' -> 'United_States'
    Matches against KNOWN_COUNTRY_PREFIXES since some country names have
    underscores themselves (United_States), so a naive split('_')[0] would
    wrongly return 'United' instead of 'United_States'.
    """
    for prefix in sorted(KNOWN_COUNTRY_PREFIXES, key=len, reverse=True):
        if filename.startswith(prefix + "_"):
            return prefix
    # fallback: everything before the last underscore-numeric run
    stem = Path(filename).stem
    return stem.rsplit("_", 1)[0]


def parse_yolo_label(label_path: Path, img_width: int, img_height: int):
    """Returns list of (class_id, xmin, ymin, w, h) in absolute pixels."""
    if not label_path.exists() or label_path.stat().st_size == 0:
        return []

    boxes = []
    with open(label_path) as f:
        lines = [l.strip() for l in f if l.strip()]

    for line in lines:
        parts = line.split()
        if len(parts) < 5:
            continue
        class_id = int(parts[0])
        cx, cy, bw, bh = map(float, parts[1:5])

        abs_w = bw * img_width
        abs_h = bh * img_height
        xmin = (cx * img_width) - abs_w / 2
        ymin = (cy * img_height) - abs_h / 2

        boxes.append((class_id, xmin, ymin, abs_w, abs_h))
    return boxes


def convert(root_dir: Path, out_path: Path, img_out_prefix: str,
            countries: list, splits: list):
    from PIL import Image  # pip install pillow --break-system-packages

    dataset = new_unified_dataset_dict()
    img_counter = LocalCounter(image_id_offset(SOURCE))
    ann_counter = LocalCounter(annotation_id_offset(SOURCE))

    valid_categories = sorted(
        {CATEGORY_NAME_TO_ID[v] for v in KAGGLE_CLASS_ID_TO_NAME.values() if v is not None}
    )
    domain = source_domain_for(SOURCE)

    skipped_countries = {}
    skipped_classes = {}
    n_images, n_anns, n_no_box = 0, 0, 0

    for split in splits:
        img_dir = root_dir / split / "images"
        label_dir = root_dir / split / "labels"

        if not img_dir.exists():
            print(f"[warn] no images dir for split '{split}': {img_dir}")
            continue

        image_files = sorted(img_dir.glob("*.jpg")) + sorted(img_dir.glob("*.png"))
        print(f"[{split}] found {len(image_files)} total images (all countries)")

        for img_path in image_files:
            country = extract_country(img_path.name)
            if country not in countries:
                skipped_countries[country] = skipped_countries.get(country, 0) + 1
                continue

            try:
                with Image.open(img_path) as im:
                    width, height = im.size
            except Exception as e:
                print(f"[warn] could not open {img_path.name}: {e}")
                continue

            label_path = label_dir / (img_path.stem + ".txt")
            raw_boxes = parse_yolo_label(label_path, width, height)

            image_id = img_counter.next()
            kept_any = False

            for (class_id, xmin, ymin, w, h) in raw_boxes:
                mapped = KAGGLE_CLASS_ID_TO_NAME.get(class_id)
                if mapped is None:
                    skipped_classes[class_id] = skipped_classes.get(class_id, 0) + 1
                    continue
                if w <= 0 or h <= 0:
                    continue

                dataset["annotations"].append({
                    "id": ann_counter.next(),
                    "image_id": image_id,
                    "category_id": CATEGORY_NAME_TO_ID[mapped],
                    "bbox": [xmin, ymin, w, h],
                    "segmentation": None,
                    "area": w * h,
                    "iscrowd": 0,
                })
                n_anns += 1
                kept_any = True

            if not kept_any:
                n_no_box += 1
                # kept as a legitimate true negative — RDD2022 exhaustively
                # labels road damage for images it includes, so "no box
                # after filtering 'other corruption'" is a real negative,
                # not a missing annotation.

            dataset["images"].append({
                "id": image_id,
                "file_name": f"{img_out_prefix}{img_path.name}",
                "width": width,
                "height": height,
                "source_dataset": SOURCE,
                "source_domain": domain,
                "valid_categories": valid_categories,
                "capture_context": "vehicle_windshield",
                "geo": {"lat": None, "lon": None},
                "license": "RDD2022_CC_BY_SA_4.0",
            })
            n_images += 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(dataset, f)

    print(f"\n[RDD2022/Kaggle] Done. {n_images} images kept "
          f"({n_no_box} with no valid-class boxes), {n_anns} annotations "
          f"written to {out_path}")
    if skipped_countries:
        print(f"[RDD2022/Kaggle] Skipped images from other countries: {skipped_countries}")
    if skipped_classes:
        print(f"[RDD2022/Kaggle] Skipped unmapped class_id instances "
              f"(class_id 3 = 'other corruption', expected): {skipped_classes}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True,
                     help="Path to RDD_SPLIT folder (contains train/val/test)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--img-out-prefix", type=str, default="rdd2022_")
    ap.add_argument("--countries", nargs="+", default=["Japan", "India"],
                     help="Which countries to keep, e.g. --countries Japan India")
    ap.add_argument("--splits", nargs="+", default=["train", "val"],
                     help="Which Kaggle splits to pull from (test is usually unlabeled)")
    args = ap.parse_args()

    convert(args.root, args.out, args.img_out_prefix, args.countries, args.splits)