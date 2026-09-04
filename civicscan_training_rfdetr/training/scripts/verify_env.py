import argparse
import json
import os
import platform
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

EXPECTED = {
    "train": dict(images=22870, annotations=34155),
    "val": dict(images=4718, annotations=7136),
    "test": dict(images=4672, annotations=7001),
}
CATEGORY_IDS = list(range(1, 9))


def check_torch():
    import torch
    rows = [
        ("python", platform.python_version()),
        ("platform", platform.platform()),
        ("torch", torch.__version__),
        ("torch cuda build", str(torch.version.cuda)),
        ("cuda available", str(torch.cuda.is_available())),
        ("device count", str(torch.cuda.device_count() if torch.cuda.is_available() else 0)),
    ]
    if torch.cuda.is_available():
        for i in range(torch.cuda.device_count()):
            p = torch.cuda.get_device_properties(i)
            rows.append((f"gpu[{i}]",
                         f"{p.name} | {p.total_memory / 1024**3:.2f} GB | sm_{p.major}.{p.minor}"))
    return rows


def alloc_probe():
    import torch
    if not torch.cuda.is_available():
        return None
    idx = torch.cuda.current_device()
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats(idx)
    got = 0.0
    blocks = []
    try:
        while True:
            blocks.append(torch.empty(256 * 1024 * 1024 // 4, dtype=torch.float32, device=idx))
            got += 0.25
            if got > 40:
                break
    except Exception:
        pass
    del blocks
    torch.cuda.empty_cache()
    return round(got, 2)


def check_splits(split_dir):
    rows = []
    ok = True
    for name, exp in EXPECTED.items():
        path = os.path.join(split_dir, f"{name}.json")
        if not os.path.exists(path):
            rows.append((name, "MISSING", "regenerate with split_dataset.py --seed 42"))
            ok = False
            continue
        with open(path) as f:
            d = json.load(f)
        n_img, n_ann = len(d["images"]), len(d["annotations"])
        cats = sorted(c["id"] for c in d["categories"])
        good = (n_img == exp["images"] and n_ann == exp["annotations"] and cats == CATEGORY_IDS)
        ok = ok and good
        missing_vc = sum(1 for im in d["images"] if "valid_categories" not in im)
        bad_vc = 0
        vc = {im["id"]: set(im.get("valid_categories", [])) for im in d["images"]}
        for a in d["annotations"]:
            if a["category_id"] not in vc.get(a["image_id"], set()):
                bad_vc += 1
        if missing_vc or bad_vc:
            ok = False
        rows.append((name,
                     "OK" if good else "MISMATCH",
                     f"images={n_img} (exp {exp['images']}), "
                     f"anns={n_ann} (exp {exp['annotations']}), "
                     f"cat_ids={cats}, "
                     f"images_missing_valid_categories={missing_vc}, "
                     f"anns_outside_valid_categories={bad_vc}"))
    return rows, ok


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--split-dir", default="../data_pipeline/output/splits")
    p.add_argument("--weights", default="../data_pipeline/output/class_weights.json")
    p.add_argument("--model", default=None, choices=["rfdetr", "rtdetr", "yolov11"])
    p.add_argument("--out", default="runs/env_report.json")
    a = p.parse_args()

    print("=" * 68)
    for k, v in check_torch():
        print(f"{k:20s} {v}")
    print("=" * 68)

    probe = alloc_probe()
    if probe is not None:
        print(f"{'allocatable vram':20s} ~{probe} GB (free right now, close other GPU apps)")

    rows, ok = check_splits(a.split_dir)
    print("\nDataset splits")
    for name, status, detail in rows:
        print(f"  {name:6s} {status:9s} {detail}")

    wok = os.path.exists(a.weights)
    print(f"\nclass_weights.json   {'OK' if wok else 'MISSING'}  {a.weights}")

    cfg = None
    if a.model:
        from civicscan import autoconfig
        cfg = autoconfig.resolve(a.model)
        print()
        print(autoconfig.report(cfg))

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(dict(torch=dict(check_torch()), allocatable_vram_gb=probe,
                       splits=[dict(split=n, status=s, detail=d) for n, s, d in rows],
                       class_weights_present=wok, autoconfig=cfg), f, indent=2)
    print(f"\nwrote {a.out} — paste this file back to the team.")

    if not (ok and wok):
        print("\nFAIL: dataset not reproduced correctly. Do not start training.")
        sys.exit(1)
    print("\nPASS: environment and dataset verified.")


if __name__ == "__main__":
    main()
