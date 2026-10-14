const fs = require('fs');
const path = require('path');
const ExifService = require('../services/exifService');
const AiInferenceService = require('../services/aiInferenceService');
const Incident = require('../models/Incident');

// Fallback memory list if MongoDB Atlas connection is in mock mode
const incidentController = require('./incidentController');
const { generateUniqueCode } = require('../services/reportCodeService');
const { sendReportConfirmation } = require('../services/emailService');
const DispatchAgent = require('../services/dispatchAgent');
const VerificationAgent = require('../services/verificationAgent');
const ScanLog = require('../models/ScanLog');
const { teamName } = require('../services/teams');
const { sign } = require('../services/imageAccess');
const { normalizeCode } = require('../services/reportCodeService');
const crypto = require('crypto');
const connectDB = require('../config/db');

// A report that cannot be stored must not look accepted: no tracking ID, no e-mail, no "success"
const DB_UNAVAILABLE = {
  success: false,
  code: 'DB_UNAVAILABLE',
  error: 'Your report could not be saved because the CivicScan database is not reachable right now. Nothing was submitted. Please try again in a few minutes.',
};

// The citizen may still move the map pin for a few minutes after uploading. They have no
// account, so the upload response carries a short-lived token bound to this one report.
const EDIT_WINDOW_MS = 30 * 60 * 1000;
const editTokenFor = (code, exp) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev').update(`edit|${code}|${exp}`).digest('base64url');
const issueEditToken = (code) => {
  const exp = Date.now() + EDIT_WINDOW_MS;
  return `${exp}.${editTokenFor(code, exp)}`;
};
const checkEditToken = (code, token) => {
  const [expStr, sig] = String(token || '').split('.');
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !sig) return false;
  const a = Buffer.from(editTokenFor(code, exp));
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Best effort: analytics must never break an upload
const logScan = (row) => ScanLog.create(row).catch((e) => console.warn('[ScanLog] not written:', e.message));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Optional "Enhance photo with GAN" checkbox (multipart text field); anything else means off
const wantsGan = (v) => /^(1|true|on|yes)$/i.test(String(v || '').trim());
const EMAIL_TIMEOUT_MS = 12000;

const removeUpload = async (file) => {
  try {
    if (file && fs.existsSync(file.path)) await fs.promises.unlink(file.path);
  } catch (e) {
    console.warn('[UploadController] Could not remove upload:', e.message);
  }
};

