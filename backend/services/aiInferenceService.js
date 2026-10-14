/**
 * CivicScan AI Inference Service
 * Connects to the PyTorch inference microservice on port 5001, which serves every trained
 * detector: RF-DETR (production), YOLOv11 and RT-DETR (comparison). Each model is used with
 * its own calibrated thresholds unless the caller overrides them.
 * 8 Locked Detection Classes:
 * 1: crack_longitudinal
 * 2: crack_transverse
 * 3: crack_alligator
 * 4: pothole
 * 5: crack_structural
 * 6: litter
 * 7: manhole_damaged
 * 8: manhole_missing
 */

const path = require('path');
const { execFile } = require('child_process');

const INFERENCE_URL = process.env.INFERENCE_SERVICE_URL || 'http://127.0.0.1:5001/predict';
const INFERENCE_BASE = INFERENCE_URL.replace(/\/predict\/?$/, '');

const MODEL_KEYS = ['rfdetr', 'yolov11', 'rtdetr'];
const DEFAULT_MODEL = 'rfdetr';
const MODEL_NAMES = { rfdetr: 'RF-DETR-Small', yolov11: 'YOLOv11-s', rtdetr: 'RT-DETR (ResNet-18)' };
const MODEL_ROLES = { rfdetr: 'production', yolov11: 'comparison', rtdetr: 'comparison' };

// RF-DETR thresholds can be tuned from the environment: 0.40 for every class, 0.50 for litter
// (it over-triggers on grey textured surfaces). Boxes between CANDIDATE_FLOOR and the threshold
// come back as `candidates`: the verification agent keeps one only if it clearly sees a defect.
// Override with INFERENCE_SCORE_THRESH=0.4  INFERENCE_CLASS_THRESH={"litter":0.5}
//               INFERENCE_CANDIDATE_FLOOR=0.15
// The comparison models always use the defaults calibrated for them in inference_server.py.
const SCORE_THRESH = (() => {
  const v = Number(process.env.INFERENCE_SCORE_THRESH);
  return Number.isFinite(v) && v > 0 ? v : 0.4;
})();
const CANDIDATE_FLOOR = (() => {
  const v = Number(process.env.INFERENCE_CANDIDATE_FLOOR);
  return Number.isFinite(v) && v > 0 ? v : 0.15;
})();
const CLASS_THRESH = (() => {
  try {
    return { litter: 0.5, ...(process.env.INFERENCE_CLASS_THRESH ? JSON.parse(process.env.INFERENCE_CLASS_THRESH) : {}) };
  } catch {
    return { litter: 0.5 };
  }
})();

const CLASS_METADATA = {
  crack_longitudinal: { domain: 'road_damage', defaultSeverity: 'Low', label: 'Longitudinal Crack' },
  crack_transverse: { domain: 'road_damage', defaultSeverity: 'Low', label: 'Transverse Crack' },
  crack_alligator: { domain: 'road_damage', defaultSeverity: 'Medium', label: 'Alligator Cracking' },
  pothole: { domain: 'road_damage', defaultSeverity: 'High', label: 'Asphalt Pothole' },
  crack_structural: { domain: 'structural_damage', defaultSeverity: 'Critical', label: 'Structural Crack' },
  litter: { domain: 'civic_waste', defaultSeverity: 'Medium', label: 'Street Litter & Plastic' },
  manhole_damaged: { domain: 'hazard', defaultSeverity: 'High', label: 'Damaged Manhole Cover' },
  manhole_missing: { domain: 'hazard', defaultSeverity: 'Critical', label: 'Missing Manhole Cover' },
};

const normalizeModel = (model) => (MODEL_KEYS.includes(model) ? model : DEFAULT_MODEL);

