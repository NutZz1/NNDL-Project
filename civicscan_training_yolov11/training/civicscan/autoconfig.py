import json
import os
import platform
import subprocess
import sys

import torch

VRAM_TIERS = [
    (23.0, "xl"),
    (15.0, "lg"),
    (11.0, "md"),
    (7.0, "sm"),
    (5.0, "xs"),
    (0.0, "tiny"),
]

PROFILES = {
    "rfdetr": {
        "xl":   dict(variant="base",  resolution=644, batch=8, accum=2, queries=300, grad_ckpt=False),
        "lg":   dict(variant="base",  resolution=560, batch=4, accum=4, queries=300, grad_ckpt=False),
        "md":   dict(variant="small", resolution=560, batch=4, accum=4, queries=300, grad_ckpt=False),
        "sm":   dict(variant="small", resolution=560, batch=2, accum=8, queries=300, grad_ckpt=True),
        "xs":   dict(variant="nano",  resolution=448, batch=2, accum=8, queries=150, grad_ckpt=True),
        "tiny": dict(variant="nano",  resolution=392, batch=1, accum=16, queries=150, grad_ckpt=True),
    },
    "rtdetr": {
        "xl":   dict(variant="rtdetr-l", resolution=644, batch=8, accum=2, queries=300, grad_ckpt=False),
        "lg":   dict(variant="rtdetr-l", resolution=560, batch=4, accum=4, queries=300, grad_ckpt=False),
        "md":   dict(variant="rtdetr-l", resolution=560, batch=4, accum=4, queries=300, grad_ckpt=False),
        "sm":   dict(variant="rtdetr-l", resolution=560, batch=2, accum=8, queries=300, grad_ckpt=True),
        "xs":   dict(variant="rtdetr-r18", resolution=448, batch=2, accum=8, queries=150, grad_ckpt=True),
        "tiny": dict(variant="rtdetr-r18", resolution=392, batch=1, accum=16, queries=150, grad_ckpt=True),
    },
    "yolov11": {
        "xl":   dict(variant="yolo11m", resolution=640, batch=32, accum=1, grad_ckpt=False),
        "lg":   dict(variant="yolo11s", resolution=640, batch=24, accum=1, grad_ckpt=False),
        "md":   dict(variant="yolo11s", resolution=640, batch=16, accum=1, grad_ckpt=False),
        "sm":   dict(variant="yolo11s", resolution=640, batch=8,  accum=2, grad_ckpt=False),
        "xs":   dict(variant="yolo11n", resolution=512, batch=8,  accum=2, grad_ckpt=False),
        "tiny": dict(variant="yolo11n", resolution=512, batch=4,  accum=4, grad_ckpt=False),
    },
}

EFFECTIVE_BATCH = {"rfdetr": 16, "rtdetr": 16, "yolov11": 16}


def _nvidia_smi_names():
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version",
             "--format=csv,noheader"],
            stderr=subprocess.DEVNULL, timeout=15).decode()
        return [l.strip() for l in out.strip().splitlines() if l.strip()]
    except Exception:
        return []


def select_device(index=None):
    if not torch.cuda.is_available():
        return dict(device="cpu", index=None, name="cpu", vram_gb=0.0,
                    capability=None, count=0)
    count = torch.cuda.device_count()
    if index is None:
        env = os.environ.get("CIVICSCAN_GPU")
        if env is not None and env.strip() != "":
            index = int(env)
        else:
            sizes = [torch.cuda.get_device_properties(i).total_memory
                     for i in range(count)]
            index = int(max(range(count), key=lambda i: sizes[i]))
    if index < 0 or index >= count:
        raise ValueError(f"GPU index {index} out of range (found {count} device(s))")
    props = torch.cuda.get_device_properties(index)
    return dict(
        device=f"cuda:{index}",
        index=index,
        name=props.name,
        vram_gb=round(props.total_memory / (1024 ** 3), 2),
        capability=f"{props.major}.{props.minor}",
        count=count,
    )


def tier_for(vram_gb):
    for floor, tier in VRAM_TIERS:
        if vram_gb >= floor:
            return tier
    return "tiny"


def supports_bf16(cap):
    if cap is None:
        return False
    major = int(str(cap).split(".")[0])
    return major >= 8