// POST /api/upload/process-image
exports.processImage = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No image file uploaded.' });
    }

    const { userCategoryHint, manualLat, manualLng } = req.body;

    // The citizen's e-mail is required: the report ID is sent there so the report can be tracked later
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      await removeUpload(file);
      return res.status(400).json({
        success: false,
        code: 'EMAIL_REQUIRED',
        error: 'A valid email address is required. We send your report ID there so you can track the report.',
      });
    }

    if (!connectDB.isReady()) {
      await removeUpload(file);
      console.error('[UploadController] Upload refused: the database is not connected.');
      return res.status(503).json(DB_UNAVAILABLE);
    }

    // 1. Execute PyTorch model inference (also extracts native EXIF via PIL).
    // Reports are always decided by RF-DETR, the production model. A citizen cannot choose a
    // weaker detector: any `model` field in the request is ignored.
    const absoluteImagePath = path.resolve(file.path);
    // Optional: restore the photo with RF-DETR's Pix2Pix GAN before detection (citizen's choice, off by default)
    const enhance = wantsGan(req.body.enhance);
    let inferenceResult;
    try {
      inferenceResult = await AiInferenceService.runInference(absoluteImagePath, { model: AiInferenceService.DEFAULT_MODEL, enhance });
    } catch (inferErr) {
      // Never create a report from a guess: tell the citizen the model is offline
      await removeUpload(file);
      console.error(`[UploadController] Inference failed: ${inferErr.message}`);
      return res.status(inferErr.status || 503).json({ success: false, code: inferErr.code || 'MODEL_UNAVAILABLE', error: inferErr.message });
    }
    const detectorResult = inferenceResult; // kept so the report can show what the detector said originally
    const modelName = detectorResult.model;
    // The photo the models read (a HEIC upload is converted to JPEG by the model service)
    const analysedPath = path.join(path.dirname(absoluteImagePath), detectorResult.convertedFilename || file.filename);

    // Every upload also goes through RT-DETR and YOLOv11 for the officer's Comparison view.
    // They run while the verification agent works, and they never decide or dispatch anything.
    // With the GAN on, the same comparison is also run with each model's GAN (reusing the RF-DETR
    // run above), and the plain comparison is run separately so both can be compared.
    const known = { [AiInferenceService.DEFAULT_MODEL]: detectorResult };
    const comparison = (enhance
      ? AiInferenceService.runAllModels(analysedPath, known, { enhance: true }).then(async (ganRows) => ({
          rows: await AiInferenceService.runAllModels(analysedPath),
          ganRows,
        }))
      : AiInferenceService.runAllModels(analysedPath, known).then((rows) => ({ rows, ganRows: null }))
    ).catch((e) => {
      console.warn('[Compare] comparison models did not run:', e.message);
      return { rows: [], ganRows: null };
    });
    const logComparison = (rows) =>
      rows.length &&
      console.log(`[Compare] ${rows.map((r) => (r.available ? `${r.name}: ${r.hasDefect ? `${r.category} @ ${Math.round(r.confidence * 100)}%` : 'clean'} in ${Math.round(r.inferenceMs || 0)}ms` : `${r.name}: n/a`)).join(' | ')}`);

    console.log(
      `[UploadController] ${modelName} Detection: "${inferenceResult.category}" (Defect: ${inferenceResult.hasDefect}, Count: ${inferenceResult.detectionsCount}) in ${inferenceResult.inferenceMs}ms on ${inferenceResult.device}`
    );

    // 2. Read file buffer for EXIF GPS extraction via Node (supplementary)
    let exifData = { hasGps: false, latitude: null, longitude: null, timestamp: new Date().toISOString() };
    try {
      const buffer = await fs.promises.readFile(file.path);
      exifData = await ExifService.extractMetadata(buffer);
    } catch (exifErr) {
      console.warn('[UploadController] Node EXIF read notice:', exifErr.message);
    }

    // Coordinates priority: Python PIL EXIF -> Node ExifService -> Manual body params -> Amrita Ettimadai center
    const pyExif = inferenceResult.exif || {};
    let finalLat, finalLng, hasGps = false;

    if (pyExif.has_gps && typeof pyExif.latitude === 'number' && typeof pyExif.longitude === 'number') {
      finalLat = Number(pyExif.latitude.toFixed(6));
      finalLng = Number(pyExif.longitude.toFixed(6));
      hasGps = true;
      console.log(`[UploadController] 📍 Geolocation resolved via Python PIL: ${finalLat}° N, ${finalLng}° E`);
    } else if (exifData.hasGps && typeof exifData.latitude === 'number' && typeof exifData.longitude === 'number') {
      finalLat = Number(exifData.latitude.toFixed(6));
      finalLng = Number(exifData.longitude.toFixed(6));
      hasGps = true;
      console.log(`[UploadController] 📍 Geolocation resolved via Node ExifService: ${finalLat}° N, ${finalLng}° E`);
    } else if (manualLat && manualLng) {
      finalLat = parseFloat(manualLat);
      finalLng = parseFloat(manualLng);
      hasGps = true;
      console.log(`[UploadController] 📍 Geolocation supplied manually: ${finalLat}° N, ${finalLng}° E`);
    } else {
      finalLat = 10.903824;
      finalLng = 76.901518;
      hasGps = false;
      console.log(`[UploadController] 📍 No GPS metadata found. Defaulting to Amrita Campus: ${finalLat}° N, ${finalLng}° E`);
    }

    // Verification Agent: after the detector has classified the photo and drawn its boxes, a vision LLM
    // checks every box. Wrong labels are corrected, false boxes removed, correct ones kept.
    let aiReview = null;
    const confidentFound =
      inferenceResult.hasDefect && inferenceResult.detectionsCount > 0 && inferenceResult.category !== 'clean';
    // Boxes below the detector threshold: the agent may keep one only if it clearly sees a defect
    const candidates = (inferenceResult.candidates || []).map((b) => ({ ...b, candidate: true }));
    // What the detector itself said: its confident top box, or else its best uncertain guess
    const detectorTop = confidentFound || !candidates.length
      ? { category: detectorResult.category, confidence: detectorResult.confidence }
      : { category: candidates[0].label, confidence: candidates[0].score };
    if (
      (confidentFound || candidates.length) &&
      VerificationAgent.enabled() &&
      (VerificationAgent.mode() === 'all' || !confidentFound || inferenceResult.confidence < DispatchAgent.getMinConfidence())
    ) {
      const boxes = [...(confidentFound ? inferenceResult.bboxes : []), ...candidates];
      const forReview = confidentFound
        ? { ...inferenceResult, bboxes: boxes }
        : { ...inferenceResult, bboxes: boxes, category: boxes[0].label, confidence: boxes[0].score, hasDefect: true, detectionsCount: boxes.length };
      const result = await VerificationAgent.review({
        imagePath: analysedPath,
        detections: boxes,
      });
      aiReview = VerificationAgent.apply(forReview, result);
      console.log(
        `[Verify] ${detectorResult.category} @ ${Math.round(detectorResult.confidence * 100)}% -> ${aiReview.verdict}` +
          `${aiReview.changes.length ? ` (${aiReview.changes.map((c) => `${c.from} -> ${c.to || 'removed'}`).join(', ')})` : ''}` +
          `${aiReview.performed ? ` in ${aiReview.turns} turn(s)` : ` [${aiReview.summary}]`}`
      );
      if (aiReview.performed && aiReview.verdict !== 'removed') inferenceResult = aiReview.detection;
    }
    const detectorFoundDefect =
      inferenceResult.hasDefect && (inferenceResult.bboxes || []).length > 0 && inferenceResult.category !== 'clean';
    const llmSaysClean = Boolean(aiReview && aiReview.performed && aiReview.verdict === 'removed');

    const { rows: modelResults, ganRows: modelResultsGan } = await comparison;
    logComparison(modelResults);
    if (modelResultsGan) logComparison(modelResultsGan.map((r) => ({ ...r, name: `${r.name} + GAN` })));
    // Restored photos written by the GAN runs (deleted again if the photo is discarded)
    const ganFiles = [
      ...new Set(
        [detectorResult.gan && detectorResult.gan.restoredFilename, ...(modelResultsGan || []).map((r) => r.gan && r.gan.restoredFilename)].filter(Boolean)
      ),
    ];
    const ganRecord = enhance
      ? {
          requested: true,
          applied: Boolean(detectorResult.gan && detectorResult.gan.applied),
          name: (detectorResult.gan && detectorResult.gan.name) || null,
          ms: (detectorResult.gan && detectorResult.gan.ms) ?? null,
          reason: (detectorResult.gan && detectorResult.gan.reason) || (detectorResult.gan ? null : 'The model service did not apply the GAN'),
          restoredImageUrl: detectorResult.gan && detectorResult.gan.restoredFilename ? `/uploads/${detectorResult.gan.restoredFilename}` : null,
        }
      : null;
    if (ganRecord) console.log(`[GAN] ${ganRecord.applied ? `${ganRecord.name} applied in ${ganRecord.ms} ms` : `not applied: ${ganRecord.reason}`}`);

    // If image has no civic defects (detector, or the second AI check), discard it immediately
    if (!detectorFoundDefect || llmSaysClean) {
      logScan({
        detectorCategory: detectorResult.category,
        detectorConfidence: detectorResult.confidence,
        reviewVerdict: aiReview ? aiReview.verdict : 'none',
        outcome: llmSaysClean ? 'discarded_by_ai' : 'discarded_clean',
      });
      console.log(`[UploadController] 🗑️ Clean image verified${llmSaysClean ? ` by ${modelName} + second AI check` : ` by ${modelName}`}. Discarding file: ${file.filename}`);
      await removeUpload(file);
      if (analysedPath !== path.resolve(file.path)) await removeUpload({ path: analysedPath });
      for (const f of ganFiles) await removeUpload({ path: path.join(path.dirname(absoluteImagePath), f) });

      return res.json({
        success: true,
        discarded: true,
        message: llmSaysClean
          ? 'A second AI check reviewed the detector findings and found no real civic defect in this photo, so it was not reported.'
          : `No civic hazards or defects detected by ${modelName}. Image verified as clean and discarded.`,
        data: {
          discarded: true,
          aiDetection: inferenceResult,
          metadata: {
            hasGps,
            latitude: finalLat,
            longitude: finalLng,
            address: `Ettimadai, Coimbatore (${Math.abs(finalLat).toFixed(4)}° N, ${Math.abs(finalLng).toFixed(4)}° E)`,
            timestamp: exifData.timestamp || new Date().toISOString(),
          },
        },
      });
    }

    // 3. Static relative and full URL for stored image (supports JPEG converted from HEIC)
    const storedFilename = inferenceResult.convertedFilename || file.filename;
    const relativeImageUrl = `/uploads/${storedFilename}`;

    // 4. Persist location, defect classification, and image into Database
    const incidentPayload = {
      title: `Reported ${inferenceResult.label || inferenceResult.category.replace('_', ' ')}`,
      category: inferenceResult.category,
      domain: inferenceResult.domain,
      severity: inferenceResult.severity,
      status: 'Needs Review',
      location: {
        type: 'Point',
        coordinates: [finalLng, finalLat], // [longitude, latitude] GeoJSON
      },
      address: `Ettimadai, Coimbatore (${Math.abs(finalLat).toFixed(4)}° N, ${Math.abs(finalLng).toFixed(4)}° E)`,
      ward: 'Ettimadai Ward',
      imageUrl: relativeImageUrl,
      confidence: inferenceResult.confidence,
      detectorModel: modelName,
      modelResults,
      ...(modelResultsGan ? { modelResultsGan } : {}),
      ...(ganRecord ? { gan: ganRecord } : {}),
      detectedBboxes: inferenceResult.bboxes.map((b) => ({
        box: b.box,
        label: b.label,
        score: b.score,
      })),
      daysUnresolved: 0,
      assignedTeam: 'Unassigned',
      reportedBy: { name: 'Citizen Reporter', email },
      statusHistory: [{ status: 'Received', note: 'Report received', at: new Date(), by: 'Citizen', role: 'citizen', visibility: 'public' }],
    };

    // Public tracking ID, e.g. CS-7K4M-X9QD
    incidentPayload.reportCode = await generateUniqueCode(async (code) => {
      if (await Incident.exists({ reportCode: code })) return true;
      return incidentController.getMemoryStore().some((i) => i.reportCode === code);
    });

    // Auto-dispatch agent: pick the team + crew and the priority for this report
    const openJobs = async (crewName) => {
      const open = ['Assigned', 'In Progress'];
      try {
        return await Incident.countDocuments({ assignedTeam: crewName, status: { $in: open } });
      } catch {
        return incidentController
          .getMemoryStore()
          .filter((i) => i.assignedTeam === crewName && open.includes(i.status)).length;
      }
    };
    const decision = await DispatchAgent.decide(
      {
        category: inferenceResult.category,
        severity: inferenceResult.severity,
        confidence: inferenceResult.confidence,
        label: inferenceResult.label,
      },
      openJobs,
      { review: aiReview }
    );
    if (aiReview && aiReview.performed) {
      incidentPayload.aiReview = {
        performed: true,
        verdict: aiReview.verdict,
        model: aiReview.model,
        summary: aiReview.summary,
        changes: aiReview.changes,
        notes: aiReview.notes,
        original: detectorTop,
      };
    }
    // Held items belong to the Municipal Officer until triage, so no team sees them yet
    incidentPayload.team = decision.dispatched ? decision.team : undefined;
    incidentPayload.dispatch = {
      mode: 'auto',
      crew: decision.crew || null,
      reason: decision.reason,
      priority: decision.priority,
      targetBy: decision.targetBy || null,
      needsReview: decision.needsReview,
      decidedAt: decision.decidedAt,
    };
    const agent = { by: 'Auto-Dispatch Agent', role: 'agent' };
    if (decision.dispatched) {
      incidentPayload.status = 'Assigned';
      incidentPayload.assignedTeam = decision.crew;
      incidentPayload.reassignments = [
        { from: null, to: decision.team, kind: 'agent', by: agent.by, reason: decision.reason.slice(0, 300), at: new Date() },
      ];
      incidentPayload.statusHistory.push(
        { status: 'Assigned', note: `Assigned to the ${teamName(decision.team)}`, at: new Date(), ...agent, visibility: 'public' },
        { status: 'Assigned', note: `Auto-dispatch: ${decision.reason}`, at: new Date(), ...agent, visibility: 'internal' }
      );
      console.log(`[Dispatch] ${incidentPayload.reportCode}: ${decision.reason}`);
    } else {
      incidentPayload.status = 'Needs Review';
      incidentPayload.statusHistory.push(
        { status: 'Needs Review', note: 'A municipal officer is reviewing your report', at: new Date(), ...agent, visibility: 'public' },
        { status: 'Needs Review', note: `Held for triage: ${decision.reason}`, at: new Date(), ...agent, visibility: 'internal' }
      );
      console.log(`[Dispatch] ${incidentPayload.reportCode}: not dispatched. ${decision.reason}`);
    }

    let savedIncident;
    try {
      savedIncident = await Incident.create(incidentPayload);
      console.log(`[UploadController] Saved incident to MongoDB Atlas with ID: ${savedIncident._id}`);
    } catch (dbErr) {
      // Never pretend: a report kept only in memory would vanish on restart while the citizen
      // already holds its tracking ID. Remove the photos and tell the citizen to try again.
      console.error(`[UploadController] Report NOT saved (${dbErr.message}). Upload refused.`);
      await removeUpload(file);
      if (analysedPath !== path.resolve(file.path)) await removeUpload({ path: analysedPath });
      for (const f of ganFiles) await removeUpload({ path: path.join(path.dirname(absoluteImagePath), f) });
      return res.status(503).json(DB_UNAVAILABLE);
    }

    logScan({
      detectorCategory: detectorResult.category,
      detectorConfidence: detectorResult.confidence,
      reviewVerdict: aiReview ? aiReview.verdict : 'none',
      finalCategory: incidentPayload.category,
      team: decision.dispatched ? decision.team : null,
      outcome: decision.dispatched ? 'assigned' : 'held',
      reportCode: incidentPayload.reportCode,
    });

    // E-mail the report ID (test inbox unless SMTP is configured). A mail failure never loses the report.
    let emailInfo = { sent: false, previewUrl: null };
    try {
      emailInfo = await Promise.race([
        sendReportConfirmation({
          to: email,
          reportCode: incidentPayload.reportCode,
          label: inferenceResult.label || inferenceResult.category.replace('_', ' '),
          severity: inferenceResult.severity,
          area: incidentPayload.ward,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('email timed out')), EMAIL_TIMEOUT_MS)),
      ]);
    } catch (mailErr) {
      console.warn(`[UploadController] Confirmation e-mail not sent for ${incidentPayload.reportCode}: ${mailErr.message}`);
    }

    // Never send the reporter's address back to the browser / dashboard state
    const publicIncident = (typeof savedIncident.toObject === 'function' ? savedIncident.toObject() : { ...savedIncident });
    if (publicIncident.reportedBy) publicIncident.reportedBy = { name: publicIncident.reportedBy.name };
    publicIncident.imageUrl = sign(publicIncident.imageUrl);
    if (publicIncident.gan && publicIncident.gan.restoredImageUrl) {
      publicIncident.gan = { ...publicIncident.gan, restoredImageUrl: sign(publicIncident.gan.restoredImageUrl) };
    }
    // Staff-only details stay on the server
    delete publicIncident.statusHistory;
    delete publicIncident.reassignments;
    publicIncident.editToken = issueEditToken(incidentPayload.reportCode);

    res.json({
      success: true,
      data: {
        incident: publicIncident,
        reportCode: incidentPayload.reportCode,
        email: {
          sent: Boolean(emailInfo.sent),
          to: email,
          testInbox: Boolean(emailInfo.testInbox),
          previewUrl: emailInfo.previewUrl || null,
        },
        imageUrl: sign(relativeImageUrl),
        ...(ganRecord ? { gan: { ...ganRecord, restoredImageUrl: ganRecord.restoredImageUrl ? sign(ganRecord.restoredImageUrl) : null } } : {}),
        metadata: {
          hasGps: hasGps,
          latitude: finalLat,
          longitude: finalLng,
          altitude: (pyExif && pyExif.altitude) ? (String(pyExif.altitude).endsWith('m') ? pyExif.altitude : `${pyExif.altitude}m`) : (exifData.altitude || '336m'),
          timestamp: exifData.timestamp || new Date().toISOString(),
          address: incidentPayload.address,
        },
        aiDetection: inferenceResult,
        aiReview: aiReview && aiReview.performed
          ? {
              verdict: aiReview.verdict,
              model: aiReview.model,
              summary: aiReview.summary,
              changes: aiReview.changes,
              notes: aiReview.notes,
              original: detectorTop,
            }
          : null,
      },
    });
  } catch (err) {
    console.error('[UploadController] Error processing image:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/municipal/comparison/upload  (multipart: image, Municipal Officer only)
// Runs every trained detector on the same photo for the model comparison page. Nothing is
// stored: no report, no e-mail, and the uploaded file is deleted afterwards.
exports.compareModels = async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ success: false, error: 'No image file uploaded.' });
  try {
    const data = await AiInferenceService.compareModels(path.resolve(file.path), { enhance: wantsGan(req.body.enhance) });
    const ran = Object.values(data.results).filter((r) => r.available);
    console.log(
      `[Compare] ${ran.map((r) => `${r.model}: ${r.category} @ ${Math.round((r.confidence || 0) * 100)}% in ${r.inferenceMs}ms`).join(' | ')}`
    );
    res.json({ success: true, data });
  } catch (err) {
    console.error('[Compare] failed:', err.message);
    res.status(err.status || 500).json({ success: false, code: err.code, error: err.message });
  } finally {
    await removeUpload(file);
    // A HEIC upload is also saved as JPEG by the model service
    const jpg = file.path.replace(/\.(heic|heif)$/i, '.jpg');
    if (jpg !== file.path) await removeUpload({ path: jpg });
  }
};

