/**
 * One-off, idempotent migration of existing data to the role-based workflow.
 *
 *   npm run migrate:workflow             dry run: prints what would change, writes nothing
 *   npm run migrate:workflow -- --apply  apply the changes
 *
 * Incidents
 *   - reports without a tracking ID         -> get one (CS-XXXX-XXXX)
 *   - legacy status "Reported"             -> "Needs Review" (goes to the officer's triage)
 *   - crew that is not one of the team's   -> the team's specialist crew for that class
 *   - team display name                     -> team key (litter | roads)
 *   - assigned/open items without a team    -> team derived from the class
 *   - first team assignment recorded        -> reassignments[0] (kind agent, or manual for legacy items)
 *   - open items without a target time      -> target from severity (so "overdue" works)
 *   - timeline entries                      -> by / visibility filled in
 * Users
 *   - admin / field_supervisor -> municipal_officer, citizen -> deactivated
 *   - plaintext passwords -> bcrypt hash (the plaintext is removed)
 */
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Incident = require('../models/Incident');
const User = require('../models/User');
const { normalizeTeam, teamForCategory, crewsFor } = require('../services/teams');
const { generateUniqueCode } = require('../services/reportCodeService');
const { targetFor } = require('../services/dispatchAgent');

const APPLY = process.argv.includes('--apply');
const OPEN = ['Assigned', 'In Progress'];

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/civicscan', { serverSelectionTimeoutMS: 8000 });
  console.log(APPLY ? 'APPLYING changes\n' : 'DRY RUN (add -- --apply to write)\n');

  let changed = 0;
  const incidents = await Incident.find({}).lean();
  for (const d of incidents) {
    const set = {};
    const notes = [];

    if (!d.reportCode) {
      // Old reports from before tracking IDs: the new screens open items by tracking ID
      set.reportCode = await generateUniqueCode(async (c) => Boolean(await Incident.exists({ reportCode: c })));
      notes.push(`tracking ID ${set.reportCode}`);
    }
    if (d.status === 'Reported') {
      set.status = 'Needs Review';
      notes.push('status Reported -> Needs Review');
    }
    const status = set.status || d.status;
    const key = normalizeTeam(d.team);
    if (d.team && key && key !== d.team) {
      set.team = key;
      notes.push(`team "${d.team}" -> ${key}`);
    }
    if (!key && [...OPEN, 'Resolved'].includes(status)) {
      const derived = teamForCategory(d.category);
      if (derived) {
        set.team = derived;
        notes.push(`team -> ${derived} (from class)`);
      }
    }
    const team = set.team || key;
    // A crew that does not belong to the team (e.g. the old hard-coded "Ward 7 Rapid Crew")
    // is replaced with the team's first crew that specialises in this class
    if (team && OPEN.includes(status)) {
      const crews = crewsFor(team);
      if (!crews.some((c) => c.name === d.assignedTeam)) {
        const pick = crews.find((c) => c.handles.includes(d.category)) || crews[0];
        set.assignedTeam = pick.name;
        set['dispatch.crew'] = pick.name;
        notes.push(`crew "${d.assignedTeam}" -> ${pick.name}`);
      }
    }
    if ((!d.reassignments || !d.reassignments.length) && team && status !== 'Needs Review') {
      const agent = d.dispatch && d.dispatch.mode === 'auto' && !d.dispatch.needsReview;
      set.reassignments = [
        {
          from: null,
          to: team,
          kind: agent ? 'agent' : 'manual',
          by: agent ? 'Auto-Dispatch Agent' : 'legacy',
          reason: agent ? (d.dispatch.reason || '').slice(0, 300) : 'Assigned before the workflow existed',
          at: (d.dispatch && d.dispatch.decidedAt) || d.createdAt,
        },
      ];
      notes.push(`reassignments[0] = ${set.reassignments[0].kind}`);
    }
    if (OPEN.includes(status) && !(d.dispatch && d.dispatch.targetBy)) {
      set['dispatch.targetBy'] = targetFor(d.severity, new Date(d.createdAt || Date.now()));
      notes.push('target time from severity');
    }
    if ((d.statusHistory || []).some((h) => !h.visibility || !h.by)) {
      set.statusHistory = d.statusHistory.map((h) => ({ by: 'system', role: 'system', visibility: 'public', ...h }));
      notes.push('timeline by/visibility');
    }

    if (notes.length) {
      changed += 1;
      console.log(`${d.reportCode || d._id}: ${notes.join('; ')}`);
      if (APPLY) await Incident.updateOne({ _id: d._id }, { $set: set });
    }
  }

  let users = 0;
  const all = await User.find({}).select('+password');
  for (const u of all) {
    const notes = [];
    if (u.role === 'admin' || u.role === 'field_supervisor') {
      notes.push(`role ${u.role} -> municipal_officer`);
      if (APPLY) u.role = 'municipal_officer';
    }
    if (u.role === 'citizen' && u.active !== false) {
      notes.push('citizen account deactivated (citizens no longer log in)');
      if (APPLY) u.active = false;
    }
    if (u.password && !u.passwordHash) {
      notes.push('plaintext password -> bcrypt hash');
      if (APPLY) {
        u.passwordHash = await bcrypt.hash(u.password, 12);
        u.password = undefined;
      }
    }
    if (notes.length) {
      users += 1;
      console.log(`user ${u.email}: ${notes.join('; ')}`);
      if (APPLY) await u.save();
    }
  }

  console.log(`\n${changed} incident(s) and ${users} user(s) ${APPLY ? 'updated' : 'would change'}.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('migration failed:', err.message);
  process.exit(1);
});
