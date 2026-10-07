const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const connUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/civicscan';
    const conn = await mongoose.connect(connUri, {
      serverSelectionTimeoutMS: 2000 // Quick timeout if Mongo isn't running locally
    });
    console.log(`[MongoDB] Connected successfully: ${conn.connection.host}`);
  } catch (error) {
    console.warn(`[MongoDB Warning] Could not connect to MongoDB (${error.message}). Running in mock/fallback mode for development preview.`);
  }
};

module.exports = connectDB;
