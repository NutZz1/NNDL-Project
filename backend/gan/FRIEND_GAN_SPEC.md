# RF-DETR GAN - facts needed for app integration (teammate fills this in)

Weights file: `best_generator.pt` (`43.42 MB`, `11,378,179` parameters)

| Question | Answer |
|---|---|
| Generator class name and file it comes from | `ResnetGenerator` (with `ResnetBlock`) in `lab_eval2_rtdetr_pix2pix/models/pix2pix_resnet.py` |
| How the .pt was saved (`state_dict` only / dict with key `...` / whole model) | `state_dict` only: `torch.save(net_G.state_dict(), out_ckpt_dir / "best_generator.pt")` (`train_gan.py` line 207) |
| Input size the generator was trained on (H x W) | Full paired images are `512 x 512`; trained with random aligned `256 x 256` crops (`train_gan.py` line 55-63) and evaluated fully-convolutionally at `512 x 512` (`exp1_gan_quality.py` / `exp2_rfdetr_eval.py`) |
| Resize method (cv2 INTER_AREA / PIL bilinear / crop / ...) | `cv2.resize(img, (512, 512))` (default `cv2.INTER_LINEAR`) before generator; resized back to `(w, h)` with `cv2.INTER_LINEAR` / `cv2.INTER_CUBIC` |
| Colour order fed to the generator (RGB / BGR) | `RGB` (`cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)` in `train_gan.py` line 50 & `exp2_rfdetr_eval.py` line 89) |
| Normalisation of input (e.g. [-1,1] = x/127.5-1, [0,1], ImageNet mean/std) | `[-1, 1]` via `transforms.ToTensor()` (`x / 255.0`) + `transforms.Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5))` (`(x / 255.0 - 0.5) / 0.5`, i.e., `x / 127.5 - 1.0`) |
| Output range and how to convert back to 0-255 | Generator ends with `nn.Tanh()` outputting `[-1, 1]`; converted back via `np.clip((fake_rgb * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)` (`exp2_rfdetr_eval.py` line 94) |
| Residual / skip-to-input / clamp at the output? | Internal residual skips `x + self.conv_block(x)` inside each of the 9 `ResnetBlock`s (`pix2pix_resnet.py` line 30); no outer input-to-output skip (`nn.Tanh()` directly at output, line 76) |
| Any extra step (padding to a multiple of N, grayscale, etc.) | No extra padding step required once resized to `512 x 512` (`ReflectionPad2d(3)` and `ReflectionPad2d(1)` are built inside `ResnetGenerator` and `ResnetBlock`) |
| Degradation used for training (degrade.py seed / strength) | `degrade_dataset.py` (`seed=42`, 3,000 train pairs + 500 test pairs at `512 x 512`): applies 2-3 random degradations per image from motion blur (`ksize=5..15`), Gaussian blur (`sigma=1..3`), darkening + directional shadow gradient (`factor=0.35..0.65`), Gaussian sensor noise (`sigma=5..20`), and JPEG compression (`quality=30..60`) |
| Results: PSNR degraded -> restored | `18.13 dB -> 20.36 dB` (**`+2.23 dB`**, 500 test pairs, `exp1_results.json`) |
| Results: SSIM degraded -> restored | `0.4669 -> 0.5700` (**`+0.1031`**, 500 test pairs, `exp1_results.json`) |
| Results: RF-DETR mAP@50 clean / degraded / restored | Clean: `46.00%` \| Degraded: `19.43%` \| Restored: **`26.23%`** (**`+6.80% mAP@50`**, Recall `33.60% -> 45.37%`, Detections `2,024 -> 2,731`, `exp2_rfdetr_results.json`) |

Deliverable: `gan_rfdetr.py` with the same interface as `gan_yolov11.py`
(`INFO`, `load_generator`, `restore`), passing `check_gan.py`.
