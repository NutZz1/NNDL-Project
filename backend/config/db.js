const mongoose = require('mongoose');

const RETRY_MS = 15000;
let listening = false;

// Log every loss and recovery of the connection, so a database problem is never silent
const watchConnection = () => {
  if (listening) return;
  listening = true;
  mongoose.connection.on('disconnected', () => console.warn('[MongoDB] Disconnected. Uploads are refused until the database is reachable again.'));
  mongoose.connection.on('reconnected', () => console.log('[MongoDB] Reconnected.'));
};

const connectDB = async () => {
  watchConnection();
  try {
    const connUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/civicscan';
    const conn = await mongoose.connect(connUri, {
      serverSelectionTimeoutMS: 10000, // Allow up to 10s for Atlas connections
    });
    console.log(`[MongoDB] Connected successfully: ${conn.connection.host}`);
  } catch (error) {
    // Not a "mock mode": nothing can be saved without the database, so uploads are refused with
    // a clear error (see uploadController) and the connection is retried until it works.
    console.error(
      `[MongoDB] Could not connect (${error.message}). Check MONGO_URI in backend/.env and the network. ` +
        `Uploads are refused until it connects; retrying in ${RETRY_MS / 1000}s.`
    );
    setTimeout(connectDB, RETRY_MS).unref();
  }
};

// True only while the database can actually take writes
connectDB.isReady = () => mongoose.connection.readyState === 1;

module.exports = connectDB;
