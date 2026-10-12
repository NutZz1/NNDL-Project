const Incident = require('../models/Incident');
const { normalizeCode } = require('../services/reportCodeService');
const { teamName, normalizeTeam, teamForCategory } = require('../services/teams');
const { sign } = require('../services/imageAccess');

// Statuses as the citizen sees them (staff wording stays internal)
const CITIZEN_STATUS = {
  Reported: 'Reported',
  'Needs Review': 'Reported',
  Assigned: 'Assigned',
  'In Progress': 'In Progress',
  Resolved: 'Resolved',
  Rejected: 'Closed',
};

// GET /api/track/:code  (public, no login)
// Returns only what the citizen who holds the code should see: never the e-mail address,
// internal notes, reassignment reasons or officer names.
exports.trackReport = async (req, res) => {
  try {
    const code = normalizeCode(req.params.code);
    if (!code) {
      return res.status(400).json({ success: false, error: 'That does not look like a report ID. It looks like CS-7K4M-X9QD.' });
    }

    const incident = await Incident.findOne({ reportCode: code }).select('-reportedBy.email').lean();
    if (!incident) {
      return res.status(404).json({ success: false, error: 'No report found with that ID. Please check it and try again.' });
    }

    const coords = (incident.location && incident.location.coordinates) || [];
    const history = (incident.statusHistory || [])
      .filter((h) => (h.visibility || 'public') === 'public')
      .map((h) => ({ status: CITIZEN_STATUS[h.status] || h.status, note: h.note || '', at: h.at }));
    if (!history.length) history.push({ status: 'Reported', note: 'Report received', at: incident.createdAt });

    const status = CITIZEN_STATUS[incident.status] || incident.status;
    const team = normalizeTeam(incident.team);
    const open = ['Assigned', 'In Progress'].includes(incident.status);

    res.json({
      success: true,
      data: {
        reportCode: incident.reportCode,
        title: incident.title,
        category: incident.category,
        domain: incident.domain,
        severity: incident.severity,
        status,
        underReview: ['Reported', 'Needs Review'].includes(incident.status),
        confidence: incident.confidence,
        address: incident.address,
        ward: incident.ward,
        lat: coords[1] ?? null,
        lng: coords[0] ?? null,
        imageUrl: sign(incident.imageUrl),
        detectedBboxes: (incident.detectedBboxes || []).map((b) => ({ box: b.box, label: b.label, score: b.score })),
        team: team ? teamName(team) : teamName(teamForCategory(incident.category)),
        crew: open && incident.assignedTeam && incident.assignedTeam !== 'Unassigned' ? incident.assignedTeam : null,
        targetBy: open && incident.dispatch ? incident.dispatch.targetBy || null : null,
        resolvedAt: incident.resolvedAt || null,
        afterImageUrl: incident.status === 'Resolved' && incident.resolution ? sign(incident.resolution.afterImageUrl) || null : null,
        reportedAt: incident.createdAt,
        updatedAt: incident.updatedAt || incident.createdAt,
        history,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not look up the report right now.' });
  }
};
