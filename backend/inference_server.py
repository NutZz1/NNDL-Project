"""CivicScan Inference Microservice (RF-DETR, YOLOv11, RT-DETR)
Loads every trained detector checkpoint it can find and serves them over HTTP.
RF-DETR is the production model; YOLOv11 and RT-DETR are served for side-by-side comparison.
A model whose best.pt is missing is simply reported as unavailable (e.g. RT-DETR until its
checkpoint is copied into civicscan_training_rfdetr/training/runs/rtdetr/).

Endpoints:
  GET  /health   - Healthcheck & model info
  GET  /models   - Every model: availability, checkpoint, test metrics from its run folder
  POST /predict  - JSON {"image_path": "...", "model": "rfdetr"|"yolov11"|"rtdetr"} or raw binary image
                   Returns predicted defect class, confidence, bounding boxes, and latency.
  POST /compare  - JSON {"image_path": "..."}: runs every available model on the same image
  Both accept "enhance": true to restore the photo first with the Pix2Pix GAN trained for that
  detector (backend/gan/gan_<model>.py). Off by default; without it nothing changes.

Can also be invoked via CLI:
  python inference_server.py --image <path_to_image> [--model yolov11]
  python inference_server.py --test
"""

import sys
import os
import io
import glob
import json
import time
import argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
from PIL import Image, ImageOps

def open_upright(path_or_file):
    """Open a photo the way a phone shows it. Phones store portrait photos sideways plus an
    EXIF "rotate me" flag; without applying it the model sees a sideways picture and the boxes
    do not line up with the photo the browser displays. Returns (upright RGB image, raw image)."""
    raw = Image.open(path_or_file)
    return ImageOps.exif_transpose(raw).convert("RGB"), raw

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass

import torch
import torchvision.transforms.functional as TF

# Add civicscan training module to path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRAINING_DIR = os.path.join(ROOT_DIR, "civicscan_training_rfdetr", "training")
if TRAINING_DIR not in sys.path:
    sys.path.insert(0, TRAINING_DIR)

from civicscan.models import build_model_and_criterion, postprocess
from civicscan.data.transforms import build_transforms
from civicscan.schema import CATEGORIES

RUNS_DIR = os.path.join(TRAINING_DIR, "runs")

# One entry per detector. `runs` lists run folders (globs allowed) in priority order; the first
# one holding a best.pt is served. CIVICSCAN_CKPT_<KEY> (or CIVICSCAN_CKPT for RF-DETR) in the
# environment overrides the search with an explicit checkpoint path.
# Thresholds: DETR sigmoid-focal scores are low (a good detection is typically 0.3-0.7), so 0.4
# is the cut; `litter` gets 0.5 because it fires on any grey textured surface. YOLO scores are
# calibrated differently (Ultralytics default 0.25). Boxes between `floor` and the threshold are
# returned as uncertain `candidates` for the verification agent. YOLOv11-s from scratch is far less
# confident (its best boxes on field photos score ~0.2-0.3), so it uses 0.2.
MODEL_SPECS = {
    "rfdetr": {
        "name": "RF-DETR-Small",
        "architecture": "Transformer detector, DINOv2 ViT-S/14 backbone, 300 queries, no NMS",
        "role": "production",
        "runs": ["rfdetr_run4_700px", "rfdetr_run2", "rfdetr"],
        "env": "CIVICSCAN_CKPT",
        "thresh": 0.4, "class_thresh": {"litter": 0.5}, "floor": 0.15,
    },
    "yolov11": {
        "name": "YOLOv11-s",
        "architecture": "One-stage CNN detector, CSP backbone + PAN-FPN, anchor-free, NMS",
        "role": "comparison",
        "runs": ["yolov11_576", "yolov11*"],
        "env": "CIVICSCAN_CKPT_YOLOV11",
        "thresh": 0.2, "class_thresh": {}, "floor": 0.1,
    },
    "rtdetr": {
        "name": "RT-DETR (ResNet-18)",
        "architecture": "Transformer detector, ResNet-18 backbone + hybrid encoder, 300 queries, no NMS",
        "role": "comparison",
        "runs": ["rtdetr*"],
        "env": "CIVICSCAN_CKPT_RTDETR",
        "thresh": 0.4, "class_thresh": {"litter": 0.5}, "floor": 0.15,
    },
}
DEFAULT_MODEL = "rfdetr"
CLASS_NAMES = [c["name"] for c in CATEGORIES]

