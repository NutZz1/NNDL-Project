"""Box-safe transforms. Square resize (no letterbox) so every image in a batch
has identical shape — required by the DETR-style models and simpler for YOLO.
Aspect ratio is not preserved; boxes are scaled by the same factors.
"""

import random

import torch
import torchvision.transforms.functional as F

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


class Compose:
    def __init__(self, ts):
        self.ts = ts

    def __call__(self, img, target):
        for t in self.ts:
            img, target = t(img, target)
        return img, target


class Resize:
    def __init__(self, size):
        self.size = int(size)

    def __call__(self, img, target):
        w, h = img.size
        img = F.resize(img, [self.size, self.size])
        if target["boxes"].numel():
            sx, sy = self.size / w, self.size / h
            target["boxes"] = target["boxes"] * torch.tensor([sx, sy, sx, sy])
        target["size"] = torch.tensor([self.size, self.size], dtype=torch.long)
        return img, target


class RandomHorizontalFlip:
    def __init__(self, p=0.5):
        self.p = p

    def __call__(self, img, target):
        if random.random() < self.p:
            w, _ = img.size
            img = F.hflip(img)
            b = target["boxes"]
            if b.numel():
                target["boxes"] = torch.stack(
                    [w - b[:, 2], b[:, 1], w - b[:, 0], b[:, 3]], dim=1)
        return img, target


class ColorJitter:
    """Brightness/contrast/saturation/hue. Boxes untouched. Targets the
    shadow / wet-surface / oil-stain false-positive modes in the dataset."""

    def __init__(self, brightness=0.4, contrast=0.4, saturation=0.4, hue=0.015, p=0.8):
        self.b, self.c, self.s, self.h, self.p = brightness, contrast, saturation, hue, p

    def __call__(self, img, target):
        if random.random() < self.p:
            if self.b:
                img = F.adjust_brightness(img, 1 + random.uniform(-self.b, self.b))
            if self.c:
                img = F.adjust_contrast(img, 1 + random.uniform(-self.c, self.c))
            if self.s:
                img = F.adjust_saturation(img, 1 + random.uniform(-self.s, self.s))
            if self.h:
                img = F.adjust_hue(img, random.uniform(-self.h, self.h))
        return img, target


class RandomScaleCrop:
    """Zoom-in crop. Preserves small-object learnability for thin cracks and
    distant litter. Boxes are clipped; boxes losing >60% area are dropped."""

    def __init__(self, min_scale=0.6, p=0.5, min_keep=0.4):
        self.min_scale, self.p, self.min_keep = min_scale, p, min_keep

    def __call__(self, img, target):
        if random.random() >= self.p:
            return img, target
        w, h = img.size
        s = random.uniform(self.min_scale, 1.0)
        cw, ch = int(w * s), int(h * s)
        x0 = random.randint(0, w - cw)
        y0 = random.randint(0, h - ch)
        img = img.crop((x0, y0, x0 + cw, y0 + ch))
        b = target["boxes"]
        if b.numel():
            area0 = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
            b = b - torch.tensor([x0, y0, x0, y0], dtype=b.dtype)
            b[:, 0::2] = b[:, 0::2].clamp(0, cw)
            b[:, 1::2] = b[:, 1::2].clamp(0, ch)
            area1 = (b[:, 2] - b[:, 0]).clamp(min=0) * (b[:, 3] - b[:, 1]).clamp(min=0)
            keep = (area1 > 1) & (area1 >= self.min_keep * area0.clamp(min=1e-6))
            target["boxes"] = b[keep]
            target["labels"] = target["labels"][keep]
        return img, target


class ToTensorNormalize:
    def __call__(self, img, target):
        img = F.to_tensor(img)
        img = F.normalize(img, IMAGENET_MEAN, IMAGENET_STD)
        return img, target


def build_transforms(size, train):
    if train:
        return Compose([
            RandomScaleCrop(min_scale=0.6, p=0.5),
            RandomHorizontalFlip(0.5),
            ColorJitter(),
            Resize(size),
            ToTensorNormalize(),
        ])
    return Compose([Resize(size), ToTensorNormalize()])
