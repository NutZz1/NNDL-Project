# CivicScan web app — backend + frontend

Module 3: serves the trained detectors behind a web UI. A citizen uploads a
photo, the model finds civic defects, and the result is stored as an incident
with its location, confidence and bounding boxes.

RF-DETR is the production model. YOLOv11 and RT-DETR are served too, so the
UI can run any of them (model picker on the upload page) and compare all of
them on the same photo (**Compare** page, `/api/upload/compare-models`).

## Three processes

| | what | port |
|---|---|---|
| 1 | Inference service: RF-DETR, YOLOv11, RT-DETR (Python) | 5001 |
| 2 | Express API (Node) | 5000 |
| 3 | Vite dev server (React) | 5173 |

Start them in that order. If the inference service is not up, the API tries
one CLI run of the model; if that fails too, the upload is refused with
"model not running" (it never invents a detection).

```bash
# 1. model service  (from the repo root) - loads every checkpoint it finds
python backend\inference_server.py

# 2. API
cd backend && npm install && npm start

# 3. UI
cd frontend && npm install && npm run dev
```

**First run needs internet:** RF-DETR builds its DINOv2 backbone through
`torch.hub`, which downloads the `facebookresearch/dinov2` code once into
`~/.cache/torch/hub`. Run the service once before a demo on a machine without
internet (or copy that cache folder over).

## Models and checkpoints

The service looks in `civicscan_training_rfdetr/training/runs/`:

| model | run folder searched (first with `best.pt` wins) | threshold |
|---|---|---|
| RF-DETR-Small | `rfdetr_run4_700px`, `rfdetr_run2`, `rfdetr` | 0.40 (litter 0.50) |
| YOLOv11-s | `yolov11_576`, `yolov11*` | 0.20 |
| RT-DETR (ResNet-50) | `rtdetr*` | 0.40 (litter 0.50) |

**Adding RT-DETR:** copy its `best.pt` (and its `test_eval.json`, if you have
it) into `civicscan_training_rfdetr/training/runs/rtdetr/` and restart the
model service. It then appears in the model picker and on the Compare page.
`CIVICSCAN_CKPT`, `CIVICSCAN_CKPT_YOLOV11` and `CIVICSCAN_CKPT_RTDETR` override
the search with an explicit path.

The Compare page's benchmark table reads `test_eval.json` (masked COCO
evaluation from `scripts/evaluate_test.py`) or `test_ap50.json` from the run
folder; without either it shows the validation metrics stored in the
checkpoint and labels them as validation.

Endpoints of the model service: `GET /health`, `GET /models`,
`POST /predict {image_path, model}`, `POST /compare {image_path}`.

Copy `backend/.env.example` to `backend/.env` and fill in `MONGO_URI` and a
`JWT_SECRET` first. The real `.env` is gitignored and must stay that way.

## Request flow — POST /api/upload/process-image

1. **Multer** writes the upload to `backend/uploads/`.
2. **aiInferenceService** sends the *file path* to the model service (no copy
   of the image is made; both processes read the same disk).
3. The model service converts HEIC, reads EXIF, runs RF-DETR on the GPU and
   returns classes, confidences, boxes and GPS as JSON.
4. **No defect** → the file is deleted and the response says "clean".
   **Defect** → continue.
5. Location is resolved: EXIF GPS (Python, then Node `exifService`) → manual
   coordinates from the form → campus default.
6. An `Incident` is written to MongoDB with category, domain, severity,
   GeoJSON point, ward, image URL, confidence and boxes. The image itself
   stays on disk; the database holds the URL.
7. The incident and image URL go back to the UI, which draws the boxes.

`spatialService` is not in this path — it clusters incidents by distance when
the dashboard *reads* them.

## Known gaps

- **Priority scoring is not implemented.** It belongs between steps 5 and 6:
  score an incident from defect class, confidence, box size and nearby repeat
  reports, and store it so hazards can be actioned first.
- The ward is a hard-coded string in `uploadController`, not computed.
