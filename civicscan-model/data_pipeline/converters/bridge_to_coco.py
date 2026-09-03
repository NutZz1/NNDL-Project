"""
Converts the csustcv bridge-inspection Roboflow source into the unified
schema, CRACK ONLY.

Source: https://universe.roboflow.com/csustcv/bridge-detection-p4vmv
        (forked to sreepathy-vadakkath-joshy/bridge-detection-p4vmv-otawr)

Why this source exists in the pipeline: `crack_structural` was 87% one
subset (Crackseg9k's Rissbilder) and contained no bridge data at all, because
SDNET2018 — Crackseg9k's only bridge-deck source — is absent from our
download. This adds real bridge structure: girders, soffits, bearing seats,
box-girder interiors and underside-of-deck views.

Only `Crack`/`crack` map through. The mapping, including every case and
spelling duplicate in the upstream project, is declared in
converters/roboflow_sources.py under "bridge_csust".

DEDUP. Bridge and wall crack close-ups look alike, so this is deduplicated
at import against our existing crack_structural imagery. The index is
filtered to the subsets actually IN the dataset — Crackseg9k's Images/
folders still hold the road-pavement subsets we excluded, and matching
against those would discard usable bridge annotations for no benefit.

THRESHOLD. This source uses 3, not the pipeline default of 8. Measured
nearest-neighbour distances from all 2,972 bridge images to the 4,814 kept
structural photos:

    distance:  0    1    2    3    4    5    6    7    8  ...  15   16
    count:     1   12   28   25   46   46   50   82   96  ... 335  329

There is no separated duplicate cluster. A true-duplicate population spikes
at 0-1 and then gaps (as it did for the manhole sources, where matches
landed at distance 0); here the counts rise smoothly into a bulk centred at
15-16, so everything above ~2 is the shoulder of "different photographs of
grey concrete", not duplication. At the default threshold of 8, 690 of 2,972
images (23%) were discarded, almost all of them genuine distinct bridge
photographs. At 3, 66 cross-source matches are blocked.

Consequence to be aware of: near-duplicate frames WITHIN this source — the
campaign photographs the same structure repeatedly — are no longer all
caught either. split_dataset.py groups this source per image, so a pair of
near-identical campaign frames can land either side of the train/test line.
This is documented as a known limitation rather than fixed by loosening the
threshold, which would cost an order of magnitude more real data.

Usage:
    python bridge_to_coco.py --root /path/to/export \
        --out output/bridge_unified.json \
        --dedup-against /path/to/Crackseg9k
"""

import argparse
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parent))
sys.path.append(str(Path(__file__).resolve().parent.parent))
from roboflow_sources import get as get_source
from roboflow_common import convert_roboflow_export
from crackseg9k_to_coco import subset_of, CRACKSEG_SUBSETS

# Subsets that actually survive into the merged dataset — the ones tagged
# "structural" in crackseg9k_to_coco.CRACKSEG_SUBSETS.
KEPT_STRUCTURAL = {k for k, v in CRACKSEG_SUBSETS.items() if v[0] == "structural"}


def crackseg_kept_only(path: Path) -> bool:
    """
    Index only Crackseg9k PHOTOS that are in the merged dataset.

    Two filters, both load-bearing:
      - `Final_Masks/` must be excluded. Its Masks/ and Heads/ folders hold
        PNGs with the SAME filenames as the photos, so a subset-name test
        alone matches them and the index ends up full of binary crack masks
        and noisy model outputs. Hashing a bridge photo against a mostly
        black mask is meaningless and inflates false-positive matches.
      - only subsets tagged "structural" survive into the merged dataset;
        deduping against excluded road subsets would discard usable bridge
        annotations for no benefit.
    """
    if "Final_Masks" in path.parts:
        return False
    return subset_of(path.stem) in KEPT_STRUCTURAL


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True,
                    help="Roboflow COCO export directory")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--dedup-against", type=Path, nargs="*", default=[],
                    help="Crackseg9k root; only its kept structural subsets "
                         "are indexed")
    ap.add_argument("--dedup-threshold", type=int, default=3,
                    help="hash distance for duplicate matching. 3, not the "
                         "pipeline default of 8 — see module docstring for "
                         "the measured distance distribution behind this")
    args = ap.parse_args()

    convert_roboflow_export(
        get_source("bridge_csust"),
        args.root,
        args.out,
        dedup_against=args.dedup_against,
        dedup_filter=crackseg_kept_only,
        dedup_threshold=args.dedup_threshold,
    )
