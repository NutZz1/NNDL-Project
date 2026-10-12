/**
 * Analytics for the team dashboards and the municipal overview.
 * Every metric is defined in docs/role-based-workflow-design.md, section 8.
 *
 * A team manager's numbers are computed from their team's incidents only (the team comes
 * from the login, see middlewares/auth.js); the officer gets both teams and the agent KPIs.
 * Results are cached for 60 s per scope and period.
 */

const Incident = require('../models/Incident');
const ScanLog = require('../models/ScanLog');
const AiInferenceService = require('./aiInferenceService');
const { TEAM_KEYS, teamName } = require('./teams');

const META = AiInferenceService.CLASS_METADATA || {};
const OPEN = ['Assigned', 'In Progress'];
const REVIEW = ['Needs Review', 'Reported'];
const PERIODS = { '7d': 7, '30d': 30, '90d': 90 };
const DAY = 24 * 3600 * 1000;
const CACHE_MS = 60 * 1000;
const cache = new Map();

const cached = async (key, fn) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
};

const periodDays = (p) => PERIODS[p] || 7;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10);
const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// Local calendar day (toISOString would shift days in time zones ahead of UTC, e.g. India)
const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const teamMetrics = async (teamKey, days) => {
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY);
  const trendSince = startOfDay(new Date(now.getTime() - 13 * DAY));
  const scope = teamKey ? { team: teamKey } : {};

  const [open, recent] = await Promise.all([
    Incident.find({ ...scope, status: { $in: OPEN } })
      .select('status severity category assignedTeam dispatch.targetBy createdAt')
      .lean(),
    Incident.find({
      ...scope,
      $or: [{ createdAt: { $gte: new Date(Math.min(since, trendSince)) } }, { resolvedAt: { $gte: new Date(Math.min(since, trendSince)) } }],
    })
      .select('status category createdAt resolvedAt dispatch.targetBy')
      .lean(),
  ]);

  const target = (d) => (d.dispatch && d.dispatch.targetBy ? new Date(d.dispatch.targetBy) : null);
  const resolved = recent.filter((d) => d.status === 'Resolved' && d.resolvedAt && new Date(d.resolvedAt) >= since);
  const withTarget = resolved.filter(target);
  const hours = (d) => (new Date(d.resolvedAt) - new Date(d.createdAt)) / 3600000;

  // by class: open now + resolved in the period
  const classes = new Map();
  const bump = (cat) => {
    if (!classes.has(cat)) classes.set(cat, { category: cat, label: (META[cat] || {}).label || cat, open: 0, resolved: 0, hours: [] });
    return classes.get(cat);
  };
  open.forEach((d) => (bump(d.category).open += 1));
  resolved.forEach((d) => {
    const c = bump(d.category);
    c.resolved += 1;
    c.hours.push(hours(d));
  });

  // daily trend, last 14 days
  const trend = [];
  for (let i = 13; i >= 0; i -= 1) {
    const k = dayKey(new Date(now.getTime() - i * DAY));
    trend.push({ day: k, created: 0, resolved: 0 });
  }
  const byDay = Object.fromEntries(trend.map((t) => [t.day, t]));
  recent.forEach((d) => {
    if (d.createdAt && byDay[dayKey(d.createdAt)]) byDay[dayKey(d.createdAt)].created += 1;
    if (d.status === 'Resolved' && d.resolvedAt && byDay[dayKey(d.resolvedAt)]) byDay[dayKey(d.resolvedAt)].resolved += 1;
  });

  const ageDays = (d) => (now - new Date(d.createdAt)) / DAY;
  const crews = new Map();
  open.forEach((d) => {
    const crew = d.assignedTeam && d.assignedTeam !== 'Unassigned' ? d.assignedTeam : 'Unassigned';
    crews.set(crew, (crews.get(crew) || 0) + 1);
  });

  return {
    team: teamKey,
    teamName: teamKey ? teamName(teamKey) : 'All teams',
    backlog: open.length,
    assigned: open.filter((d) => d.status === 'Assigned').length,
    inProgress: open.filter((d) => d.status === 'In Progress').length,
    overdue: open.filter((d) => target(d) && target(d) < now).length,
    created: recent.filter((d) => new Date(d.createdAt) >= since).length,
    resolved: resolved.length,
    resolvedToday: resolved.filter((d) => new Date(d.resolvedAt) >= startOfDay(now)).length,
    meanHoursToResolve: round1(avg(resolved.map(hours))),
    withinTargetPct: pct(withTarget.filter((d) => new Date(d.resolvedAt) <= target(d)).length, withTarget.length),
    byClass: [...classes.values()]
      .map((c) => ({ category: c.category, label: c.label, open: c.open, resolved: c.resolved, meanHours: round1(avg(c.hours)) }))
      .sort((a, b) => b.open + b.resolved - (a.open + a.resolved)),
    bySeverity: ['Critical', 'High', 'Medium', 'Low'].map((s) => ({ severity: s, open: open.filter((d) => d.severity === s).length })),
    trend,
    ageing: [
      { bucket: 'Under 1 day', count: open.filter((d) => ageDays(d) < 1).length },
      { bucket: '1-3 days', count: open.filter((d) => ageDays(d) >= 1 && ageDays(d) < 3).length },
      { bucket: '3-7 days', count: open.filter((d) => ageDays(d) >= 3 && ageDays(d) < 7).length },
      { bucket: '7+ days', count: open.filter((d) => ageDays(d) >= 7).length },
    ],
    crewLoad: [...crews.entries()].map(([crew, count]) => ({ crew, open: count })).sort((a, b) => b.open - a.open),
  };
};

