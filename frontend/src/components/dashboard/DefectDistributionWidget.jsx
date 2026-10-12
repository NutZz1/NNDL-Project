import React, { useState } from 'react';
import { PieChart, SlidersHorizontal, Info, Sparkles } from 'lucide-react';

/**
 * 8 Locked Detection Classes in CivicScan:
 * 1: crack_longitudinal
 * 2: crack_transverse
 * 3: crack_alligator
 * 4: pothole
 * 5: crack_structural
 * 6: litter
 * 7: manhole_damaged
 * 8: manhole_missing
 */
const ALL_8_CLASSES = [
  {
    id: 'pothole',
    label: 'Potholes',
    shortLabel: 'Potholes',
    color: '#EF4444', // Red
    benchmarkPct: 42,
    domain: 'Road Damage',
  },
  {
    id: 'litter',
    label: 'Street Litter',
    shortLabel: 'Litter',
    color: '#10B981', // Emerald
    benchmarkPct: 24,
    domain: 'Civic Waste',
  },
  {
    id: 'crack_alligator',
    label: 'Alligator Cracks',
    shortLabel: 'Alligator Cracks',
    color: '#F59E0B', // Amber
    benchmarkPct: 18,
    domain: 'Road Damage',
  },
  {
    id: 'manhole_missing',
    label: 'Missing Manholes',
    shortLabel: 'Missing Covers',
    color: '#B91C1C', // Dark Crimson
    benchmarkPct: 9,
    domain: 'Hazard Covers',
  },
  {
    id: 'manhole_damaged',
    label: 'Damaged Manholes',
    shortLabel: 'Damaged Covers',
    color: '#EA580C', // Orange
    benchmarkPct: 7,
    domain: 'Hazard Covers',
  },
  {
    id: 'crack_structural',
    label: 'Structural Cracks',
    shortLabel: 'Structural',
    color: '#8B5CF6', // Purple
    benchmarkPct: 0,
    domain: 'Structural Damage',
  },
  {
    id: 'crack_longitudinal',
    label: 'Longitudinal Cracks',
    shortLabel: 'Longitudinal',
    color: '#3B82F6', // Blue
    benchmarkPct: 0,
    domain: 'Road Damage',
  },
  {
    id: 'crack_transverse',
    label: 'Transverse Cracks',
    shortLabel: 'Transverse',
    color: '#06B6D4', // Cyan
    benchmarkPct: 0,
    domain: 'Road Damage',
  },
];

// 4 High-level headline categories matching user prompt:
// "42% Potholes • 24% Litter • 18% Alligator Cracks • 16% Hazard Covers"
const HEADLINE_GROUPS = [
  {
    id: 'potholes_grp',
    label: 'Potholes',
    shortLabel: 'Potholes',
    color: '#EF4444',
    benchmarkPct: 42,
    classIds: ['pothole'],
  },
  {
    id: 'litter_grp',
    label: 'Litter',
    shortLabel: 'Litter',
    color: '#10B981',
    benchmarkPct: 24,
    classIds: ['litter'],
  },
  {
    id: 'alligator_grp',
    label: 'Alligator Cracks',
    shortLabel: 'Alligator Cracks',
    color: '#F59E0B',
    benchmarkPct: 18,
    classIds: ['crack_alligator'],
  },
  {
    id: 'hazard_grp',
    label: 'Hazard Covers',
    shortLabel: 'Hazard Covers',
    color: '#EA580C',
    benchmarkPct: 16,
    classIds: ['manhole_missing', 'manhole_damaged'],
  },
];

