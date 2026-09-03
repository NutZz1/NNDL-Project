"""
Computes per-class instance counts and suggested inverse-frequency loss
weights. Output feeds directly into Member B's training config.

Usage:
    python class_balance_stats.py --dataset output/splits/train.json \
        --out output/class_weights.json
"""

import argparse
import json
from pathlib import Path
from collections import Counter
import sys

sys.path.append(str(Path(__file__).resolve().parent))
from schema import CATEGORY_ID_TO_NAME


def compute_stats(dataset_path: Path, out_path: Path, cap_ratio: float = 10.0):
    with open(dataset_path) as f:
        data = json.load(f)

    counts = Counter()
    for ann in data["annotations"]:
        counts[ann["category_id"]] += 1

    all_cat_ids = sorted(CATEGORY_ID_TO_NAME.keys())
    for cid in all_cat_ids:
        counts.setdefault(cid, 0)

    total = sum(counts.values())
    if total == 0:
        print("[error] no annotations found in dataset")
        return

    # Inverse-frequency weighting, normalized so weights average to 1.0 —
    # standard starting point for CrossEntropy/Focal loss class weighting.
    # TODO Member B: this is a STARTING POINT, not a final answer — per our
    # discussion, over-correcting rare-class weights can destabilize
    # training. Tune empirically, watch for rare-class loss spikes early
    # in training, and consider capping the max weight ratio (e.g. no
    # class weighted more than 10x the median) if training is unstable.
    n_classes = len(all_cat_ids)
    raw_weights = {cid: (total / (n_classes * max(counts[cid], 1))) for cid in all_cat_ids}
    weight_sum = sum(raw_weights.values())
    normalized_weights = {cid: (w * n_classes / weight_sum) for cid, w in raw_weights.items()}

    # Capped variant. Pure inverse frequency across this taxonomy spans two
    # orders of magnitude (crack_structural vs manhole_missing), and a class
    # that is absent from a split gets an unbounded weight, which is exactly
    # the rare-class loss spike we agreed to avoid. Clamp to cap_ratio x the
    # median weight, then renormalize so the mean weight is still 1.0.
    median_w = sorted(normalized_weights.values())[n_classes // 2]
    capped = {cid: min(w, cap_ratio * median_w) for cid, w in normalized_weights.items()}
    capped_sum = sum(capped.values())
    capped = {cid: (w * n_classes / capped_sum) for cid, w in capped.items()}

    print(f"{'Class':22s} {'Count':>10s} {'% of total':>12s} "
          f"{'Weight (raw)':>14s} {'Weight (capped)':>16s}")
    print("-" * 80)
    for cid in all_cat_ids:
        name = CATEGORY_ID_TO_NAME[cid]
        cnt = counts[cid]
        pct = 100 * cnt / total
        flag = "  <-- LOW COUNT, inspect before trusting" if cnt < 50 else ""
        print(f"{name:22s} {cnt:10d} {pct:11.2f}% {normalized_weights[cid]:14.3f} "
              f"{capped[cid]:16.3f}{flag}")

    output = {
        "counts_by_category_id": {str(k): v for k, v in counts.items()},
        "counts_by_category_name": {CATEGORY_ID_TO_NAME[k]: v for k, v in counts.items()},
        "suggested_loss_weights_by_category_id": {str(k): round(v, 4) for k, v in normalized_weights.items()},
        "capped_loss_weights_by_category_id": {str(k): round(v, 4) for k, v in capped.items()},
        "cap_ratio_vs_median": cap_ratio,
        "total_annotations": total,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nWritten to {out_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--cap-ratio", type=float, default=10.0,
                    help="cap any class weight at this multiple of the median "
                         "weight (written alongside the uncapped weights)")
    args = ap.parse_args()

    compute_stats(args.dataset, args.out, args.cap_ratio)