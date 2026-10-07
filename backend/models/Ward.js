const mongoose = require('mongoose');

const WardSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    code: {
      type: String,
      required: true,
    },
    leadOfficer: {
      type: String,
      default: 'Officer Tom Miller',
    },
    activeIssuesCount: {
      type: Number,
      default: 0,
    },
    crewsAvailable: {
      type: Number,
      default: 3,
    },
    coverageAreaKm2: {
      type: Number,
      default: 14.5,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Ward', WardSchema);
