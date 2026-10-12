const Analytics = require('../services/analyticsService');
const Incident = require('../models/Incident');
const { handle } = require('./workController');
const { TEAMS } = require('../services/teams');

const period = (p) => (Analytics.PERIODS[p] ? p : '7d');

// GET /api/analytics/team?period=7d|30d|90d[&team=]  (a manager always gets their own team)
exports.team = handle((req) => {
  const team = req.scope.team || (TEAMS[req.query.team] ? req.query.team : null);
  return Analytics.forTeam(team, period(req.query.period));
});

// GET /api/analytics/municipal?period=  (officer only)
exports.municipal = handle((req) => Analytics.forMunicipal(period(req.query.period)));

// GET /api/notifications/summary  : badge counts, polled by the dashboards
exports.notifications = handle(async (req) => {
  const now = new Date();
  const scope = req.scope.team ? { team: req.scope.team } : {};
  const open = { $in: ['Assigned', 'In Progress'] };
  const [newToday, overdue, pendingRequests] = await Promise.all([
    Incident.countDocuments({ ...scope, status: 'Assigned', createdAt: { $gte: new Date(now - 24 * 3600 * 1000) } }),
    Incident.countDocuments({ ...scope, status: open, 'dispatch.targetBy': { $lt: now } }),
    Incident.countDocuments({ ...scope, requests: { $elemMatch: { state: 'pending' } } }),
  ]);
  const out = { newToday, overdue, pendingRequests, at: now };
  if (!req.scope.team) {
    out.needsReview = await Incident.countDocuments({ status: { $in: ['Needs Review', 'Reported'] } });
  }
  return out;
});
