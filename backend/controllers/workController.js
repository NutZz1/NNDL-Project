const path = require('path');
const fs = require('fs');
const Workflow = require('../services/workflowService');
const { TEAMS, classesFor } = require('../services/teams');

// Turns HttpError into the matching status code; anything else is a 500
const handle = (fn) => async (req, res) => {
  try {
    const data = await fn(req, res);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (err) {
    if (err instanceof Workflow.HttpError) return res.status(err.status).json({ success: false, error: err.message });
    console.error('[Work] error:', err);
    res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
  }
};

// GET /api/work/meta : what the caller's screens need to build filters and dropdowns
exports.meta = handle(async (req) => ({
  user: req.user,
  scopeTeam: req.scope.team,
  teams: Object.values(TEAMS).map((t) => ({ key: t.key, name: t.name, short: t.short })),
  classes: req.scope.team ? classesFor(req.scope.team) : Object.values(TEAMS).flatMap((t) => t.classes),
  crews: req.scope.team ? TEAMS[req.scope.team].crews.map((c) => c.name) : Object.values(TEAMS).flatMap((t) => t.crews.map((c) => c.name)),
}));

// GET /api/work?status=&severity=&category=&overdue=&q=&sort=&page=&limit=&team=
exports.list = handle((req) => Workflow.list(req.scope, req.query));

// GET /api/work/:code
exports.get = handle((req) => Workflow.get(req.params.code, req.scope));

// POST /api/work/:code/start
exports.start = handle((req) => Workflow.start(req.params.code, req.user, req.scope));

// POST /api/work/:code/resolve  multipart: note (required), afterPhoto (optional jpg/png/webp)
exports.resolve = handle(async (req) => {
  let afterImageUrl = null;
  if (req.file) {
    const okType = /^image\/(jpeg|png|webp)$/.test(req.file.mimetype);
    if (!okType) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      throw new Workflow.HttpError(400, 'The after photo must be a JPEG, PNG or WebP image.');
    }
    afterImageUrl = `/uploads/${path.basename(req.file.path)}`;
  }
  try {
    return await Workflow.resolve(req.params.code, req.user, req.scope, { note: req.body.note, afterImageUrl });
  } catch (err) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    throw err;
  }
});

// POST /api/work/:code/request-reassign  { reason, suggestedTeam }
exports.requestReassign = handle((req) => Workflow.requestReassign(req.params.code, req.user, req.scope, req.body || {}));

// POST /api/work/:code/request-not-defect  { reason }
exports.requestNotDefect = handle((req) => Workflow.requestNotDefect(req.params.code, req.user, req.scope, req.body || {}));

exports.handle = handle;
