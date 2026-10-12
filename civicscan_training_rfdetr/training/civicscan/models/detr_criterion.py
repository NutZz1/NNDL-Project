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
        returns list of (query_idx, target_idx) per image

        The cost matrix is computed for the whole batch in one shot and moved
        to the CPU with a single transfer; the per-image assignment is then
        read off block-by-block. Per-image results are identical to computing
        each image on its own — the batching only removes B-1 GPU->CPU syncs
        per call, which on a laptop GPU was a third of the training step.
        """
        logits, boxes = outputs["pred_logits"], outputs["pred_boxes"]
        b, q, _ = logits.shape
        sizes = [t["labels"].numel() for t in targets]
        empty = (torch.as_tensor([], dtype=torch.long),
                 torch.as_tensor([], dtype=torch.long))
        if sum(sizes) == 0:
            return [empty] * b

        # MASK 1: invalid classes cannot be matched.
        lg = mask_class_logits(logits, valid_mask).flatten(0, 1)      # [B*Q, C]
        p = lg.sigmoid()
        neg = (1 - self.alpha) * (p ** self.gamma) * (-(1 - p + 1e-8).log())
        pos = self.alpha * ((1 - p) ** self.gamma) * (-(p + 1e-8).log())
        tgt_labels = torch.cat([t["labels"] for t in targets])
        tgt_boxes = torch.cat([t["boxes_norm"] for t in targets])
        cost_cls = (pos - neg)[:, tgt_labels]                           # [B*Q, N]
        flat_boxes = boxes.flatten(0, 1)
        cost_bbox = torch.cdist(flat_boxes, tgt_boxes, p=1)
        cost_giou = -generalized_box_iou(cxcywh_to_xyxy(flat_boxes),
                                         cxcywh_to_xyxy(tgt_boxes))
        c = (self.cost_class * cost_cls + self.cost_bbox * cost_bbox
             + self.cost_giou * cost_giou).view(b, q, -1)
        c = torch.nan_to_num(c, nan=1e4, posinf=1e4, neginf=-1e4).float().cpu()

        indices = []
        for i, ci in enumerate(c.split(sizes, -1)):
            if sizes[i] == 0:
                indices.append(empty)
                continue
            r, col = linear_sum_assignment(ci[i].numpy())
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

    def _layer_loss(self, out, targets, valid_mask, num_boxes, idx=None):
        logits, boxes = out["pred_logits"], out["pred_boxes"]
        b, q, c = logits.shape
        if idx is None:
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
        layers = [outputs]
        if self.aux_loss and "aux_outputs" in outputs:
            layers += list(outputs["aux_outputs"])

        # One matcher call for every decoder layer at once: the layers are
        # stacked along the batch axis, so the (L x B) assignments come back
        # from a single cost matrix and a single GPU->CPU transfer. Each
        # (layer, image) block is still solved independently, so the
        # assignments are exactly those of L separate calls.
        L, b = len(layers), len(targets)
        stacked = {"pred_logits": torch.cat([l["pred_logits"] for l in layers], 0),
                   "pred_boxes": torch.cat([l["pred_boxes"] for l in layers], 0)}
        idx_all = self.matcher(stacked, targets * L, valid_mask.repeat(L, 1))

        losses = self._layer_loss(layers[0], targets, valid_mask, num_boxes,
                                  idx=idx_all[:b])
        total = (self.w_class * losses["loss_cls"] + self.w_bbox * losses["loss_bbox"]
                 + self.w_giou * losses["loss_giou"])
        for j, aux in enumerate(layers[1:]):
            al = self._layer_loss(aux, targets, valid_mask, num_boxes,
                                  idx=idx_all[(j + 1) * b:(j + 2) * b])
            total = total + (self.w_class * al["loss_cls"]
                             + self.w_bbox * al["loss_bbox"]
                             + self.w_giou * al["loss_giou"])
            for k, v in al.items():
                losses[f"{k}_aux{j}"] = v.detach()
        losses["loss_total"] = total
        return losses
