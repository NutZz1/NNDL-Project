const mongoose = require('mongoose');

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
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['municipal_officer', 'field_supervisor', 'citizen', 'admin'],
      default: 'municipal_officer',
    },
    wardAssigned: {
      type: String,
      default: 'Ward 7 - Central Urban',
    },
    organization: {
      type: String,
      default: 'Metropolitan Civic Authority',
    },
    avatarUrl: {
      type: String,
      default: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('User', UserSchema);
