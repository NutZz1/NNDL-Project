"""RF-DETR — Member 1.

DINOv2 ViT backbone (self-supervised, LVD-142M) with intermediate-layer
extraction, reshaped into a 3-level feature pyramid, feeding the shared
DETR decoder head.

Reimplementation, not the official Roboflow checkpoint. The distinguishing
property that matters for the research question is preserved: a
self-supervised vision-transformer backbone with global attention, against
RT-DETR's supervised CNN backbone under an otherwise identical head.

Backbone weights are fetched from torch.hub on first run and need internet.
Use --no-pretrained to train from scratch (expect much worse results and say so).
"""

import torch
import torch.nn as nn
import torch.nn.functional as Fn

from .detr_head import DetrDecoderHead

VARIANTS = {
    "nano": dict(hub="dinov2_vits14", embed=384, patch=14,
                 out_layers=(5, 8, 11), d_model=256, layers=3, nhead=8, ffn=1024),
    "small": dict(hub="dinov2_vits14", embed=384, patch=14,
                  out_layers=(3, 7, 11), d_model=256, layers=6, nhead=8, ffn=1024),
    "base": dict(hub="dinov2_vitb14", embed=768, patch=14,
                 out_layers=(3, 7, 11), d_model=256, layers=6, nhead=8, ffn=2048),
}


class DinoV2Backbone(nn.Module):
    def __init__(self, hub_name, out_layers, pretrained=True, freeze_n=0):
        super().__init__()
        self.vit = torch.hub.load("facebookresearch/dinov2", hub_name,
                                  pretrained=pretrained, trust_repo=True)
        self.out_layers = out_layers
        self.patch = self.vit.patch_embed.patch_size
        if isinstance(self.patch, (tuple, list)):
            self.patch = self.patch[0]
        self.embed_dim = self.vit.embed_dim
        if freeze_n > 0:
            for p in self.vit.patch_embed.parameters():
                p.requires_grad_(False)
            for blk in self.vit.blocks[:freeze_n]:
                for p in blk.parameters():
                    p.requires_grad_(False)

    def forward(self, x):
        b, _, h, w = x.shape
        gh, gw = h // self.patch, w // self.patch
        n = max(self.out_layers) + 1
        feats = self.vit.get_intermediate_layers(x, n=n, reshape=False)
        picked = [feats[i] for i in self.out_layers]
        out = []
        for i, f in enumerate(picked):
            f = f[:, -gh * gw:, :] if f.shape[1] != gh * gw else f
            f = f.transpose(1, 2).reshape(b, self.embed_dim, gh, gw)
            # 3 pyramid levels from one uniform-stride ViT: /1, /2, /4 of grid
            if i == 1:
                f = Fn.avg_pool2d(f, 2)
            elif i == 2:
                f = Fn.avg_pool2d(f, 4)
            out.append(f)
        return out


class RFDETR(nn.Module):
    def __init__(self, num_classes=8, variant="small", num_queries=300,
                 pretrained=True, freeze_backbone_blocks=0, aux_loss=True):
        super().__init__()
        if variant not in VARIANTS:
            raise ValueError(f"variant must be one of {list(VARIANTS)}")
        v = VARIANTS[variant]
        self.variant = variant
        self.patch_size = v["patch"]
        self.backbone = DinoV2Backbone(v["hub"], v["out_layers"], pretrained,
                                       freeze_backbone_blocks)
        ch = [self.backbone.embed_dim] * 3
        self.head = DetrDecoderHead(ch, num_classes, num_queries, v["d_model"],
                                    v["nhead"], v["layers"], v["ffn"],
                                    aux_loss=aux_loss)

    def param_groups(self, lr, backbone_lr):
        bb = [p for p in self.backbone.parameters() if p.requires_grad]
        hd = [p for p in self.head.parameters() if p.requires_grad]
        return [{"params": bb, "lr": backbone_lr, "name": "backbone"},
                {"params": hd, "lr": lr, "name": "head"}]

    def forward(self, images):
        return self.head(self.backbone(images))


def build_rfdetr(cfg, num_classes=8):
    return RFDETR(num_classes=num_classes,
                  variant=cfg.get("variant", "small"),
                  num_queries=cfg.get("queries", 300),
                  pretrained=cfg.get("pretrained", True),
                  freeze_backbone_blocks=cfg.get("freeze_backbone_blocks", 0),
                  aux_loss=cfg.get("aux_loss", True))
