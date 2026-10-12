const mongoose = require('mongoose');

/**
 * Staff accounts only. Citizens never log in (they track reports by ID).
 *
 *   team_manager       manages one team's work queue: team = 'litter' | 'roads'
 *   municipal_officer  sees and manages everything (team = null)
 *
 * Older records may still hold 'field_supervisor', 'admin' or 'citizen'; the auth layer
 * maps them (see middlewares/auth.js) and the migration script rewrites them.
 */
const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // bcrypt hash. `password` is the legacy plaintext field, cleared by the migration.
    passwordHash: {
      type: String,
    },
    password: {
      type: String,
      select: false,
    },
    role: {
      type: String,
      enum: ['team_manager', 'municipal_officer', 'field_supervisor', 'citizen', 'admin'],
      default: 'team_manager',
    },
    team: {
      type: String,
      enum: ['litter', 'roads', null],
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: Date,
    wardAssigned: {
      type: String,
      default: 'Ettimadai Ward',
    },
    organization: {
      type: String,
      default: 'Amrita Civic & Infrastructure Authority',
    },
    avatarUrl: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', UserSchema);
