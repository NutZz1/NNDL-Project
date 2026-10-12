const Incident = require('../models/Incident');
const SpatialService = require('../services/spatialService');
const { sign } = require('../services/imageAccess');
const DispatchAgent = require('../services/dispatchAgent');
const { normalizeTeam, teamForCategory, teamName, crewsFor } = require('../services/teams');

// A team manager only ever sees their own team's incidents (team comes from the login)
const scopeOf = (req) => (req.scope && req.scope.team ? { team: req.scope.team } : {});
const withSignedImage = (doc) => {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  o.imageUrl = sign(o.imageUrl);
  delete o.statusHistory; // staff timelines are served by /api/work
  return o;
};

// In-memory store starts empty - zero static fake data
let memoryIncidents = [];

const initMemoryData = () => {
  return memoryIncidents;
};

// Shared with the upload and tracking controllers so mock mode (no database) still works
exports.getMemoryStore = initMemoryData;

// The reporter's e-mail address is private: never return it from the public API
const PUBLIC_FIELDS = '-reportedBy.email';
const stripEmail = (doc) => {
  if (doc && doc.reportedBy && 'email' in doc.reportedBy) {
    const { email, ...rest } = doc.reportedBy; // eslint-disable-line no-unused-vars
    return { ...doc, reportedBy: rest };
  }
  return doc;
};

