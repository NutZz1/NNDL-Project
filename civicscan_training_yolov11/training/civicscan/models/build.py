"""Model, criterion and postprocessor factory. One entry point for all three
members so the training script is identical regardless of model."""

import torch
import torchvision

from ..schema import NUM_CLASSES
from ..masking import filter_predictions
from .boxes import cxcywh_to_xyxy
from .detr_criterion import HungarianMatcher, SetCriterion
from .rfdetr import build_rfdetr
from .rtdetr import build_rtdetr
from .yolov11 import build_yolov11
from .yolo_loss import YOLOLoss, dist2bbox

FAMILY = {"rfdetr": "detr", "rtdetr": "detr", "yolov11": "yolo"}


def build_model_and_criterion(cfg, class_weights=None):
    name = cfg["model"]
    if name == "rfdetr":
        model = build_rfdetr(cfg, NUM_CLASSES)
    elif name == "rtdetr":
        model = build_rtdetr(cfg, NUM_CLASSES)
    elif name == "yolov11":
        model = build_yolov11(cfg, NUM_CLASSES)
    else:
        raise ValueError(f"unknown model '{name}'")

    if FAMILY[name] == "detr":
        matcher = HungarianMatcher(cfg.get("cost_class", 2.0),
                                   cfg.get("cost_bbox", 5.0),
                                   cfg.get("cost_giou", 2.0))
        crit = SetCriterion(NUM_CLASSES, matcher,
                            w_class=cfg.get("w_class", 2.0),
                            w_bbox=cfg.get("w_bbox", 5.0),
                            w_giou=cfg.get("w_giou", 2.0),
                            class_weights=class_weights,
                            aux_loss=cfg.get("aux_loss", True))
    else:
        crit = YOLOLoss(NUM_CLASSES, cfg.get("reg_max", 16),
                        box=cfg.get("w_box", 7.5), cls=cfg.get("w_cls", 0.5),
                        dfl=cfg.get("w_dfl", 1.5), topk=cfg.get("tal_topk", 10),
                        class_weights=class_weights)
    return model, crit


@torch.no_grad()
def postprocess(name, outputs, targets, valid_mask, image_size,
                score_thresh=0.001, max_det=300, nms_iou=0.7, apply_mask=True):
    """-> list of dicts with boxes xyxy in ORIGINAL image pixels, scores, labels."""
    results = []
    if FAMILY[name] == "detr":
        prob = outputs["pred_logits"].sigmoid()
        b, q, c = prob.shape
        boxes = cxcywh_to_xyxy(outputs["pred_boxes"]) * image_size
        for i in range(b):
            s, idx = prob[i].flatten().topk(min(max_det, q * c))
            lbl = idx % c
            qi = idx // c
            bx = boxes[i][qi]
            keep = s > score_thresh
            s, lbl, bx = s[keep], lbl[keep], bx[keep]
            if apply_mask:
                lbl, s, bx = filter_predictions(lbl, s, bx, valid_mask[i])
            results.append(_rescale(bx, s, lbl, targets[i], image_size))
    else:
        cls = outputs["pred_cls"].sigmoid()
        dist = outputs["pred_dist"]
        b, a, c = cls.shape
        rm = dist.shape[-1] // 4
        proj = torch.arange(rm, device=dist.device, dtype=dist.dtype)
        dec = (dist.view(b, a, 4, rm).softmax(-1) * proj).sum(-1)
        boxes = dist2bbox(dec, outputs["anchors"], outputs["strides"])
        for i in range(b):
            sc, lbl = cls[i].max(-1)
            keep = sc > max(score_thresh, 0.001)
            bx, sc, lbl = boxes[i][keep], sc[keep], lbl[keep]
            if apply_mask:
                lbl, sc, bx = filter_predictions(lbl, sc, bx, valid_mask[i])
            if bx.numel():
                k = torchvision.ops.batched_nms(bx, sc, lbl, nms_iou)[:max_det]
                bx, sc, lbl = bx[k], sc[k], lbl[k]
            results.append(_rescale(bx, sc, lbl, targets[i], image_size))
    return results


def _rescale(boxes, scores, labels, target, image_size):
    h, w = target["orig_size"].tolist()
    if boxes.numel():
        sx, sy = w / image_size, h / image_size
        boxes = boxes * torch.tensor([sx, sy, sx, sy], device=boxes.device,
                                     dtype=boxes.dtype)
        boxes[:, 0::2] = boxes[:, 0::2].clamp(0, w)
        boxes[:, 1::2] = boxes[:, 1::2].clamp(0, h)
    return {"boxes": boxes.cpu(), "scores": scores.cpu(), "labels": labels.cpu(),
            "image_id": int(target["image_id"])}
