"""Shared training loop. Identical for all three models — AMP, gradient
accumulation to a fixed effective batch, EMA, warmup + cosine schedule,
gradient clipping, per-epoch validation, checkpointing and the project's
convergence criterion.

Convergence criterion (applied identically to all three runs):
  val mAP@50-95 improves by < 0.002 absolute over 10 consecutive epochs AND
  val loss has not risen for 10 epochs.
"""

import copy
import math
import os
import time

import torch

from .evaluate import evaluate, _to_device
from .logging import RunLogger


class ModelEMA:
    def __init__(self, model, decay=0.9998, warmup=2000):
        self.ema = copy.deepcopy(model).eval()
        for p in self.ema.parameters():
            p.requires_grad_(False)
        self.decay, self.warmup, self.updates = decay, warmup, 0

    @torch.no_grad()
    def update(self, model):
        self.updates += 1
        d = self.decay * (1 - math.exp(-self.updates / self.warmup))
        msd = model.state_dict()
        for k, v in self.ema.state_dict().items():
            if v.dtype.is_floating_point:
                v.mul_(d).add_(msd[k].detach().to(v.dtype), alpha=1 - d)
            else:
                v.copy_(msd[k])


def build_optimizer(model, cfg):
    groups = model.param_groups(cfg["lr"], cfg.get("backbone_lr", cfg["lr"] * 0.1))
    if cfg.get("optimizer", "adamw").lower() == "sgd":
        return torch.optim.SGD(groups, lr=cfg["lr"], momentum=cfg.get("momentum", 0.937),
                               weight_decay=cfg.get("weight_decay", 5e-4), nesterov=True)
    return torch.optim.AdamW(groups, lr=cfg["lr"],
                             weight_decay=cfg.get("weight_decay", 1e-4))


def lr_lambda_factory(cfg, steps_per_epoch):
    warmup_steps = cfg.get("warmup_epochs", 3) * steps_per_epoch
    total = cfg["epochs"] * steps_per_epoch
    final = cfg.get("lr_final_factor", 0.01)

    def fn(step):
        if step < warmup_steps:
            return (step + 1) / max(1, warmup_steps)
        p = (step - warmup_steps) / max(1, total - warmup_steps)
        return final + (1 - final) * 0.5 * (1 + math.cos(math.pi * min(p, 1.0)))
    return fn


