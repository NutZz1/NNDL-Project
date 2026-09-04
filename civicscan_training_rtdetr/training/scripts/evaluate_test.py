"""Final test-split evaluation. Run ONCE, at the very end, per model.

    python scripts/evaluate_test.py --config configs/rfdetr.yaml --ckpt runs/rfdetr/best.pt
"""

import argparse
import json
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from civicscan.data import CivicScanCocoDataset, build_transforms, collate_fn, load_class_weights
from civicscan.engine.evaluate import evaluate, attach_coco_gt
from civicscan.models import build_model_and_criterion
from train import load_config


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", required=True)
    p.add_argument("--ckpt", required=True)
    p.add_argument("--out", default=None)
    p.add_argument("--gpu", type=int, default=None)
    p.add_argument("--no-mask-eval", action="store_true",
                   help="report unmasked eval too, for the protocol comparison")
    a = p.parse_args()

    cfg = load_config(a.config, dict(gpu=a.gpu))
    ck = torch.load(a.ckpt, map_location="cpu")
    saved = ck.get("config", {})
    for k in ("variant", "resolution", "queries", "reg_max"):
        if k in saved:
            cfg[k] = saved[k]
    cfg["pretrained"] = False

    cw = load_class_weights(cfg["class_weights"])
    model, crit = build_model_and_criterion(cfg, cw)
    model.load_state_dict(ck["model"])
    model.to(cfg["device"]).eval()

    ds = CivicScanCocoDataset(cfg["test_json"], cfg["image_root"],
                              build_transforms(cfg["resolution"], False))
    attach_coco_gt(ds, cfg["test_json"])
    print(ds.stats())
    dl = torch.utils.data.DataLoader(ds, batch_size=max(1, cfg["batch"]),
                                     shuffle=False, num_workers=cfg["num_workers"],
                                     collate_fn=collate_fn)

    dtype = torch.bfloat16 if cfg.get("amp_dtype") == "bf16" else torch.float16
    res = {"masked": evaluate(model, crit, dl, cfg["device"], cfg, dtype,
                              compute_loss=False, apply_mask=True)}
    if a.no_mask_eval:
        res["unmasked"] = evaluate(model, crit, dl, cfg["device"], cfg, dtype,
                                   compute_loss=False, apply_mask=False)
    res["checkpoint"] = a.ckpt
    res["best_epoch"] = ck.get("epoch")
    res["config"] = {k: cfg[k] for k in
                     ("model", "variant", "resolution", "batch", "accum",
                      "effective_batch", "gpu_name", "tier")}

    out = a.out or os.path.join(os.path.dirname(a.ckpt), "test_eval.json")
    with open(out, "w") as f:
        json.dump(res, f, indent=2, default=str)
    m = res["masked"]
    print(f"\nTEST  mAP50 {m['val_mAP50']:.4f}  mAP50-95 {m['val_mAP5095']:.4f}")
    print(f"      AP_S {m['val_AP_small']:.4f}  AP_M {m['val_AP_medium']:.4f}  AP_L {m['val_AP_large']:.4f}")
    for k, v in m.items():
        if k.startswith("AP_"):
            print(f"      {k:28s} {v:.4f}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
