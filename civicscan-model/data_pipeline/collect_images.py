"""
Materialise the merged dataset's images into ONE flat directory.

WHY THIS EXISTS. The converters write a flattened, prefixed `file_name` into
the unified JSON — `rdd2022_India_000000.jpg`, `taco_train_000056_JPG.rf.<hash>.jpg`
— because eight sources with independent naming would otherwise collide. But
nothing ever moved the pixels: the actual files still sit in eight separate
download directories under their ORIGINAL names. So there is no single
`image_root` on disk that the JSON's `file_name` fields resolve against, and
training cannot load a single image until this script has run.

It rebuilds the original name from the unified one (strip the source prefix,
then the Roboflow split token where that source uses one) and links each file
into the output directory under its unified name.

HARDLINKS by default: same-volume links cost no extra disk, so a 32k-image
dataset materialises in seconds and occupies no additional space. Falls back
to copying automatically across volumes (`--copy` forces it).

PUT THE OUTPUT OUTSIDE ANY SYNCED FOLDER. The repo lives under OneDrive; a
flat directory of 32,260 images inside it would trigger a multi-gigabyte
upload. The default output path is deliberately under Downloads.

Usage:
    python collect_images.py --splits output/splits --out D:/civicscan_images
    python collect_images.py --dataset output/merged.json --out ...
"""

import argparse
import json
import os
import shutil
import sys
from collections import defaultdict
from pathlib import Path

# prefix -> (does this source carry a train_/valid_/test_ split token?)
# The Roboflow-derived converters prepend the split directory name; the
# RDD2022 and Crackseg9k converters do not.
SOURCE_PREFIXES = {
    "rdd2022_": False,
    "crackseg9k_": False,
    "taco_": True,
    "trashtrail_": True,
    "bridgecsust_": True,
    "manholeg8_": True,      # before "manhole_" — longest prefix must win
    "manholejg_": True,
    "manhole_": True,
}
SPLIT_TOKENS = ("train_", "valid_", "test_")

# Where each source's images live on this machine. Override with --root.
DEFAULT_ROOTS = [
    r"C:\Users\sreep\Downloads\archiv\RDD_SPLIT",
    r"C:\Users\sreep\Downloads\Crackseg9k",
    r"C:\Users\sreep\Downloads\civicscan_exports",
    r"C:\Users\sreep\Downloads\Manhole Cover Dataset YOLO.v4i.coco",
]
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"}


def original_name(unified: str):
    """`taco_train_000056_x.jpg` -> `000056_x.jpg`. None if no prefix matches."""
    for prefix in sorted(SOURCE_PREFIXES, key=len, reverse=True):
        if unified.startswith(prefix):
            rest = unified[len(prefix):]
            if SOURCE_PREFIXES[prefix]:
                for tok in SPLIT_TOKENS:
                    if rest.startswith(tok):
                        rest = rest[len(tok):]
                        break
            return rest
    return None


def index_roots(roots):
    """basename -> path. Later roots do not clobber earlier ones."""
    index = {}
    collisions = 0
    for root in roots:
        root = Path(root)
        if not root.exists():
            print(f"[warn] root does not exist, skipping: {root}")
            continue
        n = 0
        for p in root.rglob("*"):
            if p.suffix in IMAGE_EXTS and p.is_file():
                if p.name in index:
                    collisions += 1
                    continue
                index[p.name] = p
                n += 1
        print(f"[index] {n:6d} images under {root}")
    if collisions:
        print(f"[index] {collisions} basename collisions across roots "
              f"(first occurrence kept)")
    return index


def collect(images, index, out_dir: Path, copy: bool):
    out_dir.mkdir(parents=True, exist_ok=True)
    linked = skipped = missing = unparsed = 0
    missing_by_source = defaultdict(int)
    examples = []

    for img in images:
        unified = img["file_name"]
        dest = out_dir / unified
        if dest.exists():
            skipped += 1
            continue

        orig = original_name(unified)
        if orig is None:
            unparsed += 1
            continue

        src = index.get(orig)
        if src is None:
            missing += 1
            missing_by_source[img.get("source_dataset", "?")] += 1
            if len(examples) < 5:
                examples.append((unified, orig))
            continue

        try:
            if copy:
                shutil.copy2(src, dest)
            else:
                try:
                    os.link(src, dest)
                except OSError:
                    shutil.copy2(src, dest)     # different volume
            linked += 1
        except Exception as e:
            print(f"[warn] {unified}: {e}")
            missing += 1

    return linked, skipped, missing, unparsed, missing_by_source, examples


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--splits", type=Path,
                   help="directory holding train/val/test.json")
    g.add_argument("--dataset", type=Path, help="a single unified/merged JSON")
    ap.add_argument("--out", type=Path, required=True,
                    help="flat output directory — put this OUTSIDE OneDrive")
    ap.add_argument("--root", type=Path, action="append", default=None,
                    help="source image root; repeatable. Defaults to the "
                         "known local download locations.")
    ap.add_argument("--copy", action="store_true",
                    help="copy instead of hardlinking (uses real disk space)")
    args = ap.parse_args()

    roots = args.root if args.root else DEFAULT_ROOTS
    index = index_roots(roots)
    print(f"[index] {len(index)} unique basenames total\n")

    if args.dataset:
        files = [args.dataset]
    else:
        files = [args.splits / f"{s}.json" for s in ("train", "val", "test")]

    seen_ids = set()
    images = []
    for f in files:
        if not f.exists():
            print(f"[error] not found: {f}")
            sys.exit(1)
        d = json.load(open(f))
        for i in d["images"]:
            if i["id"] not in seen_ids:
                seen_ids.add(i["id"])
                images.append(i)
        print(f"[read] {f.name}: {len(d['images'])} images")
    print(f"[read] {len(images)} unique images to materialise\n")

    linked, skipped, missing, unparsed, by_source, examples = collect(
        images, index, args.out, args.copy)

    print(f"\n[done] {linked} linked, {skipped} already present, "
          f"{missing} missing, {unparsed} unrecognised prefix")
    print(f"[done] image_root = {args.out.resolve()}")
    if missing:
        print(f"[missing] by source: {dict(by_source)}")
        for u, o in examples:
            print(f"[missing]   {u}\n              -> looked for {o}")
        print("[missing] the source download is probably absent or at another "
              "path; pass it with --root")
    return 1 if (missing or unparsed) else 0


if __name__ == "__main__":
    sys.exit(main())
