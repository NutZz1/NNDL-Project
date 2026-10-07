const express = require('express');
const router = express.Router();
const kpiController = require('../controllers/kpiController');

router.get('/summary', kpiController.getKpiSummary);

module.exports = router;
