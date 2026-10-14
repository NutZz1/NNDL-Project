const Workflow = require('../services/workflowService');
const { handle } = require('./workController');
const { TEAMS } = require('../services/teams');
const fs = require('fs');
const path = require('path');
const Incident = require('../models/Incident');
const AiInferenceService = require('../services/aiInferenceService');
const { sign, uploadPath } = require('../services/imageAccess');
const { normalizeCode } = require('../services/reportCodeService');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

const ALL = { team: null };

// GET /api/municipal/board?team=  : columns for the "All work" board
exports.board = handle(async (req) => {
  const team = TEAMS[req.query.team] ? req.query.team : undefined;
  const columns = ['needs_review', 'assigned', 'in_progress', 'resolved'];
  const results = await Promise.all(
    columns.map((status) =>
      Workflow.list(ALL, { status, team, limit: 40, sort: status === 'resolved' ? 'resolved' : 'priority' })
    )
  );
  return Object.fromEntries(columns.map((c, i) => [c, results[i]]));
});

// GET /api/municipal/triage
exports.triage = handle((req) => Workflow.list(ALL, { ...req.query, status: 'needs_review', sort: 'newest' }));

// POST /api/municipal/triage/:code/assign  { team, category?, reason? }
exports.triageAssign = handle((req) => Workflow.triageAssign(req.params.code, req.user, req.body || {}));

// POST /api/municipal/triage/:code/reject  { reason }
exports.triageReject = handle((req) => Workflow.reject(req.params.code, req.user, req.body || {}));

// GET /api/municipal/requests : items with a pending team request
exports.requests = handle((req) => Workflow.list(ALL, { ...req.query, status: 'all', requests: 'pending', sort: 'newest' }));

// POST /api/municipal/requests/:code/:requestId/decide  { approve, toTeam?, note? }
exports.decide = handle((req) =>
  Workflow.decideRequest(req.params.code, req.params.requestId, req.user, {
    approve: req.body && (req.body.approve === true || req.body.approve === 'true'),
    toTeam: req.body && req.body.toTeam,
    note: req.body && req.body.note,
  })
);

// POST /api/municipal/work/:code/reassign  { toTeam, reason }
exports.reassign = handle((req) => Workflow.reassign(req.params.code, req.user, req.body || {}));

// POST /api/municipal/work/:code/reopen  { reason }
exports.reopen = handle((req) => Workflow.reopen(req.params.code, req.user, req.body || {}));

// POST /api/municipal/work/:code/reject  { reason } : close any open item as "not a defect"
exports.reject = handle((req) => Workflow.reject(req.params.code, req.user, req.body || {}, [...Workflow.OPEN, ...Workflow.REVIEW]));

// ------------------------------------------------------------------ model comparison
// Every upload is run through RF-DETR, RT-DETR and YOLOv11 and their raw outputs are stored on
// the report (modelResults). Only RF-DETR decides the report; the others are for comparison.

// Restored photos are served like every other upload: through a signed link
const withGanLinks = (rows) =>
  (rows || []).map((r) =>
    r.gan && r.gan.restoredFilename ? { ...r, gan: { ...r.gan, restoredUrl: sign(`/uploads/${r.gan.restoredFilename}`) } } : r
  );

const pickReport = (d) => ({
  reportCode: d.reportCode,
  title: d.title,
  category: d.category,
  confidence: d.confidence,
  status: d.status,
  team: d.team || null,
  createdAt: d.createdAt,
  imageUrl: sign(d.imageUrl),
  aiReview: d.aiReview && d.aiReview.performed ? { verdict: d.aiReview.verdict, summary: d.aiReview.summary, original: d.aiReview.original } : null,
  modelResults: d.modelResults || [],
  modelResultsGan: withGanLinks(d.modelResultsGan),
  gan: d.gan && d.gan.requested ? { ...d.gan, restoredImageUrl: d.gan.restoredImageUrl ? sign(d.gan.restoredImageUrl) : null } : null,
});

// GET /api/municipal/comparison?q=&limit= : reports with a photo, newest first
exports.comparisonList = handle(async (req) => {
  const filter = { imageUrl: { $regex: '/uploads/' } };
  if (req.query.q) {
    const code = normalizeCode(req.query.q);
    if (!code) return [];
    filter.reportCode = code;
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 60));
  const docs = await Incident.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('reportCode title category confidence status team createdAt imageUrl modelResults.key modelResults.available modelResults.hasDefect modelResults.category modelResults.confidence modelResultsGan.key modelResultsGan.available modelResultsGan.hasDefect modelResultsGan.category modelResultsGan.confidence gan.requested gan.applied')
    .lean();
  return docs.map(pickReport);
});

const findReport = async (code) => {
  const c = normalizeCode(code);
  const d = c && (await Incident.findOne({ reportCode: c }).lean());
  if (!d) throw new Workflow.HttpError(404, 'No report with that ID.');
  return d;
};

// GET /api/municipal/comparison/:code : the photo and every model's stored output
exports.comparisonGet = handle(async (req) => pickReport(await findReport(req.params.code)));

// POST /api/municipal/comparison/:code/run : (re)run every model on the stored photo,
// e.g. for reports uploaded before every model was run on upload. Saves the new results.
// Body { enhance: true } runs each model on its own GAN-restored photo instead and saves that
// separately (modelResultsGan), so the plain results are never overwritten.
exports.comparisonRun = handle(async (req) => {
  const d = await findReport(req.params.code);
  const rel = uploadPath(d.imageUrl);
  const file = rel && path.join(UPLOAD_DIR, path.basename(rel));
  if (!file || !fs.existsSync(file)) throw new Workflow.HttpError(404, 'The photo for this report is no longer on the server.');
  const enhance = Boolean(req.body && req.body.enhance === true);
  const rows = await AiInferenceService.runAllModels(file, {}, { enhance });
  if (!rows.some((r) => r.available)) {
    throw new Workflow.HttpError(503, 'The model service is not running. Start it with: python backend/inference_server.py');
  }
  const field = enhance ? 'modelResultsGan' : 'modelResults';
  await Incident.updateOne({ _id: d._id }, { $set: { [field]: rows } });
  return pickReport({ ...d, [field]: rows });
});
