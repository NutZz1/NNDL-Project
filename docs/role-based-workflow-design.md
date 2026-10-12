# CivicScan: role-based workflow, end-to-end design

Status: built (all phases 0-6). See "Running it" at the end for setup.
Builds on what exists: RF-DETR detector, Verification Agent (`services/verificationAgent.js`), Auto-Dispatch Agent (`services/dispatchAgent.js`), report IDs + Track Report page + test-inbox email, `statusHistory`, `aiReview`, `dispatch` on every incident.

---

## 1. The system in one page

```
Citizen ──upload photo + email──▶ [1] RF-DETR detector (classes + boxes)
                                   │
                                   ▼
                              [2] Verification Agent (LLM): keep / relabel / remove each box
                                   │  nothing left → photo discarded
                                   ▼
                              [3] Auto-Dispatch Agent: team + crew + priority + target time
                                   │
                  ┌────────────────┴─────────────────┐
          confident & verified                  unsure / AI disagreement
                  │                                   │
                  ▼                                   ▼
         status: Assigned                     status: Needs Review
   (appears in the team's queue)        (Municipal Officer's triage queue)
                  │                                   │ officer assigns a team or rejects
                  ▼                                   ▼
        Litter Manager  /  Road Manager  ◀───────────┘
        review ▸ start ▸ resolve (or flag wrong team / not a defect)
                  │
                  ▼
        Municipal Officer: sees everything, decides flags, reassigns, reads analytics
                  │
                  ▼
   Citizen: Track Report page (+ email on assignment / resolution)
```

### Users

| Role | `role` | `team` | Can see | Main job |
|---|---|---|---|---|
| Litter Manager | `team_manager` | `litter` | Litter incidents only | Clear litter work assigned by the agent |
| Road Manager | `team_manager` | `roads` | Cracks, potholes, manholes only | Fix road, structural and manhole work |
| Municipal Officer | `municipal_officer` | none | Everything | Oversee both teams, triage, reassign, analytics |
| Citizen | no account | none | Own report by ID (Track Report) | Report and follow up |

Team keys: `litter` (class `litter`) and `roads` (classes `pothole`, `crack_longitudinal`, `crack_transverse`, `crack_alligator`, `crack_structural`, `manhole_damaged`, `manhole_missing`). One shared file `services/teams.js` holds the team keys, display names, classes and crews so the dispatch agent, the scoping code and the chat agent can never disagree.

---

## 2. Incident lifecycle (the contract every phase follows)

### Statuses
`Needs Review` → `Assigned` → `In Progress` → `Resolved`, plus the terminal `Rejected` (not a real defect).
(Existing values `Reported`, `Assigned`, `In Progress`, `Resolved` stay valid; `Reported` is treated as `Needs Review` for old records.)

### Transitions

| From | To | Who | Effect |
|---|---|---|---|
| (upload) | `Assigned` | Auto-Dispatch Agent | team + crew + `dispatch.targetBy`; reassignment log entry kind `agent` |
| (upload) | `Needs Review` | Auto-Dispatch Agent | held: low confidence or the two AIs disagree |
| (upload) | discarded | Verification Agent / detector | no incident; counted in the scan log |
| `Needs Review` | `Assigned` | Municipal Officer | picks team (+ crew, optional category fix) |
| `Needs Review` | `Rejected` | Municipal Officer | closed as not a defect |
| `Assigned` | `In Progress` | Team Manager of that team | `startedAt` set |
| `Assigned` / `In Progress` | `Resolved` | Team Manager of that team | `resolvedAt`, note, optional "after" photo |
| `Assigned` / `In Progress` | (same, request attached) | Team Manager | files a request: *wrong team* or *not a defect*; item stays in their queue, marked "Request pending" |
| any open status | `Assigned` (other team) | Municipal Officer | manual reassign or approving a "wrong team" request; crew chosen by the dispatch agent inside the new team |
| any open status | `Rejected` | Municipal Officer | approving a "not a defect" request |
| `Resolved` | `In Progress` | Municipal Officer | reopen (citizen complaint), reason required |

