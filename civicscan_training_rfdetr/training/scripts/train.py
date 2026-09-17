"""CivicScan training entrypoint. Identical for all three members.

    python scripts/train.py --config configs/rfdetr.yaml

Everything hardware-dependent (variant, resolution, batch, accumulation, AMP
dtype, dataloader workers) is resolved automatically from the detected GPU.
Override any of it on the command line if you need to.
"""

import argparse
import ctypes
import json
import os
import platform
import random
import sys

import numpy as np
import torch
import yaml

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from civicscan import autoconfig
from civicscan.data import (CivicScanCocoDataset, build_transforms, collate_fn,
                            load_class_weights)
from civicscan.engine import train
from civicscan.engine.evaluate import attach_coco_gt
from civicscan.models import build_model_and_criterion


def keep_awake():
    """Stop Windows idle-sleep from killing a multi-day run.

    Run 2 died 18 minutes in when the laptop went to standby. This is the
    per-process request media players use (ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
    it changes no power-plan settings and lapses when the process exits. It
    does NOT override a lid-close action — keep the lid open or set lid-close
    to "do nothing" while training.
    """
    if platform.system() != "Windows":
        return
    try:
        ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
        if ctypes.windll.kernel32.SetThreadExecutionState(
                ES_CONTINUOUS | ES_SYSTEM_REQUIRED) == 0:
            print("[warn] SetThreadExecutionState failed; system may sleep")
    except Exception as e:  # never let this stop training
        print(f"[warn] keep-awake unavailable: {e}")


def set_seed(s):
    random.seed(s)
    np.random.seed(s)
    torch.manual_seed(s)
    torch.cuda.manual_seed_all(s)
    torch.backends.cudnn.benchmark = True


def load_config(path, overrides):
    with open(path) as f:
        cfg = yaml.safe_load(f)
    base = os.path.join(os.path.dirname(path), cfg.pop("inherit", "base.yaml"))
    if os.path.exists(base):
        with open(base) as f:
            merged = yaml.safe_load(f)
        merged.update(cfg)
        cfg = merged
    auto = autoconfig.resolve(cfg["model"],
                              gpu_index=overrides.pop("gpu", None),
                              override={k: v for k, v in overrides.items()
                                        if v is not None})
    cfg.update(auto)
    return cfg


def build_loaders(cfg):
    dm = cfg.get("decode_max") or 2 * cfg["resolution"]
    tr = CivicScanCocoDataset(cfg["train_json"], cfg["image_root"],
                              build_transforms(cfg["resolution"], True),
                              decode_max=dm)
    va = CivicScanCocoDataset(cfg["val_json"], cfg["image_root"],
                              build_transforms(cfg["resolution"], False),
                              decode_max=dm)
    attach_coco_gt(va, cfg["val_json"])
    print(f"train {tr.stats()}")
    print(f"val   {va.stats()}")
    kw = dict(num_workers=cfg["num_workers"], pin_memory=cfg["pin_memory"],
              collate_fn=collate_fn,
              persistent_workers=cfg["persistent_workers"] and cfg["num_workers"] > 0)
    # Validation gets fewer, non-persistent workers. With 8 persistent train
    # workers, giving val the same spawned 8 more resident processes (each
    # with its own torch import) at the first validation and exhausted the
    # 15 GB of system RAM on the laptop. Val only feeds ~4.7k images once an
    # epoch; 4 workers keep it to ~1 min and are released afterwards.
    val_kw = dict(kw, num_workers=min(4, cfg["num_workers"]),
                  persistent_workers=False)
    return (torch.utils.data.DataLoader(tr, batch_size=cfg["batch"], shuffle=True,
                                        drop_last=True, **kw),
            torch.utils.data.DataLoader(va, batch_size=max(1, cfg["batch"]),
                                        shuffle=False, **val_kw))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", required=True)
    p.add_argument("--run-dir", default=None)
    p.add_argument("--gpu", type=int, default=None)
    p.add_argument("--batch", type=int, default=None)
    p.add_argument("--accum", type=int, default=None,
                   help="gradient-accumulation steps (effective batch = batch x accum)")
    p.add_argument("--workers", type=int, default=None, help="dataloader workers")
    p.add_argument("--resolution", type=int, default=None)
    p.add_argument("--variant", default=None)
    p.add_argument("--epochs", type=int, default=None)
    p.add_argument("--no-masking", action="store_true",
                   help="ABLATION ONLY: disable valid_categories masking")
    p.add_argument("--no-pretrained", action="store_true")
    p.add_argument("--init-from", default=None,
                   help="warm-start model weights from a checkpoint (best.pt); "
                        "optimizer and schedule start fresh")
    p.add_argument("--resume", action="store_true",
                   help="continue a killed run from <run-dir>/last.pt: same "
                        "weights, optimizer, schedule position and log")
    a = p.parse_args()

    cfg = load_config(a.config, dict(gpu=a.gpu, batch=a.batch, accum=a.accum,
                                     num_workers=a.workers,
                                     resolution=a.resolution, variant=a.variant))
    if a.epochs:
        cfg["epochs"] = a.epochs
    if a.no_pretrained:
        cfg["pretrained"] = False
    cfg["masking"] = not a.no_masking

    run_dir = a.run_dir or os.path.join(
        "runs", cfg["model"] + ("_nomask" if a.no_masking else ""))
    os.makedirs(run_dir, exist_ok=True)
    keep_awake()
    set_seed(cfg.get("seed", 42))

    print(autoconfig.report(cfg))
    autoconfig.save(cfg, os.path.join(run_dir, "autoconfig.json"))
    with open(os.path.join(run_dir, "config.json"), "w") as f:
        json.dump(cfg, f, indent=2, default=str)

    if a.no_masking:
        print("\n*** valid_categories MASKING DISABLED — ablation run only. ***")
        print("*** Do not report this as a headline result. ***\n")
        import civicscan.masking as M
        M.class_loss_weight_mask = lambda vm, like: torch.ones_like(like)
        M.mask_class_logits = lambda logits, vm: logits

    cw = load_class_weights(cfg["class_weights"]) if cfg.get("use_class_weights", True) else None
    model, criterion = build_model_and_criterion(cfg, cw)
    if a.init_from:
        ck = torch.load(a.init_from, map_location="cpu")
        model.load_state_dict(ck["model"], strict=True)
        cfg["init_from"] = a.init_from
        cfg["init_from_epoch"] = ck.get("epoch")
        print(f"warm-start: loaded weights from {a.init_from} "
              f"(epoch {ck.get('epoch')}, val mAP50-95 "
              f"{ck.get('metrics', {}).get('val_mAP5095', float('nan')):.4f})")
    n_par = sum(p.numel() for p in model.parameters())
    n_trn = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"params total {n_par/1e6:.2f}M | trainable {n_trn/1e6:.2f}M")

    tl, vl = build_loaders(cfg)

    resume = os.path.join(run_dir, "last.pt") if a.resume else None
    if resume and not os.path.exists(resume):
        sys.exit(f"--resume: no last.pt in {run_dir}")

    def run(c):
        return train(model, criterion, tl, vl, c, c["device"], run_dir, resume=resume)

    (best, hist), used_cfg, attempts = autoconfig.run_with_oom_backoff(run, cfg)
    if attempts:
        with open(os.path.join(run_dir, "vram_ladder.json"), "w") as f:
            json.dump(attempts, f, indent=2)
    print(f"\nbest epoch {best['epoch']} val mAP50-95 {best['mAP5095']:.4f}")
    print(f"artefacts in {run_dir}")


if __name__ == "__main__":
    main()
