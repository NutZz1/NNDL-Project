"""TaskAligned assigner + YOLO loss with valid_categories masking.

Masking points:
  1. assigner — the alignment metric is zeroed on invalid classes before top-k
     selection, so an invalid class can never win an anchor.
  2. classification BCE — including the negative/background term on every
     unmatched anchor. This is the term that would otherwise punish a correct
     prediction of an unannotated class.
Box (CIoU) and DFL losses are computed only on positive anchors and are not
masked; positives are valid by construction.
"""

import torch
import torch.nn as nn
import torch.nn.functional as Fn

from ..masking import class_loss_weight_mask
from .boxes import bbox_ciou, box_iou


def dist2bbox(dist, anchors, stride):
    """dist [B,A,4] (l,t,r,b in stride units) -> xyxy pixels"""
    lt, rb = dist.chunk(2, -1)
    a = anchors.unsqueeze(0)
    s = stride.view(1, -1, 1)
    return torch.cat([a - lt * s, a + rb * s], -1)


def bbox2dist(boxes, anchors, stride, reg_max):
    a = anchors.unsqueeze(0)
    s = stride.view(1, -1, 1)
    lt = (a - boxes[..., :2]) / s
    rb = (boxes[..., 2:] - a) / s
    return torch.cat([lt, rb], -1).clamp(0, reg_max - 1 - 0.01)


class TaskAlignedAssigner(nn.Module):
    def __init__(self, topk=10, alpha=0.5, beta=6.0, eps=1e-9):
        super().__init__()
        self.topk, self.alpha, self.beta, self.eps = topk, alpha, beta, eps

    @torch.no_grad()
    def forward(self, pred_scores, pred_boxes, anchors, gt_boxes, gt_labels,
                valid_mask):
        """Single image.
        pred_scores [A,C] sigmoid, pred_boxes [A,4] xyxy px, anchors [A,2] px,
        gt_boxes [N,4] xyxy px, gt_labels [N], valid_mask [C] bool
        returns fg_mask [A] bool, target_boxes [A,4], target_scores [A,C]
        """
        a, c = pred_scores.shape
        n = gt_labels.numel()
        dev = pred_scores.device
        if n == 0:
            return (torch.zeros(a, dtype=torch.bool, device=dev),
                    torch.zeros(a, 4, device=dev),
                    torch.zeros(a, c, device=dev))

        # anchor centre inside GT box
        inside = ((anchors[:, None, 0] > gt_boxes[None, :, 0])
                  & (anchors[:, None, 0] < gt_boxes[None, :, 2])
                  & (anchors[:, None, 1] > gt_boxes[None, :, 1])
                  & (anchors[:, None, 1] < gt_boxes[None, :, 3]))  # [A,N]

        # MASK 1: an invalid class contributes zero alignment, so it can never
        # be selected as a positive.
        scores_masked = pred_scores * valid_mask.to(pred_scores.dtype).view(1, -1)
        cls_score = scores_masked[:, gt_labels]                    # [A,N]
        ious = box_iou(pred_boxes, gt_boxes)[0].clamp(min=0)       # [A,N]
        align = (cls_score.pow(self.alpha) * ious.pow(self.beta)) * inside

        k = min(self.topk, a)
        topk_val, topk_idx = align.topk(k, dim=0)
        cand = torch.zeros_like(align, dtype=torch.bool)
        cand.scatter_(0, topk_idx, topk_val > self.eps)
        cand = cand & inside

        # one anchor -> one GT: keep the highest-IoU GT on conflicts
        overlap = cand.sum(1)
        if (overlap > 1).any():
            multi = overlap > 1
            best = ious.argmax(1)
            fix = torch.zeros_like(cand)
            fix[torch.arange(a, device=dev), best] = True
            cand = torch.where(multi.unsqueeze(1), fix & inside, cand)

        fg_mask = cand.any(1)
        gt_idx = cand.float().argmax(1)

        target_boxes = gt_boxes[gt_idx]
        target_labels = gt_labels[gt_idx]

        # normalised alignment as the soft classification target (TAL)
        align_pos = align * cand
        max_align = align_pos.amax(0, keepdim=True)
        max_iou = (ious * cand).amax(0, keepdim=True)
        norm = (align_pos / (max_align + self.eps) * max_iou).amax(1)  # [A]

        target_scores = torch.zeros(a, c, device=dev, dtype=pred_scores.dtype)
        idx = fg_mask.nonzero(as_tuple=True)[0]
        target_scores[idx, target_labels[idx]] = norm[idx]
        target_boxes = target_boxes * fg_mask.unsqueeze(1)
        return fg_mask, target_boxes, target_scores


