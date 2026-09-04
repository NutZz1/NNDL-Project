"""Params, GFLOPs, latency, FPS and peak VRAM. Required for the T1 table.

    python scripts/profile_model.py --config configs/rfdetr.yaml
"""

import argparse
import json
import os
import sys
import time

import torch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from civicscan.models import build_model_and_criterion
from train import load_config


def gflops(model, x):
    try:
        from torch.utils.flop_counter import FlopCounterMode
        m = FlopCounterMode(display=False)
        with m, torch.no_grad():
            model(x)
        return m.get_total_flops() / 1e9
    except Exception as e:
        return f"unavailable ({type(e).__name__})"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--config", required=True)
    p.add_argument("--gpu", type=int, default=None)
    p.add_argument("--iters", type=int, default=50)
    p.add_argument("--out", default=None)
    a = p.parse_args()

    cfg = load_config(a.config, dict(gpu=a.gpu))
    cfg["pretrained"] = False
    model, _ = build_model_and_criterion(cfg)
    dev = cfg["device"]
    model.to(dev).eval()
    x = torch.randn(1, 3, cfg["resolution"], cfg["resolution"], device=dev)

    rep = {
        "model": cfg["model"], "variant": cfg["variant"],
        "resolution": cfg["resolution"], "gpu": cfg["gpu_name"],
        "params_total_M": round(sum(q.numel() for q in model.parameters()) / 1e6, 3),
        "params_trainable_M": round(sum(q.numel() for q in model.parameters()
                                        if q.requires_grad) / 1e6, 3),
        "gflops_bs1": gflops(model, x),
    }

    with torch.no_grad():
        for _ in range(10):
            model(x)
        if dev.startswith("cuda"):
            torch.cuda.synchronize()
            torch.cuda.reset_peak_memory_stats()
        t0 = time.perf_counter()
        for _ in range(a.iters):
            model(x)
        if dev.startswith("cuda"):
            torch.cuda.synchronize()
        dt = (time.perf_counter() - t0) / a.iters

    rep["latency_ms_bs1"] = round(dt * 1000, 2)
    rep["fps_bs1"] = round(1 / dt, 2)
    if dev.startswith("cuda"):
        rep["peak_vram_inference_gb"] = round(torch.cuda.max_memory_allocated() / 1024 ** 3, 3)

    out = a.out or f"runs/{cfg['model']}/profile.json"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump(rep, f, indent=2)
    print(json.dumps(rep, indent=2))
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
