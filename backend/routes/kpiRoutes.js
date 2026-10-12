const express = require('express');
const router = express.Router();
const kpiController = require('../controllers/kpiController');
const { protect, requireRole } = require('../middlewares/auth');

router.get('/summary', protect, requireRole('team_manager', 'municipal_officer'), kpiController.getKpiSummary);

module.exports = router;