class YOLOLoss(nn.Module):
    def __init__(self, num_classes=8, reg_max=16, box=7.5, cls=0.5, dfl=1.5,
                 topk=10, class_weights=None):
        super().__init__()
        self.nc, self.reg_max = num_classes, reg_max
        self.w_box, self.w_cls, self.w_dfl = box, cls, dfl
        self.assigner = TaskAlignedAssigner(topk=topk)
        self.register_buffer(
            "class_weights",
            torch.ones(num_classes) if class_weights is None else class_weights.float())

    def _dfl_loss(self, pred_dist, target, fg):
        """pred_dist [P,4,reg_max] logits, target [P,4] continuous"""
        tl = target.long()
        tr = (tl + 1).clamp(max=self.reg_max - 1)
        wl = tr.float() - target
        wr = 1 - wl
        p = pred_dist.view(-1, self.reg_max)
        loss = (Fn.cross_entropy(p, tl.view(-1), reduction="none") * wl.view(-1)
                + Fn.cross_entropy(p, tr.view(-1), reduction="none") * wr.view(-1))
        return loss.view(-1, 4).mean(1)

    def forward(self, outputs, targets, valid_mask):
        cls_logits = outputs["pred_cls"]                    # [B,A,C]
        dist = outputs["pred_dist"]                         # [B,A,4*reg_max]
        anchors, strides = outputs["anchors"], outputs["strides"]
        b, a, c = cls_logits.shape
        dev = cls_logits.device

        dist_r = dist.view(b, a, 4, self.reg_max)
        proj = torch.arange(self.reg_max, device=dev, dtype=dist.dtype)
        dist_dec = (dist_r.softmax(-1) * proj).sum(-1)      # [B,A,4]
        pred_boxes = dist2bbox(dist_dec, anchors, strides)  # [B,A,4] px

        scores = cls_logits.sigmoid()
        fg_all, tb_all, ts_all = [], [], []
        for i in range(b):
            fg, tb, ts = self.assigner(
                scores[i].detach(), pred_boxes[i].detach(), anchors,
                targets[i]["boxes"].to(dev), targets[i]["labels"].to(dev),
                valid_mask[i].to(dev))
            fg_all.append(fg)
            tb_all.append(tb)
            ts_all.append(ts)
        fg = torch.stack(fg_all)
        target_boxes = torch.stack(tb_all)
        target_scores = torch.stack(ts_all)
        norm = target_scores.sum().clamp(min=1)

        # MASK 2: classification BCE, positives and background alike.
        bce = Fn.binary_cross_entropy_with_logits(
            cls_logits, target_scores, reduction="none")
        bce = bce * self.class_weights.view(1, 1, -1).to(bce)
        bce = bce * class_loss_weight_mask(valid_mask.to(dev), bce)
        loss_cls = bce.sum() / norm

        if fg.any():
            pb = pred_boxes[fg]
            tb = target_boxes[fg]
            weight = target_scores.sum(-1)[fg]
            loss_box = ((1 - bbox_ciou(pb, tb)) * weight).sum() / norm
            tgt_dist = bbox2dist(target_boxes, anchors, strides, self.reg_max)[fg]
            loss_dfl = (self._dfl_loss(dist_r[fg], tgt_dist, fg) * weight).sum() / norm
        else:
            loss_box = cls_logits.sum() * 0.0
            loss_dfl = cls_logits.sum() * 0.0

        total = self.w_box * loss_box + self.w_cls * loss_cls + self.w_dfl * loss_dfl
        return {"loss_cls": loss_cls, "loss_bbox": loss_box, "loss_dfl": loss_dfl,
                "loss_total": total, "num_pos": fg.sum().detach()}
