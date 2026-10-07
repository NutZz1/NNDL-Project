const Incident = require('../models/Incident');
const SpatialService = require('../services/spatialService');

// In-memory store starts empty - zero static fake data
let memoryIncidents = [];

const initMemoryData = () => {
  return memoryIncidents;
};

// GET /api/incidents
exports.getIncidents = async (req, res) => {
  try {
    const { domain, category, status, severity, search } = req.query;
    let results = [];

    try {
      const query = {};
      if (domain && domain !== 'all') query.domain = domain;
      if (category && category !== 'all') query.category = category;
      if (status && status !== 'all') query.status = status;
      if (severity && severity !== 'all') query.severity = severity;
      if (search) query.title = { $regex: search, $options: 'i' };

      results = await Incident.find(query).sort({ createdAt: -1 });
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
      results = data;
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
      incident = await Incident.findById(req.params.id);
    } catch {
      incident = initMemoryData().find((i) => i._id === req.params.id);
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
      updated = await Incident.findByIdAndUpdate(id, { $set: updates }, { new: true });
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
  try {
    const { status, assignedTeam } = req.body;
    let updated;

    try {
      updated = await Incident.findByIdAndUpdate(
        req.params.id,
        { status, assignedTeam, updatedAt: Date.now() },
        { new: true }
      );
    } catch {
      const list = initMemoryData();
      const idx = list.findIndex((i) => i._id === req.params.id);
      if (idx !== -1) {
        list[idx].status = status || list[idx].status;
        list[idx].assignedTeam = assignedTeam || list[idx].assignedTeam;
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
