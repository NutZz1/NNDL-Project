"""Variable-N target collation. Images are stacked (uniform square size);
targets stay a list of dicts. valid_mask is additionally stacked to [B, C] so
losses and assigners can broadcast it directly.
"""

import torch


def collate_fn(batch):
    images = torch.stack([b[0] for b in batch], dim=0)
    targets = [b[1] for b in batch]
    valid_mask = torch.stack([t["valid_mask"] for t in targets], dim=0)
    return images, targets, valid_mask
