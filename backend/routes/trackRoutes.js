const express = require('express');
const router = express.Router();
const rateLimit = require('../middlewares/rateLimit');
const trackController = require('../controllers/trackController');

router.get('/:code', rateLimit({ windowMs: 60_000, max: 30 }), trackController.trackReport);

module.exports = router;