# Back-compat thresholds for callers that do not name a model (RF-DETR's)
DEFAULT_SCORE_THRESH = MODEL_SPECS["rfdetr"]["thresh"]
DEFAULT_CLASS_THRESH = MODEL_SPECS["rfdetr"]["class_thresh"]
DEFAULT_CANDIDATE_FLOOR = MODEL_SPECS["rfdetr"]["floor"]

LOADED = {}  # key -> {"model", "cfg", "device", "info"}
GLOBAL_DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"


def find_checkpoint(key):
    spec = MODEL_SPECS[key]
    override = os.environ.get(spec["env"])
    if override:
        return override if os.path.exists(override) else None
    for pattern in spec["runs"]:
        for run_dir in sorted(glob.glob(os.path.join(RUNS_DIR, pattern))):
            ckpt = os.path.join(run_dir, "best.pt")
            if os.path.exists(ckpt):
                return ckpt
    return None


def read_test_metrics(run_dir, ck_metrics):
    """Test-set metrics saved next to the checkpoint. All files use the same masked COCO
    evaluation (civicscan.engine.evaluate), so the numbers are comparable across models.
    Falls back to the validation metrics stored inside the checkpoint, labelled as such."""
    te = os.path.join(run_dir, "test_eval.json")
    if os.path.exists(te):
        with open(te) as f:
            m = json.load(f).get("masked", {})
        return {
            "split": "test", "source": "test_eval.json",
            "mAP50": m.get("val_mAP50"), "mAP5095": m.get("val_mAP5095"),
            "precision": m.get("val_precision"), "recall": m.get("val_recall"),
            "AP_small": m.get("val_AP_small"), "AP_medium": m.get("val_AP_medium"), "AP_large": m.get("val_AP_large"),
            "per_class_AP5095": {n: m.get(f"AP_{n}") for n in CLASS_NAMES},
        }
    ta = os.path.join(run_dir, "test_ap50.json")
    if os.path.exists(ta):
        with open(ta) as f:
            d = json.load(f)
        pc = d.get("per_class", {})
        return {
            "split": "test", "source": "test_ap50.json",
            "mAP50": d.get("overall", {}).get("mAP50"), "mAP5095": d.get("overall", {}).get("mAP5095"),
            "per_class_AP5095": {n: pc.get(n, {}).get("AP5095") for n in CLASS_NAMES},
        }
    m = ck_metrics or {}
    return {
        "split": "validation", "source": "checkpoint",
        "mAP50": m.get("val_mAP50"), "mAP5095": m.get("val_mAP5095"),
        "precision": m.get("val_precision"), "recall": m.get("val_recall"),
        "per_class_AP5095": {n: m.get(f"AP_{n}") for n in CLASS_NAMES},
    }


