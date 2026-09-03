"""
Converts the trash-trail-litter Roboflow source into the unified schema.

Source: https://universe.roboflow.com/andrew-watson-yz64n/trash-trail-litter
        (forked to sreepathy-vadakkath-joshy/trash-trail-litter-dmsiz)

Why this source exists in the pipeline: TACO alone gave us 2,982 litter
instances of mostly close-range photographs. trash-trail is an independent
annotation effort (0/16 sampled images overlap TACO) shot at street level
from an oblique/elevated viewpoint with the litter small in frame — much
closer to what a vehicle-mounted camera actually sees. It is the diversity,
not just the count, that we are buying.

All 8 of its classes flatten into our single `litter` class; the mapping is
in converters/roboflow_sources.py under "trash_trail".

Two source-specific hazards, both handled:
  1. It is itself an aggregation of at least three sub-collections
     (`yolov7trash_IMG_*`, `yolov7trash_trash-*`, `litter2_*`) with
     clustered sequence numbers, so split_dataset.py groups on those
     prefixes rather than treating every image as independent.
  2. The same filename was observed twice in one page of results, so
     --dedup-within is ON by default.

Usage:
    python trash_trail_to_coco.py --root /path/to/export \
        --out output/trash_trail_unified.json
"""

import argparse
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parent))
sys.path.append(str(Path(__file__).resolve().parent.parent))
from roboflow_sources import get as get_source
from roboflow_common import convert_roboflow_export

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True,
                    help="Roboflow COCO export directory")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--dedup-against", type=Path, nargs="*", default=[],
                    help="directories of already-accepted images to dedup against")
    ap.add_argument("--no-dedup-within", action="store_true",
                    help="keep duplicate images inside this export (not advised)")
    args = ap.parse_args()

    convert_roboflow_export(
        get_source("trash_trail"),
        args.root,
        args.out,
        dedup_against=args.dedup_against,
        dedup_within=not args.no_dedup_within,
    )
