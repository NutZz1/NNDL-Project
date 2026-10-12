const express = require('express');
const { protect, requireRole } = require('../middlewares/auth');
const upload = require('../middlewares/uploadMiddleware');
const work = require('../controllers/workController');
const municipal = require('../controllers/municipalController');
const analytics = require('../controllers/analyticsController');

// Team managers and the Municipal Officer. The team scope comes from the login (req.scope).
const workRouter = express.Router();
workRouter.use(protect, requireRole('team_manager', 'municipal_officer'));
workRouter.get('/meta', work.meta);
workRouter.get('/', work.list);
workRouter.get('/:code', work.get);
workRouter.post('/:code/start', work.start);
workRouter.post('/:code/resolve', upload.single('afterPhoto'), work.resolve);
workRouter.post('/:code/request-reassign', work.requestReassign);
workRouter.post('/:code/request-not-defect', work.requestNotDefect);

// Municipal Officer only
const municipalRouter = express.Router();
municipalRouter.use(protect, requireRole('municipal_officer'));
municipalRouter.get('/board', municipal.board);
municipalRouter.get('/triage', municipal.triage);
municipalRouter.post('/triage/:code/assign', municipal.triageAssign);
municipalRouter.post('/triage/:code/reject', municipal.triageReject);
municipalRouter.get('/requests', municipal.requests);
municipalRouter.post('/requests/:code/:requestId/decide', municipal.decide);
municipalRouter.post('/work/:code/reassign', municipal.reassign);
municipalRouter.post('/work/:code/reopen', municipal.reopen);
municipalRouter.post('/work/:code/reject', municipal.reject);

const analyticsRouter = express.Router();
analyticsRouter.use(protect, requireRole('team_manager', 'municipal_officer'));
analyticsRouter.get('/team', analytics.team);
analyticsRouter.get('/municipal', requireRole('municipal_officer'), analytics.municipal);

const notificationsRouter = express.Router();
notificationsRouter.use(protect, requireRole('team_manager', 'municipal_officer'));
notificationsRouter.get('/summary', analytics.notifications);

module.exports = { workRouter, municipalRouter, analyticsRouter, notificationsRouter };
