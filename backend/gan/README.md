# GAN integration package (CivicScan app)

Each detector uses the Pix2Pix GAN that was trained and evaluated with it in Lab Eval 2:

| Detector | GAN module | Weights file | Owner |
|---|---|---|---|
| YOLOv11 | `gan_yolov11.py` | `G_final.pt` (111.6 MB) | Siddarth |
| RF-DETR | `gan_rfdetr.py` | `best_generator.pt` | teammate (fills `FRIEND_GAN_SPEC.md` + writes `gan_rfdetr.py`) |
| RT-DETR | none | none | no GAN trained for it |

App flow with the toggle "Enhance photo with GAN" on:

    photo -> gan_<model>.restore() -> restored photo (same size) -> detector -> boxes

## Contents
- `G_final.pt` - trained YOLOv11-pairing generator weights (117 MB). Tested: reproduces the
  Colab `test_restored` images (mean pixel difference 1.29/255); PSNR 18.87 -> 23.50 dB on
  12 random degraded test images; ~0.76 s per photo on CPU.
- `gan_yolov11.py` - generator class + exact preprocessing from `pix2pix_civicscan.ipynb`. Ready.
- `pix2pix_civicscan.ipynb` - the executed Colab notebook the GAN came from (reference).
- `gan_check_degraded_restored_clean.jpg` - example: degraded | GAN output | clean.
- `PROMPT_FOR_TEAMMATE.txt` - prompt for the teammate's IDE to produce `gan_rfdetr.py`.
- `gan_rfdetr.py` - to be written by the teammate with the SAME interface (see below).
- `check_gan.py` - self-test for either module; run it before integrating.
- `FRIEND_GAN_SPEC.md` - the facts about the RF-DETR GAN the teammate must fill in.

## Required interface (both modules)
```python
INFO = {...}                                    # name, detector, input_size, normalisation, metrics
load_generator(weights_path, device="cpu")      # -> generator object (eval mode)
restore(generator, pil_image)                   # -> PIL RGB image, SAME width/height as input
```
`restore` must do every pre/post-processing step itself (resize, colour order, normalisation,
denormalisation, resize back). The backend only calls `restore`.

## Where the files go in the repo
```
backend/gan/gan_yolov11.py
backend/gan/gan_rfdetr.py
backend/gan/check_gan.py
civicscan_training_rfdetr/training/runs/gan_yolov11/G_final.pt
civicscan_training_rfdetr/training/runs/gan_rfdetr/best_generator.pt
```
`*.pt` is ignored by `.gitignore`: either add `!civicscan_training_rfdetr/training/runs/gan_*/*.pt`
and push with Git LFS (like the detector checkpoints), or share the weights via Drive.

## Test
```
python check_gan.py --module gan_yolov11 --weights G_final.pt --image bad_photo.jpg
```
Then open `check_gan_yolov11.jpg`: right side must look like a cleaner version of the left.
Use a genuinely bad photo (dark / shadowed / blurred) - on a clean photo the GAN changes little.
