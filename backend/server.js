const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');
const errorHandler = require('./middlewares/errorHandler');
const { verify: verifyPhotoLink } = require('./services/imageAccess');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Uploaded photos: only reachable through the signed, expiring links the API hands out
app.use('/uploads', verifyPhotoLink, express.static(path.join(__dirname, 'uploads')));

// Base API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'CivicScan Backend API',
    modelAlignment: 'RF-DETR + YOLO baseline (8 locked classes)',
    sdgImpact: ['SDG-11 Sustainable Cities', 'SDG-12 Responsible Waste', 'SDG-13 Climate Action'],
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/incidents', require('./routes/incidentRoutes'));
app.use('/api/kpi', require('./routes/kpiRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/track', require('./routes/trackRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));

// Role-based workflow (team managers + Municipal Officer)
const { workRouter, municipalRouter, analyticsRouter, notificationsRouter } = require('./routes/workRoutes');
app.use('/api/work', workRouter);
app.use('/api/municipal', municipalRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/notifications', notificationsRouter);

// Centralized Error Handling
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Started directly (node server.js): listen and run the background jobs.
// Required by a test: just export the app.
if (require.main === module) {
  // Overdue escalation: flags items that just passed their target response time (every 15 min)
  const { escalateOverdue } = require('./services/workflowService');
  const runEscalation = () => escalateOverdue().catch((e) => console.warn('[Escalation] skipped:', e.message));
  setTimeout(runEscalation, 20 * 1000).unref();
  setInterval(runEscalation, 15 * 60 * 1000).unref();

  app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(`🚀 CivicScan Server running on port ${PORT}`);
    console.log(`🌍 Health: http://localhost:${PORT}/api/health`);
    console.log(`=============================================`);
  });
}

module.exports = app;
