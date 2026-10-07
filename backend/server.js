const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const connectDB = require('./config/db');
const errorHandler = require('./middlewares/errorHandler');

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

// Static uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// Centralized Error Handling
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`=============================================`);
  console.log(`🚀 CivicScan Server running on port ${PORT}`);
  console.log(`🌍 Health: http://localhost:${PORT}/api/health`);
  console.log(`📊 KPIs:   http://localhost:${PORT}/api/kpi/summary`);
  console.log(`📍 Incidents: http://localhost:${PORT}/api/incidents`);
  console.log(`=============================================`);
});