// GET /api/municipal/comparison/models  (Municipal Officer only)
// Every detector with its availability, checkpoint and saved test-set metrics
exports.listModels = async (req, res) => {
  try {
    const data = await AiInferenceService.listModels();
    res.json({ success: true, data: { default: data.default, models: data.models } });
  } catch (err) {
    res.status(503).json({
      success: false,
      code: 'MODEL_UNAVAILABLE',
      error: 'The model service is not running. Start it with: python backend/inference_server.py',
    });
  }
};

// PATCH /api/upload/report/:code/location  { lat, lng, editToken }
// Lets the citizen fix the map pin for 30 minutes after uploading (no account needed).
exports.updateReportLocation = async (req, res) => {
  try {
    const code = normalizeCode(req.params.code);
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!code || !checkEditToken(code, req.body.editToken)) {
      return res.status(403).json({ success: false, error: 'This report can no longer be edited from the upload page.' });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ success: false, error: 'Invalid coordinates.' });
    }
    const updated = await Incident.findOneAndUpdate(
      { reportCode: code },
      {
        $set: {
          location: { type: 'Point', coordinates: [lng, lat] },
          address: `Ettimadai, Coimbatore (${Math.abs(lat).toFixed(4)}° N, ${Math.abs(lng).toFixed(4)}° E)`,
        },
        $push: { statusHistory: { status: 'Location', note: 'Citizen adjusted the map pin', at: new Date(), by: 'Citizen', role: 'citizen', visibility: 'internal' } },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Report not found.' });
    res.json({ success: true, data: { reportCode: code, lat, lng, address: updated.address } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
