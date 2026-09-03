"""
Schema/sanity validator — run this before handing the merged dataset to
Member B. Catches the mistakes that are easy to make silently across four
independent converters (missing valid_categories, boxes outside image
bounds, orphaned annotations, category ids not in the master list, etc.)

Usage:
    python validate_schema.py --dataset output/civicscan_merged.json
"""

import argparse
import json
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parent))
from schema import CATEGORY_ID_TO_NAME, VALID_CAPTURE_CONTEXTS


def validate(dataset_path: Path):
    with open(dataset_path) as f:
        data = json.load(f)

    errors = []
    warnings = []

    valid_cat_ids = set(CATEGORY_ID_TO_NAME.keys())
    image_ids = set()
    image_id_to_wh = {}
    # Built once up front: the per-annotation valid_categories cross-check
    # below used to do a linear scan of data["images"] per annotation, which
    # is ~3e8 comparisons on the real merged dataset (15k+ images x 20k+
    # annotations) and made the validator look hung.
    image_id_to_valid_cats = {}

    for img in data["images"]:
        if img["id"] in image_ids:
            errors.append(f"Duplicate image id: {img['id']}")
        image_ids.add(img["id"])
        image_id_to_wh[img["id"]] = (img["width"], img["height"])
        image_id_to_valid_cats[img["id"]] = img.get("valid_categories")

        if "valid_categories" not in img or not img["valid_categories"]:
            errors.append(f"image {img['id']} ({img['file_name']}) missing/empty valid_categories")
        else:
            for c in img["valid_categories"]:
                if c not in valid_cat_ids:
                    errors.append(f"image {img['id']} has unknown category id "
                                   f"{c} in valid_categories")

        if img.get("source_domain") is None:
            errors.append(f"image {img['id']} missing source_domain")

        if img.get("capture_context") not in VALID_CAPTURE_CONTEXTS:
            warnings.append(f"image {img['id']} has capture_context="
                             f"'{img.get('capture_context')}' not in the "
                             f"standard set {VALID_CAPTURE_CONTEXTS}")

        geo = img.get("geo", {})
        if geo.get("lat") is not None or geo.get("lon") is not None:
            if img["source_dataset"] != "live_deployment":
                warnings.append(f"image {img['id']} from {img['source_dataset']} "
                                 f"has non-null geo — expected null for static "
                                 f"training sources")

        if not img.get("license") or "VERIFY" in img.get("license", ""):
            warnings.append(f"image {img['id']} has unverified/placeholder "
                             f"license string: {img.get('license')}")

    ann_ids = set()
    for ann in data["annotations"]:
        if ann["id"] in ann_ids:
            errors.append(f"Duplicate annotation id: {ann['id']}")
        ann_ids.add(ann["id"])

        if ann["image_id"] not in image_ids:
            errors.append(f"annotation {ann['id']} references missing "
                           f"image_id {ann['image_id']}")
            continue

        if ann["category_id"] not in valid_cat_ids:
            errors.append(f"annotation {ann['id']} has unknown category_id "
                           f"{ann['category_id']}")

        # cross-check: annotation's category must be in its image's
        # valid_categories — this is the single most important invariant
        # for Member B's loss masking to work correctly.
        img_valid = image_id_to_valid_cats.get(ann["image_id"])
        if img_valid is not None and ann["category_id"] not in img_valid:
            errors.append(f"CRITICAL: annotation {ann['id']} has category_id "
                           f"{ann['category_id']} not present in its image's "
                           f"valid_categories {img_valid} — loss masking will "
                           f"silently discard this annotation's gradient")

        x, y, w, h = ann["bbox"]
        if w <= 0 or h <= 0:
            errors.append(f"annotation {ann['id']} has non-positive bbox "
                           f"dimensions: {ann['bbox']}")

        img_w, img_h = image_id_to_wh.get(ann["image_id"], (None, None))
        if img_w and (x < 0 or y < 0 or x + w > img_w + 1 or y + h > img_h + 1):
            errors.append(f"annotation {ann['id']} bbox extends outside "
                           f"image bounds ({img_w}x{img_h}): {ann['bbox']}")

    print(f"Validated {len(data['images'])} images, {len(data['annotations'])} annotations.\n")

    if warnings:
        print(f"--- {len(warnings)} WARNINGS ---")
        for w in warnings[:50]:
            print(f"  [warn] {w}")
        if len(warnings) > 50:
            print(f"  ... and {len(warnings) - 50} more")
        print()

    if errors:
        print(f"--- {len(errors)} ERRORS ---")
        for e in errors[:50]:
            print(f"  [ERROR] {e}")
        if len(errors) > 50:
            print(f"  ... and {len(errors) - 50} more")
        print(f"\nFAILED — fix errors before handing off to Member B.")
        sys.exit(1)
    else:
        print("PASSED — no schema errors found.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", type=Path, required=True)
    args = ap.parse_args()
    validate(args.dataset)
