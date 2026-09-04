"""Hungarian matcher and set criterion with valid_categories masking.

Two masking points, both mandatory:
  1. the matching cost matrix — invalid classes get NEG_INF logits, so their
     cost is effectively infinite and they can never be matched to a query.
  2. the classification loss, including the no-object term — this is what
     stops a correct-but-unannotated prediction being punished.

Auxiliary decoder-layer losses are masked identically. Masking only the final
layer silently loses most of the effect.
"""

import torch
import torch.nn as nn
import torch.nn.functional as Fn
from scipy.optimize import linear_sum_assignment

from ..masking import mask_class_logits, masked_sigmoid_focal_loss
from .boxes import cxcywh_to_xyxy, generalized_box_iou


class HungarianMatcher(nn.Module):
    def __init__(self, cost_class=2.0, cost_bbox=5.0, cost_giou=2.0,
                 alpha=0.25, gamma=2.0):
        super().__init__()
        self.cost_class, self.cost_bbox, self.cost_giou = cost_class, cost_bbox, cost_giou
        self.alpha, self.gamma = alpha, gamma

    @torch.no_grad()
    def forward(self, outputs, targets, valid_mask):
        """outputs: logits [B,Q,C], boxes [B,Q,4] cxcywh normalised
        targets: list of dicts with boxes_norm [N,4] cxcywh, labels [N]
        valid_mask: [B,C] bool
        returns list of (query_idx, target_idx) per image"""
        logits, boxes = outputs["pred_logits"], outputs["pred_boxes"]
        b, q, _ = logits.shape
        indices = []
        for i in range(b):
            tgt = targets[i]
            n = tgt["labels"].numel()
            if n == 0:
                indices.append((torch.as_tensor([], dtype=torch.long),
                                torch.as_tensor([], dtype=torch.long)))
                continue
            # MASK 1: invalid classes cannot be matched.
            lg = mask_class_logits(logits[i], valid_mask[i])
            p = lg.sigmoid()
            neg = (1 - self.alpha) * (p ** self.gamma) * (-(1 - p + 1e-8).log())
            pos = self.alpha * ((1 - p) ** self.gamma) * (-(p + 1e-8).log())
            cost_cls = (pos - neg)[:, tgt["labels"]]
            cost_bbox = torch.cdist(boxes[i], tgt["boxes_norm"], p=1)
            cost_giou = -generalized_box_iou(cxcywh_to_xyxy(boxes[i]),
                                             cxcywh_to_xyxy(tgt["boxes_norm"]))
            c = (self.cost_class * cost_cls + self.cost_bbox * cost_bbox
                 + self.cost_giou * cost_giou)
            c = torch.nan_to_num(c, nan=1e4, posinf=1e4, neginf=-1e4)
            r, col = linear_sum_assignment(c.float().cpu().numpy())
            indices.append((torch.as_tensor(r, dtype=torch.long),
                            torch.as_tensor(col, dtype=torch.long)))
        return indices


class SetCriterion(nn.Module):
    def __init__(self, num_classes, matcher, w_class=2.0, w_bbox=5.0,
                 w_giou=2.0, alpha=0.25, gamma=2.0, class_weights=None,
                 aux_loss=True):
        super().__init__()
        self.num_classes = num_classes
        self.matcher = matcher
        self.w_class, self.w_bbox, self.w_giou = w_class, w_bbox, w_giou
        self.alpha, self.gamma = alpha, gamma
        self.aux_loss = aux_loss
        self.register_buffer(
            "class_weights",
            torch.ones(num_classes) if class_weights is None else class_weights.float())

    def _layer_loss(self, out, targets, valid_mask, num_boxes):
        logits, boxes = out["pred_logits"], out["pred_boxes"]
        b, q, c = logits.shape
        idx = self.matcher(out, targets, valid_mask)

        target_onehot = torch.zeros_like(logits)
        src_boxes, tgt_boxes = [], []
        for i, (qi, ti) in enumerate(idx):
            if qi.numel() == 0:
                continue
            qi, ti = qi.to(logits.device), ti.to(logits.device)
            target_onehot[i, qi, targets[i]["labels"][ti]] = 1.0
            src_boxes.append(boxes[i, qi])
            tgt_boxes.append(targets[i]["boxes_norm"][ti])

        # MASK 2: classification loss, including the background term.
        loss_cls = masked_sigmoid_focal_loss(
            logits, target_onehot, valid_mask, self.alpha, self.gamma,
            class_weights=self.class_weights, reduction="sum") / max(num_boxes, 1)

        if src_boxes:
            sb = torch.cat(src_boxes, 0)
            tb = torch.cat(tgt_boxes, 0)
            loss_bbox = Fn.l1_loss(sb, tb, reduction="sum") / max(num_boxes, 1)
            loss_giou = (1 - torch.diag(generalized_box_iou(
                cxcywh_to_xyxy(sb), cxcywh_to_xyxy(tb)))).sum() / max(num_boxes, 1)
        else:
            loss_bbox = logits.sum() * 0.0
            loss_giou = logits.sum() * 0.0
        return {"loss_cls": loss_cls, "loss_bbox": loss_bbox, "loss_giou": loss_giou}

    def forward(self, outputs, targets, valid_mask):
        num_boxes = max(1, sum(t["labels"].numel() for t in targets))
        losses = self._layer_loss(outputs, targets, valid_mask, num_boxes)
        total = (self.w_class * losses["loss_cls"] + self.w_bbox * losses["loss_bbox"]
                 + self.w_giou * losses["loss_giou"])
        if self.aux_loss and "aux_outputs" in outputs:
            for j, aux in enumerate(outputs["aux_outputs"]):
                al = self._layer_loss(aux, targets, valid_mask, num_boxes)
                total = total + (self.w_class * al["loss_cls"]
                                 + self.w_bbox * al["loss_bbox"]
                                 + self.w_giou * al["loss_giou"])
                for k, v in al.items():
                    losses[f"{k}_aux{j}"] = v.detach()
        losses["loss_total"] = total
        return losses
