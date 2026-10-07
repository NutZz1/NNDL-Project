/**
 * EXIF Geolocation Extraction Service
 * Parses raw image buffers using exifr to pull GPS Latitude, Longitude, Altitude,
 * DateTimeOriginal, Make, and Model.
 * Region anchor: Amrita Vishwa Vidyapeetham, Ettimadai, Coimbatore (10.9038° N, 76.9015° E).
 */

const exifr = require('exifr');

class ExifService {
  /**
   * Extracts location and timestamp metadata from file buffer
   * @param {Buffer} buffer
   */
  static async extractMetadata(buffer) {
    try {
      const parsed = await exifr.parse(buffer, {
        gps: true,
        tiff: true,
        xmp: true,
        mergeOutput: true,
      });

      if (parsed && typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
        return {
          hasGps: true,
          latitude: Number(parsed.latitude.toFixed(6)),
          longitude: Number(parsed.longitude.toFixed(6)),
          altitude: parsed.GPSAltitude ? `${Math.round(parsed.GPSAltitude)}m` : '336m',
          timestamp: parsed.DateTimeOriginal
            ? new Date(parsed.DateTimeOriginal).toISOString()
            : new Date().toISOString(),
          camera: `${parsed.Make || ''} ${parsed.Model || ''}`.trim() || 'Mobile Camera',
        };
      }
    } catch (err) {
      console.warn('[ExifService] Error extracting EXIF:', err.message);
    }

    return {
      hasGps: false,
      latitude: null,
      longitude: null,
      altitude: '336m',
      timestamp: new Date().toISOString(),
      camera: 'Citizen Upload',
    };
  }
}

module.exports = ExifService;
