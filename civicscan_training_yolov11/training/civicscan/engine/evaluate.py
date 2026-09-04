"""COCO evaluation with valid_categories masking.

Predictions on classes the image's source dataset cannot annotate are removed
before COCOeval sees them (done in models.build.postprocess). This is a
NON-STANDARD evaluation protocol: without it, correct detections of
unannotated objects count as false positives and val mAP is depressed by an
amount that varies with the source mix of the split. Declare it in the report.

Reported: mAP@50, mAP@50-95, AP small/medium/large, per-class AP@50-95,
precision and recall at IoU 0.5, and per-source mAP.
"""

import contextlib
import io
from collections import defaultdict

import numpy as np
import torch
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval

from ..schema import CLASS_NAMES, IDX_TO_CAT_ID, NUM_CLASSES
from ..models.build import postprocess


def _coco_eval(coco_gt, dets, img_ids, cat_ids=None):
    if not dets:
        return None
    with contextlib.redirect_stdout(io.StringIO()):
        coco_dt = coco_gt.loadRes(dets)
        e = COCOeval(coco_gt, coco_dt, "bbox")
        e.params.imgIds = list(img_ids)
        if cat_ids is not None:
            e.params.catIds = list(cat_ids)
        e.evaluate()
        e.accumulate()
        e.summarize()
    return e


def _pr_at_50(e):
    """Precision and recall at IoU 0.5, averaged over classes, max-dets 100."""
    if e is None:
        return 0.0, 0.0
    p = e.eval["precision"][0, :, :, 0, 2]
    r = e.eval["recall"][0, :, 0, 2]
    p = p[p > -1]
    r = r[r > -1]
    return float(p.mean()) if p.size else 0.0, float(r.mean()) if r.size else 0.0


@torch.no_grad()
def evaluate(model, criterion, loader, device, cfg, amp_dtype=torch.float16,
             compute_loss=True, apply_mask=True, max_batches=None):
    model.eval()
    name = cfg["model"]
    size = cfg["resolution"]
    dets, img_ids, losses = [], [], []
    src_of = {}

    for bi, (images, targets, valid_mask) in enumerate(loader):
        if max_batches and bi >= max_batches:
            break
        images = images.to(device, non_blocking=True)
        vm = valid_mask.to(device, non_blocking=True)
        tg = _to_device(targets, device, size)

        with torch.autocast(device_type=device.split(":")[0], dtype=amp_dtype,
                            enabled=device.startswith("cuda")):
            out = model(images)
            if compute_loss:
                losses.append(float(criterion(out, tg, vm)["loss_total"]))

        out = {k: (v.float() if torch.is_tensor(v) else v) for k, v in out.items()}
        if "aux_outputs" in out:
            out.pop("aux_outputs")
        res = postprocess(name, out, targets, vm, size,
                          score_thresh=cfg.get("score_thresh", 0.001),
                          max_det=cfg.get("max_det", 300),
                          nms_iou=cfg.get("nms_iou", 0.7),
                          apply_mask=apply_mask)
        for t, r in zip(targets, res):
            iid = int(t["image_id"])
            img_ids.append(iid)
            src_of[iid] = t.get("source", "unknown")
            for b, s, l in zip(r["boxes"].tolist(), r["scores"].tolist(),
                               r["labels"].tolist()):
                dets.append({"image_id": iid, "category_id": IDX_TO_CAT_ID[int(l)],
                             "bbox": [b[0], b[1], b[2] - b[0], b[3] - b[1]],
                             "score": float(s)})

    coco_gt = loader.dataset.coco_gt
    e = _coco_eval(coco_gt, dets, img_ids)
    metrics = _empty_metrics()
    if e is not None:
        s = e.stats
        metrics.update(val_mAP5095=float(s[0]), val_mAP50=float(s[1]),
                       val_AP_small=float(s[3]), val_AP_medium=float(s[4]),
                       val_AP_large=float(s[5]))
        p, r = _pr_at_50(e)
        metrics.update(val_precision=p, val_recall=r)
        for i in range(NUM_CLASSES):
            ce = _coco_eval(coco_gt, dets, img_ids, cat_ids=[IDX_TO_CAT_ID[i]])
            metrics[f"AP_{CLASS_NAMES[i]}"] = (
                float(ce.stats[0]) if ce is not None and not np.isnan(ce.stats[0]) else -1.0)

    by_src = defaultdict(list)
    for iid, s in src_of.items():
        by_src[s].append(iid)
    per_source = {}
    for s, ids in by_src.items():
        se = _coco_eval(coco_gt, [d for d in dets if d["image_id"] in set(ids)], ids)
        per_source[s] = float(se.stats[1]) if se is not None else -1.0
    metrics["per_source_mAP50"] = per_source
    metrics["val_loss"] = float(np.mean(losses)) if losses else None
    metrics["num_detections"] = len(dets)
    return metrics


def _empty_metrics():
    m = dict(val_mAP50=0.0, val_mAP5095=0.0, val_AP_small=-1.0,
             val_AP_medium=-1.0, val_AP_large=-1.0, val_precision=0.0,
             val_recall=0.0)
    for n in CLASS_NAMES:
        m[f"AP_{n}"] = -1.0
    return m


def _to_device(targets, device, size):
    from ..models.boxes import xyxy_to_cxcywh
    out = []
    for t in targets:
        b = t["boxes"].to(device)
        d = {k: (v.to(device) if torch.is_tensor(v) else v) for k, v in t.items()}
        d["boxes"] = b
        d["boxes_norm"] = xyxy_to_cxcywh(b / size) if b.numel() else b.new_zeros(0, 4)
        out.append(d)
    return out


def attach_coco_gt(dataset, ann_file):
    """COCO ground truth object used by COCOeval, attached to the dataset."""
    with contextlib.redirect_stdout(io.StringIO()):
        dataset.coco_gt = COCO(ann_file)
    return dataset
