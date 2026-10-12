const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { protect, requireRole } = require('../middlewares/auth');
const rateLimit = require('../middlewares/rateLimit');

// Staff only; the answer is scoped to the caller's team by the agent's tools
router.post('/', protect, requireRole('team_manager', 'municipal_officer'), rateLimit({ windowMs: 60_000, max: 20 }), chatController.chatWithAnalytics);

module.exports = router;
