import React from 'react';
import { Filter, ShieldAlert, Trash2, Activity } from 'lucide-react';

export default function FilterBar({
  selectedDomain,
  onDomainChange,
  totalCount,
}) {
  const domains = [
    { id: 'all', label: 'All Issues', icon: <Filter size={14} /> },
    { id: 'civic_waste', label: 'Waste & Litter', icon: <Trash2 size={14} /> },
    { id: 'road_damage', label: 'Road Damage', icon: <Activity size={14} /> },
    { id: 'hazard', label: 'Hazards & Manholes', icon: <ShieldAlert size={14} /> },
  ];

  return (
    <div
      style={{
        padding: '0 32px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      {/* Category Domain Buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {domains.map((dom) => {
          const isActive = selectedDomain === dom.id;
          return (
            <button
              key={dom.id}
              onClick={() => onDomainChange(dom.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 600,
                background: isActive ? '#0f172a' : '#ffffff',
                color: isActive ? '#ffffff' : '#475569',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                transition: 'all 0.15s ease',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: isActive ? '#10b981' : '#64748b' }}>{dom.icon}</span>
              <span>{dom.label}</span>
            </button>
          );
        })}
      </div>

      {/* Incident Count Badge */}
      <div
        style={{
          fontSize: '0.82rem',
          fontWeight: 600,
          color: '#64748b',
          background: '#ffffff',
          padding: '6px 14px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <span>Showing </span>
        <strong style={{ color: '#0f172a' }}>{totalCount}</strong>
        <span> mapped incidents</span>
      </div>
    </div>
  );
}