Rules that apply everywhere:
- Every transition is checked on the server against role, team and current status. An invalid move returns `409`.
- Every transition appends a history entry `{ status, note, by, role, at, visibility }`. `visibility: public` entries appear on the citizen's Track page; `internal` ones (flags, reassignment reasons) do not.
- While a "wrong team" request is pending the SLA clock keeps running (a flag cannot be used to dodge a deadline).
- "Overdue" is computed, not stored: open status and `dispatch.targetBy < now`.

---

## 3. Data model changes (additive, nothing is dropped)

**User** (`models/User.js`)
```
role: 'team_manager' | 'municipal_officer'   (old values accepted during migration)
team: 'litter' | 'roads' | null              (required for team_manager)
passwordHash (bcrypt)  active  lastLoginAt
```

**Incident** (`models/Incident.js`), new fields
```
team: 'litter' | 'roads'            (canonical key; display name comes from teams.js)
assignedTeam: crew name             (existing field, kept: it already holds the crew)
startedAt, resolvedAt
resolution: { note, afterImageUrl, by }
requests: [{ id, kind: 'reassign'|'not_defect', fromTeam, suggestedTeam, reason,
             by, at, state: 'pending'|'approved'|'rejected', decidedBy, decidedAt, decisionNote }]
reassignments: [{ from, to, kind: 'agent'|'request'|'manual', by, reason, at }]   (first entry = the agent's choice)
statusHistory[]: add by, role, visibility
```
Indexes: `{ team, status, 'dispatch.targetBy' }`, `{ reportCode } unique`, `{ createdAt }`.

**ScanLog** (new, tiny, no photo and no email): one row per upload attempt so the agent analytics can count what was discarded
```
at, detectorCategory, detectorConfidence, reviewVerdict, outcome: 'reported'|'discarded_clean'|'discarded_by_ai'|'held'
```

**Migration script** (run once, idempotent): derive `team` from `category`; map `Reported` + `needsReview` to `Needs Review`; seed `reassignments[0]` from existing dispatch data; add `by: 'system'` to old history entries; hash passwords of existing users.

---

## 4. Phase 0: real login and roles (foundation, nothing else is safe without it)

**Why first:** today `protect` lets every request through as one fixed officer and `/register` lets anyone create an admin. Roles that nothing enforces are decoration.

**Backend**
- New dependencies: `bcryptjs`, `jsonwebtoken`. Secret from `JWT_SECRET` (already in `.env`), token life 8 h.
- `POST /api/auth/login` → verifies the bcrypt hash, returns `{ token, user: { name, role, team } }`. Rate-limited (reuse `middlewares/rateLimit.js`).
- `GET /api/auth/me`.
- Middleware: `protect` (verifies token, attaches `req.user`), `requireRole('municipal_officer')`, `scopeTeam` (puts `req.teamScope = req.user.team` or `null` for the officer).
- Lock the routes: all of `/api/incidents` writes, `/api/kpi`, `/api/chat` and later `/api/work`, `/api/municipal`, `/api/analytics` require login. Stay public: `/api/upload`, `/api/track`, `/api/health`.
- Remove open registration; accounts come from `npm run seed:users` (1 Litter Manager, 1 Road Manager, 1 Municipal Officer) or from an officer-only create-user endpoint.

**Frontend**
- `isLoggedIn` boolean becomes a `user` object (kept in memory, token in `sessionStorage` so a refresh keeps the session).
- Login modal calls the real endpoint; 401 anywhere logs out.
- Role-based landing after login: Litter/Road Manager → Team dashboard, Municipal Officer → Overview.
- Route guard: a Litter Manager typing the municipal URL gets "no access".
- Adopt `react-router` here (small change) so every page has a real URL (`/team`, `/work/CS-7K4M-X9QD`, `/municipal`). The email links keep working through the existing `?track=` handling.

**Done when**
- Wrong password → 401, no token. Expired or altered token → 401.
- A Litter Manager token calling any municipal endpoint → 403.
- No endpoint returns incident data without a token (except Track by ID).

---

## 5. Phase 1: team work queue and the work-item review page

