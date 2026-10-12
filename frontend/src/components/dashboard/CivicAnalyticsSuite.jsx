import React, { useState } from 'react';
import {
  TrendingUp,
  BarChart3,
  Gauge,
  Users,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
} from 'lucide-react';

// Timeframe datasets for the Line Graph
const TIMEFRAME_DATA = {
  '7d': {
    label: 'Last 7 Days',
    labels: ['Mon 06', 'Tue 07', 'Wed 08', 'Thu 09', 'Fri 10', 'Sat 11', 'Sun 12'],
    detections: [12, 18, 31, 22, 27, 15, 24],
    resolved: [8, 14, 22, 25, 29, 18, 26],
    summaryDetected: 149,
    summaryResolved: 142,
    detectionDelta: '+12.4%',
    resolutionRate: '95.3%',
    mttr: '24.6 hrs',
  },
  '30d': {
    label: 'Last 30 Days',
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    detections: [84, 112, 138, 95],
    resolved: [72, 105, 126, 101],
    summaryDetected: 429,
    summaryResolved: 404,
    detectionDelta: '+8.1%',
    resolutionRate: '94.2%',
    mttr: '26.2 hrs',
  },
  '90d': {
    label: 'Quarterly',
    labels: ['Aug', 'Sep', 'Oct'],
    detections: [320, 395, 440],
    resolved: [290, 370, 422],
    summaryDetected: 1155,
    summaryResolved: 1082,
    detectionDelta: '+14.8%',
    resolutionRate: '93.7%',
    mttr: '28.1 hrs',
  },
};

// Ward defect density data
const WARD_DENSITY = [
  { ward: 'Ettimadai Main Corridor', count: 34, resolved: 28, share: '32%', color: '#3B82F6' },
  { ward: 'Academic Complex & Labs', count: 22, resolved: 19, share: '21%', color: '#059669' },
  { ward: 'Hostels & Mess Perimeter', count: 18, resolved: 15, share: '17%', color: '#F59E0B' },
  { ward: 'Western Bypass Ring Road', count: 16, resolved: 12, share: '15%', color: '#8B5CF6' },
  { ward: 'Railway Station Approach', count: 14, resolved: 11, share: '15%', color: '#EF4444' },
];

// Departmental Dispatch Teams workload
const TEAMS_WORKLOAD = [
  {
    name: 'Road Infrastructure Crew',
    domain: 'Potholes & Road Cracks',
    activeCases: 18,
    capacity: 25,
    status: 'Optimal',
    statusColor: '#059669',
  },
  {
    name: 'Waste & Litter Management',
    domain: 'Street Litter & Dumps',
    activeCases: 14,
    capacity: 20,
    status: 'Optimal',
    statusColor: '#059669',
  },
  {
    name: 'Public Safety & Manhole Crew',
    domain: 'Hazard Covers & Rims',
    activeCases: 6,
    capacity: 10,
    status: 'On Alert',
    statusColor: '#F59E0B',
  },
  {
    name: 'Structural Engineering Team',
    domain: 'Bridges & Retaining Walls',
    activeCases: 3,
    capacity: 8,
    status: 'Ready',
    statusColor: '#059669',
  },
];

