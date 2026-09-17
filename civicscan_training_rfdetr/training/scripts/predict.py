"""Run a checkpoint on one or more images and draw the detections.

    python scripts/predict.py --ckpt runs/rfdetr_run4_700px/best.pt IMG.jpg [IMG2.HEIC ...]
        [--conf 0.3] [--out predictions/]

No valid_categories masking at inference: every class is a candidate on a
photo of unknown origin. The confidence threshold matters — sigmoid-focal
DETR scores are low (a well-trained detection is typically 0.3-0.7), so
0.3 is a reasonable default; 0.5 is strict.
"""

import argparse
import os
import sys

import torch
from PIL import Image, ImageDraw, ImageFont, ImageOps

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from civicscan.data.transforms import build_transforms
from civicscan.models import build_model_and_criterion
from civicscan.models.build import postprocess
from civicscan.schema import CLASS_NAMES, NUM_CLASSES

try:  # iPhone HEIC support, optional
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

COLORS = ["#2a78d6", "#eb6834", "#2ca02c", "#d62728", "#9467bd", "#8c564b",
          "#e377c2", "#17becf"]


def load_model(ckpt_path):
    ck = torch.load(ckpt_path, map_location="cpu")
    cfg = dict(ck["config"])
    cfg["pretrained"] = False
    model, _ = build_model_and_criterion(cfg, None)
    model.load_state_dict(ck["model"])
    return model.eval(), cfg, ck.get("epoch")


@torch.no_grad()
def predict(model, cfg, img, device, conf):
    res = cfg["resolution"]
    tf = build_transforms(res, train=False)
    target = {"boxes": torch.zeros(0, 4), "labels": torch.zeros(0, dtype=torch.long),
              "valid_mask": torch.ones(NUM_CLASSES, dtype=torch.bool),
              "image_id": torch.tensor(0),
              "orig_size": torch.tensor([img.height, img.width])}
    x, target = tf(img, target)
    dtype = torch.bfloat16 if cfg.get("amp_dtype") == "bf16" else torch.float16
    with torch.autocast(device.split(":")[0], dtype=dtype, enabled=device.startswith("cuda")):
        out = model(x.unsqueeze(0).to(device))
    out = {k: v.float() for k, v in out.items() if torch.is_tensor(v)}
    r = postprocess(cfg["model"], out, [target], target["valid_mask"].unsqueeze(0).to(device),
                    res, score_thresh=0.001, max_det=cfg.get("max_det", 300),
                    nms_iou=cfg.get("nms_iou", 0.7), apply_mask=False)[0]
    keep = r["scores"] >= conf
    return [(CLASS_NAMES[int(l)], float(s), b.tolist())
            for l, s, b in zip(r["labels"][keep], r["scores"][keep], r["boxes"][keep])]


def draw(img, dets, path):
    im = img.copy()
    d = ImageDraw.Draw(im)
    lw = max(2, im.width // 400)
    try:
        font = ImageFont.truetype("arial.ttf", max(14, im.width // 50))
    except OSError:
        font = ImageFont.load_default()
    # One label per box: DETR queries often share a box across several
    # classes; draw the highest-scoring class so the picture matches the
    # top-1 decision. Draw lowest score first so the best label ends on top.
    best = {}
    for name, score, box in dets:
        key = tuple(round(v) for v in box)
        if key not in best or score > best[key][1]:
            best[key] = (name, score, box)
    for name, score, (x0, y0, x1, y1) in sorted(best.values(), key=lambda t: t[1]):
        c = COLORS[CLASS_NAMES.index(name)]
        d.rectangle([x0, y0, x1, y1], outline=c, width=lw)
        label = f"{name} {score:.2f}"
        tw, th = d.textbbox((0, 0), label, font=font)[2:]
        d.rectangle([x0, max(0, y0 - th - 6), x0 + tw + 8, y0], fill=c)
        d.text((x0 + 4, max(0, y0 - th - 4)), label, fill="white", font=font)
    im.save(path)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("images", nargs="+")
    p.add_argument("--ckpt", required=True)
    p.add_argument("--conf", type=float, default=0.3)
    p.add_argument("--out", default="predictions")
    p.add_argument("--device", default="cuda:0" if torch.cuda.is_available() else "cpu")
    a = p.parse_args()

    model, cfg, epoch = load_model(a.ckpt)
    model.to(a.device)
    print(f"{cfg['model']} {cfg.get('variant', '')} @ {cfg['resolution']} px, epoch {epoch}")
    os.makedirs(a.out, exist_ok=True)

    for path in a.images:
        img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        dets = predict(model, cfg, img, a.device, a.conf)
        low = predict(model, cfg, img, a.device, 0.1) if not dets else []
        print(f"\n{os.path.basename(path)}  ({img.width}x{img.height})")
        if dets:
            for name, s, b in sorted(dets, key=lambda t: -t[1]):
                print(f"  {name:20s} {s:.3f}  box [{b[0]:.0f}, {b[1]:.0f}, {b[2]:.0f}, {b[3]:.0f}]")
        else:
            print(f"  no detection >= {a.conf}")
            for name, s, b in sorted(low, key=lambda t: -t[1])[:5]:
                print(f"    (below threshold) {name:20s} {s:.3f}")
        out = os.path.join(a.out, os.path.splitext(os.path.basename(path))[0] + "_pred.jpg")
        draw(img, dets, out)
        print(f"  -> {out}")


if __name__ == "__main__":
    main()
