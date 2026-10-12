const mongoose = require('mongoose');

/**
 * One row per uploaded photo, kept for the agent analytics (how many photos were
 * discarded, held, corrected...). It deliberately stores no photo, no e-mail address
 * and no location.
 */
const ScanLogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, index: true },
  detectorCategory: String,
  detectorConfidence: Number,
  reviewVerdict: String, // confirmed | corrected | removed | disputed | unsure | failed | none
  finalCategory: String,
  team: String,
  outcome: {
    type: String,
    enum: ['assigned', 'held', 'discarded_clean', 'discarded_by_ai'],
  },
  reportCode: String,
});

module.exports = mongoose.model('ScanLog', ScanLogSchema);
