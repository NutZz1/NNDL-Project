import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { ZoomIn, ZoomOut, Compass, Layers, Map as MapIcon, Globe } from 'lucide-react';
import { resolveImageUrl, handleImageError } from '../../services/imageService';

const MAP_LAYERS = {
  googleStreets: {
    id: 'googleStreets',
    label: 'Google Streets',
    icon: '🗺️',
    url: 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
    maxZoom: 21,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
  },
  googleHybrid: {
    id: 'googleHybrid',
    label: 'Satellite Hybrid',
    icon: '🛰️',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Satellite Imagery',
    maxZoom: 21,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
  },
  voyager: {
    id: 'voyager',
    label: 'Clean Modern',
    icon: '🌿',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB Voyager',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c', 'd'],
  },
};

export default function CivicMap({ incidents = [], onSelectIncident, selectedIncident }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersGroupRef = useRef(null);
  const tileLayerRef = useRef(null);

  const [activeLayer, setActiveLayer] = useState('googleStreets');
  const [hoveredData, setHoveredData] = useState(null); // { incident, x, y }
  const [showBboxes, setShowBboxes] = useState(true);
  const hoverTimerRef = useRef(null);

  // Handle layer switching
  const handleLayerChange = (layerKey) => {
    setActiveLayer(layerKey);
    if (tileLayerRef.current && MAP_LAYERS[layerKey]) {
      tileLayerRef.current.setUrl(MAP_LAYERS[layerKey].url);
    }
  };

  // 1. Initialize Leaflet map once on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [10.9038, 76.9015],
        zoom: 16,
        zoomControl: false,
      });

      const tileLayer = L.tileLayer(MAP_LAYERS[activeLayer]?.url || MAP_LAYERS.googleStreets.url, {
        attribution: MAP_LAYERS.googleStreets.attribution,
        maxZoom: 21,
        subdomains: MAP_LAYERS.googleStreets.subdomains,
      }).addTo(map);

      tileLayerRef.current = tileLayer;
      mapInstanceRef.current = map;
      markersGroupRef.current = L.layerGroup().addTo(map);

      map.on('movestart zoomstart', () => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        setHoveredData(null);
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Update markers when incidents, filters, or active incident changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();
    const validLatLngs = [];

    if (Array.isArray(incidents)) {
      incidents.forEach((inc) => {
        if (!inc) return;

        // Safe coordinate parsing supporting both flat and GeoJSON objects
        const rawLat = inc.lat ?? (inc.location?.coordinates ? inc.location.coordinates[1] : null);
        const rawLng = inc.lng ?? (inc.location?.coordinates ? inc.location.coordinates[0] : null);
        const lat = typeof rawLat === 'number' ? rawLat : parseFloat(rawLat);
        const lng = typeof rawLng === 'number' ? rawLng : parseFloat(rawLng);

        if (isNaN(lat) || isNaN(lng)) return;

        validLatLngs.push([lat, lng]);

        let iconSvg = '';
        let borderColor = '#059669';

        if (inc.domain === 'hazard' || inc.category?.includes('manhole')) {
          borderColor = '#ef4444';
          iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        } else if (inc.domain === 'road_damage') {
          borderColor = '#3b82f6';
          iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
        } else {
          borderColor = '#059669';
          iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`;
        }

        const incId = inc.id || inc._id;
        const selectedId = selectedIncident?.id || selectedIncident?._id;
        const isSelected = Boolean(selectedId && selectedId === incId);

        // Marker with live animated radar ping beacon
        const pinIcon = L.divIcon({
          className: 'civic-marker-pin',
          html: `
            <div class="civic-marker-wrapper">
              <div class="civic-pin-radar-ring" style="background: ${borderColor}35; border: 1.5px solid ${borderColor};"></div>
              <div class="civic-pin-radar-ring delayed" style="background: ${borderColor}20; border: 1px solid ${borderColor};"></div>
              <div style="
                position: relative;
                z-index: 2;
                width: ${isSelected ? '38px' : '32px'};
                height: ${isSelected ? '38px' : '32px'};
                background: #ffffff;
                border: 2.5px solid ${isSelected ? '#0f172a' : borderColor};
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 10px rgba(0,0,0,0.25);
                cursor: pointer;
                transform: ${isSelected ? 'scale(1.2)' : 'scale(1)'};
                transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
              ">${iconSvg}</div>
            </div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([lat, lng], { icon: pinIcon }).addTo(markersGroup);

        // Click handler to open assignment modal
        marker.on('click', () => {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          setHoveredData(null);
          onSelectIncident(inc);
        });

        // Mouseover handler for instant hover preview
        marker.on('mouseover', () => {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          const point = map.latLngToContainerPoint([lat, lng]);
          setHoveredData({
            incident: inc,
            x: point.x,
            y: point.y,
          });
        });

        // Mouseout handler with grace period
        marker.on('mouseout', () => {
          hoverTimerRef.current = setTimeout(() => {
            setHoveredData(null);
          }, 400);
        });
      });
    }

    // Smoothly pan or frame visible markers
    if (validLatLngs.length > 0) {
      if (validLatLngs.length === 1) {
        map.panTo(validLatLngs[0], { animate: true });
      } else {
        const bounds = L.latLngBounds(validLatLngs);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17, animate: true });
        }
      }
    }
  }, [incidents, selectedIncident, onSelectIncident]);

  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  const handleResetCenter = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.setView([10.9038, 76.9015], 16);
  };

  // Helper for safe bounding boxes
  const getBboxes = (inc) => {
    if (!inc) return [];
    if (Array.isArray(inc.detectedBboxes) && inc.detectedBboxes.length > 0) return inc.detectedBboxes;
    if (Array.isArray(inc.bboxes) && inc.bboxes.length > 0) return inc.bboxes;
    return [
      {
        box: [0.22, 0.2, 0.78, 0.8],
        label: inc.category || 'defect',
        score: inc.confidence || 0.92,
      },
    ];
  };

  const hoveredInc = hoveredData?.incident;
  const hoveredBboxes = hoveredInc ? getBboxes(hoveredInc) : [];

  const getThemeColor = (inc) => {
    if (!inc) return '#059669';
    if (inc.domain === 'hazard' || inc.category?.includes('manhole')) return '#ef4444';
    if (inc.domain === 'road_damage') return '#3b82f6';
    return '#059669';
  };
  const themeColor = getThemeColor(hoveredInc);

  // Calculate smart anchor coordinates inside container
  const mapW = mapContainerRef.current?.clientWidth || 900;
  const mapH = mapContainerRef.current?.clientHeight || 620;

  const cardW = 340;
  const cardH = 340;
  const isRightEdge = hoveredData ? hoveredData.x > mapW - cardW - 20 : false;
  const isTopEdge = hoveredData ? hoveredData.y < cardH + 20 : false;

  const cardLeft = hoveredData
    ? isRightEdge
      ? Math.max(16, hoveredData.x - cardW - 14)
      : Math.min(mapW - cardW - 16, hoveredData.x + 16)
    : 0;
  const cardTop = hoveredData
    ? isTopEdge
      ? Math.min(mapH - cardH - 16, hoveredData.y + 14)
      : Math.max(16, hoveredData.y - cardH + 10)
    : 0;

  return (
    <div
      style={{
        position: 'relative',
        height: '620px',
        width: '100%',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
        background: '#e5e7eb',
      }}
    >
      {/* Map Element */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Hover Inspection HUD Card */}
      {hoveredData && hoveredInc && (
        <div
          onMouseEnter={() => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          }}
          onMouseLeave={() => {
            hoverTimerRef.current = setTimeout(() => {
              setHoveredData(null);
            }, 300);
          }}
          style={{
            position: 'absolute',
            left: `${cardLeft}px`,
            top: `${cardTop}px`,
            width: `${cardW}px`,
            zIndex: 600,
            background: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 18px 40px -10px rgba(0,0,0,0.28)',
            overflow: 'hidden',
            animation: 'fadeIn 0.18s ease-out',
            pointerEvents: 'auto',
          }}
        >
          {/* Card Top Info Bar */}
          <div
            style={{
              padding: '10px 14px',
              background: '#f8fafc',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: themeColor,
                }}
              />
              <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                {(hoveredInc.category || 'defect').replace('_', ' ')}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  background: themeColor,
                  padding: '2px 7px',
                  borderRadius: '9999px',
                }}
              >
                {Math.round((hoveredInc.confidence || 0.92) * 100)}% AI
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: '#475569',
                  background: '#e2e8f0',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                {hoveredInc.severity || 'Medium'}
              </span>
            </div>
          </div>

          {/* Card Image Area with Bounding Box Overlay & Toggle */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '175px',
              background: '#0f172a',
              overflow: 'hidden',
            }}
          >
            <img
              src={resolveImageUrl(hoveredInc.imageUrl, hoveredInc.category)}
              alt={hoveredInc.title}
              onError={(e) => handleImageError(e, hoveredInc.category)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />

            {/* Bounding Box Overlays when showBboxes is true */}
            {showBboxes &&
              hoveredBboxes.map((b, idx) => {
                const box = b.box || [0.2, 0.2, 0.8, 0.8];
                const top = box[0] * 100;
                const left = box[1] * 100;
                const height = (box[2] - box[0]) * 100;
                const width = (box[3] - box[1]) * 100;

                return (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      top: `${top}%`,
                      left: `${left}%`,
                      width: `${width}%`,
                      height: `${height}%`,
                      border: `2.5px solid ${themeColor}`,
                      background: `${themeColor}22`,
                      borderRadius: '4px',
                      boxShadow: `0 0 10px ${themeColor}90`,
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '-18px',
                        left: 0,
                        background: themeColor,
                        color: '#ffffff',
                        fontSize: '9px',
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      }}
                    >
                      {(b.label || hoveredInc.category).replace('_', ' ')} {b.score ? `${Math.round(b.score * 100)}%` : ''}
                    </span>
                  </div>
                );
              })}

            {/* In-Image Toggle Button Bar: Bounding Boxes vs Clear Image */}
            <div
              style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                zIndex: 10,
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(6px)',
                borderRadius: '8px',
                padding: '3px',
                display: 'flex',
                gap: '3px',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBboxes(true);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '5px',
                  fontSize: '0.68rem',
                  fontWeight: showBboxes ? 800 : 500,
                  background: showBboxes ? themeColor : 'transparent',
                  color: '#ffffff',
                  transition: 'all 0.15s ease',
                }}
              >
                🎯 Boxes
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBboxes(false);
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '5px',
                  fontSize: '0.68rem',
                  fontWeight: !showBboxes ? 800 : 500,
                  background: !showBboxes ? '#475569' : 'transparent',
                  color: '#ffffff',
                  transition: 'all 0.15s ease',
                }}
              >
                🖼️ Clear Image
              </button>
            </div>
          </div>

          {/* Card Body & Location */}
          <div style={{ padding: '12px 14px' }}>
            <div
              style={{
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#1e293b',
                marginBottom: '4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {hoveredInc.title}
            </div>
            <div
              style={{
                fontSize: '0.74rem',
                color: '#64748b',
                marginBottom: '10px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              📍 {hoveredInc.address || 'Ettimadai, Coimbatore'}
            </div>

            {/* Action CTA Button */}
            <button
              onClick={() => {
                setHoveredData(null);
                onSelectIncident(hoveredInc);
              }}
              style={{
                width: '100%',
                padding: '8px',
                background: '#0f172a',
                color: '#ffffff',
                borderRadius: '8px',
                fontSize: '0.76rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(15,23,42,0.15)',
              }}
            >
              <span>Inspect Full Ticket & Assign Crew</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Map Theme / Layer Selector (Top Left) */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          zIndex: 400,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          borderRadius: '10px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          padding: '4px',
          display: 'flex',
          gap: '4px',
        }}
      >
        {Object.values(MAP_LAYERS).map((layer) => {
          const isCurrent = activeLayer === layer.id;
          return (
            <button
              key={layer.id}
              onClick={() => handleLayerChange(layer.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: isCurrent ? 700 : 600,
                background: isCurrent ? '#059669' : 'transparent',
                color: isCurrent ? '#ffffff' : '#334155',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{layer.icon}</span>
              <span>{layer.label}</span>
            </button>
          );
        })}
      </div>

      {/* Floating Map Controls (Top Right) */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 400,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={handleZoomIn}
            style={{
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: '1px solid #e2e8f0',
              color: '#334155',
            }}
            title="Zoom In"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={handleZoomOut}
            style={{
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#334155',
            }}
            title="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
        </div>

        <button
          onClick={handleResetCenter}
          style={{
            background: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#059669',
          }}
          title="Recenter to Amrita Campus"
        >
          <Compass size={18} />
        </button>
      </div>

      {/* Floating Legend Pill matching screenshot */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          zIndex: 400,
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(8px)',
          borderRadius: '10px',
          padding: '10px 16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '0.78rem',
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#059669' }} />
          <span>Civic Waste (Litter)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }} />
          <span>Road Damage (Potholes/Cracks)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
          <span>Hazard (Missing Manholes)</span>
        </div>
      </div>
    </div>
  );
}
