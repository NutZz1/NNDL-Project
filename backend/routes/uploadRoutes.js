const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const upload = require('../middlewares/uploadMiddleware');
const rateLimit = require('../middlewares/rateLimit');

// Public (citizens have no account): rate-limited per IP
router.post('/process-image', rateLimit({ windowMs: 60_000, max: 10 }), upload.single('image'), uploadController.processImage);
router.patch('/report/:code/location', rateLimit({ windowMs: 60_000, max: 20 }), uploadController.updateReportLocation);
// Model comparison: every detector on one photo; nothing is stored
router.post('/compare-models', rateLimit({ windowMs: 60_000, max: 10 }), upload.single('image'), uploadController.compareModels);
router.get('/models', uploadController.listModels);

module.exports = router;
