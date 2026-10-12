import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapPin, Navigation, Info } from 'lucide-react';

export default function LocationPickerMap({ lat, lng, onLocationChange, onUseBrowserLocation }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Leaflet map if not already done
    if (!mapInstanceRef.current) {
      const initialLat = (lat && !isNaN(lat)) ? lat : 10.9038;
      const initialLng = (lng && !isNaN(lng)) ? lng : 76.9015;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 16,
        zoomControl: true,
      });

      L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        attribution: '&copy; Google Maps',
        maxZoom: 21,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      }).addTo(map);

      // Custom Pin Icon
      const pinIcon = L.divIcon({
        className: 'custom-pin-marker',
        html: `<div style="width: 32px; height: 32px; border-radius: 50%; background: #059669; border: 3px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      const marker = L.marker([initialLat, initialLng], { draggable: true, icon: pinIcon }).addTo(map);

      marker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        onLocationChange(Number(newPos.lat.toFixed(6)), Number(newPos.lng.toFixed(6)));
      });

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        onLocationChange(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
    } else {
      // Update existing map and marker
      if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        mapInstanceRef.current.setView([lat, lng], mapInstanceRef.current.getZoom());
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        }
      }
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [lat, lng]);

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        padding: '24px',
        boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
            Geotag Location Verification
          </h4>
          <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
            Extracted from photo EXIF tags. Click map or drag pin to fine-tune exact street position.
          </p>
        </div>

        <button
          type="button"
          onClick={onUseBrowserLocation}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '8px',
            background: '#f1f5f9',
            color: '#0f172a',
            fontSize: '0.82rem',
            fontWeight: 700,
            border: '1px solid #cbd5e1',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#e2e8f0')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#f1f5f9')}
        >
          <Navigation size={14} color="#059669" />
          <span>Use Current GPS</span>
        </button>
      </div>

      {/* Map container */}
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '280px',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '12px',
          fontSize: '0.78rem',
          color: '#64748b',
        }}
      >
        <Info size={14} color="#059669" />
        <span>Selected Location: {lat}° N, {lng}° E (Assigned Sector: Amrita Vishwa Vidyapeetham, Ettimadai)</span>
      </div>
    </div>
  );
}
