const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const { protect, requireRole } = require('../middlewares/auth');

// Staff only. Reads are scoped to the manager's team; changes go through /api/work and
// /api/municipal (with the workflow rules), so the legacy write routes are officer-only.
router.use(protect, requireRole('team_manager', 'municipal_officer'));
router.get('/', incidentController.getIncidents);
router.get('/:id', incidentController.getIncidentById);
router.post('/', requireRole('municipal_officer'), incidentController.createIncident);
router.put('/:id', requireRole('municipal_officer'), incidentController.updateIncident);
router.patch('/:id/status', requireRole('municipal_officer'), incidentController.updateIncidentStatus);

module.exports = router;
