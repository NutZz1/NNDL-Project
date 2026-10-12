"""YOLOv11 — Member 2.

Anchor-free, decoupled-head, DFL-regression one-stage CNN detector with a
CSP backbone (C3k2 blocks), SPPF, C2PSA attention block and a PAN-FPN neck.
Reimplementation in plain PyTorch; no Ultralytics dependency.

No pretrained weights: this trains from scratch while RF-DETR and RT-DETR both
start from pretrained backbones. That is a pretraining confound, it favours the
DETR models, and it must be stated in the report rather than presented as an
architectural result.
"""

import math

import torch
import torch.nn as nn


def autopad(k, p=None):
    return (k // 2) if p is None else p


class Conv(nn.Module):
    def __init__(self, ci, co, k=1, s=1, p=None, g=1):
        super().__init__()
        self.conv = nn.Conv2d(ci, co, k, s, autopad(k, p), groups=g, bias=False)
        self.bn = nn.BatchNorm2d(co)
        self.act = nn.SiLU(inplace=True)

    def forward(self, x):
        return self.act(self.bn(self.conv(x)))


class Bottleneck(nn.Module):
    def __init__(self, ci, co, shortcut=True, e=0.5):
        super().__init__()
        c = int(co * e)
        self.cv1, self.cv2 = Conv(ci, c, 3), Conv(c, co, 3)
        self.add = shortcut and ci == co

    def forward(self, x):
        return x + self.cv2(self.cv1(x)) if self.add else self.cv2(self.cv1(x))


class C3k2(nn.Module):
    """CSP block with n bottlenecks — the YOLOv11 backbone/neck unit."""

    def __init__(self, ci, co, n=1, shortcut=True, e=0.5):
        super().__init__()
        c = int(co * e)
        self.cv1 = Conv(ci, 2 * c, 1)
        self.cv2 = Conv((2 + n) * c, co, 1)
        self.m = nn.ModuleList(Bottleneck(c, c, shortcut) for _ in range(n))

    def forward(self, x):
        y = list(self.cv1(x).chunk(2, 1))
        for m in self.m:
            y.append(m(y[-1]))
        return self.cv2(torch.cat(y, 1))


class SPPF(nn.Module):
    def __init__(self, ci, co, k=5):
        super().__init__()
        c = ci // 2
        self.cv1, self.cv2 = Conv(ci, c, 1), Conv(c * 4, co, 1)
        self.m = nn.MaxPool2d(k, 1, k // 2)

    def forward(self, x):
        x = self.cv1(x)
        y1 = self.m(x)
        y2 = self.m(y1)
        return self.cv2(torch.cat([x, y1, y2, self.m(y2)], 1))


class C2PSA(nn.Module):
    """Position-sensitive self-attention block at the deepest level."""

    def __init__(self, c, nhead=4):
        super().__init__()
        self.attn = nn.MultiheadAttention(c, nhead, batch_first=True)
        self.norm = nn.LayerNorm(c)
        self.ffn = nn.Sequential(nn.Linear(c, c * 2), nn.SiLU(), nn.Linear(c * 2, c))
        self.norm2 = nn.LayerNorm(c)

    def forward(self, x):
        b, c, h, w = x.shape
        t = x.flatten(2).transpose(1, 2)
        a, _ = self.attn(t, t, t)
        t = self.norm(t + a)
        t = self.norm2(t + self.ffn(t))
        return t.transpose(1, 2).reshape(b, c, h, w)


class DFL(nn.Module):
    """Distribution Focal Loss integral: expectation over reg_max bins."""

    def __init__(self, reg_max=16):
        super().__init__()
        self.reg_max = reg_max
        self.register_buffer("proj", torch.arange(reg_max, dtype=torch.float32))

    def forward(self, x):
        b, _, a = x.shape
        x = x.view(b, 4, self.reg_max, a).softmax(2)
        return (x * self.proj.view(1, 1, -1, 1)).sum(2)


VARIANTS = {
    "yolo11n": dict(w=0.25, d=1, nc_head=64),
    "yolo11s": dict(w=0.50, d=1, nc_head=128),
    "yolo11m": dict(w=0.75, d=2, nc_head=192),
}


def _c(base, w):
    return max(16, int(round(base * w / 8) * 8))


class YOLOv11(nn.Module):
    def __init__(self, num_classes=8, variant="yolo11s", reg_max=16):
        super().__init__()
        if variant not in VARIANTS:
            raise ValueError(f"variant must be one of {list(VARIANTS)}")
        v = VARIANTS[variant]
        w, d = v["w"], v["d"]
        self.variant, self.nc, self.reg_max = variant, num_classes, reg_max
        self.strides = (8, 16, 32)

        c1, c2, c3, c4, c5 = (_c(64, w), _c(128, w), _c(256, w), _c(512, w), _c(1024, w))
        self.stem = Conv(3, c1, 3, 2)
        self.b1 = nn.Sequential(Conv(c1, c2, 3, 2), C3k2(c2, c2, d))
        self.b2 = nn.Sequential(Conv(c2, c3, 3, 2), C3k2(c3, c3, 2 * d))
        self.b3 = nn.Sequential(Conv(c3, c4, 3, 2), C3k2(c4, c4, 2 * d))
        self.b4 = nn.Sequential(Conv(c4, c5, 3, 2), C3k2(c5, c5, d),
                                SPPF(c5, c5), C2PSA(c5))

        self.up = nn.Upsample(scale_factor=2, mode="nearest")
        self.n1 = C3k2(c5 + c4, c4, d, shortcut=False)
        self.n2 = C3k2(c4 + c3, c3, d, shortcut=False)
        self.d1 = Conv(c3, c3, 3, 2)
        self.n3 = C3k2(c3 + c4, c4, d, shortcut=False)
        self.d2 = Conv(c4, c4, 3, 2)
        self.n4 = C3k2(c4 + c5, c5, d, shortcut=False)

        ch = (c3, c4, c5)
        hc = v["nc_head"]
        hr = max(64, 4 * reg_max)
        self.cls_head = nn.ModuleList(
            nn.Sequential(Conv(c, hc, 3), Conv(hc, hc, 3), nn.Conv2d(hc, num_classes, 1))
            for c in ch)
        self.reg_head = nn.ModuleList(
            nn.Sequential(Conv(c, hr, 3), Conv(hr, hr, 3), nn.Conv2d(hr, 4 * reg_max, 1))
            for c in ch)
        self.dfl = DFL(reg_max)
        self._init()

    def _init(self):
        prior = 0.01
        for m in self.cls_head:
            nn.init.constant_(m[-1].bias, -math.log((1 - prior) / prior))
        for m in self.reg_head:
            nn.init.constant_(m[-1].bias, 1.0)

    def param_groups(self, lr, backbone_lr=None):
        decay, no_decay = [], []
        for n, p in self.named_parameters():
            if not p.requires_grad:
                continue
            (no_decay if p.ndim <= 1 else decay).append(p)
        return [{"params": decay, "lr": lr, "name": "decay"},
                {"params": no_decay, "lr": lr, "weight_decay": 0.0, "name": "no_decay"}]

    def forward(self, x):
        x = self.stem(x)
        x = self.b1(x)
        p3 = self.b2(x)
        p4 = self.b3(p3)
        p5 = self.b4(p4)
        t4 = self.n1(torch.cat([self.up(p5), p4], 1))
        o3 = self.n2(torch.cat([self.up(t4), p3], 1))
        o4 = self.n3(torch.cat([self.d1(o3), t4], 1))
        o5 = self.n4(torch.cat([self.d2(o4), p5], 1))

        feats = [o3, o4, o5]
        cls, reg, anchors, strides = [], [], [], []
        for i, f in enumerate(feats):
            b, _, h, w = f.shape
            cls.append(self.cls_head[i](f).view(b, self.nc, -1))
            reg.append(self.reg_head[i](f).view(b, 4 * self.reg_max, -1))
            sy, sx = torch.meshgrid(
                torch.arange(h, device=f.device, dtype=torch.float32) + 0.5,
                torch.arange(w, device=f.device, dtype=torch.float32) + 0.5,
                indexing="ij")
            anchors.append(torch.stack([sx, sy], -1).view(-1, 2) * self.strides[i])
            strides.append(torch.full((h * w,), float(self.strides[i]), device=f.device))
        return {
            "pred_cls": torch.cat(cls, 2).permute(0, 2, 1),      # [B, A, nc]
            "pred_dist": torch.cat(reg, 2).permute(0, 2, 1),     # [B, A, 4*reg_max]
            "anchors": torch.cat(anchors, 0),                    # [A, 2] px centres
            "strides": torch.cat(strides, 0),                    # [A]
        }


def build_yolov11(cfg, num_classes=8):
    return YOLOv11(num_classes=num_classes,
                   variant=cfg.get("variant", "yolo11s"),
                   reg_max=cfg.get("reg_max", 16))
