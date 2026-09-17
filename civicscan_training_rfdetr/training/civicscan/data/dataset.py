"""CivicScan COCO dataset.

Contract returned by __getitem__:
    image      float [3,H,W]  ImageNet-normalised
    boxes      float [N,4]    xyxy, absolute pixels in the RESIZED image
    labels     long  [N]      0-indexed (COCO id - 1)
    valid_mask bool  [8]      from image["valid_categories"]
    image_id   long  scalar
    orig_size  long  [2]      (h, w) before resize
    size       long  [2]      (h, w) after resize
    source     str

Images with zero annotations are KEPT. 5,995 RDD2022 no-damage frames, 1,434
crack-free wall images and the intact-cover manhole frames are deliberate
negatives for false-positive suppression. Dropping them silently changes the
dataset.
"""

import json
import os
from collections import defaultdict

import torch
from PIL import Image
from torch.utils.data import Dataset

from ..schema import CAT_ID_TO_IDX, NUM_CLASSES
from ..masking import build_valid_mask, assert_targets_valid


class CivicScanCocoDataset(Dataset):
    def __init__(self, ann_file, image_root, transforms=None,
                 skip_missing_images=True, strict=True, decode_max=None):
        self.ann_file = ann_file
        self.image_root = image_root
        self.transforms = transforms
        self.strict = strict
        # Reduced-size JPEG decoding. TACO photos are 2448x3264 (8 MP) and
        # each one costs ~20x the decode time of a 600x600 RDD frame, which
        # made the data loader the bottleneck for the fast models (YOLO-s
        # runs ~100 img/s on the GPU; 8 workers fed it 57 img/s). PIL's
        # draft() lets libjpeg decode at 1/2, 1/4 or 1/8 scale, choosing the
        # largest reduction that still yields >= decode_max on both sides,
        # so nothing is decoded smaller than it will be resized to anyway.
        # Boxes are scaled to the decoded size below; orig_size stays the
        # annotation-file size so evaluation still maps back to GT pixels.
        # Set to ~2x the training resolution: a RandomScaleCrop at 0.6 of a
        # 2x-resolution decode is still >= resolution, so no upsampling.
        self.decode_max = decode_max

        with open(ann_file, "r") as f:
            data = json.load(f)

        cats = sorted(c["id"] for c in data["categories"])
        if cats != sorted(CAT_ID_TO_IDX):
            raise ValueError(
                f"category ids in {ann_file} are {cats}, expected "
                f"{sorted(CAT_ID_TO_IDX)}. Regenerate the splits with seed 42.")

        by_image = defaultdict(list)
        for a in data["annotations"]:
            if a.get("iscrowd", 0):
                continue
            by_image[a["image_id"]].append(a)

        self.records = []
        self.missing = []
        for im in data["images"]:
            path = os.path.join(image_root, im["file_name"])
            if skip_missing_images and not os.path.exists(path):
                self.missing.append(im["file_name"])
                continue
            self.records.append((im, by_image.get(im["id"], []), path))

        if not self.records:
            raise RuntimeError(
                f"0 usable images. Checked image_root={image_root}. "
                f"{len(self.missing)} files listed in the annotation JSON were "
                f"not found on disk — image_root is probably wrong.")

        self.valid_masks = {
            im["id"]: build_valid_mask(im["valid_categories"], CAT_ID_TO_IDX,
                                       NUM_CLASSES)
            for im, _, _ in self.records
        }

    def __len__(self):
        return len(self.records)

    def stats(self):
        n_ann = sum(len(a) for _, a, _ in self.records)
        n_empty = sum(1 for _, a, _ in self.records if not a)
        per_class = [0] * NUM_CLASSES
        per_source = defaultdict(int)
        for im, anns, _ in self.records:
            per_source[im.get("source_dataset", "unknown")] += 1
            for a in anns:
                per_class[CAT_ID_TO_IDX[a["category_id"]]] += 1
        return dict(images=len(self.records), annotations=n_ann,
                    empty_images=n_empty, per_class=per_class,
                    per_source=dict(per_source),
                    missing_files=len(self.missing))

    def __getitem__(self, i):
        im, anns, path = self.records[i]
        img = Image.open(path)
        ow, oh = img.size                      # true size, from the header
        if self.decode_max and img.format == "JPEG":
            img.draft("RGB", (self.decode_max, self.decode_max))
        img = img.convert("RGB")
        w, h = img.size                        # decoded size (<= original)
        sx, sy = w / ow, h / oh

        boxes, labels = [], []
        for a in anns:
            x, y, bw, bh = a["bbox"]
            if bw <= 1 or bh <= 1:
                continue
            x, y, bw, bh = x * sx, y * sy, bw * sx, bh * sy
            x0, y0 = max(0.0, x), max(0.0, y)
            x1, y1 = min(float(w), x + bw), min(float(h), y + bh)
            if x1 <= x0 or y1 <= y0:
                continue
            boxes.append([x0, y0, x1, y1])
            # THE ONLY PLACE COCO ids are shifted to 0-indexed.
            labels.append(CAT_ID_TO_IDX[a["category_id"]])

        target = {
            "boxes": torch.tensor(boxes, dtype=torch.float32).reshape(-1, 4),
            "labels": torch.tensor(labels, dtype=torch.long),
            "valid_mask": self.valid_masks[im["id"]].clone(),
            "image_id": torch.tensor(im["id"], dtype=torch.long),
            "orig_size": torch.tensor([oh, ow], dtype=torch.long),
            "source": im.get("source_dataset", "unknown"),
        }
        if self.strict:
            assert_targets_valid(target["labels"], target["valid_mask"])

        if self.transforms is not None:
            img, target = self.transforms(img, target)
        return img, target
