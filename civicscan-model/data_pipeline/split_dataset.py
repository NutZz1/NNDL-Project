"""
Train/val/test splitter — deliberately NOT random, per the leakage risk we
flagged (random splitting on video-sequence-derived datasets like RDD2022
puts near-duplicate consecutive frames of the same physical defect into
both train and test, inflating reported mAP).

Splitting strategy per source (all four verified against the real
filenames in our actual downloads, not assumed):

  - RDD2022 (Kaggle mirror): filenames are `Country_NNNNNN.jpg` with dense,
    sequential numbering per country (India 0..9891, Japan 0..13132, gap of
    1 between ~70% of consecutive images). There is NO drive/sequence id in
    the filename, so exact sequence grouping is impossible — but consecutive
    numbers are consecutive frames of the same drive, which is exactly the
    near-duplicate leakage we care about. We therefore group by
    country + a fixed-size bucket of the frame number
    (`RDD_SEQUENCE_BUCKET`, default 100), which keeps runs of consecutive
    frames together while still producing hundreds of groups to split over.
    Grouping by country alone (what the old prefix heuristic effectively
    did) yields only TWO groups for India+Japan and puts an entire country
    in test — that was the bug this replaces.
    Residual risk, documented deliberately: the two frames either side of a
    bucket boundary can land in different splits. That is ~1 pair per
    boundary vs. ~15.5k images, and is the price of having no real
    sequence id.

  - Crackseg9k: filenames are `<SubDataset>_<id>[-<patch>].png` (e.g.
    `CFD_001.png`, `DeepCrack_11116-1.png`, `DeepCrack_11116-4.png`). The
    `-N` suffix marks PATCHES CROPPED FROM THE SAME SOURCE IMAGE, so those
    must stay together — that is the real leakage risk here, not the
    sub-dataset. Group key is therefore sub-dataset + base image id.
    (Holding out whole sub-datasets instead would measure cross-domain
    generalization, but with only ~10 sub-datasets the split fractions
    become uncontrollable and whole textures vanish from train. Use
    `--crackseg-group subdataset` if you deliberately want that experiment.)

  - TACO: independent Flickr photos, no sequences — plain per-image
    grouping (i.e. an unconstrained stratified random split). This holds for
    the Roboflow mirror too: same photos, so still no sequences.

  - TrashTrail: NOT independent. It is an aggregation of at least three
    sub-collections whose filenames survive into the export
    (`yolov7trash_IMG_8853`, `yolov7trash_trash-214-`, `litter2_000076`),
    and the IMG numbers come in tight clusters (…6744, 6756, 6777…), i.e.
    consecutive shots from one walk down one street. Grouped by
    sub-collection + a bucket of consecutive sequence numbers, the same
    treatment RDD2022 gets and for the same reason.

  - RoboflowManhole: filenames look sequential (`well0_0004`, `well0_0005`,
    ...), but spot-checking consecutive indices by eye confirms they are
    unrelated scenes, not video frames — so per-image grouping is correct
    here too, and grouping by the `wellN` prefix would collapse the whole
    source into 7 groups for no benefit.

Usage:
    python split_dataset.py --dataset output/civicscan_merged.json \
        --out-dir output/splits --val-frac 0.15 --test-frac 0.15
"""

import argparse
import json
import random
import re
from pathlib import Path
from collections import defaultdict
import sys

sys.path.append(str(Path(__file__).resolve().parent))
sys.path.append(str(Path(__file__).resolve().parent / "converters"))
from schema import new_unified_dataset_dict
# Single source of truth for "which filename tokens identify the SOURCE PHOTO
# a Crackseg9k patch was cut from" — defined next to the converter that
# established it, imported here so the two can never drift apart.
from crackseg9k_to_coco import CRACKSEG_SUBSETS, subset_of


# Number of consecutive RDD2022 frame indices that are kept in one group.
# Bigger = safer against consecutive-frame leakage, but fewer groups to
# split over. 100 gives ~231 groups across India+Japan.
RDD_SEQUENCE_BUCKET = 100