**API** (all behind `protect` + `scopeTeam`; the team comes from the token, never from the request)
- `GET /api/work?status=&severity=&class=&overdue=&q=&sort=&page=&limit=` → paged list. Team managers get their team automatically; the officer may add `team=`.
- `GET /api/work/:code` → full item. An item outside the caller's scope returns the same `404` as a code that does not exist.

Item payload: tracking ID, status, severity, category + label, original image URL, detected boxes (`[ymin,xmin,ymax,xmax]`, label, score), address, lat/lng, ward, detector confidence, `aiReview` (verdict, changes, notes), `dispatch` (crew, reason, priority, targetBy), `requests`, `statusHistory`.

**Screens**
1. **Work queue**: table with tracking ID, class, severity badge, address, status, **due-in countdown** (red when overdue), crew. Default sort = priority (severity weight + confidence, already computed by the agent). Filters for status, severity, class, overdue; search by tracking ID or address. Pagination. Empty state: "Nothing pending".
2. **Work item page** (the review screen):
   - Side by side: **Original** | **Detected** (same photo, boxes drawn from the saved box data). Shared zoom and pan, toggle "show boxes", legend of boxes with label and score. On narrow screens the two stack.
   - Location card: Leaflet map with a pin, address, exact coordinates, "Open in Google/OpenStreetMap".
   - AI card: detector class and confidence, the Verification Agent's verdict with its reason, the Dispatch Agent's reason.
   - Timeline (internal entries visible to managers).
   - Action bar (disabled in this phase, enabled in Phase 2).

**Done when**
- A Litter Manager sees only litter items; opening a road item's URL shows "not found".
- The two images line up exactly (box positions match on a rotated phone photo too).
- List loads in under a second for 1,000 incidents (index on `{team,status,dispatch.targetBy}`).

---

## 6. Phase 2: acting on work

**API** (each action checks role, team and the transition table in section 2)
- `POST /api/work/:code/start`
- `POST /api/work/:code/resolve` (multipart: `note` required, `afterPhoto` optional)
- `POST /api/work/:code/request-reassign` `{ reason, suggestedTeam }`
- `POST /api/work/:code/request-not-defect` `{ reason }`
- Concurrency: `findOneAndUpdate` with the expected status in the filter, so two clicks or two users cannot both win (`409` for the loser).

**Screens**
- Action bar on the work item page: **Start work**, **Mark resolved** (opens a form: note + optional after photo, shown side by side with the original afterwards), **Wrong team** and **Not a defect** (reason required). After a request the item shows a "Request pending with Municipal Officer" banner.
- Completed list per team: searchable history with resolution notes and after photos.

**Citizen side**
- Track page timeline shows only `public` entries ("Assigned to …", "Work started", "Resolved").
- Email to the citizen on **assignment** and on **resolution** through the existing `emailService` (test inbox by default; the link opens Track Report).

**Done when**
- A Road Manager cannot start, resolve or flag a litter item (403/404).
- A resolved item shows the note and after photo to the officer and the resolution time on the citizen's Track page.
- Double-click on "Resolve" creates one history entry.

---

## 7. Phase 3: municipal control (triage, all work, reassignment)

**API** (all `requireRole('municipal_officer')`)
- `GET /api/municipal/board` → counts and lists by status and team.
- `GET /api/municipal/triage` → items in `Needs Review`.
- `POST /api/municipal/triage/:code/assign` `{ team, crew?, category? }` / `POST …/reject` `{ reason }`.
- `GET /api/municipal/requests?state=pending`, `POST /api/municipal/requests/:id/decide` `{ approve, toTeam?, note }`.
- `POST /api/work/:code/reassign` `{ toTeam, reason }` (manual, any open item).
- Reassignment calls a new `DispatchAgent.chooseCrew(team, category)` so the crew and target time are recomputed for the new team.

