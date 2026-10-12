import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Read-only map with one pin, for the work-item page
export default function MiniMap({ lat, lng, height = 220 }) {
  const ref = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!ref.current || typeof lat !== 'number' || typeof lng !== 'number') return undefined;
    const map = L.map(ref.current, { center: [lat, lng], zoom: 17, scrollWheelZoom: false, attributionControl: false });
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20 }).addTo(map);
    L.circleMarker([lat, lng], { radius: 9, color: '#ffffff', weight: 3, fillColor: '#d03b3b', fillOpacity: 1 }).addTo(map);
    mapRef.current = map;
    // the container may have been laid out after mount (inside a dialog)
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng]);

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return <div style={{ height, borderRadius: 10, background: '#f1f5f9', display: 'grid', placeItems: 'center', color: '#64748b' }}>No location</div>;
  }
  return <div ref={ref} role="img" aria-label={`Map of the reported location at ${lat.toFixed(5)}, ${lng.toFixed(5)}`} style={{ height, borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }} />;
}
