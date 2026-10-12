# T1 model comparison

| model | best_epoch | epochs_run | val_AP_large | val_AP_medium | val_AP_small | val_mAP50 | val_mAP5095 | val_precision | val_recall |
|---|---|---|---|---|---|---|---|---|---|
| rfdetr_run1 |  |  |  |  |  |  |  |  |  |
| rfdetr_run2 | 56 | 60 | 0.3378 | 0.2063 | 0.0295 | 0.46 | 0.2575 | 0.5654 | 0.7956 |

# T2 per-class AP@50-95 (test)

| class | rfdetr_run2 |
|---|---|
| crack_longitudinal | 0.1314 |
| crack_transverse | 0.0776 |
| crack_alligator | 0.271 |
| pothole | 0.1171 |
| crack_structural | 0.169 |
| litter | 0.2964 |
| manhole_damaged | 0.6207 |
| manhole_missing | 0.3771 |