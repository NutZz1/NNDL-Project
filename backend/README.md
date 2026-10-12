# CivicScan web app — backend + frontend

Module 3: serves the trained RF-DETR detector behind a web UI. A citizen
uploads a photo, the model finds civic defects, and the result is stored as
an incident with its location, confidence and bounding boxes.

## Three processes

| | what | port |
|---|---|---|
| 1 | RF-DETR inference service (Python, GPU) | 5001 |
| 2 | Express API (Node) | 5000 |
| 3 | Vite dev server (React) | 5173 |

Start them in that order — the API falls back to a slow per-request CLI call
if the inference service is not up.

```bash
# 1. model service  (from the repo root)
set CIVICSCAN_CKPT=civicscan_training_rfdetr\training\runs\rfdetr_run4_700px\best.pt
python backend\inference_server.py

# 2. API
cd backend && npm install && npm start

# 3. UI
cd frontend && npm install && npm run dev
```

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

## Model checkpoint

`inference_server.py` defaults to `runs/rfdetr_run2/best.pt` (560 px). The
current best model is `runs/rfdetr_run4_700px/best.pt` (700 px, test mAP@50
0.472); point `CIVICSCAN_CKPT` at it. The resolution is read from the
checkpoint, so nothing else needs changing.

## Known gaps

- **Priority scoring is not implemented.** It belongs between steps 5 and 6:
  score an incident from defect class, confidence, box size and nearby repeat
  reports, and store it so hazards can be actioned first.
- **Per-class thresholds.** The service uses a flat 0.15 score floor. Field
  testing showed `litter` over-triggers on grey textured objects (concrete
  slabs, gravel inside potholes); it needs a higher bar (~0.45) than the
  hazard classes, plus one label per box. See
  `civicscan_training_rfdetr/training/scripts/predict.py --class-conf`.
- `spatialService.clusterIncidents` references an undefined `lon1`
  (declared as `lng1`) and will throw when called with two or more incidents.
- The ward is a hard-coded string in `uploadController`, not computed.
