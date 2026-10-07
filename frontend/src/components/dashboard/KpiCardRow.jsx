import React from 'react';
import {
  Layers,
  Clock,
  Truck,
  CheckCircle2,
  AlertOctagon,
  ArrowUpRight,
} from 'lucide-react';

export default function KpiCardRow({ kpis = {}, incidents = [] }) {
  // Compute real CivicScan product metrics dynamically from live incidents
  const totalCount = incidents.length;

  const pendingCount = incidents.filter(
    (i) =>
      (i.status || '').toLowerCase().includes('report') ||
      (i.status || '').toLowerCase().includes('pend')
  ).length;

  const inProgressCount = incidents.filter(
    (i) =>
      (i.status || '').toLowerCase().includes('progress') ||
      (i.status || '').toLowerCase().includes('dispatch')
  ).length;

  const resolvedCount = incidents.filter((i) =>
    (i.status || '').toLowerCase().includes('resolve')
  ).length;

  const criticalCount = incidents.filter(
    (i) =>
      (i.severity || '').toLowerCase() === 'critical' ||
      (i.severity || '').toLowerCase() === 'high' ||
      (i.category || '').includes('missing')
  ).length;

  const lowCount = incidents.filter(
    (i) => (i.severity || '').toLowerCase() === 'low'
  ).length;

  return (
    <div style={{ padding: '0 32px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 5 Product KPI Cards Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '16px',
        }}
        className="kpi-grid"
      >
        {/* Card 1: Total Defects Detected */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '110px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            transition: 'transform 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Layers size={20} color="#334155" strokeWidth={1.8} />
            <ArrowUpRight size={16} color="#94a3b8" />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: '6px' }}>
              Total Defects Detected
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
              {totalCount}
            </div>
          </div>
        </div>

        {/* Card 2: Pending Review (Amber outline highlight) */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1.5px solid #f59e0b',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '110px',
            boxShadow: '0 1px 4px rgba(245, 158, 11, 0.1)',
            transition: 'transform 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Clock size={20} color="#f59e0b" strokeWidth={1.8} />
            <ArrowUpRight size={16} color="#f59e0b" />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: '6px' }}>
              Pending Review
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
              {pendingCount}
            </div>
          </div>
        </div>

        {/* Card 3: Dispatched Crews (Low & Critical badges) */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '110px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            transition: 'transform 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Truck size={20} color="#334155" strokeWidth={1.8} />
            <ArrowUpRight size={16} color="#94a3b8" />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: '8px' }}>
              Dispatched Crews
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
                {inProgressCount}
              </span>
              <span
                style={{
                  background: '#fef3c7',
                  color: '#92400e',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '4px',
                }}
              >
                {lowCount} Low
              </span>
              <span
                style={{
                  background: '#fee2e2',
                  color: '#b91c1c',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '4px',
                }}
              >
                {criticalCount} Critical
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Cases Resolved */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '110px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            transition: 'transform 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <CheckCircle2 size={20} color="#059669" strokeWidth={1.8} />
            <ArrowUpRight size={16} color="#94a3b8" />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: '6px' }}>
              Cases Resolved
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>
              {resolvedCount}
            </div>
          </div>
        </div>

        {/* Card 5: Critical Hazards */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '110px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            transition: 'transform 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <AlertOctagon size={20} color="#dc2626" strokeWidth={1.8} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500, marginBottom: '6px' }}>
              Critical Hazards
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#dc2626', lineHeight: 1 }}>
              {criticalCount}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 1200px) {
          .kpi-grid {
            grid-template-columns: repeat(3, 1fr) !important;
          }
        }
        @media (max-width: 768px) {
          .kpi-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

