"""
Converts TACO into the unified schema, from either of two sources.

  --format roboflow  (DEFAULT, and what we now ship)
      A Roboflow COCO export of the pre-mirrored TACO dataset, forked from
      https://universe.roboflow.com/taco-2we3b/taco-litter. 1,499 of the
      official 1,500 images and 4,782 of the 4,784 annotations, with the
      images served from Roboflow storage instead of Flickr.

  --format official
      The original github.com/pedropro/TACO layout, whose images are fetched
      from live Flickr URLs by TACO's own download.py.

WHY THE DEFAULT CHANGED: the official route only ever recovered 968 of
1,500 images for us. The rest are dead Flickr links (2019-era link rot, not
a bug on our side) and re-running the scraper does not fix them. The mirror
is a superset of what we had: 33 of 60 sampled mirror images hash-match
images already in our pull, and the misses carry TACO's own filenames, i.e.
they are exactly the dead links. So the mirror REPLACES the partial pull
rather than being merged alongside it — merging would double-count ~968
photos and could place the same photo in both train and test.

Both formats write source_dataset="TACO" and share one id block, so nothing
downstream needs to know which route produced the file.

TACO ships with ~60 fine-grained categories (e.g. "Plastic bag", "Cigarette",
"Drink can", ...). Per the locked taxonomy decision, we flatten ALL of these
into the single unified `litter` class for v1. If the team later decides
material-type matters for dispatch routing, this is the one place to change
that (map fine categories to multiple unified classes instead of one).

Expected input:
    TACO_root/
        data/
            annotations.json      (single COCO file, all images referenced
                                    by relative batch_x/image.jpg paths)
            batch_1/*.jpg
            batch_2/*.jpg
            ...

TACO ships annotations for 1500 images but NOT the images — download.py
fetches them from Flickr, and a 2019-era Flickr collection has link rot, so
a fresh download lands well short of 1500. Images whose file is not on disk
are therefore skipped by default (--allow-missing-images keeps them, which
would hand Member B a dataset whose file_names do not resolve). Rerun the
converter after any further download attempt; the run summary prints how
many were missing.

Usage:
    python taco_to_coco.py --root /path/to/TACO_root \
        --out /path/to/output/taco_unified.json \
        --img-out-prefix taco_
"""

import argparse
import json
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parent.parent))
from schema import CATEGORY_NAME_TO_ID, source_domain_for, new_unified_dataset_dict
from utils.id_allocator import image_id_offset, annotation_id_offset, LocalCounter
from utils.bbox import clip_bbox, ClipStats

SOURCE = "TACO"


# TACO records a per-image license (Flickr terms vary image to image); it is
# NOT uniformly CC BY 4.0. Observed values in our copy: 466 images ODbL via
# OpenLitterMap, 319 "CC", 715 with no license recorded at all. CC BY 4.0
# covers TACO's ANNOTATIONS; the images keep their own terms, so carry
# whatever TACO recorded per image instead of stamping one blanket string.
TACO_IMAGE_LICENSES = {
    "ODBL (c) OpenLitterMap & Contributors": "TACO_IMAGE_ODBL_OpenLitterMap",
    "CC": "TACO_IMAGE_CC_UNSPECIFIED_VARIANT",
}
TACO_LICENSE_UNKNOWN = "TACO_ANNOTATIONS_CC_BY_4.0_IMAGE_LICENSE_UNRECORDED"


