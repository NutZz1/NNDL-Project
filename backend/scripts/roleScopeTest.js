/**
 * Role, scope and workflow tests (docs/role-based-workflow-design.md, section 11).
 *
 *   npm run test:roles
 *
 * Runs the real Express app against a throw-away in-memory MongoDB (mongodb-memory-server),
 * so it never touches the real database and needs no network except for the first
 * download of the MongoDB binary. The chat agent's tools are tested directly (no LLM call),
 * because the scope is enforced by the tools, not by the model.
 */
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
};

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('civicscan_test');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-role-scope-tests';
  process.env.SIGNED_UPLOADS = 'true';

  const request = require('supertest');
  const mongoose = require('mongoose');
  const app = require(path.join(__dirname, '..', 'server.js'));
  while (mongoose.connection.readyState !== 1) await new Promise((r) => setTimeout(r, 100));

  const User = require('../models/User');
  const Incident = require('../models/Incident');
  const ChatAgent = require('../services/chatAgent');
  const { randomCode } = require('../services/reportCodeService');

  // ---------------------------------------------------------------- fixtures
  const pw = 'correct-horse-battery';
  const hash = await bcrypt.hash(pw, 4);
  await User.create([
    { name: 'Litter Manager', email: 'litter@test.local', role: 'team_manager', team: 'litter', passwordHash: hash },
    { name: 'Road Manager', email: 'road@test.local', role: 'team_manager', team: 'roads', passwordHash: hash },
    { name: 'Municipal Officer', email: 'officer@test.local', role: 'municipal_officer', passwordHash: hash },
    { name: 'Old Admin', email: 'legacy@test.local', role: 'admin', password: 'plain-legacy-password' },
  ]);

  const base = (o) => ({
    title: 'Test',
    location: { type: 'Point', coordinates: [76.9015, 10.9038] },
    address: 'Test Road, Ettimadai',
    imageUrl: '/uploads/test.jpg',
    confidence: 0.8,
    reportedBy: { name: 'Citizen', email: 'citizen@civicscan.org' },
    statusHistory: [{ status: 'Received', note: 'Report received', visibility: 'public' }],
    dispatch: { priority: 50, targetBy: new Date(Date.now() + 3600e3) },
    ...o,
  });
  const code = {};
  const mk = async (key, o) => {
    code[key] = randomCode();
    await Incident.create(base({ reportCode: code[key], ...o }));
  };
  await mk('L1', { category: 'litter', domain: 'civic_waste', severity: 'Medium', status: 'Assigned', team: 'litter', assignedTeam: 'Sanitation Crew A', reassignments: [{ to: 'litter', kind: 'agent' }] });
  await mk('L2', { category: 'litter', domain: 'civic_waste', severity: 'Low', status: 'Assigned', team: 'litter', assignedTeam: 'Sanitation Crew B' });
  await mk('R1', { category: 'pothole', domain: 'road_damage', severity: 'High', status: 'Assigned', team: 'roads', assignedTeam: 'Road Repair Crew 1', reassignments: [{ to: 'roads', kind: 'agent' }] });
  await mk('R2', { category: 'manhole_missing', domain: 'hazard', severity: 'Critical', status: 'Assigned', team: 'roads', assignedTeam: 'Manhole & Drainage Crew', dispatch: { priority: 108, targetBy: new Date(Date.now() - 3600e3) } });
  await mk('H1', { category: 'litter', domain: 'civic_waste', severity: 'Medium', status: 'Needs Review' });
  await mk('H2', { category: 'pothole', domain: 'road_damage', severity: 'High', status: 'Reported' });
  await mk('H3', { category: 'pothole', domain: 'road_damage', severity: 'High', status: 'Needs Review' });

  const login = async (email, password = pw) => request(app).post('/api/auth/login').send({ email, password });
  const tok = {};
  const as = (who) => ({ Authorization: `Bearer ${tok[who]}` });

  console.log('\nPhase 0: login and roles');
  check('wrong password is refused', (await login('litter@test.local', 'nope')).status === 401);
  check('unknown email gets the same message', (await login('ghost@test.local')).body.error === (await login('litter@test.local', 'nope')).body.error);
  for (const [who, email] of [['litter', 'litter@test.local'], ['road', 'road@test.local'], ['officer', 'officer@test.local']]) {
    const r = await login(email);
    tok[who] = r.body.data && r.body.data.token;
    check(`${who} can log in`, r.status === 200 && Boolean(tok[who]));
  }
  const legacy = await login('legacy@test.local', 'plain-legacy-password');
  check('legacy plaintext account logs in once and is mapped to municipal_officer', legacy.status === 200 && legacy.body.data.user.role === 'municipal_officer');
  const legacyDoc = await User.findOne({ email: 'legacy@test.local' }).select('+password').lean();
  check('legacy plaintext password was replaced by a hash', Boolean(legacyDoc.passwordHash) && !legacyDoc.password);
  check('no token -> 401', (await request(app).get('/api/work')).status === 401);
  check('forged token -> 401', (await request(app).get('/api/work').set('Authorization', 'Bearer abc.def.ghi')).status === 401);
  check('manager cannot open the municipal board', (await request(app).get('/api/municipal/board').set(as('litter'))).status === 403);
  check('manager cannot read municipal analytics', (await request(app).get('/api/analytics/municipal').set(as('road'))).status === 403);
  check('manager cannot create users', (await request(app).post('/api/auth/users').set(as('litter')).send({})).status === 403);
  check('weak password refused for new user', (await request(app).post('/api/auth/users').set(as('officer')).send({ name: 'X', email: 'x@test.local', password: 'short', team: 'litter' })).status === 400);
  check('legacy incidents API needs login', (await request(app).get('/api/incidents')).status === 401);
  check('manager cannot use the legacy create route', (await request(app).post('/api/incidents').set(as('road')).send({})).status === 403);
  check('photos are not public without a signed link', (await request(app).get('/uploads/test.jpg')).status === 403);
  check('model comparison needs login', (await request(app).get('/api/municipal/comparison')).status === 401);
  check('manager cannot open model comparison', (await request(app).get('/api/municipal/comparison').set(as('road'))).status === 403);
  check('manager cannot run the comparison models', (await request(app).post('/api/municipal/comparison/upload').set(as('litter'))).status === 403);
  check('public compare endpoints are gone', (await request(app).post('/api/upload/compare-models')).status === 404 && (await request(app).get('/api/upload/models')).status === 404);
  const cmp = await request(app).get('/api/municipal/comparison').set(as('officer'));
  check('officer lists reports for comparison', cmp.status === 200 && Array.isArray(cmp.body.data));

  console.log('\nPhase 1: team scope');
  const lList = await request(app).get('/api/work?status=all').set(as('litter'));
  check('litter manager only sees litter work', lList.body.data.items.length > 0 && lList.body.data.items.every((i) => i.team === 'litter'));
  const sneaky = await request(app).get('/api/work?status=all&team=roads').set(as('litter'));
  check('a team= parameter cannot widen a manager\'s scope', sneaky.body.data.items.every((i) => i.team === 'litter'));
  const rCat = await request(app).get('/api/work?status=all&category=litter').set(as('road'));
  check('road manager asking for litter gets nothing', rCat.body.data.total === 0);
  const outOfScope = await request(app).get(`/api/work/${code.R1}`).set(as('litter'));
  const missing = await request(app).get('/api/work/CS-ZZZZ-ZZZZ').set(as('litter'));
  check('another team\'s item looks exactly like a missing one (404, same message)', outOfScope.status === 404 && outOfScope.body.error === missing.body.error);
  const legacyList = await request(app).get('/api/incidents').set(as('litter'));
  check('legacy incidents list is scoped too', legacyList.body.data.every((i) => i.team === 'litter'));
  check('held items are not in any team queue', !lList.body.data.items.some((i) => i.code === code.H1));
  const detail = await request(app).get(`/api/work/${code.R1}`).set(as('road'));
  check('work item has signed photo link and boxes', detail.status === 200 && /\?exp=\d+&sig=/.test(detail.body.data.imageUrl));
  check('work item never contains the reporter e-mail', !JSON.stringify(detail.body).includes('citizen@civicscan.org'));
  const photo = await request(app).get(detail.body.data.imageUrl);
  check('signed photo link passes the check (404 = file missing, not 403)', photo.status !== 403);

  console.log('\nPhase 2: actions and status rules');
  check('litter manager cannot start a road item', (await request(app).post(`/api/work/${code.R1}/start`).set(as('litter'))).status === 404);
  const both = await Promise.all([
    request(app).post(`/api/work/${code.R1}/start`).set(as('road')),
    request(app).post(`/api/work/${code.R1}/start`).set(as('road')),
  ]);
  check('two simultaneous "start" clicks: exactly one wins, the other gets 409', both.filter((r) => r.status === 200).length === 1 && both.filter((r) => r.status === 409).length === 1);
  check('resolve without a note is refused', (await request(app).post(`/api/work/${code.R1}/resolve`).set(as('road')).field('note', '')).status === 400);
  const res = await request(app).post(`/api/work/${code.R1}/resolve`).set(as('road')).field('note', 'Filled and compacted the pothole');
  check('resolve with a note works', res.status === 200 && res.body.data.status === 'Resolved');
  check('resolving again is refused (409)', (await request(app).post(`/api/work/${code.R1}/resolve`).set(as('road')).field('note', 'again')).status === 409);
  const track = await request(app).get(`/api/track/${code.R1}`);
  check('citizen Track page shows Resolved', track.body.data.status === 'Resolved');
  check('citizen Track page hides internal notes', !JSON.stringify(track.body).includes('Filled and compacted'));

  console.log('\nPhase 3: municipal control');
  const req1 = await request(app).post(`/api/work/${code.L1}/request-reassign`).set(as('litter')).send({ reason: 'This is a broken drain cover, not litter' });
  check('team can ask to reassign', req1.status === 200 && req1.body.data.requests.some((r) => r.state === 'pending'));
  check('a second request while one is pending is refused', (await request(app).post(`/api/work/${code.L1}/request-not-defect`).set(as('litter')).send({ reason: 'not a defect at all' })).status === 409);
  check('the officer sees it in pending requests', (await request(app).get('/api/municipal/requests').set(as('officer'))).body.data.items.some((i) => i.code === code.L1));
  const reqId = req1.body.data.requests.find((r) => r.state === 'pending').id;
  const dec = await request(app).post(`/api/municipal/requests/${code.L1}/${reqId}/decide`).set(as('officer')).send({ approve: true, toTeam: 'roads' });
  check('approving moves the item to the Road team with a road crew', dec.status === 200 && dec.body.data.team === 'roads' && /Road|Manhole|Structural/.test(dec.body.data.crew));
  check('the move is recorded as a "request" reassignment', dec.body.data.reassignments.some((r) => r.kind === 'request' && r.to === 'roads'));
  check('the litter manager no longer sees it', (await request(app).get(`/api/work/${code.L1}`).set(as('litter'))).status === 404);
  check('the road manager now does', (await request(app).get(`/api/work/${code.L1}`).set(as('road'))).status === 200);
  check('deciding the same request twice is refused', (await request(app).post(`/api/municipal/requests/${code.L1}/${reqId}/decide`).set(as('officer')).send({ approve: false })).status === 409);

  const triage = await request(app).get('/api/municipal/triage').set(as('officer'));
  check('triage lists Needs Review and legacy Reported items', [code.H1, code.H2].every((c) => triage.body.data.items.some((i) => i.code === c)));
  const ta = await request(app).post(`/api/municipal/triage/${code.H1}/assign`).set(as('officer')).send({ team: 'litter' });
  check('triage assigns a held item to a team and crew', ta.status === 200 && ta.body.data.status === 'Assigned' && ta.body.data.team === 'litter' && /Sanitation/.test(ta.body.data.crew));
  check('assigning the same held item twice is refused', (await request(app).post(`/api/municipal/triage/${code.H1}/assign`).set(as('officer')).send({ team: 'litter' })).status === 409);
  check('rejecting needs a reason', (await request(app).post(`/api/municipal/triage/${code.H3}/reject`).set(as('officer')).send({})).status === 400);
  const rj = await request(app).post(`/api/municipal/triage/${code.H3}/reject`).set(as('officer')).send({ reason: 'Shadow on the road, no pothole' });
  check('officer can close a held item as not a defect', rj.status === 200 && rj.body.data.status === 'Rejected');
  check('track page shows Closed for a rejected report', (await request(app).get(`/api/track/${code.H3}`)).body.data.status === 'Closed');
  check('manual reassign needs a reason', (await request(app).post(`/api/municipal/work/${code.L2}/reassign`).set(as('officer')).send({ toTeam: 'roads' })).status === 400);
  const mr = await request(app).post(`/api/municipal/work/${code.L2}/reassign`).set(as('officer')).send({ toTeam: 'roads', reason: 'Debris from road works' });
  check('manual reassign works and is logged as manual', mr.status === 200 && mr.body.data.reassignments.some((r) => r.kind === 'manual'));
  const board = await request(app).get('/api/municipal/board').set(as('officer'));
  check('officer board has all four columns', ['needs_review', 'assigned', 'in_progress', 'resolved'].every((k) => board.body.data[k]));

  console.log('\nPhase 4 and 5: analytics, notifications, escalation');
  const ta1 = await request(app).get('/api/analytics/team?team=roads').set(as('litter'));
  check('team analytics are always the manager\'s own team', ta1.body.data.team === 'litter');
  const mun = await request(app).get('/api/analytics/municipal?period=30d').set(as('officer'));
  check('municipal analytics include both teams and the agent KPIs', mun.body.data.teams.litter && mun.body.data.teams.roads && mun.body.data.agent);
  const nl = await request(app).get('/api/notifications/summary').set(as('litter'));
  const no = await request(app).get('/api/notifications/summary').set(as('officer'));
  check('manager badges do not include the triage count', nl.body.data.needsReview === undefined && typeof no.body.data.needsReview === 'number');
  const { escalateOverdue } = require('../services/workflowService');
  const n1 = await escalateOverdue();
  const n2 = await escalateOverdue();
  check('overdue items are escalated once', n1 >= 1 && n2 === 0);

  console.log('\nPhase 6: chat agent tools (no LLM involved)');
  const litterScope = { team: 'litter' };
  const litterTools = ChatAgent.toolsFor(litterScope).map((t) => t.name);
  check('manager gets no officer-only tools', !litterTools.some((n) => ['compare_teams', 'agent_performance', 'triage_queue', 'pending_requests', 'reassignment_history'].includes(n)));
  const searchSchema = ChatAgent.toolsFor(litterScope).find((t) => t.name === 'search_incidents').input_schema;
  check('manager search tool has no team parameter and only litter classes', !searchSchema.properties.team && searchSchema.properties.category.enum.every((c) => ['litter', 'illegal_dumping'].includes(c)));
  const g = await ChatAgent.runTool('get_incident', { code: code.R2 }, litterScope);
  check('get_incident on a road item as litter -> "not visible"', Boolean(g.error) && !JSON.stringify(g).includes('manhole'));
  const s1 = await ChatAgent.runTool('search_incidents', { category: 'pothole', team: 'roads', status: 'all', limit: 50 }, litterScope);
  check('search with road class + team=roads as litter -> nothing', s1.total === 0);
  const s2 = await ChatAgent.runTool('search_incidents', { status: 'all' }, litterScope);
  check('plain search as litter returns only litter items', s2.items.every((i) => /Litter/i.test(i.class)));
  check('officer-only tool called by a manager is refused', Boolean((await ChatAgent.runTool('compare_teams', {}, litterScope)).error));
  const st = await ChatAgent.runTool('team_stats', { team: 'roads' }, litterScope);
  check('team_stats as litter ignores team=roads', st.team === 'litter');
  const sys = ChatAgent.systemFor({ name: 'Litter Manager' }, litterScope);
  check('system prompt states the scope', /only help with litter work/i.test(sys));

  // ---------------------------------------------------------------- database down
  console.log('\nPhase 7: database unavailable');
  check('health reports the database as connected', (await request(app).get('/api/health')).body.database === 'connected');
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const filesBefore = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).length : 0;
  await mongoose.disconnect();
  const refused = await request(app)
    .post('/api/upload/process-image')
    .field('email', 'demo@civicscan.local')
    .attach('image', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'db-down-test.jpg', contentType: 'image/jpeg' });
  check('upload with the database down is refused (503), not faked', refused.status === 503 && refused.body.code === 'DB_UNAVAILABLE' && !refused.body.data);
  check('refused upload leaves no file behind', (fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).length : 0) === filesBefore);
  check('health reports the database as disconnected', (await request(app).get('/api/health')).body.database === 'disconnected');

  console.log(`\n${passed} passed, ${failed} failed`);
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failed ? 1 : 0);
})().catch(async (err) => {
  console.error('test run crashed:', err);
  process.exit(1);
});
