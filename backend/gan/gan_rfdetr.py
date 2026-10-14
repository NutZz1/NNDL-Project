"""Pix2Pix ResNet-9 restoration GAN paired with RF-DETR (Lab Eval 2, Rathish).

Copied unchanged from lab_eval2_rtdetr_pix2pix/models/pix2pix_resnet.py and
lab_eval2_rtdetr_pix2pix/exp2_rfdetr_eval.py so the app restores photos
exactly the way the GAN was trained and evaluated:
    resize to 512x512 -> RGB -> [-1, 1] -> ResnetGenerator (9 blocks) -> [0, 255]
    -> resize back to the original size

Weights: best_generator.pt, saved as raw state_dict via torch.save(net_G.state_dict(), ...).

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
    "name": "Pix2Pix ResNet-9 (RF-DETR pairing)",
    "detector": "rfdetr",
    "input_size": 512,
    "normalisation": "[-1, 1]",
    "trained_on": "3,000 train-split pairs, degrade_dataset.py seed 42, 15 epochs (256x256 random aligned patches)",
    "val_psnr": [18.13, 20.36],     # degraded -> restored, 500 test pairs
    "val_ssim": [0.4669, 0.5700],   # degraded -> restored, 500 test pairs
    "map50_clean": 0.4600,          # RF-DETR clean baseline (46.00%)
    "map50_degraded": 0.1943,       # RF-DETR degraded input (19.43%)
    "map50_recovered": 0.2623,      # RF-DETR after ResNet GAN restoration (26.23%, +6.80% recovery)
}
RES = INFO["input_size"]


# ---------------------------------------------------------------- generator (models/pix2pix_resnet.py)
class ResnetBlock(nn.Module):
    """ResNet Residual Block with Reflection Padding & Instance Normalization."""

    def __init__(self, dim):
        super(ResnetBlock, self).__init__()
        conv_block = [
            nn.ReflectionPad2d(1),
            nn.Conv2d(dim, dim, kernel_size=3, padding=0, bias=True),
            nn.InstanceNorm2d(dim),
            nn.ReLU(True),
            nn.ReflectionPad2d(1),
            nn.Conv2d(dim, dim, kernel_size=3, padding=0, bias=True),
            nn.InstanceNorm2d(dim),
        ]
        self.conv_block = nn.Sequential(*conv_block)

    def forward(self, x):
        return x + self.conv_block(x)


class ResnetGenerator(nn.Module):
    """ResNet-based Generator (9 Residual Blocks for 512x512 image translation)."""

    def __init__(self, input_nc=3, output_nc=3, ngf=64, n_blocks=9):
        super(ResnetGenerator, self).__init__()
        assert n_blocks >= 0

        # Initial Convolutional Block
        model = [
            nn.ReflectionPad2d(3),
            nn.Conv2d(input_nc, ngf, kernel_size=7, padding=0, bias=True),
            nn.InstanceNorm2d(ngf),
            nn.ReLU(True),
        ]

        # Downsampling Layers (64 -> 128 -> 256)
        n_downsampling = 2
        for i in range(n_downsampling):
            mult = 2 ** i
            model += [
                nn.Conv2d(ngf * mult, ngf * mult * 2, kernel_size=3, stride=2, padding=1, bias=True),
                nn.InstanceNorm2d(ngf * mult * 2),
                nn.ReLU(True),
            ]

        # Residual Blocks
        mult = 2 ** n_downsampling
        for i in range(n_blocks):
            model += [ResnetBlock(ngf * mult)]

        # Upsampling Layers (256 -> 128 -> 64)
        for i in range(n_downsampling):
            mult = 2 ** (n_downsampling - i)
            model += [
                nn.ConvTranspose2d(
                    ngf * mult,
                    int(ngf * mult / 2),
                    kernel_size=3,
                    stride=2,
                    padding=1,
                    output_padding=1,
                    bias=True,
                ),
                nn.InstanceNorm2d(int(ngf * mult / 2)),
                nn.ReLU(True),
            ]

        # Output Convolutional Layer
        model += [
            nn.ReflectionPad2d(3),
            nn.Conv2d(ngf, output_nc, kernel_size=7, padding=0),
            nn.Tanh(),
        ]

        self.model = nn.Sequential(*model)

    def forward(self, input):
        return self.model(input)


# ---------------------------------------------------------------- pre/post-processing (exp2_rfdetr_eval.py)
def to_t(rgb_uint8):
    """uint8 HWC RGB -> float CHW in [-1, 1], matching ToTensor() + Normalize((0.5,0.5,0.5),(0.5,0.5,0.5))."""
    x = torch.from_numpy(rgb_uint8).permute(2, 0, 1).float() / 255.0
    return (x - 0.5) / 0.5


def to_img(t):
    """float CHW [-1, 1] -> uint8 HWC RGB, matching np.clip((fake_rgb * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)."""
    fake_rgb = t.detach().cpu().permute(1, 2, 0).numpy()
    return np.clip((fake_rgb * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- interface
def load_generator(weights_path, device="cpu"):
    ck = torch.load(weights_path, map_location="cpu", weights_only=False)
    state = ck["model"] if isinstance(ck, dict) and "model" in ck else (ck["G"] if isinstance(ck, dict) and "G" in ck else ck)
    G = ResnetGenerator(input_nc=3, output_nc=3, ngf=64, n_blocks=9)
    G.load_state_dict(state)
    G.to(device).eval()
    G.device = device
    return G


@torch.no_grad()
def restore(G, pil_image):
    """Reproduces exact preprocessing and postprocessing from exp1_gan_quality.py / exp2_rfdetr_eval.py."""
    rgb = np.asarray(pil_image.convert("RGB"))
    h, w = rgb.shape[:2]
    x = cv2.resize(rgb, (RES, RES), interpolation=cv2.INTER_LINEAR)
    inp = to_t(x).unsqueeze(0).to(getattr(G, "device", "cpu"))
    y = G(inp).squeeze(0).float()
    out_512 = to_img(y)
    if (w, h) != (RES, RES):
        out = cv2.resize(out_512, (w, h), interpolation=cv2.INTER_CUBIC)
    else:
        out = out_512
    return Image.fromarray(out)