def resolve(model, gpu_index=None, override=None):
    if model not in PROFILES:
        raise ValueError(f"unknown model '{model}', expected one of {list(PROFILES)}")
    dev = select_device(gpu_index)
    if dev["device"] == "cpu":
        raise SystemExit(
            "No CUDA device found. Training this project on CPU is not viable "
            "(22,870 training images). Install the CUDA build of PyTorch:\n"
            "  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121"
        )
    tier = tier_for(dev["vram_gb"])
    cfg = dict(PROFILES[model][tier])
    cfg["model"] = model
    cfg["tier"] = tier
    cfg["device"] = dev["device"]
    cfg["gpu_name"] = dev["name"]
    cfg["gpu_vram_gb"] = dev["vram_gb"]
    cfg["gpu_capability"] = dev["capability"]
    cfg["amp_dtype"] = "bf16" if supports_bf16(dev["capability"]) else "fp16"
    cfg["num_workers"] = 2 if platform.system() == "Windows" else 4
    cfg["pin_memory"] = platform.system() != "Windows"
    cfg["persistent_workers"] = cfg["num_workers"] > 0
    target = EFFECTIVE_BATCH[model]
    if cfg["batch"] * cfg["accum"] != target:
        cfg["accum"] = max(1, round(target / cfg["batch"]))
    cfg["effective_batch"] = cfg["batch"] * cfg["accum"]
    if model == "rfdetr" and cfg["resolution"] % 14 != 0:
        cfg["resolution"] = (cfg["resolution"] // 14) * 14
    if override:
        cfg.update({k: v for k, v in override.items() if v is not None})
        cfg["effective_batch"] = cfg["batch"] * cfg["accum"]
        cfg["overridden"] = sorted(override)
    return cfg


def downgrade(cfg):
    order = [t for _, t in VRAM_TIERS]
    i = order.index(cfg["tier"])
    if i + 1 >= len(order):
        return None
    lower = order[i + 1]
    new = dict(PROFILES[cfg["model"]][lower])
    new.update({k: cfg[k] for k in
                ("model", "device", "gpu_name", "gpu_vram_gb", "gpu_capability",
                 "amp_dtype", "num_workers", "pin_memory", "persistent_workers")})
    new["tier"] = lower
    new["auto_downgraded_from"] = cfg["tier"]
    target = EFFECTIVE_BATCH[cfg["model"]]
    new["accum"] = max(1, round(target / new["batch"]))
    new["effective_batch"] = new["batch"] * new["accum"]
    return new


def is_oom(err):
    s = str(err).lower()
    return isinstance(err, torch.cuda.OutOfMemoryError) or "out of memory" in s


def run_with_oom_backoff(fn, cfg, max_downgrades=3):
    attempts = []
    for _ in range(max_downgrades + 1):
        try:
            return fn(cfg), cfg, attempts
        except Exception as e:
            if not is_oom(e):
                raise
            attempts.append(dict(tier=cfg["tier"], batch=cfg["batch"],
                                 resolution=cfg["resolution"], error="CUDA OOM"))
            torch.cuda.empty_cache()
            nxt = downgrade(cfg)
            if nxt is None:
                raise
            print(f"[autoconfig] OOM at tier '{cfg['tier']}' "
                  f"(bs={cfg['batch']}, res={cfg['resolution']}) -> "
                  f"retrying at tier '{nxt['tier']}' "
                  f"(bs={nxt['batch']}, res={nxt['resolution']})", flush=True)
            cfg = nxt
    raise RuntimeError("exhausted VRAM downgrade ladder")


def report(cfg):
    lines = [
        "CivicScan training auto-configuration",
        f"  model            : {cfg['model']}",
        f"  gpu              : {cfg['gpu_name']} ({cfg['gpu_vram_gb']} GB, sm_{cfg['gpu_capability']})",
        f"  device           : {cfg['device']}",
        f"  vram tier        : {cfg['tier']}",
        f"  variant          : {cfg['variant']}",
        f"  resolution       : {cfg['resolution']}",
        f"  batch            : {cfg['batch']} x accum {cfg['accum']} = {cfg['effective_batch']}",
        f"  amp              : {cfg['amp_dtype']}",
        f"  grad checkpoint  : {cfg.get('grad_ckpt')}",
        f"  dataloader       : workers={cfg['num_workers']} pin={cfg['pin_memory']}",
    ]
    if "queries" in cfg:
        lines.append(f"  queries          : {cfg['queries']}")
    if "auto_downgraded_from" in cfg:
        lines.append(f"  NOTE             : auto-downgraded from tier '{cfg['auto_downgraded_from']}' after OOM")
    if "overridden" in cfg:
        lines.append(f"  manual overrides : {', '.join(cfg['overridden'])}")
    return "\n".join(lines)


def save(cfg, path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    payload = dict(cfg)
    payload["torch"] = torch.__version__
    payload["cuda"] = torch.version.cuda
    payload["platform"] = platform.platform()
    payload["python"] = sys.version.split()[0]
    payload["nvidia_smi"] = _nvidia_smi_names()
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    return path


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True, choices=sorted(PROFILES))
    p.add_argument("--gpu", type=int, default=None)
    p.add_argument("--batch", type=int, default=None)
    p.add_argument("--resolution", type=int, default=None)
    p.add_argument("--variant", default=None)
    p.add_argument("--save", default=None)
    a = p.parse_args()
    cfg = resolve(a.model, a.gpu,
                  override=dict(batch=a.batch, resolution=a.resolution, variant=a.variant))
    print(report(cfg))
    if a.save:
        print(f"\nwrote {save(cfg, a.save)}")