def convert(root_dir: Path, out_path: Path, img_out_prefix: str,
            flatten_to_single_class: bool = True,
            allow_missing_images: bool = False):
    ann_path = root_dir / "data" / "annotations.json"
    if not ann_path.exists():
        # some TACO releases put annotations.json at root instead of data/
        ann_path = root_dir / "annotations.json"
    image_root = ann_path.parent
    with open(ann_path) as f:
        taco = json.load(f)

    dataset = new_unified_dataset_dict()
    img_counter = LocalCounter(image_id_offset(SOURCE))
    ann_counter = LocalCounter(annotation_id_offset(SOURCE))

    valid_categories = [CATEGORY_NAME_TO_ID["litter"]]
    domain = source_domain_for(SOURCE)
    unified_litter_id = CATEGORY_NAME_TO_ID["litter"]

    # Map original TACO image_id -> our new unified image_id
    taco_img_id_to_new_id = {}

    n_missing = 0
    for img in taco["images"]:
        # TACO file_name is usually "batch_x/000123.jpg", relative to the
        # directory holding annotations.json.
        if not (image_root / img["file_name"]).exists():
            n_missing += 1
            if not allow_missing_images:
                continue

        new_id = img_counter.next()
        taco_img_id_to_new_id[img["id"]] = new_id

        safe_name = img["file_name"].replace("/", "_")

        dataset["images"].append({
            "id": new_id,
            "file_name": f"{img_out_prefix}{safe_name}",
            "width": img.get("width"),
            "height": img.get("height"),
            "source_dataset": SOURCE,
            "source_domain": domain,
            "valid_categories": valid_categories,
            # TACO images are a genuine mix of contexts (street-level,
            # beach, park, close-range), and the annotation file carries no
            # capture metadata to separate them — "unknown" is the accurate
            # tag here, and the domain-gap audit treats it as such.
            "capture_context": "unknown",
            "geo": {"lat": None, "lon": None},
            "license": TACO_IMAGE_LICENSES.get(img.get("license"),
                                               TACO_LICENSE_UNKNOWN),
        })

    n_anns = 0
    clip_stats = ClipStats()
    wh_by_new_id = {i["id"]: (i["width"], i["height"]) for i in dataset["images"]}
    for ann in taco["annotations"]:
        if ann["image_id"] not in taco_img_id_to_new_id:
            continue  # orphaned annotation, or its image was never downloaded
        x, y, w, h = ann["bbox"]
        if w <= 0 or h <= 0:
            continue

        # A few TACO boxes were drawn slightly past the image edge (up to
        # ~1.3px above the top). Clamp them rather than shipping boxes the
        # validator rejects.
        new_image_id = taco_img_id_to_new_id[ann["image_id"]]
        img_w, img_h = wh_by_new_id[new_image_id]
        bbox, overshoot = clip_bbox(x, y, w, h, img_w, img_h)
        clip_stats.record(bbox, overshoot)
        if bbox is None:
            continue

        if flatten_to_single_class:
            category_id = unified_litter_id
        else:
            # NOT IMPLEMENTED: fine-grained mapping. If the team decides
            # against flattening later, build a TACO-category-id -> unified
            # -category-id dict here instead of this flattening shortcut.
            raise NotImplementedError(
                "Fine-grained TACO category mapping not built yet — "
                "flatten_to_single_class=False requires the mapping table."
            )

        dataset["annotations"].append({
            "id": ann_counter.next(),
            "image_id": new_image_id,
            "category_id": category_id,
            "bbox": bbox,
            "segmentation": None,  # dropping TACO's polygon masks for v1
                                     # consistency with bbox-only litter class;
                                     # revisit if litter severity needs area
                                     # more precisely than bbox gives.
            "area": bbox[2] * bbox[3],
            "iscrowd": 0,
        })
        n_anns += 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(dataset, f)

    print(f"[TACO] Done. {len(dataset['images'])} images, {n_anns} annotations "
          f"written to {out_path}")
    print(f"[TACO] bbox bounds: {clip_stats.summary()}")
    if n_missing:
        state = "KEPT anyway (--allow-missing-images)" if allow_missing_images             else "skipped"
        print(f"[TACO] {n_missing} of {len(taco['images'])} annotated images "
              f"have no file on disk ({state}) — expected Flickr link rot for "
              f"a 2019 collection. Rerun download.py, then rerun this converter.")


def convert_roboflow_mirror(root_dir: Path, out_path: Path, dedup_against=()):
    """The mirror is an ordinary Roboflow COCO export; the shared reader and
    the class mapping in roboflow_sources.py do all the work."""
    sys.path.append(str(Path(__file__).resolve().parent))
    from roboflow_sources import get as get_source
    from roboflow_common import convert_roboflow_export
    return convert_roboflow_export(get_source("taco_mirror"), root_dir,
                                   out_path, dedup_against=dedup_against)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--format", choices=["roboflow", "official"], default="roboflow",
                    help="roboflow = forked pre-mirrored export (default); "
                         "official = pedropro/TACO layout with Flickr-downloaded images")
    ap.add_argument("--root", type=Path, required=True, help="TACO root directory")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--img-out-prefix", type=str, default="taco_")
    ap.add_argument("--allow-missing-images", action="store_true",
                    help="keep images whose file was never downloaded "
                         "(off by default — their file_name would not resolve)")
    args = ap.parse_args()

    if args.format == "roboflow":
        convert_roboflow_mirror(args.root, args.out)
    else:
        convert(args.root, args.out, args.img_out_prefix,
                allow_missing_images=args.allow_missing_images)