export default function DefectDistributionWidget({ incidents = [] }) {
  const [viewMode, setViewMode] = useState('headline'); // 'headline' (4 groups) | 'detailed' (8 classes)
  const [hoveredItem, setHoveredItem] = useState(null);

  // Normalize incoming incident category strings
  const normalizeCat = (catStr) => {
    const s = (catStr || '').toLowerCase();
    if (s.includes('pothole')) return 'pothole';
    if (s.includes('litter') || s.includes('trash') || s.includes('waste') || s.includes('dump')) return 'litter';
    if (s.includes('alligator')) return 'crack_alligator';
    if (s.includes('missing')) return 'manhole_missing';
    if (s.includes('damaged') || s.includes('manhole')) return 'manhole_damaged';
    if (s.includes('structur')) return 'crack_structural';
    if (s.includes('longitud')) return 'crack_longitudinal';
    if (s.includes('transver')) return 'crack_transverse';
    return 'pothole';
  };

  const totalIncidents = incidents.length;
  const isLive = totalIncidents > 0;

  // Compute counts for all 8 classes
  const counts8 = {};
  ALL_8_CLASSES.forEach((c) => {
    counts8[c.id] = 0;
  });

  if (isLive) {
    incidents.forEach((inc) => {
      const norm = normalizeCat(inc.category || inc.title);
      if (counts8[norm] !== undefined) {
        counts8[norm]++;
      } else {
        counts8.pothole++;
      }
    });
  }

  // Build active items based on viewMode
  let items = [];
  if (viewMode === 'headline') {
    items = HEADLINE_GROUPS.map((grp) => {
      let count = 0;
      if (isLive) {
        grp.classIds.forEach((cid) => {
          count += counts8[cid] || 0;
        });
      } else {
        count = Math.round((grp.benchmarkPct / 100) * 48); // demo sample total 48
      }
      const pct = isLive
        ? Math.round((count / totalIncidents) * 100)
        : grp.benchmarkPct;

      return {
        id: grp.id,
        label: grp.label,
        shortLabel: grp.shortLabel,
        color: grp.color,
        count,
        pct,
      };
    });
  } else {
    items = ALL_8_CLASSES.map((cls) => {
      const count = isLive
        ? counts8[cls.id] || 0
        : Math.round((cls.benchmarkPct / 100) * 48);
      const pct = isLive
        ? Math.round((count / totalIncidents) * 100)
        : cls.benchmarkPct;

      return {
        id: cls.id,
        label: cls.label,
        shortLabel: cls.shortLabel,
        color: cls.color,
        count,
        pct,
      };
    });
  }

  // Filter items for bar segments (only > 0% for clean bar rendering)
  const nonZeroItems = items.filter((it) => it.pct > 0);

  // SVG Mini Donut calculations
  const radius = 24;
  const circumference = 2 * Math.PI * radius; // ~150.796
  let accumulatedPercent = 0;

  const activeHover = hoveredItem
    ? items.find((it) => it.id === hoveredItem.id)
    : null;

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        position: 'relative',
        minHeight: '202px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: '#ecfdf5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
            }}
          >
            <PieChart size={16} strokeWidth={2.2} />
          </div>
          <div>
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#0f172a',
                lineHeight: 1.2,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Defect Category Distribution
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: isLive ? '#059669' : '#64748b',
                  background: isLive ? '#d1fae5' : '#f1f5f9',
                  padding: '1px 6px',
                  borderRadius: '9999px',
                }}
              >
                {isLive ? `${totalIncidents} Live` : 'Benchmark Baseline'}
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
              8 locked detection classes • AI visual telemetry
            </div>
          </div>
        </div>

        {/* View Mode Toggle Button */}
        <div
          style={{
            display: 'inline-flex',
            background: '#f1f5f9',
            padding: '2px',
            borderRadius: '6px',
            fontSize: '0.68rem',
            fontWeight: 600,
          }}
        >
          <button
            onClick={() => setViewMode('headline')}
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              border: 'none',
              background: viewMode === 'headline' ? '#ffffff' : 'transparent',
              color: viewMode === 'headline' ? '#0f172a' : '#64748b',
              boxShadow: viewMode === 'headline' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            4 Groups
          </button>
          <button
            onClick={() => setViewMode('detailed')}
            style={{
              padding: '3px 8px',
              borderRadius: '4px',
              border: 'none',
              background: viewMode === 'detailed' ? '#ffffff' : 'transparent',
              color: viewMode === 'detailed' ? '#0f172a' : '#64748b',
              boxShadow: viewMode === 'detailed' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            8 Classes
          </button>
        </div>
      </div>

      {/* Main Visual Row: Mini Donut + Horizontal Stacked Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          margin: '8px 0',
        }}
      >
        {/* SVG Mini Donut Chart */}
        <div
          style={{
            position: 'relative',
            width: '62px',
            height: '62px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="62"
            height="62"
            viewBox="0 0 62 62"
            style={{ transform: 'rotate(-90deg)' }}
          >
            {/* Background ring */}
            <circle
              cx="31"
              cy="31"
              r={radius}
              fill="transparent"
              stroke="#f1f5f9"
              strokeWidth="7"
            />
            {/* Colored arcs */}
            {nonZeroItems.map((item) => {
              const strokeDasharray = `${(item.pct / 100) * circumference} ${circumference}`;
              const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
              accumulatedPercent += item.pct;

              const isHovered = hoveredItem && hoveredItem.id === item.id;

              return (
                <circle
                  key={item.id}
                  cx="31"
                  cy="31"
                  r={radius}
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth={isHovered ? 8.5 : 7}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  style={{
                    transition: 'all 0.25s ease',
                    opacity: hoveredItem ? (isHovered ? 1 : 0.35) : 1,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={() => setHoveredItem(item)}
                  onMouseLeave={() => setHoveredItem(null)}
                />
              );
            })}
          </svg>

          {/* Donut Center Display */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              textAlign: 'center',
            }}
          >
            {activeHover ? (
              <>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    color: activeHover.color,
                    lineHeight: 1,
                  }}
                >
                  {activeHover.pct}%
                </span>
                <span
                  style={{
                    fontSize: '0.52rem',
                    color: '#64748b',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    marginTop: '2px',
                    maxWidth: '42px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeHover.shortLabel}
                </span>
              </>
            ) : (
              <>
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    lineHeight: 1,
                  }}
                >
                  100%
                </span>
                <span
                  style={{
                    fontSize: '0.52rem',
                    color: '#94a3b8',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    marginTop: '2px',
                  }}
                >
                  Tally
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right side: Compact Horizontal Distribution Bar & Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Stacked Horizontal Bar */}
          <div
            style={{
              width: '100%',
              height: '11px',
              borderRadius: '9999px',
              background: '#f1f5f9',
              display: 'flex',
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
              gap: '1px',
            }}
          >
            {nonZeroItems.map((item) => {
              const isHovered = hoveredItem && hoveredItem.id === item.id;
              return (
                <div
                  key={item.id}
                  style={{
                    width: `${item.pct}%`,
                    background: item.color,
                    height: '100%',
                    transition: 'all 0.2s ease',
                    opacity: hoveredItem ? (isHovered ? 1 : 0.35) : 1,
                    transform: isHovered ? 'scaleY(1.3)' : 'scaleY(1)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={() => setHoveredItem(item)}
                  onMouseLeave={() => setHoveredItem(null)}
                  title={`${item.label}: ${item.pct}% (${item.count} detections)`}
                />
              );
            })}
          </div>

          {/* Quick hint on bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '5px',
              fontSize: '0.66rem',
              color: '#94a3b8',
            }}
          >
            <span>Class proportion</span>
            <span>Hover segments to inspect</span>
          </div>
        </div>
      </div>

      {/* Breakdown Legend Row: e.g. "42% Potholes • 24% Litter • 18% Alligator Cracks • 16% Hazard Covers" */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px 10px',
          paddingTop: '8px',
          borderTop: '1px solid #f1f5f9',
        }}
      >
        {items.map((item, idx) => {
          const isHovered = hoveredItem && hoveredItem.id === item.id;
          const isLast = idx === items.length - 1;

          return (
            <div
              key={item.id}
              onMouseEnter={() => setHoveredItem(item)}
              onMouseLeave={() => setHoveredItem(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '4px',
                background: isHovered ? '#f8fafc' : 'transparent',
                transition: 'background 0.15s ease',
              }}
            >
              {/* Colored Dot */}
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: item.color,
                  flexShrink: 0,
                  boxShadow: isHovered ? `0 0 6px ${item.color}` : 'none',
                  transition: 'box-shadow 0.2s ease',
                }}
              />

              {/* Percentage & Label */}
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: isHovered ? item.color : '#1e293b',
                  lineHeight: 1,
                }}
              >
                {item.pct}%
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  color: isHovered ? '#0f172a' : '#64748b',
                  fontWeight: isHovered ? 600 : 500,
                  lineHeight: 1,
                }}
              >
                {item.shortLabel}
              </span>

              {/* Bullet separator unless last or hovered */}
              {!isLast && viewMode === 'headline' && (
                <span
                  style={{
                    color: '#cbd5e1',
                    fontSize: '0.7rem',
                    marginLeft: '2px',
                  }}
                >
                  •
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