export default function CivicAnalyticsSuite({ incidents = [] }) {
  const [timeframe, setTimeframe] = useState('7d');
  const [hoveredPointIndex, setHoveredPointIndex] = useState(null);

  const activeData = TIMEFRAME_DATA[timeframe];
  const { labels, detections, resolved } = activeData;

  // Compute SVG dimensions and coordinates for Line Chart
  const svgWidth = 680;
  const svgHeight = 220;
  const paddingLeft = 45;
  const paddingRight = 25;
  const paddingTop = 20;
  const paddingBottom = 35;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const maxVal = Math.max(...detections, ...resolved) * 1.15 || 40;

  // Helper to map (index, value) to (x, y)
  const getX = (index) => paddingLeft + (index / (labels.length - 1)) * chartWidth;
  const getY = (val) => paddingTop + chartHeight - (val / maxVal) * chartHeight;

  // Generate smooth cubic bezier SVG path
  const generateCurvedPath = (values) => {
    if (values.length === 0) return '';
    const points = values.map((val, idx) => ({ x: getX(idx), y: getY(val) }));

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 2;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (p1.x - p0.x) / 2;
      const cpY2 = p1.y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return path;
  };

  const lineDetectionsPath = generateCurvedPath(detections);
  const lineResolvedPath = generateCurvedPath(resolved);

  // Closed area paths for gradient backgrounds
  const areaDetectionsPath = `${lineDetectionsPath} L ${getX(labels.length - 1)} ${paddingTop + chartHeight} L ${getX(0)} ${paddingTop + chartHeight} Z`;
  const areaResolvedPath = `${lineResolvedPath} L ${getX(labels.length - 1)} ${paddingTop + chartHeight} L ${getX(0)} ${paddingTop + chartHeight} Z`;

  // Grid tick marks
  const yTicks = [0, Math.round(maxVal * 0.33), Math.round(maxVal * 0.66), Math.round(maxVal)];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Trends Line Graph Card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {/* Header with Title and Timeframe Toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#ecfdf5',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrendingUp size={18} strokeWidth={2.2} />
              </div>
              <div>
                <h3
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    margin: 0,
                    lineHeight: 1.2,
                  }}
                >
                  Defect Ingestion & Resolution Velocity
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0 0' }}>
                  Live rate comparing AI visual detections against field repairs
                </p>
              </div>
            </div>
          </div>

          {/* Timeframe Buttons & Series Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {/* Series Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.74rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#EF4444',
                  }}
                />
                <span style={{ fontWeight: 600, color: '#334155' }}>New Detections</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#059669',
                  }}
                />
                <span style={{ fontWeight: 600, color: '#334155' }}>Resolved Cases</span>
              </div>
            </div>

            {/* Timeframe Selector Pill */}
            <div
              style={{
                display: 'inline-flex',
                background: '#f1f5f9',
                padding: '3px',
                borderRadius: '8px',
                gap: '2px',
              }}
            >
              {['7d', '30d', '90d'].map((key) => (
                <button
                  key={key}
                  onClick={() => setTimeframe(key)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: timeframe === key ? '#ffffff' : 'transparent',
                    color: timeframe === key ? '#0f172a' : '#64748b',
                    boxShadow: timeframe === key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {TIMEFRAME_DATA[key].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Analytical Metric Badges Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            marginBottom: '18px',
            padding: '12px 14px',
            background: '#f8fafc',
            borderRadius: '10px',
            border: '1px solid #f1f5f9',
          }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>
              Total Detected ({timeframe})
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                {activeData.summaryDetected}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                <ArrowUpRight size={12} /> {activeData.detectionDelta}
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>
              Cases Resolved ({timeframe})
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669' }}>
                {activeData.summaryResolved}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600 }}>
                {activeData.resolutionRate} efficiency
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>
              Mean Time to Repair (MTTR)
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                {activeData.mttr}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                <ArrowDownRight size={12} /> -18.4% vs baseline
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>
              Hazard SLA Compliance
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669' }}>
                98.2%
              </span>
              <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                &lt; 24h response
              </span>
            </div>
          </div>
        </div>

        {/* SVG Interactive Line Chart Canvas */}
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          >
            <defs>
              {/* Gradients for Area Fills */}
              <linearGradient id="detectionAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#EF4444" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#EF4444" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="resolvedAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines & Y-Axis Labels */}
            {yTicks.map((tickVal) => {
              const y = getY(tickVal);
              return (
                <g key={tickVal}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={svgWidth - paddingRight}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth="1"
                    strokeDasharray={tickVal === 0 ? 'none' : '4 4'}
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="#94a3b8"
                    fontWeight="500"
                  >
                    {tickVal}
                  </text>
                </g>
              );
            })}

            {/* X-Axis Labels */}
            {labels.map((lbl, idx) => {
              const x = getX(idx);
              return (
                <text
                  key={lbl}
                  x={x}
                  y={svgHeight - 10}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="#64748b"
                  fontWeight="500"
                >
                  {lbl}
                </text>
              );
            })}

            {/* Area Fills under curves */}
            <path d={areaDetectionsPath} fill="url(#detectionAreaGrad)" />
            <path d={areaResolvedPath} fill="url(#resolvedAreaGrad)" />

            {/* Line 1: New Detections (Red) */}
            <path
              d={lineDetectionsPath}
              fill="none"
              stroke="#EF4444"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Line 2: Resolved Cases (Green) */}
            <path
              d={lineResolvedPath}
              fill="none"
              stroke="#059669"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Hover Guides & Interactive Points */}
            {labels.map((_, idx) => {
              const x = getX(idx);
              const yDet = getY(detections[idx]);
              const yRes = getY(resolved[idx]);
              const isHovered = hoveredPointIndex === idx;

              return (
                <g
                  key={idx}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredPointIndex(idx)}
                  onMouseLeave={() => setHoveredPointIndex(null)}
                >
                  {/* Invisible wide capture rect for easy hover */}
                  <rect
                    x={x - chartWidth / (labels.length * 2)}
                    y={paddingTop}
                    width={chartWidth / labels.length}
                    height={chartHeight}
                    fill="transparent"
                  />

                  {/* Vertical crosshair line when hovered */}
                  {isHovered && (
                    <line
                      x1={x}
                      y1={paddingTop}
                      x2={x}
                      y2={paddingTop + chartHeight}
                      stroke="#94a3b8"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Points on New Detections line */}
                  <circle
                    cx={x}
                    cy={yDet}
                    r={isHovered ? 5.5 : 3.5}
                    fill="#ffffff"
                    stroke="#EF4444"
                    strokeWidth={isHovered ? 3 : 2}
                    style={{ transition: 'all 0.15s ease' }}
                  />

                  {/* Points on Resolved line */}
                  <circle
                    cx={x}
                    cy={yRes}
                    r={isHovered ? 5.5 : 3.5}
                    fill="#ffffff"
                    stroke="#059669"
                    strokeWidth={isHovered ? 3 : 2}
                    style={{ transition: 'all 0.15s ease' }}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Hover Readout Tooltip Bar */}
        {hoveredPointIndex !== null && (
          <div
            style={{
              marginTop: '10px',
              padding: '8px 14px',
              background: '#0f172a',
              color: '#ffffff',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.76rem',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={14} color="#94a3b8" />
              <span style={{ fontWeight: 600 }}>{labels[hoveredPointIndex]}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div>
                <span style={{ color: '#fca5a5' }}>New Detections: </span>
                <strong style={{ color: '#ffffff' }}>{detections[hoveredPointIndex]}</strong>
              </div>
              <div>
                <span style={{ color: '#86efac' }}>Resolved: </span>
                <strong style={{ color: '#ffffff' }}>{resolved[hoveredPointIndex]}</strong>
              </div>
              <div>
                <span style={{ color: '#94a3b8' }}>Net Backlog: </span>
                <strong
                  style={{
                    color:
                      detections[hoveredPointIndex] - resolved[hoveredPointIndex] > 0
                        ? '#fca5a5'
                        : '#86efac',
                  }}
                >
                  {detections[hoveredPointIndex] - resolved[hoveredPointIndex] > 0 ? '+' : ''}
                  {detections[hoveredPointIndex] - resolved[hoveredPointIndex]}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Two-Column Analytics Row: Ward Density Bar Graph + Team Dispatch Load */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Ward Defect Density (Comparative Horizontal Bar Chart) */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <BarChart3 size={16} strokeWidth={2.2} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                    Ward Defect Concentration
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b' }}>
                    Defects identified vs resolved by campus zone
                  </p>
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 600,
                  color: '#2563eb',
                  background: '#dbeafe',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                Top 5 Zones
              </span>
            </div>

            {/* Horizontal Stacked Bars for Each Ward */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {WARD_DENSITY.map((item) => {
                const total = item.count;
                const maxWard = 36;
                const barWidth = (total / maxWard) * 100;
                const resolvedWidth = (item.resolved / total) * 100;

                return (
                  <div key={item.ward}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.74rem',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#334155' }}>{item.ward}</span>
                      <span style={{ color: '#64748b', fontSize: '0.7rem' }}>
                        <strong style={{ color: '#0f172a' }}>{item.resolved}</strong> / {item.count}{' '}
                        resolved
                      </span>
                    </div>

                    {/* Bar container */}
                    <div
                      style={{
                        height: '8px',
                        background: '#f1f5f9',
                        borderRadius: '9999px',
                        overflow: 'hidden',
                        position: 'relative',
                        width: '100%',
                      }}
                    >
                      <div
                        style={{
                          width: `${barWidth}%`,
                          height: '100%',
                          background: '#e2e8f0',
                          borderRadius: '9999px',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Green resolved portion */}
                        <div
                          style={{
                            width: `${resolvedWidth}%`,
                            height: '100%',
                            background: item.color,
                            borderRadius: '9999px',
                            transition: 'width 0.4s ease',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.7rem',
              color: '#64748b',
            }}
          >
            <span>Primary Hotspot: Ettimadai Main Corridor</span>
            <span style={{ color: '#059669', fontWeight: 600 }}>82.1% Avg Clearance</span>
          </div>
        </div>

        {/* Departmental Team Workload & Dispatch Balancer */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    background: '#fef3c7',
                    color: '#b45309',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Users size={16} strokeWidth={2.2} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>
                    Team Dispatch & Workload Balancer
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b' }}>
                    Live crew capacity across 4 municipal domains
                  </p>
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 600,
                  color: '#059669',
                  background: '#d1fae5',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                }}
              >
                All 4 Active
              </span>
            </div>

            {/* Teams list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {TEAMS_WORKLOAD.map((team) => {
                const loadPct = Math.round((team.activeCases / team.capacity) * 100);
                const isHigh = loadPct > 80;

                return (
                  <div
                    key={team.name}
                    style={{
                      padding: '10px 12px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#0f172a' }}>
                        {team.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          color: team.statusColor,
                        }}
                      >
                        {team.status} ({loadPct}%)
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.68rem',
                        color: '#64748b',
                        marginBottom: '6px',
                      }}
                    >
                      <span>{team.domain}</span>
                      <span>
                        <strong>{team.activeCases}</strong> / {team.capacity} crew load
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div
                      style={{
                        height: '6px',
                        background: '#e2e8f0',
                        borderRadius: '9999px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${loadPct}%`,
                          height: '100%',
                          background: isHigh
                            ? '#dc2626'
                            : loadPct > 65
                            ? '#f59e0b'
                            : '#059669',
                          borderRadius: '9999px',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            style={{
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.7rem',
              color: '#64748b',
            }}
          >
            <span>Total Assigned Field Crew: 41 Personnel</span>
            <span style={{ color: '#059669', fontWeight: 600 }}>Zero Idle Shifts</span>
          </div>
        </div>
      </div>
    </div>
  );
}
