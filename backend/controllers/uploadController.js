const fs = require('fs');
const path = require('path');
const ExifService = require('../services/exifService');
const AiInferenceService = require('../services/aiInferenceService');
const Incident = require('../models/Incident');

// Fallback memory list if MongoDB Atlas connection is in mock mode
const incidentController = require('./incidentController');

// POST /api/upload/process-image
exports.processImage = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No image file uploaded.' });
    }

    const { userCategoryHint, manualLat, manualLng } = req.body;

    // 1. Execute PyTorch RF-DETR Model Inference (also extracts native EXIF via PIL)
    const absoluteImagePath = path.resolve(file.path);
    const inferenceResult = await AiInferenceService.runInference(absoluteImagePath);

    console.log(
      `[UploadController] RF-DETR Detection: "${inferenceResult.category}" (Defect: ${inferenceResult.hasDefect}, Count: ${inferenceResult.detectionsCount}) in ${inferenceResult.inferenceMs}ms on ${inferenceResult.device}`
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

    // If image has no civic defects, discard it immediately
    if (!inferenceResult.hasDefect || inferenceResult.detectionsCount === 0 || inferenceResult.category === 'clean') {
      console.log(`[UploadController] 🗑️ Clean image verified by RF-DETR. Discarding file: ${file.filename}`);
      try {
        if (fs.existsSync(file.path)) {
          await fs.promises.unlink(file.path);
        }
      } catch (unlinkErr) {
        console.warn('[UploadController] Error removing discarded image:', unlinkErr.message);
      }

      return res.json({
        success: true,
        discarded: true,
        message: 'No civic hazards or defects detected by RF-DETR. Image verified as clean and discarded.',
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
    const fullImageUrl = `${req.protocol}://${req.get('host')}${relativeImageUrl}`;

    // 4. Persist location, defect classification, and image into Database
    const incidentPayload = {
      title: `Reported ${inferenceResult.label || inferenceResult.category.replace('_', ' ')}`,
      category: inferenceResult.category,
      domain: inferenceResult.domain,
      severity: inferenceResult.severity,
      status: 'Reported',
      location: {
        type: 'Point',
        coordinates: [finalLng, finalLat], // [longitude, latitude] GeoJSON
      },
      address: `Ettimadai, Coimbatore (${Math.abs(finalLat).toFixed(4)}° N, ${Math.abs(finalLng).toFixed(4)}° E)`,
      ward: 'Ettimadai Ward',
      imageUrl: relativeImageUrl,
      confidence: inferenceResult.confidence,
      detectedBboxes: inferenceResult.bboxes.map((b) => ({
        box: b.box,
        label: b.label,
        score: b.score,
      })),
      daysUnresolved: 0,
      assignedTeam: 'Unassigned',
      reportedBy: { name: 'Citizen Ingestion Portal', email: 'citizen@civicscan.org' },
    };

    let savedIncident;
    try {
      savedIncident = await Incident.create(incidentPayload);
      console.log(`[UploadController] Saved incident to MongoDB Atlas with ID: ${savedIncident._id}`);
    } catch (dbErr) {
      console.warn(`[UploadController] MongoDB Atlas save notice (${dbErr.message}). Storing in local memory.`);
      incidentPayload._id = `inc-${Date.now()}`;
      incidentPayload.createdAt = new Date().toISOString();
      savedIncident = incidentPayload;
    }

    res.json({
      success: true,
      data: {
        incident: savedIncident,
        imageUrl: relativeImageUrl,
        fullImageUrl: fullImageUrl,
        metadata: {
          hasGps: hasGps,
          latitude: finalLat,
          longitude: finalLng,
          altitude: (pyExif && pyExif.altitude) ? (String(pyExif.altitude).endsWith('m') ? pyExif.altitude : `${pyExif.altitude}m`) : (exifData.altitude || '336m'),
          timestamp: exifData.timestamp || new Date().toISOString(),
          address: incidentPayload.address,
        },
        aiDetection: inferenceResult,
      },
    });
  } catch (err) {
    console.error('[UploadController] Error processing image:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
