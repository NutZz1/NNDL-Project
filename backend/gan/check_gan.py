"""Self-test for a gan_<model>.py module. Run it before integrating.

    python check_gan.py --module gan_yolov11  --weights G_final.pt          --image some_bad_photo.jpg
    python check_gan.py --module gan_rfdetr   --weights best_generator.pt   --image some_bad_photo.jpg

Checks the interface, that the output has the same size as the input, that it is not a
blank/grey/colour-swapped image, and saves before|after side by side as check_<module>.jpg.
"""

import argparse
import importlib
import time

import numpy as np
from PIL import Image


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--module", required=True, help="gan_yolov11 or gan_rfdetr")
    p.add_argument("--weights", required=True)
    p.add_argument("--image", required=True)
    p.add_argument("--device", default="cpu")
    a = p.parse_args()

    m = importlib.import_module(a.module)
    for name in ("load_generator", "restore", "INFO"):
        assert hasattr(m, name), f"{a.module} is missing `{name}`"
    print("INFO:", m.INFO)

    G = m.load_generator(a.weights, a.device)
    img = Image.open(a.image).convert("RGB")
    t = time.time()
    out = m.restore(G, img)
    ms = (time.time() - t) * 1000

    assert isinstance(out, Image.Image), "restore() must return a PIL image"
    assert out.size == img.size, f"size changed: {img.size} -> {out.size} (boxes would not line up)"
    assert out.mode == "RGB", f"mode must be RGB, got {out.mode}"

    a_in, a_out = np.asarray(img, np.float32), np.asarray(out, np.float32)
    print(f"restore time      {ms:.0f} ms on {a.device}")
    print(f"output std        {a_out.std():.1f}   (near 0 = blank/grey image: wrong normalisation)")
    print(f"mean |out - in|   {np.abs(a_out - a_in).mean():.1f}  (0 = GAN did nothing; >60 = probably broken)")
    ch_in, ch_out = a_in.mean((0, 1)), a_out.mean((0, 1))
    print(f"channel means in  R{ch_in[0]:.0f} G{ch_in[1]:.0f} B{ch_in[2]:.0f}")
    print(f"channel means out R{ch_out[0]:.0f} G{ch_out[1]:.0f} B{ch_out[2]:.0f}   (R and B swapped = BGR/RGB bug)")

    side = Image.new("RGB", (img.width * 2, img.height))
    side.paste(img, (0, 0)); side.paste(out, (img.width, 0))
    side.save(f"check_{a.module}.jpg", quality=90)
    print(f"saved check_{a.module}.jpg (left: input, right: GAN output) - LOOK at it")


if __name__ == "__main__":
    main()
