"""Transformer decoder head shared by RF-DETR and RT-DETR.

Identical for both models by design: queries, layers, matcher, losses and
schedule are held constant so the only difference between Member 1 and Member 3
is the backbone/encoder. That is what makes "the ViT backbone helped" a
falsifiable claim rather than an assertion.

Cross-attention is standard multi-head attention over concatenated multi-scale
tokens, not deformable attention. Deformable attention needs a CUDA extension;
this is pure PyTorch. Cost: slower convergence and more memory at high token
counts. Declare this deviation in the report.
"""

import math

import torch
import torch.nn as nn


class MLP(nn.Module):
    def __init__(self, dim_in, dim_hidden, dim_out, layers):
        super().__init__()
        h = [dim_hidden] * (layers - 1)
        self.layers = nn.ModuleList(
            nn.Linear(a, b) for a, b in zip([dim_in] + h, h + [dim_out]))

    def forward(self, x):
        for i, l in enumerate(self.layers):
            x = torch.relu(l(x)) if i < len(self.layers) - 1 else l(x)
        return x


def sine_pos_embed(h, w, dim, device, temperature=10000):
    """2-D sine positional embedding, [h*w, dim]."""
    d = dim // 4
    y = torch.arange(h, device=device, dtype=torch.float32).unsqueeze(1).repeat(1, w)
    x = torch.arange(w, device=device, dtype=torch.float32).unsqueeze(0).repeat(h, 1)
    y = y / (h + 1e-6) * 2 * math.pi
    x = x / (w + 1e-6) * 2 * math.pi
    dim_t = temperature ** (2 * (torch.arange(d, device=device) // 2) / d)
    px = x[..., None] / dim_t
    py = y[..., None] / dim_t
    px = torch.stack([px[..., 0::2].sin(), px[..., 1::2].cos()], -1).flatten(-2)
    py = torch.stack([py[..., 0::2].sin(), py[..., 1::2].cos()], -1).flatten(-2)
    return torch.cat([py, px], -1).flatten(0, 1)


class DecoderLayer(nn.Module):
    def __init__(self, d_model, nhead, ffn, dropout):
        super().__init__()
        self.self_attn = nn.MultiheadAttention(d_model, nhead, dropout, batch_first=True)
        self.cross_attn = nn.MultiheadAttention(d_model, nhead, dropout, batch_first=True)
        self.lin1 = nn.Linear(d_model, ffn)
        self.lin2 = nn.Linear(ffn, d_model)
        self.n1, self.n2, self.n3 = (nn.LayerNorm(d_model) for _ in range(3))
        self.do = nn.Dropout(dropout)

    def forward(self, q, q_pos, mem, mem_pos):
        t = q + q_pos
        x, _ = self.self_attn(t, t, q)
        q = self.n1(q + self.do(x))
        x, _ = self.cross_attn(q + q_pos, mem + mem_pos, mem)
        q = self.n2(q + self.do(x))
        x = self.lin2(self.do(torch.relu(self.lin1(q))))
        return self.n3(q + self.do(x))


class DetrDecoderHead(nn.Module):
    """Consumes a list of multi-scale feature maps, emits DETR outputs."""

    def __init__(self, in_channels, num_classes, num_queries=300, d_model=256,
                 nhead=8, num_layers=6, ffn=1024, dropout=0.0, aux_loss=True):
        super().__init__()
        self.num_queries, self.d_model, self.aux_loss = num_queries, d_model, aux_loss
        self.input_proj = nn.ModuleList(
            nn.Sequential(nn.Conv2d(c, d_model, 1), nn.GroupNorm(32, d_model))
            for c in in_channels)
        self.level_embed = nn.Parameter(torch.zeros(len(in_channels), d_model))
        self.query_embed = nn.Embedding(num_queries, d_model)
        self.query_pos = nn.Embedding(num_queries, d_model)
        self.layers = nn.ModuleList(
            DecoderLayer(d_model, nhead, ffn, dropout) for _ in range(num_layers))
        self.norm = nn.LayerNorm(d_model)
        self.class_head = nn.Linear(d_model, num_classes)
        self.bbox_head = MLP(d_model, d_model, 4, 3)
        self._init()

    def _init(self):
        nn.init.normal_(self.level_embed, std=0.02)
        prior = 0.01
        nn.init.constant_(self.class_head.bias, -math.log((1 - prior) / prior))
        nn.init.constant_(self.bbox_head.layers[-1].weight, 0.0)
        nn.init.constant_(self.bbox_head.layers[-1].bias, 0.0)

    def forward(self, feats):
        b = feats[0].shape[0]
        mem, mem_pos = [], []
        for i, f in enumerate(feats):
            p = self.input_proj[i](f)
            _, c, h, w = p.shape
            mem.append(p.flatten(2).transpose(1, 2))
            pe = sine_pos_embed(h, w, c, p.device).unsqueeze(0).expand(b, -1, -1)
            mem_pos.append(pe + self.level_embed[i].view(1, 1, -1))
        mem = torch.cat(mem, 1)
        mem_pos = torch.cat(mem_pos, 1).to(mem.dtype)

        q = self.query_embed.weight.unsqueeze(0).expand(b, -1, -1)
        qp = self.query_pos.weight.unsqueeze(0).expand(b, -1, -1)

        inter = []
        for layer in self.layers:
            q = layer(q, qp, mem, mem_pos)
            inter.append(self.norm(q))

        outs = [{"pred_logits": self.class_head(h_),
                 "pred_boxes": self.bbox_head(h_).sigmoid()} for h_ in inter]
        out = outs[-1]
        if self.aux_loss and len(outs) > 1:
            out["aux_outputs"] = outs[:-1]
        return out