/** Shape one model's raw microservice output for the rest of the backend and the UI */
function shapeResult(data, model, t0, viaCli = false) {
  const base = {
    model: (data.model || MODEL_NAMES[model]) + (viaCli ? ' (CLI)' : ''),
    modelKey: data.model_key || model,
    device: data.device || 'cpu',
    inferenceMs: data.inference_ms || Date.now() - t0,
    resolution: data.resolution || null,
    imageSize: data.image_size || null,
    thresholds: data.thresholds || null,
    candidates: data.candidates || [],
    convertedFilename: data.converted_filename || null,
    exif: data.exif || null,
    isRealModel: true,
  };
  if (data.gan) {
    base.gan = {
      applied: Boolean(data.gan.applied),
      name: data.gan.name || null,
      ms: data.gan.ms ?? null,
      reason: data.gan.reason || null,
      restoredFilename: data.gan.restored_filename || null,
      restoredPreview: data.gan.restored_preview || null,
    };
  }
  if (data.has_defect === false || (data.detections_count === 0 && data.category === 'clean')) {
    return {
      ...base,
      hasDefect: false,
      category: 'clean',
      domain: 'none',
      severity: 'None',
      label: 'Clean Infrastructure (No Defects)',
      confidence: 0,
      bboxes: [],
      detectionsCount: 0,
    };
  }
  const meta = CLASS_METADATA[data.category];
  if (!meta) throw new Error(`Unknown category from model: ${data.category}`);
  return {
    ...base,
    hasDefect: true,
    category: data.category,
    domain: meta.domain,
    severity: meta.defaultSeverity,
    label: meta.label,
    confidence: data.confidence,
    bboxes: data.bboxes || [],
    detectionsCount: data.detections_count || 0,
  };
}

/** Thrown when no detector could analyse the photo, so callers never act on an invented result */
class InferenceUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.code = 'MODEL_UNAVAILABLE';
    this.status = 503;
  }
}

