const mongoose = require('mongoose');

const IncidentSchema = new mongoose.Schema(
  {
    // Public tracking ID shown to the citizen and emailed to them (CS-XXXX-XXXX)
    reportCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
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
    // Detector that decided the report. Always RF-DETR: the other models are only compared.
    detectorModel: {
      type: String,
      default: 'RF-DETR-Small',
    },
    // Raw output of every detector on this photo (RF-DETR before the verification agent,
    // RT-DETR, YOLOv11), for the officer's Comparison view. Never used to dispatch.
    modelResults: [
      {
        _id: false,
        key: String, // rfdetr | rtdetr | yolov11
        name: String,
        role: String, // production | comparison
        available: Boolean,
        error: String,
        hasDefect: Boolean,
        category: String,
        confidence: Number,
        detectionsCount: Number,
        bboxes: [{ _id: false, box: [Number], label: String, score: Number }],
        candidates: [{ _id: false, box: [Number], label: String, score: Number }],
        threshold: Number,
        resolution: Number,
        inferenceMs: Number,
        device: String,
        ranAt: Date,
        gan: { applied: Boolean, name: String, ms: Number, reason: String, restoredFilename: String },
      },
    ],
    // Same comparison with each detector's Pix2Pix GAN applied first (RT-DETR has none).
    // Filled when the citizen asked for GAN enhancement, or when an officer runs it.
    modelResultsGan: [
      {
        _id: false,
        key: String,
        name: String,
        role: String,
        available: Boolean,
        error: String,
        hasDefect: Boolean,
        category: String,
        confidence: Number,
        detectionsCount: Number,
        bboxes: [{ _id: false, box: [Number], label: String, score: Number }],
        candidates: [{ _id: false, box: [Number], label: String, score: Number }],
        threshold: Number,
        resolution: Number,
        inferenceMs: Number,
        device: String,
        ranAt: Date,
        gan: { applied: Boolean, name: String, ms: Number, reason: String, restoredFilename: String },
      },
    ],
    // Set only when the citizen ticked "Enhance photo with GAN": the report was decided on the
    // GAN-restored photo (the original photo stays the evidence image).
    gan: {
      requested: Boolean,
      applied: Boolean,
      name: String,
      ms: Number,
      reason: String,
      restoredImageUrl: String,
    },
    status: {
      type: String,
      // Needs Review -> Assigned -> In Progress -> Resolved, or Rejected (not a real defect).
      // 'Reported' is the legacy value and is treated as Needs Review.
      enum: ['Reported', 'Needs Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected'],
      default: 'Needs Review',
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
    // Responsible municipal team key: 'litter' | 'roads' (see services/teams.js)
    team: { type: String, index: true },
    startedAt: Date,
    resolvedAt: Date,
    resolution: {
      note: String,
      afterImageUrl: String,
      by: String,
    },
    // Requests from a team manager that the Municipal Officer decides
    requests: [
      {
        kind: { type: String, enum: ['reassign', 'not_defect'] },
        fromTeam: String,
        suggestedTeam: String,
        reason: String,
        by: String,
        at: { type: Date, default: Date.now },
        state: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        decidedBy: String,
        decidedAt: Date,
        decisionNote: String,
      },
    ],
    // Every change of team: the first entry is the dispatch agent's own choice
    reassignments: [
      {
        _id: false,
        from: String,
        to: String,
        kind: { type: String, enum: ['agent', 'request', 'manual', 'triage'] },
        by: String,
        reason: String,
        at: { type: Date, default: Date.now },
      },
    ],
    // Set once by the escalation job when the item first becomes overdue
    escalatedAt: Date,
    // Decision made by the auto-dispatch agent when the report was created
    dispatch: {
      mode: { type: String, enum: ['auto', 'manual'] },
      crew: String,
      reason: String,
      priority: Number,
      targetBy: Date,
      needsReview: { type: Boolean, default: false },
      decidedAt: Date,
    },
    // Second opinion from the Verification Agent (vision LLM) on the detector's output
    aiReview: {
      performed: Boolean,
      verdict: String, // confirmed | corrected | removed | disputed | unsure | failed
      model: String,
      summary: String,
      changes: [{ _id: false, kind: String, from: String, to: String, reason: String }],
      notes: [String],
      original: { category: String, confidence: Number },
    },
    // Timeline shown on the public tracking page
    statusHistory: [
      {
        _id: false,
        status: String,
        note: String,
        at: { type: Date, default: Date.now },
        by: String,
        role: String,
        // public entries are shown to the citizen on the Track page; internal ones are not
        visibility: { type: String, enum: ['public', 'internal'], default: 'public' },
      },
    ],
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
// Work queues: one team's open items ordered by deadline
IncidentSchema.index({ team: 1, status: 1, 'dispatch.targetBy': 1 });
IncidentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Incident', IncidentSchema);