const agentMetrics = async (days) => {
  const since = new Date(Date.now() - days * DAY);
  const [scans, incidents] = await Promise.all([
    ScanLog.find({ at: { $gte: since } }).select('outcome reviewVerdict').lean(),
    Incident.find({ createdAt: { $gte: since } }).select('status reassignments dispatch').lean(),
  ]);

  const outcome = (o) => scans.filter((s) => s.outcome === o).length;
  const reviewed = scans.filter((s) => s.reviewVerdict && !['none', 'failed'].includes(s.reviewVerdict));
  const verdict = (v) => reviewed.filter((s) => s.reviewVerdict === v).length;

  // An incident was auto-dispatched if the first entry of its team history was the agent's
  const auto = incidents.filter((d) => (d.reassignments || [])[0] && d.reassignments[0].kind === 'agent');
  const overruled = auto.filter(
    (d) => d.status === 'Rejected' || (d.reassignments || []).slice(1).some((r) => r.kind === 'request' || r.kind === 'manual')
  );

  return {
    photosScanned: scans.length,
    reportsCreated: incidents.length,
    autoDispatched: auto.length,
    autoDispatchRatePct: pct(auto.length, incidents.length),
    heldForReview: outcome('held'),
    heldRatePct: pct(outcome('held'), outcome('held') + outcome('assigned')),
    discardedClean: outcome('discarded_clean'),
    discardedByAi: outcome('discarded_by_ai'),
    // How often the officer had to overrule the agent's assignment (moved or closed it)
    assignmentAccuracyPct: auto.length ? round1(100 - pct(overruled.length, auto.length)) : null,
    agentAssignmentsOverruled: overruled.length,
    falsePositiveRatePct: pct(incidents.filter((d) => d.status === 'Rejected').length, incidents.length),
    review: {
      reviewed: reviewed.length,
      confirmed: verdict('confirmed'),
      corrected: verdict('corrected'),
      removed: verdict('removed'),
      disputed: verdict('disputed'),
      unsure: verdict('unsure'),
      correctionRatePct: pct(verdict('corrected') + verdict('removed'), reviewed.length),
    },
  };
};

const hotspots = async (days) => {
  const since = new Date(Date.now() - days * DAY);
  const docs = await Incident.find({ createdAt: { $gte: since } }).select('location address status team').lean();
  const cells = new Map();
  docs.forEach((d) => {
    const c = d.location && d.location.coordinates;
    if (!c) return;
    // ~110 m grid cells
    const key = `${c[1].toFixed(3)},${c[0].toFixed(3)}`;
    if (!cells.has(key)) cells.set(key, { lat: Number(c[1].toFixed(3)), lng: Number(c[0].toFixed(3)), count: 0, open: 0, address: d.address });
    const cell = cells.get(key);
    cell.count += 1;
    if (OPEN.includes(d.status)) cell.open += 1;
  });
  return [...cells.values()].sort((a, b) => b.count - a.count).slice(0, 8);
};

const forTeam = (teamKey, period) =>
  cached(`team:${teamKey}:${period}`, async () => ({ period, ...(await teamMetrics(teamKey, periodDays(period))) }));

const forMunicipal = (period) =>
  cached(`municipal:${period}`, async () => {
    const days = periodDays(period);
    const [teams, combined, needsReview, requestsPending, agent, spots] = await Promise.all([
      Promise.all(TEAM_KEYS.map((k) => teamMetrics(k, days))),
      teamMetrics(null, days),
      Incident.countDocuments({ status: { $in: REVIEW } }),
      Incident.countDocuments({ requests: { $elemMatch: { state: 'pending' } } }),
      agentMetrics(days),
      hotspots(days),
    ]);
    return {
      period,
      teams: Object.fromEntries(TEAM_KEYS.map((k, i) => [k, teams[i]])),
      combined,
      needsReview,
      requestsPending,
      agent,
      hotspots: spots,
    };
  });

module.exports = { forTeam, forMunicipal, PERIODS };
