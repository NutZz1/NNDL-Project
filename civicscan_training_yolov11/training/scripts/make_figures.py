"""Figures F1-F8 and tables T1/T2 for Review 2, from the three run CSVs.

Collect all three members' runs/<model>/ folders into one directory first:

    figures/
      rfdetr/train_log.csv  test_eval.json  profile.json  summary.json
      rtdetr/...
      yolov11/...

    python scripts/make_figures.py --runs figures --out figures/out
"""

import argparse
import csv
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from civicscan.schema import CLASS_NAMES


def read_csv(p):
    with open(p) as f:
        rows = list(csv.DictReader(f))
    out = {}
    for k in rows[0]:
        vals = []
        for r in rows:
            try:
                vals.append(float(r[k]) if r[k] not in ("", None) else None)
            except ValueError:
                vals.append(None)
        out[k] = vals
    return out


def series(d, k):
    x = [i + 1 for i, v in enumerate(d.get(k, [])) if v is not None]
    y = [v for v in d.get(k, []) if v is not None]
    return x, y


def line_fig(runs, key, title, ylabel, path, mark_best=False):
    plt.figure(figsize=(7, 4.5))
    any_data = False
    for name, d in runs.items():
        x, y = series(d, key)
        if not y:
            continue
        any_data = True
        plt.plot(x, y, label=name, linewidth=1.6)
        if mark_best:
            bi = max(range(len(y)), key=lambda i: y[i])
            plt.scatter([x[bi]], [y[bi]], zorder=5)
            plt.annotate(f"best ep {x[bi]}\n{y[bi]:.4f}", (x[bi], y[bi]),
                         textcoords="offset points", xytext=(6, -14), fontsize=8)
    if not any_data:
        plt.close()
        return None
    plt.xlabel("epoch")
    plt.ylabel(ylabel)
    plt.title(title)
    plt.grid(alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.savefig(path, dpi=160)
    plt.close()
    return path


def components_fig(runs, out):
    made = []
    for name, d in runs.items():
        keys = [k for k in ("loss_cls", "loss_bbox", "loss_giou", "loss_dfl")
                if any(v is not None for v in d.get(k, []))]
        if not keys:
            continue
        plt.figure(figsize=(7, 4.5))
        for k in keys:
            x, y = series(d, k)
            plt.plot(x, y, label=k, linewidth=1.4)
        plt.xlabel("epoch")
        plt.ylabel("loss")
        plt.title(f"F4 loss components — {name}")
        plt.grid(alpha=0.3)
        plt.legend()
        plt.tight_layout()
        p = os.path.join(out, f"F4_loss_components_{name}.png")
        plt.savefig(p, dpi=160)
        plt.close()
        made.append(p)
    return made


def per_class_fig(runs, out):
    keys = [f"AP_{n}" for n in CLASS_NAMES]
    plt.figure(figsize=(10, 4.5))
    w = 0.8 / max(1, len(runs))
    for i, (name, d) in enumerate(runs.items()):
        vals = []
        for k in keys:
            y = [v for v in d.get(k, []) if v is not None and v >= 0]
            vals.append(y[-1] if y else 0.0)
        plt.bar([j + i * w for j in range(len(keys))], vals, width=w, label=name)
    plt.xticks([j + 0.4 for j in range(len(keys))], CLASS_NAMES,
               rotation=35, ha="right", fontsize=8)
    plt.ylabel("AP@50-95 (final epoch, val)")
    plt.title("Per-class AP")
    plt.grid(alpha=0.3, axis="y")
    plt.legend()
    plt.tight_layout()
    p = os.path.join(out, "F_per_class_AP.png")
    plt.savefig(p, dpi=160)
    plt.close()
    return p


def size_fig(runs, out):
    keys = ["val_AP_small", "val_AP_medium", "val_AP_large"]
    plt.figure(figsize=(6.5, 4.2))
    w = 0.8 / max(1, len(runs))
    for i, (name, d) in enumerate(runs.items()):
        vals = []
        for k in keys:
            y = [v for v in d.get(k, []) if v is not None and v >= 0]
            vals.append(y[-1] if y else 0.0)
        plt.bar([j + i * w for j in range(3)], vals, width=w, label=name)
    plt.xticks([j + 0.4 for j in range(3)], ["small", "medium", "large"])
    plt.ylabel("AP@50-95")
    plt.title("F8 AP vs object size — the ViT small-object claim")
    plt.grid(alpha=0.3, axis="y")
    plt.legend()
    plt.tight_layout()
    p = os.path.join(out, "F8_ap_vs_size.png")
    plt.savefig(p, dpi=160)
    plt.close()
    return p


def tables(root, runs, out):
    t1 = []
    for name in runs:
        te = os.path.join(root, name, "test_eval.json")
        pr = os.path.join(root, name, "profile.json")
        sm = os.path.join(root, name, "summary.json")
        row = {"model": name}
        if os.path.exists(te):
            m = json.load(open(te))["masked"]
            row.update({k: round(m[k], 4) for k in
                        ("val_mAP50", "val_mAP5095", "val_AP_small",
                         "val_AP_medium", "val_AP_large", "val_precision",
                         "val_recall") if k in m})
        if os.path.exists(pr):
            row.update(json.load(open(pr)))
        if os.path.exists(sm):
            s = json.load(open(sm))
            row["best_epoch"] = s.get("best_epoch")
            row["epochs_run"] = s.get("epochs_run")
        t1.append(row)

    t2 = {}
    for name in runs:
        te = os.path.join(root, name, "test_eval.json")
        if os.path.exists(te):
            m = json.load(open(te))["masked"]
            t2[name] = {n: round(m.get(f"AP_{n}", -1), 4) for n in CLASS_NAMES}

    with open(os.path.join(out, "T1_model_comparison.json"), "w") as f:
        json.dump(t1, f, indent=2)
    with open(os.path.join(out, "T2_per_class_AP.json"), "w") as f:
        json.dump(t2, f, indent=2)

    md = ["# T1 model comparison\n"]
    if t1:
        cols = sorted({k for r in t1 for k in r})
        cols = ["model"] + [c for c in cols if c != "model"]
        md.append("| " + " | ".join(cols) + " |")
        md.append("|" + "---|" * len(cols))
        for r in t1:
            md.append("| " + " | ".join(str(r.get(c, "")) for c in cols) + " |")
    md.append("\n# T2 per-class AP@50-95 (test)\n")
    if t2:
        names = list(t2)
        md.append("| class | " + " | ".join(names) + " |")
        md.append("|" + "---|" * (len(names) + 1))
        for n in CLASS_NAMES:
            md.append(f"| {n} | " + " | ".join(str(t2[m][n]) for m in names) + " |")
    p = os.path.join(out, "tables.md")
    with open(p, "w") as f:
        f.write("\n".join(md))
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", required=True)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    out = a.out or os.path.join(a.runs, "out")
    os.makedirs(out, exist_ok=True)

    runs = {}
    for d in sorted(os.listdir(a.runs)):
        p = os.path.join(a.runs, d, "train_log.csv")
        if os.path.exists(p):
            runs[d] = read_csv(p)
    if not runs:
        print(f"no train_log.csv found under {a.runs}")
        return
    print(f"loaded: {', '.join(runs)}")

    made = [
        line_fig(runs, "train_loss", "F1 training loss", "loss",
                 os.path.join(out, "F1_train_loss.png")),
        line_fig(runs, "val_loss", "F2 validation loss", "loss",
                 os.path.join(out, "F2_val_loss.png")),
        line_fig(runs, "val_mAP5095", "F3 val mAP@50-95", "mAP",
                 os.path.join(out, "F3_val_mAP5095.png"), mark_best=True),
        line_fig(runs, "val_mAP50", "F3b val mAP@50", "mAP",
                 os.path.join(out, "F3b_val_mAP50.png"), mark_best=True),
        line_fig(runs, "lr", "F5 learning-rate schedule", "lr",
                 os.path.join(out, "F5_lr.png")),
        per_class_fig(runs, out),
        size_fig(runs, out),
    ]
    made += components_fig(runs, out)
    made.append(tables(a.runs, runs, out))
    for m in made:
        if m:
            print(f"wrote {m}")
    print("\nF6 (PR curves), F7 (confusion matrix) and F9 (qualitative grid) are "
          "not produced here — they need per-detection data, not the epoch CSV.")


if __name__ == "__main__":
    main()
