/**
 * The incident workflow: who may move an incident from which status to which.
 * See docs/role-based-workflow-design.md, section 2.
 *
 *   Needs Review -> Assigned -> In Progress -> Resolved          (+ Rejected: not a real defect)
 *
 * Every function here enforces three things on the server:
 *   1. scope   - a team manager only ever touches incidents of their own team
 *   2. role    - officer-only moves are refused for managers (routes also check this)
 *   3. status  - the update is atomic and conditional on the current status, so a
 *                double click or two people acting at once cannot both win (-> 409)
 * and appends a history entry saying who did what. `public` entries are shown to the
 * citizen on the Track page, `internal` ones only to staff.
 */

const Incident = require('../models/Incident');
const DispatchAgent = require('./dispatchAgent');
const { TEAMS, TEAM_KEYS, normalizeTeam, teamForCategory, teamName } = require('./teams');
const { normalizeCode } = require('./reportCodeService');
const { sign } = require('./imageAccess');
const { sendStatusUpdate } = require('./emailService');
const AiInferenceService = require('./aiInferenceService');

const META = AiInferenceService.CLASS_METADATA || {};
const OPEN = ['Assigned', 'In Progress'];
const REVIEW = ['Needs Review', 'Reported']; // 'Reported' is the legacy name
const FINAL = ['Resolved', 'Rejected'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const pretty = (s) => String(s || '').replace(/_/g, ' ');
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const scopeFilter = (scope) => (scope && scope.team ? { team: scope.team } : {});

const entry = (status, note, user, visibility = 'public') => ({
  status,
  note,
  at: new Date(),
  by: user ? user.name : 'system',
  role: user ? user.role : 'system',
  visibility,
});

const openJobs = (crew) => Incident.countDocuments({ assignedTeam: crew, status: { $in: OPEN } });

const statusOut = (s) => (s === 'Reported' ? 'Needs Review' : s);

// ---------------------------------------------------------------- serialisers
const summary = (d) => {
  const target = d.dispatch && d.dispatch.targetBy ? new Date(d.dispatch.targetBy) : null;
  const status = statusOut(d.status);
  const pending = (d.requests || []).find((r) => r.state === 'pending');
  return {
    code: d.reportCode || String(d._id),
    id: String(d._id),
    title: d.title,
    category: d.category,
    domain: d.domain,
    label: (META[d.category] || {}).label || pretty(d.category),
    severity: d.severity,
    status,
    team: normalizeTeam(d.team) || teamForCategory(d.category),
    teamName: teamName(normalizeTeam(d.team) || teamForCategory(d.category)),
    crew: d.assignedTeam && d.assignedTeam !== 'Unassigned' ? d.assignedTeam : null,
    priority: d.dispatch ? d.dispatch.priority || 0 : 0,
    targetBy: target,
    overdue: Boolean(target && OPEN.includes(status) && target < new Date()),
    address: d.address,
    lat: d.location && d.location.coordinates ? d.location.coordinates[1] : null,
    lng: d.location && d.location.coordinates ? d.location.coordinates[0] : null,
    imageUrl: sign(d.imageUrl),
    confidence: d.confidence,
    aiVerdict: d.aiReview && d.aiReview.performed ? d.aiReview.verdict : null,
    pendingRequest: pending ? { id: String(pending._id), kind: pending.kind } : null,
    createdAt: d.createdAt,
    resolvedAt: d.resolvedAt || null,
  };
};

// Full view for the work-item page. Never includes the reporter's e-mail address.
const detail = (d) => ({
  ...summary(d),
  boxes: (d.detectedBboxes || []).map((b) => ({ box: b.box, label: b.label, score: b.score })),
  ward: d.ward,
  aiReview: d.aiReview && d.aiReview.performed ? d.aiReview : null,
  dispatch: d.dispatch
    ? {
        reason: d.dispatch.reason,
        crew: d.dispatch.crew,
        priority: d.dispatch.priority,
        targetBy: d.dispatch.targetBy,
        needsReview: d.dispatch.needsReview,
        decidedAt: d.dispatch.decidedAt,
      }
    : null,
  requests: (d.requests || []).map((r) => ({
    id: String(r._id),
    kind: r.kind,
    fromTeam: r.fromTeam,
    suggestedTeam: r.suggestedTeam,
    reason: r.reason,
    by: r.by,
    at: r.at,
    state: r.state,
    decidedBy: r.decidedBy,
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote,
  })),
  reassignments: d.reassignments || [],
  history: (d.statusHistory || []).map((h) => ({
    status: statusOut(h.status),
    note: h.note,
    at: h.at,
    by: h.by || 'system',
    role: h.role || 'system',
    visibility: h.visibility || 'public',
  })),
  resolution: d.resolution && d.resolution.note
    ? { note: d.resolution.note, by: d.resolution.by, afterImageUrl: sign(d.resolution.afterImageUrl) }
    : null,
  startedAt: d.startedAt || null,
  updatedAt: d.updatedAt,
});

// ---------------------------------------------------------------- reads
const LIST_STATUS = {
  open: OPEN,
  needs_review: REVIEW,
  assigned: ['Assigned'],
  in_progress: ['In Progress'],
  resolved: ['Resolved'],
  rejected: ['Rejected'],
  completed: FINAL,
  all: null,
};

const list = async (scope, q = {}) => {
  const filter = { ...scopeFilter(scope) };
  if (!scope.team && q.team && TEAMS[q.team]) filter.team = q.team; // only the officer may choose a team

  const statuses = LIST_STATUS[q.status || 'open'];
  if (statuses) filter.status = { $in: statuses };
  if (q.severity && ['Low', 'Medium', 'High', 'Critical'].includes(q.severity)) filter.severity = q.severity;
  if (q.category && META[q.category]) filter.category = q.category;
  if (q.overdue === 'true') {
    filter.status = { $in: OPEN };
    filter['dispatch.targetBy'] = { $lt: new Date() };
  }
  if (q.requests === 'pending') filter.requests = { $elemMatch: { state: 'pending' } };
  if (q.q) {
    const code = normalizeCode(q.q);
    filter.$or = code
      ? [{ reportCode: code }]
      : [{ address: { $regex: escapeRegex(q.q).slice(0, 80), $options: 'i' } }, { title: { $regex: escapeRegex(q.q).slice(0, 80), $options: 'i' } }];
  }

  const sorts = {
    priority: { 'dispatch.priority': -1, 'dispatch.targetBy': 1, createdAt: -1 },
    due: { 'dispatch.targetBy': 1, createdAt: -1 },
    newest: { createdAt: -1 },
    resolved: { resolvedAt: -1 },
  };
  const sort = sorts[q.sort] || (statuses === FINAL ? sorts.resolved : sorts.priority);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
  const page = Math.max(1, Number(q.page) || 1);

  const [docs, total] = await Promise.all([
    Incident.find(filter).select('-reportedBy.email -statusHistory').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Incident.countDocuments(filter),
  ]);
  return { items: docs.map(summary), total, page, limit };
};

// Out of scope and non-existent look the same (404), so a manager cannot probe the other team
const findInScope = async (code, scope, extra = {}) => {
  const c = normalizeCode(code);
  if (!c) throw new HttpError(404, 'No work item with that ID.');
  return Incident.findOne({ reportCode: c, ...scopeFilter(scope), ...extra });
};

const get = async (code, scope) => {
  const d = await findInScope(code, scope);
  if (!d) throw new HttpError(404, 'No work item with that ID.');
  return detail(d.toObject());
};

// ---------------------------------------------------------------- the atomic move
// Applies `update` only if the incident is in scope and in one of `fromStatuses`.
const move = async (code, scope, fromStatuses, update, extraFilter = {}) => {
  const c = normalizeCode(code);
  if (!c) throw new HttpError(404, 'No work item with that ID.');
  const filter = { reportCode: c, ...scopeFilter(scope), status: { $in: fromStatuses }, ...extraFilter };
  const updated = await Incident.findOneAndUpdate(filter, update, { new: true });
  if (updated) return updated;
  const exists = await Incident.findOne({ reportCode: c, ...scopeFilter(scope) }).select('status requests');
  if (!exists) throw new HttpError(404, 'No work item with that ID.');
  throw new HttpError(409, `This item is "${statusOut(exists.status)}" now, so that action is not possible. Refresh to see the latest.`);
};

// Citizen e-mails never block or fail a workflow action
const notifyCitizen = async (doc, headline, detailText) => {
  try {
    const full = await Incident.findById(doc._id).select('reportedBy.email reportCode').lean();
    const to = full && full.reportedBy && full.reportedBy.email;
    if (!to || to === 'citizen@civicscan.org' || !full.reportCode) return;
    await sendStatusUpdate({ to, reportCode: full.reportCode, headline, detail: detailText });
  } catch (err) {
    console.warn(`[Workflow] status e-mail not sent for ${doc.reportCode}: ${err.message}`);
  }
};

// ---------------------------------------------------------------- team manager actions
const start = async (code, user, scope) =>
  detail(
    (
      await move(code, scope, ['Assigned'], {
        $set: { status: 'In Progress', startedAt: new Date() },
        $push: { statusHistory: entry('In Progress', 'Work has started on site', user) },
      })
    ).toObject()
  );

const resolve = async (code, user, scope, { note, afterImageUrl }) => {
  const text = String(note || '').trim();
  if (text.length < 3) throw new HttpError(400, 'Please describe what was done (a short note is required).');
  const current = await findInScope(code, scope);
  if (!current) throw new HttpError(404, 'No work item with that ID.');
  const owner = teamName(normalizeTeam(current.team) || teamForCategory(current.category));
  const doc = await move(code, scope, OPEN, {
    $set: {
      status: 'Resolved',
      resolvedAt: new Date(),
      resolution: { note: text.slice(0, 1000), afterImageUrl: afterImageUrl || undefined, by: user.name },
    },
    $push: {
      statusHistory: {
        $each: [
          entry('Resolved', `Resolved by the ${owner}`, user),
          entry('Resolved', `Resolution note: ${text.slice(0, 300)}`, user, 'internal'),
        ],
      },
    },
  });
  notifyCitizen(doc, 'Resolved', 'The municipal team has fixed the reported issue. Thank you for reporting it.');
  return detail(doc.toObject());
};

const fileRequest = async (code, user, scope, kind, { reason, suggestedTeam }) => {
  if (!scope.team) throw new HttpError(403, 'Only the team handling this item can file a request.');
  const text = String(reason || '').trim();
  if (text.length < 5) throw new HttpError(400, 'Please give a reason (at least a few words).');
  let suggested = null;
  if (kind === 'reassign') {
    suggested = TEAMS[suggestedTeam] && suggestedTeam !== scope.team ? suggestedTeam : TEAM_KEYS.find((k) => k !== scope.team);
  }
  const label = kind === 'reassign' ? `Reassignment to ${teamName(suggested)} requested` : 'Marked as "not a defect", awaiting confirmation';
  const doc = await move(
    code,
    scope,
    OPEN,
    {
      $push: {
        requests: { kind, fromTeam: scope.team, suggestedTeam: suggested, reason: text.slice(0, 500), by: user.name, at: new Date(), state: 'pending' },
        statusHistory: entry('Request', `${label}: ${text.slice(0, 300)}`, user, 'internal'),
      },
    },
    { requests: { $not: { $elemMatch: { state: 'pending' } } } }
  ).catch(async (err) => {
    if (err.status === 409) {
      const d = await findInScope(code, scope);
      if (d && (d.requests || []).some((r) => r.state === 'pending')) {
        throw new HttpError(409, 'A request for this item is already waiting for the Municipal Officer.');
      }
    }
    throw err;
  });
  return detail(doc.toObject());
};

// ---------------------------------------------------------------- municipal officer actions
const assignToTeam = async (doc, toTeam, user, kind, reason, opts = {}) => {
  const category = opts.category && META[opts.category] ? opts.category : doc.category;
  const crew = await DispatchAgent.chooseCrew(toTeam, category, openJobs);
  if (!crew) throw new HttpError(400, 'That team has no crews configured.');
  const targetBy = doc.dispatch && doc.dispatch.targetBy && !opts.resetTarget ? doc.dispatch.targetBy : DispatchAgent.targetFor(doc.severity);
  const set = {
    status: 'Assigned',
    team: toTeam,
    assignedTeam: crew.crew,
    'dispatch.crew': crew.crew,
    'dispatch.targetBy': targetBy,
    'dispatch.needsReview': false,
  };
  if (category !== doc.category) {
    const m = META[category] || {};
    Object.assign(set, { category, domain: m.domain || doc.domain, title: `Reported ${m.label || pretty(category)}` });
  }
  return {
    $set: set,
    $unset: { startedAt: '' },
    $push: {
      reassignments: { from: normalizeTeam(doc.team), to: toTeam, kind, by: user.name, reason: String(reason || '').slice(0, 300), at: new Date() },
      statusHistory: {
        $each: [
          entry('Assigned', `Assigned to the ${teamName(toTeam)}`, user),
          entry('Assigned', `${kind === 'triage' ? 'Triage' : 'Reassigned'}: ${teamName(toTeam)} / ${crew.crew}${reason ? `. Reason: ${String(reason).slice(0, 200)}` : ''}`, user, 'internal'),
        ],
      },
    },
  };
};

const triageAssign = async (code, user, { team, category, reason }) => {
  const d = await findInScope(code, { team: null });
  if (!d) throw new HttpError(404, 'No work item with that ID.');
  const toTeam = TEAMS[team] ? team : teamForCategory(category || d.category);
  if (!toTeam) throw new HttpError(400, 'Choose a team: litter or roads.');
  const update = await assignToTeam(d, toTeam, user, 'triage', reason, { category, resetTarget: true });
  const doc = await move(code, { team: null }, REVIEW, update);
  notifyCitizen(doc, `Assigned to the ${teamName(toTeam)}`, 'Your report was reviewed and handed to the team that will fix it.');
  return detail(doc.toObject());
};

const reject = async (code, user, { reason }, fromStatuses = REVIEW) => {
  const text = String(reason || '').trim();
  if (text.length < 3) throw new HttpError(400, 'Please give a reason.');
  const doc = await move(code, { team: null }, fromStatuses, {
    $set: { status: 'Rejected' },
    $push: {
      statusHistory: {
        $each: [
          entry('Rejected', 'Reviewed: no civic defect that needs municipal work', user),
          entry('Rejected', `Closed as not a defect: ${text.slice(0, 300)}`, user, 'internal'),
        ],
      },
    },
  });
  notifyCitizen(doc, 'Closed after review', 'The municipal team reviewed the photo and found no defect that needs work.');
  return detail(doc.toObject());
};

const reassign = async (code, user, { toTeam, reason }, kind = 'manual') => {
  if (!TEAMS[toTeam]) throw new HttpError(400, 'Choose a team: litter or roads.');
  if (String(reason || '').trim().length < 3) throw new HttpError(400, 'Please give a reason for the reassignment.');
  const d = await findInScope(code, { team: null });
  if (!d) throw new HttpError(404, 'No work item with that ID.');
  if (normalizeTeam(d.team) === toTeam && !REVIEW.includes(d.status)) {
    throw new HttpError(409, `This item is already with the ${teamName(toTeam)}.`);
  }
  const update = await assignToTeam(d, toTeam, user, kind, reason);
  const doc = await move(code, { team: null }, [...OPEN, ...REVIEW], update);
  // A manual move settles any pending "wrong team" request
  await Incident.updateOne(
    { _id: doc._id, requests: { $elemMatch: { kind: 'reassign', state: 'pending' } } },
    { $set: { 'requests.$.state': 'approved', 'requests.$.decidedBy': user.name, 'requests.$.decidedAt': new Date(), 'requests.$.decisionNote': 'Reassigned by the Municipal Officer' } }
  );
  return get(code, { team: null });
};

const decideRequest = async (code, requestId, user, { approve, toTeam, note }) => {
  const d = await findInScope(code, { team: null });
  if (!d) throw new HttpError(404, 'No work item with that ID.');
  const r = (d.requests || []).find((x) => String(x._id) === String(requestId));
  if (!r) throw new HttpError(404, 'No such request.');
  if (r.state !== 'pending') throw new HttpError(409, 'This request has already been decided.');

  // Claim the request atomically first, so two officers cannot both decide it
  const claimed = await Incident.updateOne(
    { _id: d._id, requests: { $elemMatch: { _id: r._id, state: 'pending' } } },
    {
      $set: {
        'requests.$.state': approve ? 'approved' : 'rejected',
        'requests.$.decidedBy': user.name,
        'requests.$.decidedAt': new Date(),
        'requests.$.decisionNote': String(note || '').slice(0, 300),
      },
    }
  );
  if (!claimed.modifiedCount) throw new HttpError(409, 'This request has already been decided.');

  if (!approve) {
    await Incident.updateOne(
      { _id: d._id },
      { $push: { statusHistory: entry('Request', `Request declined${note ? `: ${String(note).slice(0, 200)}` : ''}`, user, 'internal') } }
    );
    return get(code, { team: null });
  }
  if (r.kind === 'reassign') {
    const target = TEAMS[toTeam] ? toTeam : r.suggestedTeam;
    const update = await assignToTeam(d, target, user, 'request', r.reason);
    await move(code, { team: null }, [...OPEN, ...REVIEW], update);
    return get(code, { team: null });
  }
  return reject(code, user, { reason: `Confirmed team request: ${r.reason}` }, [...OPEN, ...REVIEW]);
};

const reopen = async (code, user, { reason }) => {
  if (String(reason || '').trim().length < 3) throw new HttpError(400, 'Please give a reason for reopening.');
  const doc = await move(code, { team: null }, ['Resolved'], {
    $set: { status: 'In Progress' },
    $unset: { resolvedAt: '' },
    $push: {
      statusHistory: {
        $each: [entry('In Progress', 'Reopened for more work', user), entry('In Progress', `Reopened: ${String(reason).slice(0, 300)}`, user, 'internal')],
      },
    },
  });
  return detail(doc.toObject());
};

// ---------------------------------------------------------------- escalation (Phase 5)
// Marks items that just became overdue so the officer's overview shows them first.
const escalateOverdue = async () => {
  const now = new Date();
  const due = await Incident.find({ status: { $in: OPEN }, 'dispatch.targetBy': { $lt: now }, escalatedAt: { $exists: false } })
    .select('_id reportCode')
    .limit(500)
    .lean();
  for (const d of due) {
    await Incident.updateOne(
      { _id: d._id, escalatedAt: { $exists: false } },
      {
        $set: { escalatedAt: now },
        $push: { statusHistory: entry('Overdue', 'Target response time passed; escalated to the Municipal Officer', null, 'internal') },
      }
    );
  }
  if (due.length) console.log(`[Escalation] ${due.length} item(s) became overdue and were escalated`);
  return due.length;
};

module.exports = {
  HttpError,
  OPEN,
  REVIEW,
  FINAL,
  scopeFilter,
  summary,
  detail,
  list,
  get,
  start,
  resolve,
  requestReassign: (code, user, scope, body) => fileRequest(code, user, scope, 'reassign', body),
  requestNotDefect: (code, user, scope, body) => fileRequest(code, user, scope, 'not_defect', body),
  triageAssign,
  reject,
  reassign,
  decideRequest,
  reopen,
  escalateOverdue,
  openJobs,
  entry,
};