def load_model(key=DEFAULT_MODEL, ckpt_path=None):
    if key not in MODEL_SPECS:
        raise ValueError(f"Unknown model '{key}'. Choose one of: {', '.join(MODEL_SPECS)}")
    if key in LOADED:
        entry = LOADED[key]
        return entry["model"], entry["cfg"], entry["device"]

    spec = MODEL_SPECS[key]
    ckpt_path = ckpt_path or find_checkpoint(key)
    if not ckpt_path or not os.path.exists(ckpt_path):
        raise FileNotFoundError(
            f"{spec['name']} checkpoint not found. Put its best.pt in "
            f"{os.path.join(RUNS_DIR, spec['runs'][0].rstrip('*') or key)} or set {spec['env']}.")

    t0 = time.time()
    print(f"[{spec['name']}] Loading checkpoint from: {ckpt_path}")
    ck = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    cfg = dict(ck.get("config", {}))
    cfg.setdefault("model", key)
    if cfg["model"] != key:
        raise ValueError(f"{ckpt_path} holds a '{cfg['model']}' model, not '{key}'")
    cfg["device"] = GLOBAL_DEVICE
    cfg["pretrained"] = False

    model, _ = build_model_and_criterion(cfg)
    model.load_state_dict(ck["model"])
    model.to(GLOBAL_DEVICE).eval()

    LOADED[key] = {
        "model": model, "cfg": cfg, "device": GLOBAL_DEVICE, "ck_metrics": ck.get("metrics"),
        "info": {
            "checkpoint_path": ckpt_path,
            "epoch": ck.get("epoch"),
            "resolution": cfg.get("resolution"),
            "variant": cfg.get("variant"),
            "params_m": round(sum(p.numel() for p in model.parameters()) / 1e6, 2),
            "metrics": read_test_metrics(os.path.dirname(ckpt_path), ck.get("metrics")),
        },
    }
    print(f"[{spec['name']}] Loaded on {GLOBAL_DEVICE} (epoch {ck.get('epoch')}, "
          f"{cfg.get('resolution')} px) in {round(time.time() - t0, 2)}s")
    return model, cfg, GLOBAL_DEVICE


def load_rfdetr_model(ckpt_path=None):
    """Kept for existing callers: loads the production RF-DETR model."""
    return load_model("rfdetr", ckpt_path)


def load_all_models():
    for key in MODEL_SPECS:
        try:
            load_model(key)
        except FileNotFoundError as e:
            print(f"[{MODEL_SPECS[key]['name']}] not available: {e}")


def model_catalog():
    """Every model with its availability and saved test metrics, for the comparison UI."""
    out = []
    for key, spec in MODEL_SPECS.items():
        entry = LOADED.get(key)
        if entry is None and find_checkpoint(key):
            try:
                load_model(key)
                entry = LOADED[key]
            except Exception as e:
                print(f"[{spec['name']}] failed to load: {e}")
        info = dict(entry["info"]) if entry else {"checkpoint_path": None}
        if entry:  # re-read so a test_eval.json written after start-up is picked up
            info["metrics"] = read_test_metrics(os.path.dirname(info["checkpoint_path"]), entry["ck_metrics"])
        out.append({
            "key": key,
            "name": spec["name"],
            "architecture": spec["architecture"],
            "role": spec["role"],
            "available": entry is not None,
            "thresholds": {"default": spec["thresh"], "candidate_floor": spec["floor"], **spec["class_thresh"]},
            **info,
        })
    return out


# ---------------------------------------------------------------- optional GAN enhancement
# Each detector uses the Pix2Pix GAN that was trained and evaluated with it in Lab Eval 2
# (backend/gan/README.md). RT-DETR has none. Used only when a request asks for "enhance".
GAN_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gan")
GAN_SPECS = {
    "rfdetr": {"module": "gan_rfdetr", "weights": os.path.join(RUNS_DIR, "gan_rfdetr", "best_generator.pt"),
               "env": "CIVICSCAN_GAN_RFDETR"},
    "yolov11": {"module": "gan_yolov11", "weights": os.path.join(RUNS_DIR, "gan_yolov11", "G_final.pt"),
                "env": "CIVICSCAN_GAN_YOLOV11"},
}
GANS = {}  # key -> {"module", "G", "info"}


def gan_weights(key):
    spec = GAN_SPECS.get(key)
    if not spec:
        return None
    path = os.environ.get(spec["env"]) or spec["weights"]
    return path if os.path.exists(path) else None


