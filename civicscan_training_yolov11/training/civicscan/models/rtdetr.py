"""RT-DETR — Member 3, the control.

ResNet backbone (ImageNet-supervised) + the efficient hybrid encoder from the
RT-DETR paper: AIFI (self-attention on the highest level only) and CCFF (CNN
cross-scale fusion), feeding the SAME DetrDecoderHead as RF-DETR with the same
query count, layer count, matcher and losses.

Everything except backbone and encoder is identical to Member 1's model. That
identity is the experimental control — without it, any RF-DETR advantage could
be the head rather than the backbone, and the ViT claim is unfalsifiable.
"""

import torch
import torch.nn as nn
import torch.nn.functional as Fn
import torchvision

from .detr_head import DetrDecoderHead, sine_pos_embed

VARIANTS = {
    "rtdetr-r18": dict(net="resnet18", ch=(128, 256, 512), d_model=256,
                       layers=6, nhead=8, ffn=1024),
    "rtdetr-r34": dict(net="resnet34", ch=(128, 256, 512), d_model=256,
                       layers=6, nhead=8, ffn=1024),
    "rtdetr-l": dict(net="resnet50", ch=(512, 1024, 2048), d_model=256,
                     layers=6, nhead=8, ffn=1024),
}
_WEIGHTS = {
    "resnet18": torchvision.models.ResNet18_Weights.IMAGENET1K_V1,
    "resnet34": torchvision.models.ResNet34_Weights.IMAGENET1K_V1,
    "resnet50": torchvision.models.ResNet50_Weights.IMAGENET1K_V2,
}


class ResNetBackbone(nn.Module):
    """Returns C3 /8, C4 /16, C5 /32."""

    def __init__(self, net="resnet50", pretrained=True, freeze_stem=True):
        super().__init__()
        m = getattr(torchvision.models, net)(
            weights=_WEIGHTS[net] if pretrained else None)
        self.stem = nn.Sequential(m.conv1, m.bn1, m.relu, m.maxpool)
        self.layer1, self.layer2 = m.layer1, m.layer2
        self.layer3, self.layer4 = m.layer3, m.layer4
        if freeze_stem:
            for p in self.stem.parameters():
                p.requires_grad_(False)
            for p in self.layer1.parameters():
                p.requires_grad_(False)

    def forward(self, x):
        x = self.layer1(self.stem(x))
        c3 = self.layer2(x)
        c4 = self.layer3(c3)
        c5 = self.layer4(c4)
        return [c3, c4, c5]


class AIFI(nn.Module):
    """Attention-based Intra-scale Feature Interaction: self-attention applied
    to the highest (smallest) level only, where it is cheap."""

    def __init__(self, d_model, nhead=8, ffn=1024, dropout=0.0):
        super().__init__()
        self.attn = nn.MultiheadAttention(d_model, nhead, dropout, batch_first=True)
        self.lin1, self.lin2 = nn.Linear(d_model, ffn), nn.Linear(ffn, d_model)
        self.n1, self.n2 = nn.LayerNorm(d_model), nn.LayerNorm(d_model)
        self.do = nn.Dropout(dropout)

    def forward(self, x):
        b, c, h, w = x.shape
        t = x.flatten(2).transpose(1, 2)
        pos = sine_pos_embed(h, w, c, x.device).unsqueeze(0).to(t.dtype)
        a, _ = self.attn(t + pos, t + pos, t)
        t = self.n1(t + self.do(a))
        t = self.n2(t + self.do(self.lin2(torch.relu(self.lin1(t)))))
        return t.transpose(1, 2).reshape(b, c, h, w)


class CCFF(nn.Module):
    """CNN-based Cross-scale Feature Fusion — a PAN-style top-down/bottom-up
    fusion over the three projected levels."""

    def __init__(self, d_model):
        super().__init__()
        def blk():
            return nn.Sequential(
                nn.Conv2d(2 * d_model, d_model, 3, padding=1, bias=False),
                nn.BatchNorm2d(d_model), nn.SiLU(),
                nn.Conv2d(d_model, d_model, 3, padding=1, bias=False),
                nn.BatchNorm2d(d_model), nn.SiLU())
        self.td1, self.td2, self.bu1, self.bu2 = blk(), blk(), blk(), blk()
        self.down1 = nn.Conv2d(d_model, d_model, 3, 2, 1)
        self.down2 = nn.Conv2d(d_model, d_model, 3, 2, 1)

    def forward(self, p3, p4, p5):
        u5 = Fn.interpolate(p5, size=p4.shape[-2:], mode="nearest")
        p4 = self.td1(torch.cat([p4, u5], 1))
        u4 = Fn.interpolate(p4, size=p3.shape[-2:], mode="nearest")
        p3 = self.td2(torch.cat([p3, u4], 1))
        p4 = self.bu1(torch.cat([p4, self.down1(p3)], 1))
        p5 = self.bu2(torch.cat([p5, self.down2(p4)], 1))
        return [p3, p4, p5]


class RTDETR(nn.Module):
    def __init__(self, num_classes=8, variant="rtdetr-l", num_queries=300,
                 pretrained=True, aux_loss=True):
        super().__init__()
        if variant not in VARIANTS:
            raise ValueError(f"variant must be one of {list(VARIANTS)}")
        v = VARIANTS[variant]
        self.variant = variant
        d = v["d_model"]
        self.backbone = ResNetBackbone(v["net"], pretrained)
        self.proj = nn.ModuleList(
            nn.Sequential(nn.Conv2d(c, d, 1, bias=False), nn.BatchNorm2d(d))
            for c in v["ch"])
        self.aifi = AIFI(d, v["nhead"], v["ffn"])
        self.ccff = CCFF(d)
        self.head = DetrDecoderHead([d, d, d], num_classes, num_queries, d,
                                    v["nhead"], v["layers"], v["ffn"],
                                    aux_loss=aux_loss)

    def param_groups(self, lr, backbone_lr):
        bb = [p for p in self.backbone.parameters() if p.requires_grad]
        rest = [p for n, p in self.named_parameters()
                if p.requires_grad and not n.startswith("backbone.")]
        return [{"params": bb, "lr": backbone_lr, "name": "backbone"},
                {"params": rest, "lr": lr, "name": "head"}]

    def forward(self, images):
        c3, c4, c5 = self.backbone(images)
        p3, p4, p5 = (self.proj[i](f) for i, f in enumerate([c3, c4, c5]))
        p5 = self.aifi(p5)
        return self.head(self.ccff(p3, p4, p5))


def build_rtdetr(cfg, num_classes=8):
    return RTDETR(num_classes=num_classes,
                  variant=cfg.get("variant", "rtdetr-l"),
                  num_queries=cfg.get("queries", 300),
                  pretrained=cfg.get("pretrained", True),
                  aux_loss=cfg.get("aux_loss", True))
