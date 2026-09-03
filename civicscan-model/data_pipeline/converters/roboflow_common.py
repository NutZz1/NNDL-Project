"""
Shared reader for Roboflow COCO exports.

Every Roboflow export has the same shape regardless of which project it
came from:

    export_root/
        train/_annotations.coco.json + *.jpg
        valid/_annotations.coco.json + *.jpg
        test/_annotations.coco.json  + *.jpg

(or a single flat directory when the project has no splits). Image and
annotation ids restart at 0 in every split file, so each split has to be
remapped separately — reusing one id map across splits would silently merge
different images that happen to share an id.

Roboflow's own train/valid/test split is deliberately discarded: we do our
own group-aware split later, and inheriting a random split would reintroduce
exactly the leakage split_dataset.py exists to prevent.

Class mappings come from roboflow_sources.py — never from a caller.
"""

import json
from pathlib import Path
import sys
from collections import defaultdict

sys.path.append(str(Path(__file__).resolve().parent.parent))
from schema import CATEGORY_NAME_TO_ID, source_domain_for, new_unified_dataset_dict
from utils.id_allocator import image_id_offset, annotation_id_offset, LocalCounter
from utils.bbox import clip_bbox, ClipStats
from utils.imagehash import DuplicateIndex, dhash

SPLIT_DIRS = ["train", "valid", "test"]


def find_coco_sources(root_dir: Path):
    """Returns [(image_dir, annotations_json, split_name), ...]."""
    flat = root_dir / "_annotations.coco.json"
    if flat.exists():
        return [(root_dir, flat, "")]

    found = []
    for split in SPLIT_DIRS:
        j = root_dir / split / "_annotations.coco.json"
        if j.exists():
            found.append((root_dir / split, j, split))
    if not found:
        # Roboflow sometimes nests the export one level down.
        for j in sorted(root_dir.rglob("_annotations.coco.json")):
            found.append((j.parent, j, j.parent.name))
    if not found:
        raise FileNotFoundError(
            f"No _annotations.coco.json found under {root_dir}"
        )
    return found


# Every Roboflow COCO export prepends a dummy category 0 whose name is the
# project's annotation-group label and whose supercategory is the literal
# string "none" (e.g. id 0 "litter", id 0 "123", id 0 "good-lose-broke").
# No annotation ever references it. It must be skipped rather than mapped:
# under flatten_all_to it would otherwise become a real class, and under
# class_map it would be reported as an unknown class on every run.
ROBOFLOW_DUMMY_SUPERCATEGORY = "none"


def dummy_category_ids(rf_categories):
    return {c["id"] for c in rf_categories
            if c.get("supercategory") == ROBOFLOW_DUMMY_SUPERCATEGORY}


def resolve_class(cfg, rf_name):
    """
    Returns (mapped_class_name_or_None, is_known).
    `is_known` is False only when the export contains a class the config has
    never heard of — that is a louder problem than a deliberate skip,
    because it means the upstream export changed under us.
    """
    if cfg.get("flatten_all_to"):
        return cfg["flatten_all_to"], True
    class_map = cfg["class_map"]
    if rf_name not in class_map:
        return None, False
    return class_map[rf_name], True


