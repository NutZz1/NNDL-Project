"""One CSV schema for all three models. This is what lets the three runs be
overlaid on a single figure. Do not add or reorder columns per model."""

import csv
import json
import os
import time

from ..schema import CLASS_NAMES

COLUMNS = ([
    "epoch", "lr", "train_loss", "loss_cls", "loss_bbox", "loss_giou", "loss_dfl",
    "val_loss", "val_mAP50", "val_mAP5095", "val_AP_small", "val_AP_medium",
    "val_AP_large", "val_precision", "val_recall",
] + [f"AP_{n}" for n in CLASS_NAMES]
  + ["epoch_time_s", "peak_vram_gb"])


class RunLogger:
    def __init__(self, run_dir, tensorboard=True):
        self.run_dir = run_dir
        os.makedirs(run_dir, exist_ok=True)
        self.csv_path = os.path.join(run_dir, "train_log.csv")
        if not os.path.exists(self.csv_path):
            with open(self.csv_path, "w", newline="") as f:
                csv.writer(f).writerow(COLUMNS)
        self.tb = None
        if tensorboard:
            try:
                from torch.utils.tensorboard import SummaryWriter
                self.tb = SummaryWriter(os.path.join(run_dir, "tb"))
            except Exception:
                self.tb = None
        self.t0 = time.time()

    def log_epoch(self, row):
        with open(self.csv_path, "a", newline="") as f:
            csv.writer(f).writerow(
                ["" if row.get(c) is None else row.get(c) for c in COLUMNS])
        if self.tb:
            for k, v in row.items():
                if isinstance(v, (int, float)):
                    self.tb.add_scalar(k, v, row["epoch"])

    def save_json(self, name, obj):
        p = os.path.join(self.run_dir, name)
        with open(p, "w") as f:
            json.dump(obj, f, indent=2, default=str)
        return p

    def close(self):
        if self.tb:
            self.tb.close()