**Screens**
1. **Overview** (landing): both teams side by side (pending, overdue, resolved today) and a city-wide map, plus counters for "needs triage" and "requests pending".
2. **All work board**: columns Needs Review / Assigned / In Progress / Resolved, each card with tracking ID, class, team badge, crew, due-in. Filters by team, severity, overdue.
3. **Triage queue**: each card shows the same side-by-side review view plus the agents' disagreement text (detector vs Verification Agent) and **Assign to Litter / Road** and **Reject**.
4. **Reassignment section**: (a) pending requests from teams with the reason and the evidence (side-by-side view); approve → moves the item, reject → returns it with a note; (b) "Reassign any task": search by tracking ID, choose the team, enter a reason. Every move writes `reassignments[]` (this is also how agent mistakes are counted) and tells the old and the new team.
5. **Completed work** across both teams, with filters.

**Done when**
- A held item can be assigned or rejected and then appears in the right team's queue within one refresh.
- Approving "wrong team" moves the item, assigns a crew from the new team, and the old manager no longer sees it.
- The audit trail shows who reassigned, when and why.

---

## 8. Phase 4: analytics

Endpoints: `GET /api/analytics/team?period=7d|30d` (scoped by token) and `GET /api/analytics/municipal?period=…` (officer only). Computed with MongoDB aggregations, cached for 60 s. Charts: the dashboard has no chart library today, so either add a small one (for example Recharts) or keep the hand-built SVG style of the existing widgets.

