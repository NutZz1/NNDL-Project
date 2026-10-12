import torch


def cxcywh_to_xyxy(b):
    cx, cy, w, h = b.unbind(-1)
    return torch.stack([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], dim=-1)


def xyxy_to_cxcywh(b):
    x0, y0, x1, y1 = b.unbind(-1)
    return torch.stack([(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0], dim=-1)


def box_area(b):
    return (b[:, 2] - b[:, 0]).clamp(min=0) * (b[:, 3] - b[:, 1]).clamp(min=0)


def box_iou(a, b):
    """a [N,4], b [M,4] xyxy -> iou [N,M], union [N,M]"""
    area_a, area_b = box_area(a), box_area(b)
    lt = torch.max(a[:, None, :2], b[None, :, :2])
    rb = torch.min(a[:, None, 2:], b[None, :, 2:])
    wh = (rb - lt).clamp(min=0)
    inter = wh[..., 0] * wh[..., 1]
    union = area_a[:, None] + area_b[None, :] - inter
    return inter / union.clamp(min=1e-7), union


def generalized_box_iou(a, b):
    iou, union = box_iou(a, b)
    lt = torch.min(a[:, None, :2], b[None, :, :2])
    rb = torch.max(a[:, None, 2:], b[None, :, 2:])
    wh = (rb - lt).clamp(min=0)
    enclose = (wh[..., 0] * wh[..., 1]).clamp(min=1e-7)
    return iou - (enclose - union) / enclose


def bbox_ciou(pred, tgt, eps=1e-7):
    """Element-wise CIoU for matched pairs. pred/tgt [N,4] xyxy -> [N]"""
    inter = ((torch.min(pred[:, 2], tgt[:, 2]) - torch.max(pred[:, 0], tgt[:, 0])).clamp(0)
             * (torch.min(pred[:, 3], tgt[:, 3]) - torch.max(pred[:, 1], tgt[:, 1])).clamp(0))
    w1, h1 = pred[:, 2] - pred[:, 0], pred[:, 3] - pred[:, 1]
    w2, h2 = tgt[:, 2] - tgt[:, 0], tgt[:, 3] - tgt[:, 1]
    union = w1 * h1 + w2 * h2 - inter + eps
    iou = inter / union
    cw = torch.max(pred[:, 2], tgt[:, 2]) - torch.min(pred[:, 0], tgt[:, 0])
    ch = torch.max(pred[:, 3], tgt[:, 3]) - torch.min(pred[:, 1], tgt[:, 1])
    c2 = cw ** 2 + ch ** 2 + eps
    rho2 = (((tgt[:, 0] + tgt[:, 2]) - (pred[:, 0] + pred[:, 2])) ** 2
            + ((tgt[:, 1] + tgt[:, 3]) - (pred[:, 1] + pred[:, 3])) ** 2) / 4
    v = (4 / (torch.pi ** 2)) * (torch.atan(w2 / (h2 + eps))
                                 - torch.atan(w1 / (h1 + eps))) ** 2
    with torch.no_grad():
        alpha = v / (v - iou + (1 + eps))
    return iou - (rho2 / c2 + alpha * v)
