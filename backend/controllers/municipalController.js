const Workflow = require('../services/workflowService');
const { handle } = require('./workController');
const { TEAMS } = require('../services/teams');

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
