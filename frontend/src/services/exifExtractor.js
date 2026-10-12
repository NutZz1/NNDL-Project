import exifr from 'exifr';

// Patch exifr's HEIC parser to support modern Apple iOS (iPhone 15/16/17, iOS 17+)
// Bug in exifr: exifr hardcodes `if (i > 50) return false;`, but iOS writes 52-byte ftyp boxes!
try {
  if (exifr && exifr.fileParsers && exifr.fileParsers.has('heic')) {
    const heicParser = exifr.fileParsers.get('heic');
    heicParser.canHandle = function (file, uint16At0) {
      if (uint16At0 !== 0) return false;
      const boxLength = file.getUint16(2);
      if (boxLength > 256) return false;
      let offset = 16;
      const brands = [];
      while (offset < boxLength) {
        brands.push(file.getString(offset, 4));
        offset += 4;
      }
      return brands.includes(this.type) || brands.includes('heic') || brands.includes('mif1') || brands.includes('heix');
    };
  }
} catch (err) {
  console.warn('[CivicScan HEIC Patch Notice]:', err);
}

/**
 * Extracts GPS coordinates and camera metadata from image file (JPEG, PNG, HEIC)
 * @param {File} file
 * @returns {Promise<{hasGps: boolean, lat: number|null, lng: number|null, altitude: string|null, timestamp: string, camera: string}>}
 */
export async function extractExifFromImage(file) {
  console.log(
    `%c📍 [CivicScan EXIF Ingest] Reading metadata from file: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)...`,
    'background: #059669; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px;'
  );

  try {
    // 1. Comprehensive EXIF parse
    const exifData = await exifr.parse(file, {
      gps: true,
      tiff: true,
      xmp: true,
      mergeOutput: true,
    });

    console.log('[CivicScan EXIF Raw Parser Output]:', exifData);

    // 2. Direct GPS helper fallback if needed
    let lat = null;
    let lng = null;

    if (exifData && typeof exifData.latitude === 'number' && typeof exifData.longitude === 'number') {
      lat = Number(exifData.latitude.toFixed(6));
      lng = Number(exifData.longitude.toFixed(6));
    } else {
      const gpsResult = await exifr.gps(file);
      if (gpsResult && typeof gpsResult.latitude === 'number' && typeof gpsResult.longitude === 'number') {
        lat = Number(gpsResult.latitude.toFixed(6));
        lng = Number(gpsResult.longitude.toFixed(6));
      }
    }

    if (lat !== null && lng !== null) {
      const altitude = exifData?.GPSAltitude ? `${Math.round(exifData.GPSAltitude)}m` : 'N/A';
      const timestamp = exifData?.DateTimeOriginal
        ? new Date(exifData.DateTimeOriginal).toLocaleString()
        : new Date().toLocaleString();
      const camera =
        exifData?.Make || exifData?.Model
          ? `${exifData.Make || ''} ${exifData.Model || ''}`.trim()
          : 'Apple iPhone / Digital Camera';

      console.log(
        `%c🎯 [EXIF GPS SUCCESS] Extracted Coordinates:
---------------------------------------------
📍 Latitude:     ${lat}
📍 Longitude:    ${lng}
⛰️  Altitude:     ${altitude}
🕒 Captured At:   ${timestamp}
📷 Camera Model:  ${camera}
🗺️  Google Maps:  https://www.google.com/maps?q=${lat},${lng}
---------------------------------------------`,
        'background: #ecfdf5; color: #047857; font-weight: bold; font-size: 13px; padding: 6px 10px; border-left: 4px solid #10b981;'
      );

      return {
        hasGps: true,
        lat,
        lng,
        altitude,
        timestamp,
        camera,
      };
    }
  } catch (err) {
    console.error('❌ [CivicScan EXIF Parsing Notice]:', err);
  }

  // Warning when image does not have GPS metadata
  console.warn(
    `%c⚠️ [NO GPS DETECTED IN IMAGE]
-------------------------------------------------------------------
File "${file.name}" does NOT contain EXIF GPS coordinates.
Why this happens:
1. Sent via WhatsApp/Telegram as a standard photo (WhatsApp scrubs GPS metadata).
   -> Tip: Send as a 'Document' on WhatsApp to preserve GPS tags!
2. Camera Location permission was turned OFF on the phone when taking the photo.
3. Screenshots or web images do not contain camera GPS tags.

Action: CivicScan will use the default pin location and allow you to:
- Click "Use Current GPS"
- Drag/click the pin on the map to set the exact street location.
-------------------------------------------------------------------`,
    'background: #fffbeb; color: #b45309; font-weight: bold; font-size: 12px; padding: 6px 10px; border-left: 4px solid #f59e0b;'
  );

  return {
    hasGps: false,
    lat: null,
    lng: null,
    altitude: null,
    timestamp: new Date().toLocaleString(),
    camera: 'Unknown Device / Stripped Metadata',
  };
}
