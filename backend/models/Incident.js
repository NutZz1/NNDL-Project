const mongoose = require('mongoose');

const IncidentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'crack_longitudinal',
        'crack_transverse',
        'crack_alligator',
        'pothole',
        'crack_structural',
        'litter',
        'manhole_damaged',
        'manhole_missing',
        'illegal_dumping', // Post-inference aggregated cluster
      ],
      default: 'litter',
    },
    domain: {
      type: String,
      enum: ['road_damage', 'civic_waste', 'structural_damage', 'hazard'],
      default: 'civic_waste',
    },
    severity: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
    },
    status: {
      type: String,
      enum: ['Reported', 'Assigned', 'In Progress', 'Resolved'],
      default: 'Reported',
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    address: {
      type: String,
      default: 'Street location pending reverse geocode',
    },
    ward: {
      type: String,
      default: 'Ward 7 - Central Urban',
    },
    imageUrl: {
      type: String,
      required: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.88,
    },
    detectedBboxes: [
      {
        box: [Number], // [ymin, xmin, ymax, xmax]
        label: String,
        score: Number,
      },
    ],
    reportedBy: {
      name: { type: String, default: 'Citizen Reporter' },
      email: { type: String, default: 'citizen@civicscan.org' },
    },
    assignedTeam: {
      type: String,
      default: 'Unassigned',
    },
    daysUnresolved: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// GeoJSON 2dsphere index for fast proximity queries and spatial clustering
IncidentSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Incident', IncidentSchema);
