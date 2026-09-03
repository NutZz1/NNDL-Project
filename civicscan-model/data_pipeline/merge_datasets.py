"""
Merges the independently-converted per-source unified JSONs into one
combined dataset file. Because each converter used namespaced id blocks
(see utils/id_allocator.py), merging is just concatenation — no id
collisions should occur. This script re-verifies that assumption rather
than trusting it blindly.

Usage:
    python merge_datasets.py \
        --inputs output/rdd2022_unified.json output/taco_unified.json \
                 output/crackseg9k_unified.json output/manhole_unified.json \
        --out output/civicscan_merged.json
"""

import argparse
import json
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parent))
from schema import new_unified_dataset_dict, CATEGORIES


def merge(input_paths, out_path: Path):
    merged = new_unified_dataset_dict()
    seen_image_ids = set()
    seen_ann_ids = set()

    per_source_counts = {}

    for p in input_paths:
        with open(p) as f:
            part = json.load(f)

        for img in part["images"]:
            if img["id"] in seen_image_ids:
                raise ValueError(
                    f"COLLISION: image_id {img['id']} from {p} already seen. "
                    f"Check utils/id_allocator.py SOURCE_BLOCK_INDEX assignment."
                )
            seen_image_ids.add(img["id"])
            merged["images"].append(img)

        for ann in part["annotations"]:
            if ann["id"] in seen_ann_ids:
                raise ValueError(
                    f"COLLISION: annotation_id {ann['id']} from {p} already seen."
                )
            seen_ann_ids.add(ann["id"])
            merged["annotations"].append(ann)

        src_name = part["images"][0]["source_dataset"] if part["images"] else Path(p).stem
        per_source_counts[src_name] = {
            "images": len(part["images"]),
            "annotations": len(part["annotations"]),
        }

        # categories should be identical across all parts since they all
        # import from the same schema.py — sanity check that nobody
        # hand-edited one. Checked inside this loop rather than in a second
        # pass: the Crackseg9k part carries per-crack polygons and is large
        # enough that re-reading every input just for this is wasteful.
        if part["categories"] != CATEGORIES:
            print(f"[warn] {p} has categories that differ from current schema.py "
                  f"CATEGORIES — was this converted with an older taxonomy version?")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(merged, f)

    print(f"\n[merge] Wrote {len(merged['images'])} images, "
          f"{len(merged['annotations'])} annotations to {out_path}\n")
    print("Per-source breakdown:")
    for src, counts in per_source_counts.items():
        print(f"  {src:20s}  images={counts['images']:6d}  annotations={counts['annotations']:6d}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--inputs", nargs="+", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()

    merge(args.inputs, args.out)