**Team dashboard** (only that team's data)

| Metric | Definition |
|---|---|
| Backlog | open items (`Assigned`, `In Progress`) |
| Overdue | backlog with `targetBy < now` |
| Resolved (today / period) | count by `resolvedAt` |
| Mean time to resolve | average of `resolvedAt − createdAt`, resolved in period |
| Within target | resolved with `resolvedAt ≤ targetBy` ÷ resolved |
| By class / severity | counts and average resolution time |
| Created vs resolved | daily trend for 14 days |
| Ageing | open items in 0–1 d, 1–3 d, 3–7 d, 7+ d |
| Crew workload | open items per crew |

**Municipal overview** (both teams, with a comparison view)
- The team metrics above for each team and combined.
- **Agent performance:** auto-dispatch rate (dispatched ÷ all reports), held-for-review rate, **assignment accuracy** (1 − reassigned ÷ auto-dispatched), **false-positive rate** (`Rejected` ÷ reports), Verification Agent correction rate (verdict `corrected`), discards by AI. These come from `reassignments`, `aiReview` and the `ScanLog`.
- Hotspots on the map; intake volume per day.

**Done when:** each number can be reproduced with a direct database query on test data, and a team manager's response never contains the other team's figures.

---

## 9. Phase 5: notifications, escalation and polish

- **In-app badges:** a lightweight `GET /api/notifications/summary` (polled every 30 s): new items for a team, requests pending and held items for the officer.
- **SLA escalation:** a 15-minute job flags items that just became overdue; the officer's overview shows them first and, optionally, emails the officer.
- **Mobile layout** for the work queue and item page (managers use phones in the field).
- **Image access:** move `/uploads` behind signed, expiring URLs so photos are not public by guessable path.
- **Audit export** (CSV) of reassignments and status changes for the officer.
- Accessibility pass (keyboard operation, dialog focus, contrast), loading and error states on every page.

---

## 10. Phase 6: the chat agent (role-scoped search)

The existing chatbot is replaced by an agent that searches real data.

- **Tools** (server-side, Anthropic tool use): `search_incidents`, `get_incident(code)`, `team_stats`; officer only: `compare_teams`, `agent_performance`, `reassignments`, `triage_queue`.
- **Scope is enforced by the server, not by the prompt:** the user's team comes from the login token and is added to every query; any team or class the model asks for is ignored; a manager's tools do not even have a team parameter, and their class list contains only their own classes. A road item's tracking ID returns the same "not found" as a code that does not exist. Totals for a manager are team-only.
- The prompt also states the scope and the polite refusal ("I can only help with litter work"), as a second layer.
- Text from the data (addresses, notes) is data, never instructions. Cap on tool rounds, rate limit, and a log of who asked what.
- Read-only. Answers link to the work item page.
- **Tests that matter:** call every tool as a Litter Manager with road IDs, road classes, other team keys and huge limits (must return nothing); adversarial chat prompts ("ignore your rules", "total number of incidents", "act as the officer") must reveal no road data.

---

## 11. Cross-cutting

**Permission matrix**

| Action | Citizen | Litter/Road Manager | Municipal Officer |
|---|---|---|---|
| Upload, track by ID | yes | yes | yes |
| View queue / item | no | own team | all |
| Start / resolve | no | own team | all (override) |
| Flag wrong team / not a defect | no | own team | n/a (decides) |
| Triage, reassign, reject | no | no | yes |
| Team analytics | no | own team | both |
| City analytics, agent KPIs | no | no | yes |
| Chat | no | own team scope | all |

**Testing strategy**
1. API tests (supertest) with three seeded users: every endpoint × every role × in-scope and out-of-scope items. This is the main safety net.
2. State-machine tests: every valid and invalid transition, including double actions.
3. Agent tests (already built): dispatch routing and the review verdicts; add reassignment-recalculation tests.
4. A short manual script per phase.

**Rollout:** feature flag `AUTH_REQUIRED` during Phase 0 so the frontend and backend can be switched together; run the migration on a copy of the database first; keep the old status values readable.

**Rough effort** (one developer, my estimate): Phase 0 1.5 d · 1 2 d · 2 1.5 d · 3 2.5 d · 4 2 d · 5 1.5 d · 6 1.5 d.

---

## 12. Defaults I chose where the decision was open (change any of them)

1. A "wrong team" request leaves the item in the requesting team's queue, marked pending, until the officer decides.
2. Crews are a fixed list in `services/teams.js`; they have no logins.
3. The "after" photo is optional when resolving; the note is required.
4. Overdue items show in red for managers and are escalated to the officer's overview.
5. Held items (`Needs Review`) belong to the Municipal Officer, not to either team.
6. The chat agent is read-only.

## 13. Known risks

- Uploaded photos are served from a public static path today (Phase 5 fixes this).
- The Verification Agent is advice, not truth: its overrides are logged and counted so its accuracy can be measured, and disagreements go to a person.
- The hard-coded API key fallback in `chatController.js` must be removed before anything is committed (Phase 6 rewrites that file anyway).

---

## Running it

1. Install and configure the backend (`backend/.env` needs `MONGO_URI`, `JWT_SECRET`, `ANTHROPIC_API_KEY`):
   `cd backend && npm install`
2. Preview the data migration, then apply it (idempotent):
   `npm run migrate:workflow` then `npm run migrate:workflow -- --apply`
3. Create the three staff accounts (passwords go to `backend/.seed-credentials.local`, git-ignored):
   `npm run seed:users`
4. Start the backend (`npm start`) and the frontend (`cd ../frontend && npm run dev`).
5. Sign in from "Login": the Municipal Officer lands on the officer console, team managers on their workspace.

Tests: `npm run test:roles` runs 61 role, scope and workflow checks against a throw-away in-memory database.

### Where things live

| Piece | Files |
|---|---|
| Login and roles | `backend/middlewares/auth.js`, `controllers/authController.js`, `scripts/seedUsers.js` |
| Status rules and actions | `backend/services/workflowService.js`, `controllers/workController.js`, `controllers/municipalController.js` |
| Teams, crews, classes | `backend/services/teams.js` |
| Agents | `services/verificationAgent.js`, `services/dispatchAgent.js`, `services/chatAgent.js` |
| Analytics, badges, escalation | `services/analyticsService.js`, `controllers/analyticsController.js`, `workflowService.escalateOverdue` |
| Signed photo links | `services/imageAccess.js` |
| Migration and tests | `scripts/migrateWorkflow.js`, `scripts/roleScopeTest.js` |
| Team manager screens | `frontend/src/pages/TeamWorkspacePage.jsx` |
| Officer screens | `frontend/src/pages/DashboardPage.jsx` (sections added) |
| Shared work screens | `frontend/src/components/work/*` (queue, item review, board, analytics, assistant) |

### Changes from the design

- No `react-router`: the app keeps its state-based navigation (to avoid clashing with the dashboard work in progress); the email link still opens `?track=`.
- Photos are shown with `image-orientation: none` so the boxes line up with the pixels the detector saw.
- The officer's legacy incident modal is still used for old records without a tracking ID; everything with a tracking ID opens the new review screen.