def load_gan(key):
    """Loads the GAN for a detector on first use. Raises if it has none or its weights are missing."""
    if key in GANS:
        return GANS[key]
    if key not in GAN_SPECS:
        raise LookupError(f"No GAN was trained for {MODEL_SPECS[key]['name']}")
    weights = gan_weights(key)
    if not weights:
        raise LookupError(f"GAN weights for {MODEL_SPECS[key]['name']} not found ({GAN_SPECS[key]['weights']})")
    import importlib
    if GAN_DIR not in sys.path:
        sys.path.insert(0, GAN_DIR)
    module = importlib.import_module(GAN_SPECS[key]["module"])
    t0 = time.time()
    G = module.load_generator(weights, device=str(GLOBAL_DEVICE))
    info = dict(getattr(module, "INFO", {}))
    GANS[key] = {"module": module, "G": G, "info": info, "weights": weights}
    print(f"[GAN] {info.get('name', key)} loaded for {MODEL_SPECS[key]['name']} on {GLOBAL_DEVICE} "
          f"in {round(time.time() - t0, 2)}s")
    return GANS[key]


def gan_catalog():
    """Which detectors have a GAN available (for the UI)."""
    out = {}
    for key, spec in MODEL_SPECS.items():
        if key in GANS:
            out[key] = {"available": True, "name": GANS[key]["info"].get("name"), "loaded": True}
        elif key in GAN_SPECS and gan_weights(key):
            out[key] = {"available": True, "name": GAN_SPECS[key]["module"], "loaded": False}
        else:
            out[key] = {"available": False, "reason": "No GAN was trained for this detector"
                        if key not in GAN_SPECS else "GAN weights not found"}
    return out


def enhance_image(img, key):
    """Restores `img` with the detector's GAN. Returns (image to analyse, gan info).
    Never raises: if there is no usable GAN the original image is returned with the reason."""
    try:
        gan = load_gan(key)
        t0 = time.time()
        restored = gan["module"].restore(gan["G"], img)
        if restored.size != img.size:  # boxes must line up with the original photo
            restored = restored.resize(img.size, Image.BICUBIC)
        return restored.convert("RGB"), {"applied": True, "name": gan["info"].get("name", key),
                                         "ms": round((time.time() - t0) * 1000, 1)}
    except Exception as e:
        return img, {"applied": False, "reason": str(e)}


def _preview_data_url(img, max_side=1280):
    """Small JPEG of an image as a data URL, for showing a restored photo that is not stored."""
    import base64
    im = img.copy()
    im.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def extract_gps_from_pil(img):
    try:
        from PIL import ExifTags
        exif = img.getexif()
        if not exif:
            return None
        gps_ifd = exif.get_ifd(ExifTags.IFD.GPSInfo)
        if not gps_ifd:
            return None

        def to_deg(v):
            if isinstance(v, (tuple, list)) and len(v) == 3:
                return float(v[0]) + float(v[1]) / 60.0 + float(v[2]) / 3600.0
            return float(v)

        lat_ref = gps_ifd.get(1, 'N')
        lat_val = gps_ifd.get(2)
        lng_ref = gps_ifd.get(3, 'E')
        lng_val = gps_ifd.get(4)

        if lat_val and lng_val:
            lat = to_deg(lat_val)
            if lat_ref == 'S':
                lat = -lat
            lng = to_deg(lng_val)
            if lng_ref == 'W':
                lng = -lng

            alt_val = gps_ifd.get(6, 336.0)
            altitude = float(alt_val[0] / alt_val[1]) if isinstance(alt_val, (tuple, list)) and alt_val[1] != 0 else float(alt_val)

            return {
                "has_gps": True,
                "latitude": round(lat, 6),
                "longitude": round(lng, 6),
                "altitude": f"{round(altitude)}m",
            }
    except Exception as e:
        print(f"[Exif] Error extracting GPS: {e}")
    return None