def convert_roboflow_export(cfg, root_dir: Path, out_path: Path,
                            dedup_against=(), dedup_within=False,
                            image_ext_hint=".jpg", dedup_filter=None,
                            dedup_threshold=None):
    """
    Converts one Roboflow COCO export into the unified schema.

    dedup_against: directories of already-accepted images. Any incoming
                   image matching one of them is dropped, because the same
                   photo in two sources can land in two different splits.
    dedup_within:  also drop duplicates inside this export itself.
    dedup_filter:  predicate(path) -> bool, narrowing which files in
                   dedup_against actually enter the index. Use it when a
                   directory holds images that are NOT in the merged dataset.
    dedup_threshold: override the default hash distance. Tighten it when a
                   source's imagery is low-texture enough that the default
                   catches coincidental similarity rather than duplicates —
                   see bridge_to_coco.py for a worked example.
    """
    source = cfg["source_dataset"]
    sources = find_coco_sources(root_dir)

    dataset = new_unified_dataset_dict()
    img_counter = LocalCounter(image_id_offset(source))
    ann_counter = LocalCounter(annotation_id_offset(source))
    domain = source_domain_for(source)

    if cfg.get("flatten_all_to"):
        valid_categories = [CATEGORY_NAME_TO_ID[cfg["flatten_all_to"]]]
    else:
        valid_categories = sorted({
            CATEGORY_NAME_TO_ID[v] for v in cfg["class_map"].values() if v
        })

    # ---- build the dedup index up front -------------------------------
    index = (DuplicateIndex(dedup_threshold) if dedup_threshold
             else DuplicateIndex())
    for d in dedup_against:
        n = index.add_directory(d, predicate=dedup_filter)
        print(f"[{source}] dedup index: +{n} images from {d}")
    dedup_enabled = bool(dedup_against) or dedup_within

    n_anns = 0
    n_dummy = 0
    n_dropped_dup = 0
    n_missing_file = 0
    skipped = defaultdict(int)
    unknown = defaultdict(int)
    dup_examples = []
    per_split = {}
    clip_stats = ClipStats()

    for img_dir, src_json, split_name in sources:
        with open(src_json) as f:
            rf = json.load(f)
        rf_cat_name = {c["id"]: c["name"] for c in rf["categories"]}
        dummy_ids = dummy_category_ids(rf["categories"])

        rf_img_id_to_new = {}
        wh_by_new_id = {}
        split_imgs = split_anns = 0

        for img in rf["images"]:
            img_path = img_dir / img["file_name"]

            if dedup_enabled:
                if not img_path.exists():
                    n_missing_file += 1
                    continue
                h = dhash(img_path)
                hit = index.find(h)
                if hit is not None:
                    n_dropped_dup += 1
                    if len(dup_examples) < 5:
                        dup_examples.append((img["file_name"], Path(hit[0]).name, hit[1]))
                    continue
                if dedup_within or dedup_against:
                    index.add(str(img_path), h)

            new_id = img_counter.next()
            rf_img_id_to_new[img["id"]] = new_id
            wh_by_new_id[new_id] = (img["width"], img["height"])
            stem = f"{split_name}_{img['file_name']}" if split_name else img["file_name"]
            dataset["images"].append({
                "id": new_id,
                "file_name": f"{cfg['img_prefix']}{stem}",
                "width": img["width"],
                "height": img["height"],
                "source_dataset": source,
                "source_domain": domain,
                "valid_categories": valid_categories,
                "capture_context": cfg["capture_context"],
                "geo": {"lat": None, "lon": None},
                "license": cfg["license"],
            })
            split_imgs += 1

        for ann in rf["annotations"]:
            if ann["image_id"] not in rf_img_id_to_new:
                continue  # image was deduped away, or is not in this split
            if ann["category_id"] in dummy_ids:
                n_dummy += 1
                continue
            rf_name = rf_cat_name.get(ann["category_id"])
            mapped, known = resolve_class(cfg, rf_name)
            if not known:
                unknown[rf_name] += 1
                continue
            if mapped is None:
                skipped[rf_name] += 1
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

    print(f"\n[{source}] Done. {len(dataset['images'])} images, {n_anns} "
          f"annotations written to {out_path}")
    for split_name, (n_i, n_a) in per_split.items():
        print(f"[{source}]   {split_name:8s} images={n_i:6d} kept_annotations={n_a:6d}")
    print(f"[{source}] bbox bounds: {clip_stats.summary()}")
    if n_dropped_dup:
        print(f"[{source}] DEDUP: dropped {n_dropped_dup} duplicate images, e.g.")
        for a, b, d in dup_examples:
            print(f"[{source}]        {a}  ==  {b}  (distance {d})")
    if n_missing_file:
        print(f"[{source}] [warn] {n_missing_file} images listed in the export "
              f"have no file on disk (skipped)")
    if n_dummy:
        print(f"[{source}] skipped {n_dummy} annotations on Roboflow's dummy "
              f"category-0 row")
    if skipped:
        print(f"[{source}] Deliberately skipped (mapped to None): {dict(skipped)}")
    if unknown:
        print(f"[{source}] *** UNKNOWN classes absent from roboflow_sources.py: "
              f"{dict(unknown)} — the export changed, update the config.")

    return dataset