def train(model, criterion, train_loader, val_loader, cfg, device, run_dir):
    os.makedirs(run_dir, exist_ok=True)
    logger = RunLogger(run_dir)
    model.to(device)
    criterion.to(device)

    amp_dtype = torch.bfloat16 if cfg.get("amp_dtype") == "bf16" else torch.float16
    use_cuda = device.startswith("cuda")
    scaler = torch.amp.GradScaler(enabled=use_cuda and amp_dtype == torch.float16)

    opt = build_optimizer(model, cfg)
    steps = max(1, len(train_loader) // cfg["accum"])
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lr_lambda_factory(cfg, steps))
    ema = ModelEMA(model, cfg.get("ema_decay", 0.9998)) if cfg.get("ema", True) else None

    best = {"mAP5095": -1.0, "epoch": -1}
    history, no_improve, val_loss_rise = [], 0, 0
    prev_val_loss = float("inf")
    size = cfg["resolution"]

    for epoch in range(1, cfg["epochs"] + 1):
        model.train()
        t0 = time.time()
        if use_cuda:
            torch.cuda.reset_peak_memory_stats()
        agg = {"train_loss": 0.0, "loss_cls": 0.0, "loss_bbox": 0.0,
               "loss_giou": 0.0, "loss_dfl": 0.0}
        n = 0
        opt.zero_grad(set_to_none=True)

        for it, (images, targets, valid_mask) in enumerate(train_loader):
            images = images.to(device, non_blocking=True)
            vm = valid_mask.to(device, non_blocking=True)
            tg = _to_device(targets, device, size)

            with torch.autocast(device_type=device.split(":")[0], dtype=amp_dtype,
                                enabled=use_cuda):
                out = model(images)
                losses = criterion(out, tg, vm)
                loss = losses["loss_total"] / cfg["accum"]

            if not torch.isfinite(loss):
                print(f"[warn] non-finite loss at epoch {epoch} iter {it}, skipped")
                opt.zero_grad(set_to_none=True)
                continue

            scaler.scale(loss).backward()
            if (it + 1) % cfg["accum"] == 0:
                scaler.unscale_(opt)
                torch.nn.utils.clip_grad_norm_(model.parameters(),
                                               cfg.get("clip_grad", 0.1))
                scaler.step(opt)
                scaler.update()
                opt.zero_grad(set_to_none=True)
                sched.step()
                if ema:
                    ema.update(model)

            agg["train_loss"] += float(losses["loss_total"])
            for k in ("loss_cls", "loss_bbox", "loss_giou", "loss_dfl"):
                if k in losses:
                    agg[k] += float(losses[k])
            n += 1
            if it % cfg.get("print_every", 50) == 0:
                print(f"ep {epoch} [{it}/{len(train_loader)}] "
                      f"loss {float(losses['loss_total']):.4f} "
                      f"lr {opt.param_groups[-1]['lr']:.2e}", flush=True)

        for k in agg:
            agg[k] /= max(1, n)

        eval_model = ema.ema if ema else model
        metrics = evaluate(eval_model, criterion, val_loader, device, cfg,
                           amp_dtype=amp_dtype,
                           max_batches=cfg.get("val_max_batches"))

        row = {"epoch": epoch, "lr": opt.param_groups[-1]["lr"],
               "epoch_time_s": round(time.time() - t0, 1),
               "peak_vram_gb": round(torch.cuda.max_memory_allocated() / 1024 ** 3, 3)
               if use_cuda else 0.0}
        row.update(agg)
        row.update({k: v for k, v in metrics.items()
                    if isinstance(v, (int, float)) or v is None})
        logger.log_epoch(row)
        history.append(row)
        print(f"[epoch {epoch}] train {agg['train_loss']:.4f} | "
              f"val {metrics['val_loss']} | mAP50 {metrics['val_mAP50']:.4f} | "
              f"mAP50-95 {metrics['val_mAP5095']:.4f} | "
              f"{row['epoch_time_s']}s | {row['peak_vram_gb']}GB", flush=True)

        improved = metrics["val_mAP5095"] > best["mAP5095"] + 1e-6
        if improved:
            best = {"mAP5095": metrics["val_mAP5095"], "epoch": epoch}
            _save(eval_model, opt, epoch, cfg, metrics,
                  os.path.join(run_dir, "best.pt"))
        _save(eval_model, opt, epoch, cfg, metrics, os.path.join(run_dir, "last.pt"))

        no_improve = 0 if (metrics["val_mAP5095"] > best["mAP5095"] - 0.002
                           and improved) else no_improve + 1
        vl = metrics["val_loss"]
        val_loss_rise = val_loss_rise + 1 if (vl is not None and vl > prev_val_loss) else 0
        if vl is not None:
            prev_val_loss = vl

        patience = cfg.get("patience", 10)
        if no_improve >= patience and val_loss_rise >= patience:
            print(f"[converged] criterion met at epoch {epoch}")
            break
        if no_improve >= cfg.get("hard_patience", 25):
            print(f"[early stop] no mAP improvement for {no_improve} epochs")
            break

    logger.save_json("summary.json", {
        "best_epoch": best["epoch"], "best_val_mAP5095": best["mAP5095"],
        "epochs_run": len(history), "config": cfg,
        "final": history[-1] if history else None})
    logger.close()
    return best, history


def _save(model, opt, epoch, cfg, metrics, path):
    torch.save({"model": model.state_dict(), "epoch": epoch, "config": cfg,
                "metrics": {k: v for k, v in metrics.items()
                            if isinstance(v, (int, float))}}, path)
