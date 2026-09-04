"""valid_categories loss masking — the correctness requirement of this project.

Every image carries `valid_categories`: the classes its SOURCE DATASET is
capable of annotating. Absence of a label does NOT mean absence of the object.
A TACO image full of litter almost certainly also contains road cracks that
were never annotated.

If classification loss is computed over all 8 classes on that image, every
correct crack prediction is punished as a false positive and the model is
actively trained not to detect cracks in litter-like scenes.

Rules (identical for all three architectures):
  classification loss   -> masked. Invalid classes contribute nothing, neither
                           positive nor negative (the no-object/background term
                           is exactly the false-positive punishment we must
                           suppress).
  box regression        -> NOT masked. Only computed on matched ground truth,
                           which is valid by construction.
  assignment/matching   -> masked. Invalid classes must never be matchable.
  evaluation            -> masked. A prediction of class k on an image where
                           k is invalid is neither TP nor FP; it is discarded
                           before COCOeval sees it. This is a non-standard eval
                           protocol and MUST be declared in the report.
"""

import torch

NEG_INF = -1e4  # finite: -inf produces NaN under autocast/softmax


def build_valid_mask(valid_categories, cat_id_to_idx, num_classes, device=None):
    """list[int] of COCO category ids -> bool tensor [num_classes], 0-indexed."""
    m = torch.zeros(num_classes, dtype=torch.bool, device=device)
    for cid in valid_categories:
        idx = cat_id_to_idx.get(int(cid))
        if idx is not None:
            m[idx] = True
    return m


def assert_targets_valid(labels, valid_mask):
    """Every GT label must lie inside its image's valid mask. Guards silent
    id-shift bugs. labels [N] 0-indexed, valid_mask [C] bool."""
    if labels.numel() == 0:
        return
    if not bool(valid_mask[labels].all()):
        bad = labels[~valid_mask[labels]].tolist()
        raise AssertionError(
            f"ground-truth labels {bad} outside valid_categories "
            f"{valid_mask.nonzero().flatten().tolist()} — likely an id-shift bug"
        )


def mask_class_logits(logits, valid_mask):
    """Drive invalid-class logits to a large negative constant.

    logits     [..., C]
    valid_mask [C] or [B, C] (broadcast over the leading query/anchor dims)

    Used for BOTH the matching cost and the classification loss, so an invalid
    class can never be predicted, never be matched, and never generate a
    false-positive gradient.
    """
    if valid_mask.dim() == 1:
        m = valid_mask.view(*([1] * (logits.dim() - 1)), -1)
    elif valid_mask.dim() == 2:
        b, c = valid_mask.shape
        m = valid_mask.view(b, *([1] * (logits.dim() - 2)), c)
    else:
        raise ValueError(f"valid_mask must be 1-D or 2-D, got {valid_mask.shape}")
    return logits.masked_fill(~m.to(logits.device), NEG_INF)


def class_loss_weight_mask(valid_mask, shape_like):
    """Multiplicative 0/1 weight over a [..., C] loss tensor."""
    if valid_mask.dim() == 1:
        m = valid_mask.view(*([1] * (shape_like.dim() - 1)), -1)
    else:
        b, c = valid_mask.shape
        m = valid_mask.view(b, *([1] * (shape_like.dim() - 2)), c)
    return m.to(shape_like.dtype).to(shape_like.device)


def masked_sigmoid_focal_loss(logits, targets, valid_mask, alpha=0.25,
                              gamma=2.0, class_weights=None, reduction="sum"):
    """Focal loss over [..., C], zeroed on invalid classes.

    logits/targets [..., C]; targets one-hot float.
    class_weights  [C] or None (per-class inverse-frequency weights).
    """
    p = torch.sigmoid(logits)
    ce = torch.nn.functional.binary_cross_entropy_with_logits(
        logits, targets, reduction="none")
    p_t = p * targets + (1 - p) * (1 - targets)
    loss = ce * ((1 - p_t) ** gamma)
    if alpha >= 0:
        a_t = alpha * targets + (1 - alpha) * (1 - targets)
        loss = a_t * loss
    if class_weights is not None:
        loss = loss * class_weights.view(*([1] * (loss.dim() - 1)), -1).to(loss)
    loss = loss * class_loss_weight_mask(valid_mask, loss)
    if reduction == "sum":
        return loss.sum()
    if reduction == "mean":
        return loss.sum() / class_loss_weight_mask(valid_mask, loss).sum().clamp(min=1)
    return loss


def masked_bce(logits, targets, valid_mask, class_weights=None, reduction="sum"):
    """Plain BCE-with-logits over [..., C], zeroed on invalid classes."""
    loss = torch.nn.functional.binary_cross_entropy_with_logits(
        logits, targets, reduction="none")
    if class_weights is not None:
        loss = loss * class_weights.view(*([1] * (loss.dim() - 1)), -1).to(loss)
    loss = loss * class_loss_weight_mask(valid_mask, loss)
    return loss.sum() if reduction == "sum" else loss


def filter_predictions(labels, scores, boxes, valid_mask):
    """Drop predictions on classes the image's source cannot annotate.
    Applied at evaluation and inference time."""
    if labels.numel() == 0:
        return labels, scores, boxes
    keep = valid_mask.to(labels.device)[labels]
    return labels[keep], scores[keep], boxes[keep]
