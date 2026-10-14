"""Pix2Pix restoration GAN paired with YOLOv11 (Lab Eval 2, Siddarth Gupta).

Copied unchanged from pix2pix_civicscan.ipynb (sections 3 and 6) so the app restores photos
exactly the way the GAN was trained and evaluated:
    resize to 576x576 (INTER_AREA) -> RGB -> [-1, 1] -> U-Net generator -> [0, 255]
    -> resize back to the original size (INTER_CUBIC)

Weights: G_final.pt, saved as {'G': state_dict, 'res': 576, 'seed': 42, 'strength': 1.0}.

Interface (identical in every gan_<model>.py file):
    load_generator(weights_path, device="cpu") -> generator object
    restore(generator, pil_image) -> PIL image (RGB, same size as the input)
    INFO: dict describing this GAN
"""

import numpy as np
import cv2
import torch
import torch.nn as nn
from PIL import Image

INFO = {
    "name": "Pix2Pix U-Net (YOLOv11 pairing)",
    "detector": "yolov11",
    "input_size": 576,
    "normalisation": "[-1, 1]",
    "trained_on": "3,000 train-split pairs, degrade.py seed 42 strength 1.0, 100 epochs",
    "val_psnr": [22.47, 26.06],   # degraded -> restored, 150 held-out pairs
    "val_ssim": [0.661, 0.702],
    "map50_recovered": 0.41,      # YOLOv11, full 4,672-image test set
}
RES = INFO["input_size"]


# ---------------------------------------------------------------- generator (notebook section 3)
def down(i, o, norm=True):
    L = [nn.Conv2d(i, o, 4, 2, 1, bias=not norm)]
    if norm: L.append(nn.InstanceNorm2d(o, affine=True))
    L.append(nn.LeakyReLU(0.2, True))
    return nn.Sequential(*L)


def up(i, o, drop=False):
    L = [nn.ConvTranspose2d(i, o, 4, 2, 1, bias=False), nn.InstanceNorm2d(o, affine=True), nn.ReLU(True)]
    if drop: L.append(nn.Dropout(0.5))
    return nn.Sequential(*L)


class UNetG(nn.Module):
    def __init__(self, f=64):
        super().__init__()
        self.e1, self.e2, self.e3 = down(3, f, False), down(f, f*2), down(f*2, f*4)
        self.e4, self.e5, self.e6 = down(f*4, f*8), down(f*8, f*8), down(f*8, f*8, False)
        self.d6, self.d5 = up(f*8, f*8, True), up(f*16, f*8, True)
        self.d4, self.d3, self.d2 = up(f*16, f*4), up(f*8, f*2), up(f*4, f)
        self.out = nn.ConvTranspose2d(f*2, 3, 4, 2, 1)

    def forward(self, x):
        e1 = self.e1(x); e2 = self.e2(e1); e3 = self.e3(e2)
        e4 = self.e4(e3); e5 = self.e5(e4); e6 = self.e6(e5)
        d = self.d6(e6)
        d = self.d5(torch.cat([d, e5], 1))
        d = self.d4(torch.cat([d, e4], 1))
        d = self.d3(torch.cat([d, e3], 1))
        d = self.d2(torch.cat([d, e2], 1))
        return (x + torch.tanh(self.out(torch.cat([d, e1], 1)))).clamp(-1, 1)


# ---------------------------------------------------------------- pre/post-processing (notebook section 2)
def to_t(a):   # uint8 HWC RGB -> float CHW in [-1, 1]
    return torch.from_numpy(a).permute(2, 0, 1).float().div(127.5).sub(1)


def to_img(t): # float CHW [-1,1] -> uint8 HWC RGB
    return ((t.clamp(-1, 1) + 1) * 127.5).round().byte().permute(1, 2, 0).cpu().numpy()


# ---------------------------------------------------------------- interface
def load_generator(weights_path, device="cpu"):
    ck = torch.load(weights_path, map_location="cpu", weights_only=False)
    state = ck["G"] if isinstance(ck, dict) and "G" in ck else ck
    G = UNetG()
    G.load_state_dict(state)
    G.to(device).eval()
    G.device = device
    return G


@torch.no_grad()
def restore(G, pil_image):
    """Same steps as notebook section 6 (restoring the test set)."""
    rgb = np.asarray(pil_image.convert("RGB"))
    h, w = rgb.shape[:2]
    x = cv2.resize(rgb, (RES, RES), interpolation=cv2.INTER_AREA)
    y = G(to_t(x)[None].to(getattr(G, "device", "cpu")))[0].float()
    out = cv2.resize(to_img(y), (w, h), interpolation=cv2.INTER_CUBIC)
    return Image.fromarray(out)