def run_inference_on_pil(img, score_thresh=None, class_thresh=None, exif_img=None, candidate_floor=None, model_key=DEFAULT_MODEL):
    """Thresholds left as None use the chosen model's own defaults (see MODEL_SPECS)."""
    spec = MODEL_SPECS.get(model_key)
    if spec is None:
        raise ValueError(f"Unknown model '{model_key}'. Choose one of: {', '.join(MODEL_SPECS)}")
    score_thresh = spec["thresh"] if score_thresh is None else score_thresh
    candidate_floor = spec["floor"] if candidate_floor is None else candidate_floor
    class_thresh = {**spec["class_thresh"], **(class_thresh or {})}
    model, cfg, device = load_model(model_key)
    t0 = time.time()

    orig_w, orig_h = img.size
    res_size = cfg.get("resolution", 560)
    tf = build_transforms(res_size, False)

    target = {
        "boxes": torch.zeros((0, 4)),
        "labels": torch.zeros((0,), dtype=torch.long),
        "orig_size": torch.tensor([orig_h, orig_w]),
        "image_id": 0,
    }
    img_tensor, target = tf(img, target)
    img_tensor = img_tensor.unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = model(img_tensor)

    valid_mask = torch.ones((1, 8), dtype=torch.bool, device=device)
    res = postprocess(
        model_key,
        outputs,
        [target],
        valid_mask,
        res_size,
        score_thresh=min([score_thresh, candidate_floor] + list(class_thresh.values())),
        nms_iou=cfg.get("nms_iou", 0.7),
        apply_mask=False,
    )

    inference_ms = round((time.time() - t0) * 1000, 1)

    scores = res[0]["scores"].tolist()
    labels = res[0]["labels"].tolist()
    boxes = res[0]["boxes"].tolist()

    # A DETR query predicts ONE box with a score for every class, and postprocess returns the
    # top (query, class) pairs, so the same box comes back once per class (e.g. one pothole
    # reported as damaged manhole 0.73, litter 0.71, pothole 0.36 ...). Keep one label per box:
    # the best class that clears its own threshold; the others are kept as `alternatives`.
    per_box = {}
    for s, l, b in zip(scores, labels, boxes):
        name = CATEGORIES[l]["name"]
        key = tuple(round(v, 1) for v in b)
        per_box.setdefault(key, {"box": b, "cands": []})["cands"].append((s, l, name))

    picked = []
    weak = []  # best class below its threshold but above the candidate floor
    for entry in per_box.values():
        cands = sorted(entry["cands"], key=lambda c: -c[0])
        passing = [c for c in cands if c[0] >= class_thresh.get(c[2], score_thresh)]
        if not passing:
            if cands[0][0] >= candidate_floor:
                weak.append((cands[0][0], cands[0][1], entry["box"], [{"label": c[2], "score": round(c[0], 4)} for c in cands[1:3]]))
            continue
        best = passing[0]
        alts = [{"label": c[2], "score": round(c[0], 4)} for c in cands if c is not best][:3]
        picked.append((best[0], best[1], entry["box"], alts))

    # Two different queries can also land on the same object with the same class (near-identical
    # boxes). Keep the stronger one when same-class boxes overlap by more than 70% (IoU).
    def iou(a, b):
        ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
        iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
        inter = ix * iy
        union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
        return inter / union if union > 0 else 0.0

    picked.sort(key=lambda t: -t[0])
    kept = []
    for cand in picked:
        if all(k[1] != cand[1] or iou(k[2], cand[2]) <= 0.7 for k in kept):
            kept.append(cand)
    picked = kept

    # Uncertain candidates: one per object (drop any that overlaps a confident box or a
    # stronger candidate), at most 3, strongest first
    weak.sort(key=lambda t: -t[0])
    weak_kept = []
    def inside(c, k):  # share of the candidate box that lies inside box k
        ix = max(0.0, min(c[2], k[2]) - max(c[0], k[0]))
        iy = max(0.0, min(c[3], k[3]) - max(c[1], k[1]))
        area = (c[2] - c[0]) * (c[3] - c[1])
        return ix * iy / area if area > 0 else 0.0

    for cand in weak:
        # same object as an existing box: overlaps it, or lies mostly inside it
        if all(iou(k[2], cand[2]) <= 0.3 and inside(cand[2], k[2]) <= 0.6 for k in picked + weak_kept):
            weak_kept.append(cand)
    weak_kept = weak_kept[:3]

    def to_box(s, l, b, alts):
        cat_info = CATEGORIES[l]
        xmin, ymin, xmax, ymax = b
        return {
            "label": cat_info["name"],
            "domain": cat_info["supercategory"],
            "score": round(s, 4),
            "box": [
                round(max(0.0, min(1.0, ymin / orig_h)), 4),
                round(max(0.0, min(1.0, xmin / orig_w)), 4),
                round(max(0.0, min(1.0, ymax / orig_h)), 4),
                round(max(0.0, min(1.0, xmax / orig_w)), 4),
            ],
            "raw_box": [round(x, 1) for x in b],
            "alternatives": alts,
        }

    candidates = [to_box(*c) for c in weak_kept]

    detected_boxes = []
    for s, l, b, alts in picked:
        cat_info = CATEGORIES[l]
        # Normalize box to [ymin, xmin, ymax, xmax] relative to 0..1
        xmin, ymin, xmax, ymax = b
        norm_box = [
            round(max(0.0, min(1.0, ymin / orig_h)), 4),
            round(max(0.0, min(1.0, xmin / orig_w)), 4),
            round(max(0.0, min(1.0, ymax / orig_h)), 4),
            round(max(0.0, min(1.0, xmax / orig_w)), 4),
        ]
        detected_boxes.append({
            "label": cat_info["name"],
            "domain": cat_info["supercategory"],
            "score": round(s, 4),
            "box": norm_box,
            "raw_box": [round(x, 1) for x in b],
            "alternatives": alts,
        })

    # Sort detections by confidence descending
    detected_boxes.sort(key=lambda x: x["score"], reverse=True)

    if detected_boxes:
        top_det = detected_boxes[0]
        top_category = top_det["label"]
        top_domain = top_det["domain"]
        top_confidence = top_det["score"]
        has_defect = True
    else:
        # Perfectly fine image / no civic issues detected -> Mark for discard
        top_category = "clean"
        top_domain = "none"
        top_confidence = 0.0
        has_defect = False

    exif_data = extract_gps_from_pil(exif_img if exif_img is not None else img)

    return {
        "success": True,
        "has_defect": has_defect,
        "category": top_category,
        "domain": top_domain,
        "confidence": top_confidence,
        "bboxes": detected_boxes,
        "detections_count": len(detected_boxes),
        "candidates": candidates,
        "inference_ms": inference_ms,
        "device": device,
        "model": spec["name"],
        "model_key": model_key,
        "resolution": res_size,
        "image_size": [orig_w, orig_h],
        "thresholds": {"default": score_thresh, "candidate_floor": candidate_floor, **class_thresh},
        "exif": exif_data,
    }