async function postJson(url, payload) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Inference service returned HTTP ${res.status}`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

class AiInferenceService {
  static get MODEL_KEYS() {
    return MODEL_KEYS;
  }

  static get DEFAULT_MODEL() {
    return DEFAULT_MODEL;
  }

  /**
   * Runs one detector on an uploaded image.
   * @param {string} imagePath Full absolute path to image on disk
   * @param {object} [opts]
   * @param {string} [opts.model] 'rfdetr' (default) | 'yolov11' | 'rtdetr'
   * @param {boolean} [opts.cliFallback] start Python once if the microservice is down (default true)
   * @param {boolean} [opts.enhance] restore the photo with the model's Pix2Pix GAN first (default false)
   * @throws {InferenceUnavailableError} when neither the microservice nor the CLI can run the model
   */
  static async runInference(imagePath, { model = DEFAULT_MODEL, cliFallback = true, enhance = false } = {}) {
    model = normalizeModel(model);
    const t0 = Date.now();
    const thresholds = model === 'rfdetr' ? { score_thresh: SCORE_THRESH, class_thresh: CLASS_THRESH, candidate_floor: CANDIDATE_FLOOR } : {};
    try {
      // 1. Fast HTTP call to the inference microservice on port 5001
      const data = await postJson(INFERENCE_URL, { image_path: imagePath, model, ...thresholds, ...(enhance ? { enhance: true } : {}) });
      return shapeResult(data, model, t0);
    } catch (httpErr) {
      // The service answered but this model has no checkpoint: no point trying the CLI
      if (httpErr.code === 'MODEL_UNAVAILABLE') throw new InferenceUnavailableError(httpErr.message);
      if (!cliFallback) throw new InferenceUnavailableError(`The model service is not running (${httpErr.message}).`);
      console.warn(`[AI Inference Service] HTTP to inference service failed (${httpErr.message}). Attempting CLI fallback...`);
    }

    // 2. Fallback: run the Python inference once via the CLI
    const args = ['--image', imagePath, '--model', model];
    if (enhance) args.push('--enhance');
    if (model === 'rfdetr') {
      args.push('--thresh', String(SCORE_THRESH), '--candidate-floor', String(CANDIDATE_FLOOR));
      Object.entries(CLASS_THRESH).forEach(([k, v]) => args.push('--class-thresh', `${k}=${v}`));
    }
    const data = await AiInferenceService.runCli(args);
    return shapeResult(data, model, t0, true);
  }

  /** Runs every available detector on the same image (for the model comparison page) */
  static async compareModels(imagePath, { enhance = false } = {}) {
    const t0 = Date.now();
    let data;
    try {
      data = await postJson(`${INFERENCE_BASE}/compare`, { image_path: imagePath, ...(enhance ? { enhance: true } : {}) });
    } catch (httpErr) {
      console.warn(`[AI Inference Service] /compare failed (${httpErr.message}). Attempting CLI fallback...`);
      data = await AiInferenceService.runCli(['--image', imagePath, '--compare', ...(enhance ? ['--enhance'] : [])]);
    }
    const results = {};
    for (const key of MODEL_KEYS) {
      const r = (data.results || {})[key];
      if (!r || r.available === false || r.success === false) {
        results[key] = { modelKey: key, model: MODEL_NAMES[key], available: false, error: (r && r.error) || 'Model not available' };
      } else {
        results[key] = { available: true, ...shapeResult(r, key, t0) };
      }
    }
    return { imageSize: data.image_size || null, results };
  }

  /**
   * Compact record of one model's output, as stored on a report (Incident.modelResults)
   * for the officer's Comparison view. `result` is a runInference() result or an Error.
   */
  static summarize(key, result) {
    const base = { key, name: MODEL_NAMES[key], role: MODEL_ROLES[key], ranAt: new Date() };
    if (!result || result instanceof Error) {
      return { ...base, available: false, error: (result && result.message) || 'Model not available' };
    }
    const boxes = (list) => (list || []).filter((b) => Array.isArray(b.box)).map((b) => ({ box: b.box, label: b.label, score: b.score }));
    return {
      ...base,
      name: String(result.model || base.name).replace(/ \(CLI\)$/, ''),
      available: true,
      hasDefect: Boolean(result.hasDefect),
      category: result.category,
      confidence: result.confidence || 0,
      detectionsCount: result.detectionsCount || 0,
      bboxes: boxes(result.bboxes),
      candidates: boxes(result.candidates),
      threshold: result.thresholds && typeof result.thresholds.default === 'number' ? result.thresholds.default : undefined,
      resolution: result.resolution || undefined,
      inferenceMs: result.inferenceMs,
      device: result.device,
      ...(result.gan
        ? { gan: { applied: result.gan.applied, name: result.gan.name, ms: result.gan.ms, reason: result.gan.reason, restoredFilename: result.gan.restoredFilename } }
        : {}),
    };
  }

  /**
   * Runs every detector on one photo and returns one summary per model, in MODEL_KEYS order.
   * Pass `known` ({ rfdetr: result }) to reuse a run that already happened. The comparison
   * models never fall back to the slow CLI: if the service is down they are reported as
   * unavailable instead of holding up the citizen's upload.
   */
  static async runAllModels(imagePath, known = {}, { enhance = false } = {}) {
    const out = [];
    // The model service handles one request at a time, so run them one after another
    for (const key of MODEL_KEYS) {
      let result = known[key];
      if (!result) {
        result = await AiInferenceService.runInference(imagePath, { model: key, cliFallback: false, enhance }).catch((e) => e);
      }
      out.push(AiInferenceService.summarize(key, result));
    }
    return out;
  }

  /** Model catalogue with availability and saved test metrics */
  static async listModels() {
    const res = await fetch(`${INFERENCE_BASE}/models`);
    if (!res.ok) throw new InferenceUnavailableError(`Inference service returned HTTP ${res.status}`);
    return res.json();
  }

  static runCli(args) {
    const pythonExe = process.env.INFERENCE_PYTHON || path.join(__dirname, '..', '..', 'civicscan-model', '.venv', 'Scripts', 'python.exe');
    const scriptPath = path.join(__dirname, '..', 'inference_server.py');
    return new Promise((resolve, reject) => {
      execFile(pythonExe, [scriptPath, ...args], { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
        if (!err && stdout) {
          try {
            const firstBrace = stdout.indexOf('{');
            const lastBrace = stdout.lastIndexOf('}');
            if (firstBrace === -1 || lastBrace === -1) throw new Error('No valid JSON found in CLI output');
            return resolve(JSON.parse(stdout.slice(firstBrace, lastBrace + 1)));
          } catch (parseErr) {
            console.error('[AI Inference Service] Failed to parse CLI output:', parseErr.message);
          }
        }
        // No invented detections: the caller tells the user the model is offline
        reject(
          new InferenceUnavailableError(
            'The detection model is not running, so this photo could not be analysed. Start it with: python backend/inference_server.py'
          )
        );
      });
    });
  }

  /**
   * Evaluates if multiple litter reports form an illegal dumping cluster
   */
  static evaluateIllegalDumping(nearbyLitterReports = []) {
    if (nearbyLitterReports.length >= 3) {
      return {
        isIllegalDumping: true,
        reason: `Aggregated cluster of ${nearbyLitterReports.length} litter detections in 50m radius.`,
        escalatedSeverity: 'Critical',
      };
    }
    return { isIllegalDumping: false };
  }
}

module.exports = AiInferenceService;
module.exports.CLASS_METADATA = CLASS_METADATA;
module.exports.InferenceUnavailableError = InferenceUnavailableError;