// GET /api/incidents
exports.getIncidents = async (req, res) => {
  try {
    const { domain, category, status, severity, search } = req.query;
    let results = [];

    try {
      const query = { ...scopeOf(req) };
      if (domain && domain !== 'all') query.domain = domain;
      if (category && category !== 'all') query.category = category;
      if (status && status !== 'all') query.status = status;
      if (severity && severity !== 'all') query.severity = severity;
      if (search) query.title = { $regex: search, $options: 'i' };

      results = (await Incident.find(query).select(PUBLIC_FIELDS).sort({ createdAt: -1 }).lean()).map(withSignedImage);
    } catch {
      // Use in-memory fallback
      let data = initMemoryData();
      if (domain && domain !== 'all') data = data.filter((i) => i.domain === domain);
      if (category && category !== 'all') data = data.filter((i) => i.category === category);
      if (status && status !== 'all') data = data.filter((i) => i.status === status);
      if (severity && severity !== 'all') data = data.filter((i) => i.severity === severity);
      if (search) {
        data = data.filter(
          (i) =>
            i.title.toLowerCase().includes(search.toLowerCase()) ||
            i.address.toLowerCase().includes(search.toLowerCase())
        );
      }
      results = data.map(stripEmail);
    }

    res.json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/incidents/:id
exports.getIncidentById = async (req, res) => {
  try {
    let incident = null;
    try {
      incident = await Incident.findOne({ _id: req.params.id, ...scopeOf(req) }).select(PUBLIC_FIELDS).lean();
      if (incident) incident = withSignedImage(incident);
    } catch {
      incident = stripEmail(initMemoryData().find((i) => i._id === req.params.id));
    }

    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    res.json({ success: true, data: incident });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/incidents
exports.createIncident = async (req, res) => {
  try {
    const {
      title,
      category,
      domain,
      severity,
      longitude,
      latitude,
      address,
      imageUrl,
      confidence,
      reportedBy,
    } = req.body;

    const rawLng = req.body.longitude !== undefined 
      ? req.body.longitude 
      : (req.body.lng !== undefined ? req.body.lng : (req.body.location?.coordinates ? req.body.location.coordinates[0] : 76.901518));
    const rawLat = req.body.latitude !== undefined 
      ? req.body.latitude 
      : (req.body.lat !== undefined ? req.body.lat : (req.body.location?.coordinates ? req.body.location.coordinates[1] : 10.903824));

    const finalLng = parseFloat(rawLng) || 76.901518;
    const finalLat = parseFloat(rawLat) || 10.903824;

    const newRecord = {
      title: title || `Reported ${category || 'Litter'}`,
      category: category || 'litter',
      domain: domain || 'civic_waste',
      severity: severity || 'Medium',
      status: 'Reported',
      location: {
        type: 'Point',
        coordinates: [finalLng, finalLat],
      },
      address: address || `Ettimadai, Coimbatore (${finalLat.toFixed(4)}° N, ${finalLng.toFixed(4)}° E)`,
      ward: 'Ettimadai Ward',
      imageUrl: imageUrl || 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=600&q=80',
      confidence: confidence || 0.91,
      assignedTeam: 'Unassigned',
      reportedBy: reportedBy || { name: 'Citizen Reporter', email: 'citizen@civicscan.org' },
    };

    let created;
    try {
      created = await Incident.create(newRecord);
    } catch {
      newRecord._id = `inc-${Date.now()}`;
      newRecord.createdAt = new Date().toISOString();
      initMemoryData().unshift(newRecord);
      created = newRecord;
    }

    console.log(
      `📍 [CivicScan Backend] Ingested Defect: "${newRecord.title}" | Coords: Lat ${newRecord.location.coordinates[1]}, Lng ${newRecord.location.coordinates[0]} | Ward: ${newRecord.ward}`
    );

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// PUT /api/incidents/:id
exports.updateIncident = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updatedAt: Date.now() };
    // The tracking ID, its timeline and the reporter's contact can never be edited from the dashboard
    delete updates.reportCode;
    delete updates.statusHistory;
    delete updates.reportedBy;
    delete updates.dispatch;
    delete updates.team;
    delete updates._id;

    // Format location if lat / lng provided
    if (req.body.lat !== undefined && req.body.lng !== undefined) {
      const lat = parseFloat(req.body.lat);
      const lng = parseFloat(req.body.lng);
      updates.location = {
        type: 'Point',
        coordinates: [lng, lat],
      };
      updates.address = `Ettimadai, Coimbatore (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`;
    } else if (req.body.longitude !== undefined && req.body.latitude !== undefined) {
      const lat = parseFloat(req.body.latitude);
      const lng = parseFloat(req.body.longitude);
      updates.location = {
        type: 'Point',
        coordinates: [lng, lat],
      };
      updates.address = `Ettimadai, Coimbatore (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`;
    }

    let updated = null;
    try {
      updated = await Incident.findByIdAndUpdate(id, { $set: updates }, { new: true }).select(PUBLIC_FIELDS);
    } catch {
      const list = initMemoryData();
      const idx = list.findIndex((i) => i._id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updates };
        updated = list[idx];
      }
    }

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// PATCH /api/incidents/:id/status
exports.updateIncidentStatus = async (req, res) => {
  // Legacy route used by the old map pop-up ("Dispatch Crew" / "Mark Cleaned"). It now follows
  // the workflow rules: an assigned item always gets a team (from its class) and a real crew of
  // that team, and every change is recorded. Items with a tracking ID are normally handled
  // through /api/work and /api/municipal instead.
  try {
    const { status, note } = req.body;
    const allowed = ['Assigned', 'In Progress', 'Resolved'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(', ')}` });
    }
    const inc = await Incident.findById(req.params.id);
    if (!inc) return res.status(404).json({ success: false, error: 'Incident not found' });

    const by = { by: req.user ? req.user.name : 'system', role: req.user ? req.user.role : 'system' };
    const now = new Date();
    const set = { status, updatedAt: now };
    const push = { statusHistory: { $each: [] } };

    if (status === 'Assigned') {
      const team = normalizeTeam(inc.team) || teamForCategory(inc.category);
      if (!team) return res.status(400).json({ success: false, error: 'No team handles this defect class.' });
      const validCrews = crewsFor(team).map((c) => c.name);
      const crew = validCrews.includes(req.body.assignedTeam)
        ? { crew: req.body.assignedTeam }
        : await DispatchAgent.chooseCrew(team, inc.category, (name) =>
            Incident.countDocuments({ assignedTeam: name, status: { $in: ['Assigned', 'In Progress'] } })
          );
      Object.assign(set, { team, assignedTeam: crew.crew, 'dispatch.crew': crew.crew });
      if (!(inc.dispatch && inc.dispatch.targetBy)) set['dispatch.targetBy'] = DispatchAgent.targetFor(inc.severity, now);
      if (normalizeTeam(inc.team) !== team) {
        push.reassignments = { from: normalizeTeam(inc.team) || null, to: team, kind: 'manual', by: by.by, reason: 'Assigned from the map', at: now };
      }
      push.statusHistory.$each.push(
        { status, note: `Assigned to the ${teamName(team)}`, at: now, ...by, visibility: 'public' },
        { status, note: `Assigned from the map: ${teamName(team)} / ${crew.crew}`, at: now, ...by, visibility: 'internal' }
      );
    } else if (status === 'Resolved') {
      Object.assign(set, { resolvedAt: now, resolution: { note: note || 'Marked resolved from the map', by: by.by } });
      push.statusHistory.$each.push({ status, note: 'Resolved', at: now, ...by, visibility: 'public' });
    } else {
      Object.assign(set, { startedAt: now });
      push.statusHistory.$each.push({ status, note: 'Work has started on site', at: now, ...by, visibility: 'public' });
    }

    const updated = await Incident.findByIdAndUpdate(inc._id, { $set: set, $push: push }, { new: true }).select(PUBLIC_FIELDS);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

