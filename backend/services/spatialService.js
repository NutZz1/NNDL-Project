/**
 * Spatial Service for GeoJSON Clustering & Ward Assignment
 */
class SpatialService {
  /**
   * Calculates haversine distance in meters between two coordinates
   */
  static haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Clusters incidents for map display (like 8, 6, 2 cluster bubbles in the screenshot)
   */
  static clusterIncidents(incidents, radiusMeters = 500) {
    const clusters = [];
    const visited = new Set();

    incidents.forEach((inc, idx) => {
      if (visited.has(idx)) return;
      const [lng1, lat1] = inc.location.coordinates;
      const clusterMembers = [inc];
      visited.add(idx);

      incidents.forEach((otherInc, otherIdx) => {
        if (visited.has(otherIdx)) return;
        const [lng2, lat2] = otherInc.location.coordinates;
        const dist = this.haversineDistance(lat1, lng1, lat2, lng2);
        if (dist <= radiusMeters) {
          clusterMembers.push(otherInc);
          visited.add(otherIdx);
        }
      });

      clusters.push({
        center: [lat1, lng1],
        count: clusterMembers.length,
        incidents: clusterMembers,
      });
    });

    return clusters;
  }
}

module.exports = SpatialService;