def compare_on_pil(img, exif_img=None, enhance=False):
    """Run every available model on the same image, each with its own default thresholds.
    With enhance=True each model first gets the photo restored by its own GAN (if it has one)."""
    results = {}
    for key, spec in MODEL_SPECS.items():
        if key not in LOADED and not find_checkpoint(key):
            results[key] = {"success": False, "available": False, "model": spec["name"], "model_key": key,
                            "error": f"{spec['name']} checkpoint not found"}
            continue
        try:
            if enhance:
                src, gan = enhance_image(img, key)
                res = run_inference_on_pil(src, exif_img=exif_img if exif_img is not None else img, model_key=key)
                if gan["applied"]:
                    gan["restored_preview"] = _preview_data_url(src)
                results[key] = {"available": True, **res, "gan": gan}
            else:
                results[key] = {"available": True, **run_inference_on_pil(img, exif_img=exif_img, model_key=key)}
        except Exception as e:
            results[key] = {"success": False, "available": False, "model": spec["name"], "model_key": key, "error": str(e)}
    return {"success": True, "image_size": list(img.size), "results": results}


def _optional_float(v):
    return None if v is None else float(v)


def _open_from_path(image_path):
    """Open a stored upload. HEIC photos are also saved as JPEG so the browser can show them."""
    img, raw = open_upright(image_path)
    converted_filename = None
    if image_path.lower().endswith((".heic", ".heif")):
        jpg_path = os.path.splitext(image_path)[0] + ".jpg"
        img.save(jpg_path, format="JPEG", quality=92)
        converted_filename = os.path.basename(jpg_path)
    return img, raw, converted_filename


class InferenceHTTPHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {
                "status": "online",
                "service": "CivicScan Inference Server",
                "default_model": DEFAULT_MODEL,
                "loaded_models": [MODEL_SPECS[k]["name"] for k in LOADED],
                "device": str(GLOBAL_DEVICE),
                "checkpoints": {k: v["info"]["checkpoint_path"] for k, v in LOADED.items()},
                "gans": gan_catalog(),
                "timestamp": time.time(),
            })
        elif self.path == "/models":
            self._send_json(200, {"success": True, "default": DEFAULT_MODEL, "models": model_catalog(), "gans": gan_catalog()})
        else:
            self._send_json(404, {"error": "Not found"})

    def _read_body(self):
        content_len = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(content_len), self.headers.get("Content-Type", "")

    def do_POST(self):
        if self.path not in ("/predict", "/compare"):
            return self._send_json(404, {"error": "Not found"})
        try:
            body, content_type = self._read_body()
            data, converted_filename = {}, None
            if "application/json" in content_type:
                data = json.loads(body.decode("utf-8") or "{}")
                image_path = data.get("image_path")
                if not image_path or not os.path.exists(image_path):
                    return self._send_json(400, {"error": f"Invalid or non-existent image_path: {image_path}"})
                img, raw, converted_filename = _open_from_path(image_path)
            else:
                # Raw image binary upload
                img, raw = open_upright(io.BytesIO(body))

            enhance = data.get("enhance") is True
            if self.path == "/compare":
                result = compare_on_pil(img, exif_img=raw, enhance=enhance)
            else:
                model_key = data.get("model") or DEFAULT_MODEL
                if model_key not in MODEL_SPECS:
                    return self._send_json(400, {"error": f"Unknown model '{model_key}'. Choose one of: {', '.join(MODEL_SPECS)}"})
                gan = None
                if enhance:
                    # photo -> GAN restore -> detector; GPS still comes from the original photo
                    img, gan = enhance_image(img, model_key)
                    if gan["applied"] and data.get("image_path"):
                        out_path = os.path.splitext(data["image_path"])[0] + f"_gan_{model_key}.jpg"
                        img.save(out_path, format="JPEG", quality=92)
                        gan["restored_filename"] = os.path.basename(out_path)
                result = run_inference_on_pil(
                    img,
                    score_thresh=_optional_float(data.get("score_thresh")),
                    class_thresh=data.get("class_thresh") or None,
                    exif_img=raw,
                    candidate_floor=_optional_float(data.get("candidate_floor")),
                    model_key=model_key,
                )
                if gan is not None:
                    result["gan"] = gan
            if converted_filename:
                result["converted_filename"] = converted_filename
            self._send_json(200, result)
        except FileNotFoundError as e:
            self._send_json(503, {"error": str(e), "code": "MODEL_UNAVAILABLE"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def log_message(self, format, *args):
        # Concise logging
        print(f"[Inference Server] {self.address_string()} - {args[0]}")


if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach(), errors="replace")
    sys.stderr = codecs.getwriter("utf-8")(sys.stderr.detach(), errors="replace")


def run_server(port=5001, ckpt_path=None):
    if ckpt_path:
        load_model(DEFAULT_MODEL, ckpt_path=ckpt_path)
    load_all_models()
    if DEFAULT_MODEL not in LOADED:
        raise SystemExit(f"[CivicScan] The production model ({MODEL_SPECS[DEFAULT_MODEL]['name']}) could not be loaded.")
    server = HTTPServer(("0.0.0.0", port), InferenceHTTPHandler)
    print("==================================================")
    print(f"[CivicScan] Inference Microservice active on port {port}")
    for key, spec in MODEL_SPECS.items():
        print(f"[CivicScan]   {spec['name']:22s} {'loaded' if key in LOADED else 'NOT AVAILABLE'}")
    print(f"[CivicScan] Health:  http://127.0.0.1:{port}/health")
    print(f"[CivicScan] Models:  http://127.0.0.1:{port}/models")
    print(f"[CivicScan] Predict: http://127.0.0.1:{port}/predict (POST)")
    print(f"[CivicScan] Compare: http://127.0.0.1:{port}/compare (POST)")
    print("==================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping inference server...")
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CivicScan Inference Service (RF-DETR / YOLOv11 / RT-DETR)")
    parser.add_argument("--port", type=int, default=5001, help="Port to listen on")
    parser.add_argument("--ckpt", type=str, default=None, help="Custom RF-DETR checkpoint path (.pt)")
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL, choices=list(MODEL_SPECS),
                        help="Model for --image / --test")
    parser.add_argument("--image", type=str, default=None, help="Run single image inference and print JSON")
    parser.add_argument("--compare", action="store_true", help="With --image: run every available model")
    parser.add_argument("--enhance", action="store_true", help="With --image: restore the photo with the model's GAN first")
    parser.add_argument("--test", action="store_true", help="Run test on dummy image and exit")
    parser.add_argument("--thresh", type=float, default=None, help="Detection score threshold (default: the model's own)")
    parser.add_argument("--candidate-floor", type=float, default=None,
                        help="weakest score returned as an uncertain candidate for the verification agent")
    parser.add_argument("--class-thresh", action="append", default=[], metavar="CLASS=THR",
                        help="per-class threshold, e.g. litter=0.5 (repeatable)")
    args = parser.parse_args()

    if args.ckpt:
        load_model(DEFAULT_MODEL, ckpt_path=args.ckpt)

    if args.test:
        print(f"[Test Mode] Running {MODEL_SPECS[args.model]['name']} inference on sample synthetic image...")
        dummy = Image.new("RGB", (640, 480), color=(140, 140, 140))
        res = run_inference_on_pil(dummy, score_thresh=args.thresh, model_key=args.model)
        print(json.dumps(res, indent=2))
        sys.exit(0)

    if args.image:
        if not os.path.exists(args.image):
            print(f"Error: Image '{args.image}' not found.")
            sys.exit(1)
        img, raw, converted_filename = _open_from_path(args.image)
        if args.compare:
            res = compare_on_pil(img, exif_img=raw, enhance=args.enhance)
        else:
            cli_class = {k: float(v) for k, v in (x.split("=") for x in args.class_thresh)} or None
            gan = None
            if args.enhance:
                img, gan = enhance_image(img, args.model)
                if gan["applied"]:
                    out_path = os.path.splitext(args.image)[0] + f"_gan_{args.model}.jpg"
                    img.save(out_path, format="JPEG", quality=92)
                    gan["restored_filename"] = os.path.basename(out_path)
            res = run_inference_on_pil(img, score_thresh=args.thresh, class_thresh=cli_class, exif_img=raw,
                                       candidate_floor=args.candidate_floor, model_key=args.model)
            if gan is not None:
                res["gan"] = gan
        if converted_filename:
            res["converted_filename"] = converted_filename
        print(json.dumps(res, indent=2))
        sys.exit(0)

    run_server(port=args.port, ckpt_path=args.ckpt)


