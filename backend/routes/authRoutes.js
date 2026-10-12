const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect, requireRole } = require('../middlewares/auth');
const rateLimit = require('../middlewares/rateLimit');

router.post('/login', rateLimit({ windowMs: 15 * 60_000, max: 20 }), authController.login);
router.get('/me', protect, authController.me);
router.post('/users', protect, requireRole('municipal_officer'), authController.createUser);

module.exports = router;
