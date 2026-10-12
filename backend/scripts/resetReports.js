/**
 * Clears all reports so the app can be tested from scratch, after saving a backup.
 *
 *   npm run reset:reports            dry run: shows what would be removed
 *   npm run reset:reports -- --apply backs up, then removes
 *
 * Removed: every incident, every scan-log row, every uploaded photo in backend/uploads.
 * Kept:    staff accounts (users).
 * Backup:  backups/<timestamp>/ (git-ignored) with incidents.json, scanlogs.json and the photos,
 *          so nothing is lost for good.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');
const UPLOADS = path.join(__dirname, '..', 'uploads');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/civicscan', { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  const incidents = await db.collection('incidents').find({}).toArray();
  const scanlogs = await db.collection('scanlogs').find({}).toArray();
  const files = fs.readdirSync(UPLOADS).filter((f) => f !== '.gitkeep');
  console.log(`${incidents.length} incident(s), ${scanlogs.length} scan-log row(s), ${files.length} uploaded file(s)`);

  if (!APPLY) {
    console.log('DRY RUN: nothing changed. Add -- --apply to back up and remove.');
    await mongoose.disconnect();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(__dirname, '..', '..', 'backups', `reports-${stamp}`);
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'incidents.json'), JSON.stringify(incidents, null, 1));
  fs.writeFileSync(path.join(dir, 'scanlogs.json'), JSON.stringify(scanlogs, null, 1));
  for (const f of files) fs.copyFileSync(path.join(UPLOADS, f), path.join(dir, 'uploads', f));
  // verify the backup before deleting anything
  const saved = fs.readdirSync(path.join(dir, 'uploads')).length;
  const savedIncidents = JSON.parse(fs.readFileSync(path.join(dir, 'incidents.json'), 'utf8')).length;
  if (saved !== files.length || savedIncidents !== incidents.length) throw new Error('backup incomplete; nothing removed');
  console.log(`backup written to ${dir}`);

  const r1 = await db.collection('incidents').deleteMany({});
  const r2 = await db.collection('scanlogs').deleteMany({});
  for (const f of files) fs.unlinkSync(path.join(UPLOADS, f));
  console.log(`removed ${r1.deletedCount} incident(s), ${r2.deletedCount} scan-log row(s), ${files.length} file(s). Staff accounts kept.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('reset failed:', err.message);
  process.exit(1);
});