# Consecutive TrashTrail frame numbers kept together. Smaller than the
# RDD2022 bucket because these are hand-held walk-past shots, not a
# continuous vehicle drive, so runs of near-identical frames are shorter.
TRASHTRAIL_SEQUENCE_BUCKET = 25

_TRASHTRAIL_STRIP = ("trashtrail_", "train_", "valid_", "test_")


def _trashtrail_collection_and_seq(stem: str):
    """
    `trashtrail_train_yolov7trash_IMG_8853_JPG_jpg.rf.<hash>`
        -> ("yolov7trash_IMG", 8853)
    `trashtrail_valid_litter2_000076_jpg.rf.<hash>`
        -> ("litter2", 76)
    `trashtrail_test_yolov7trash_trash-214-_JPG_jpg.rf.<hash>`
        -> ("yolov7trash_trash", 214)

    Split into tokens and take the FIRST purely-numeric one as the sequence
    number; everything before it is the sub-collection. A regex anchored on
    "collection ends in a letter" looks equivalent but is not: it silently
    fails on `litter2`, whose name ends in a digit, and sends every image in
    that sub-collection to the unparsed fallback.
    """
    for prefix in _TRASHTRAIL_STRIP:
        if stem.startswith(prefix):
            stem = stem[len(prefix):]
    tokens = re.split(r"[_-]", stem)
    for i, tok in enumerate(tokens):
        if tok.isdigit():
            if i == 0:
                break
            return "_".join(tokens[:i]), int(tok)
    return None, None

# "patch" (default) groups Crackseg9k patches cut from the same source
# image; "subdataset" holds out whole sub-datasets instead. See module
# docstring for why patch is the default.
CRACKSEG_GROUP_MODE = "patch"

# `rdd2022_Japan_008361.jpg` -> ("Japan", 8361). Country names can contain
# underscores (United_States), so anchor on the trailing numeric run.
_RDD_NAME_RE = re.compile(r"^(?:rdd2022_)?(?P<country>.+)_(?P<num>\d+)$")


def group_key_for_image(img: dict) -> str:
    """
    Returns a grouping key such that all images sharing a key MUST end up
    in the same split. This is the core leakage-prevention mechanism.
    """
    source = img["source_dataset"]
    stem = Path(img["file_name"]).stem

    if source == "RDD2022":
        m = _RDD_NAME_RE.match(stem)
        if m:
            bucket = int(m.group("num")) // RDD_SEQUENCE_BUCKET
            return f"RDD2022::{m.group('country')}::seq{bucket:05d}"
        # Unrecognised filename shape: fall back to per-image grouping.
        # That is leakier than bucketing but never silently collapses the
        # whole source into one group, which is the failure mode that
        # actually bit us.
        return f"RDD2022::unparsed::{img['id']}"

    if source == "Crackseg9k":
        if stem.startswith("crackseg9k_"):
            stem = stem[len("crackseg9k_"):]
        subset = subset_of(stem)
        if subset is None:
            return f"Crackseg9k::unparsed::{img['id']}"
        if CRACKSEG_GROUP_MODE == "subdataset":
            return f"Crackseg9k::{subset}"
        # Everything after the subset prefix is <source-photo id tokens> +
        # <crop coordinates>; keep only the id tokens so all crops of one
        # photo share a key. The trailing "-N" on DeepCrack names is a patch
        # index, so it is stripped too.
        n_id_tokens = CRACKSEG_SUBSETS[subset][2]
        rest = stem[len(subset):].lstrip("_")
        base = "_".join(rest.split("_")[:n_id_tokens]).split("-")[0]
        return f"Crackseg9k::{subset}::{base}"

    if source == "TrashTrail":
        collection, seq = _trashtrail_collection_and_seq(stem)
        if collection is not None:
            bucket = seq // TRASHTRAIL_SEQUENCE_BUCKET
            return f"TrashTrail::{collection}::seq{bucket:05d}"
        return f"TrashTrail::unparsed::{img['id']}"

    # TACO / the three manhole sources: independent images, group key =
    # itself (equivalent to no grouping constraint beyond per-image).
    # Verified for the manhole sources by eye — consecutive `well0_0004`,
    # `well0_0005` filenames are unrelated scenes, not video frames.
    return f"{source}::{img['id']}"


