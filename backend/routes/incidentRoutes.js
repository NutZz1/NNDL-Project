const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');

router.get('/', incidentController.getIncidents);
router.get('/:id', incidentController.getIncidentById);
router.post('/', incidentController.createIncident);
router.put('/:id', incidentController.updateIncident);
router.patch('/:id/status', incidentController.updateIncidentStatus);

module.exports = router;
