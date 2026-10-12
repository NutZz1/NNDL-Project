/**
 * Creates the three staff accounts (Phase 0):
 *   Litter Manager, Road Manager, Municipal Officer
 *
 *   npm run seed:users            create missing accounts (existing ones are left alone)
 *   npm run seed:users -- --reset also set new passwords for the three accounts
 *
 * Passwords come from SEED_LITTER_PASSWORD / SEED_ROADS_PASSWORD / SEED_OFFICER_PASSWORD
 * if set, otherwise random ones are generated. Whatever was set is written to
 * backend/.seed-credentials.local (git-ignored), never to the console or to git.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const User = require('../models/User');

const ACCOUNTS = [
  { name: 'Litter Manager', email: 'litter.manager@civicscan.local', role: 'team_manager', team: 'litter', env: 'SEED_LITTER_PASSWORD' },
  { name: 'Road Manager', email: 'road.manager@civicscan.local', role: 'team_manager', team: 'roads', env: 'SEED_ROADS_PASSWORD' },
  { name: 'Municipal Officer', email: 'municipal.officer@civicscan.local', role: 'municipal_officer', team: null, env: 'SEED_OFFICER_PASSWORD' },
];

const randomPassword = () => crypto.randomBytes(12).toString('base64url');

(async () => {
  const reset = process.argv.includes('--reset');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/civicscan', { serverSelectionTimeoutMS: 8000 });
  const written = [];

  for (const a of ACCOUNTS) {
    const existing = await User.findOne({ email: a.email });
    if (existing && !reset) {
      console.log(`exists   ${a.email}  (${a.role}${a.team ? `/${a.team}` : ''})`);
      continue;
    }
    const password = process.env[a.env] || randomPassword();
    const passwordHash = await bcrypt.hash(password, 12);
    if (existing) {
      existing.set({ name: a.name, role: a.role, team: a.team, passwordHash, active: true });
      existing.password = undefined;
      await existing.save();
      console.log(`reset    ${a.email}`);
    } else {
      await User.create({ name: a.name, email: a.email, role: a.role, team: a.team, passwordHash });
      console.log(`created  ${a.email}  (${a.role}${a.team ? `/${a.team}` : ''})`);
    }
    written.push(`${a.name.padEnd(18)} ${a.email.padEnd(36)} ${password}`);
  }

  if (written.length) {
    const file = path.join(__dirname, '..', '.seed-credentials.local');
    fs.writeFileSync(
      file,
      ['# CivicScan staff logins (local development only, git-ignored). Delete after noting them.', ...written, ''].join('\n'),
      { mode: 0o600 }
    );
    console.log(`\nPasswords written to ${file}`);
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error('seed failed:', err.message);
  process.exit(1);
});