def stratified_group_split(images, val_frac, test_frac, seed=42):
    """
    Groups images by group_key_for_image, then assigns whole groups to
    splits, stratified per source_dataset so each source is proportionally
    represented in train/val/test rather than one source accidentally
    landing entirely in train.
    """
    rng = random.Random(seed)

    by_source = defaultdict(list)
    for img in images:
        by_source[img["source_dataset"]].append(img)

    train_ids, val_ids, test_ids = set(), set(), set()

    for source, imgs in by_source.items():
        groups = defaultdict(list)
        for img in imgs:
            groups[group_key_for_image(img)].append(img["id"])

        group_keys = list(groups.keys())
        rng.shuffle(group_keys)

        n_groups = len(group_keys)
        n_test_groups = max(1, int(n_groups * test_frac))
        n_val_groups = max(1, int(n_groups * val_frac))

        test_groups = group_keys[:n_test_groups]
        val_groups = group_keys[n_test_groups:n_test_groups + n_val_groups]
        train_groups = group_keys[n_test_groups + n_val_groups:]

        for g in test_groups:
            test_ids.update(groups[g])
        for g in val_groups:
            val_ids.update(groups[g])
        for g in train_groups:
            train_ids.update(groups[g])

        print(f"  {source:20s} groups: train={len(train_groups):5d} "
              f"val={len(val_groups):5d} test={len(test_groups):5d}  "
              f"(images: train={sum(len(groups[g]) for g in train_groups)}, "
              f"val={sum(len(groups[g]) for g in val_groups)}, "
              f"test={sum(len(groups[g]) for g in test_groups)})")

    return train_ids, val_ids, test_ids


def build_subset(data, keep_image_ids):
    subset = new_unified_dataset_dict()
    subset["images"] = [i for i in data["images"] if i["id"] in keep_image_ids]
    subset["annotations"] = [a for a in data["annotations"] if a["image_id"] in keep_image_ids]
    return subset


def split(dataset_path: Path, out_dir: Path, val_frac: float, test_frac: float, seed: int):
    with open(dataset_path) as f:
        data = json.load(f)

    print("Splitting (group-aware, stratified per source):")
    train_ids, val_ids, test_ids = stratified_group_split(
        data["images"], val_frac, test_frac, seed
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    for split_name, ids in [("train", train_ids), ("val", val_ids), ("test", test_ids)]:
        subset = build_subset(data, ids)
        out_path = out_dir / f"{split_name}.json"
        with open(out_path, "w") as f:
            json.dump(subset, f)
        print(f"\n[{split_name}] {len(subset['images'])} images, "
              f"{len(subset['annotations'])} annotations -> {out_path}")

    overlap = (train_ids & val_ids) | (train_ids & test_ids) | (val_ids & test_ids)
    if overlap:
        print(f"\n[ERROR] {len(overlap)} image ids ended up in multiple splits — bug in split logic!")
    else:
        print("\n[ok] No image-id overlap across splits.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", type=Path, required=True)
    ap.add_argument("--out-dir", type=Path, required=True)
    ap.add_argument("--val-frac", type=float, default=0.15)
    ap.add_argument("--test-frac", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--rdd-sequence-bucket", type=int, default=RDD_SEQUENCE_BUCKET,
                    help="how many consecutive RDD2022 frame indices share a group")
    ap.add_argument("--trashtrail-sequence-bucket", type=int,
                    default=TRASHTRAIL_SEQUENCE_BUCKET,
                    help="how many consecutive TrashTrail frame indices share a group")
    ap.add_argument("--crackseg-group", choices=["patch", "subdataset"],
                    default=CRACKSEG_GROUP_MODE,
                    help="group Crackseg9k by source-image patch family (default) "
                         "or hold out whole sub-datasets")
    args = ap.parse_args()

    RDD_SEQUENCE_BUCKET = args.rdd_sequence_bucket
    TRASHTRAIL_SEQUENCE_BUCKET = args.trashtrail_sequence_bucket
    CRACKSEG_GROUP_MODE = args.crackseg_group

    split(args.dataset, args.out_dir, args.val_frac, args.test_frac, args.seed)
