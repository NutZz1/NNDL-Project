const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const upload = require('../middlewares/uploadMiddleware');

router.post('/process-image', upload.single('image'), uploadController.processImage);

module.exports = router;
