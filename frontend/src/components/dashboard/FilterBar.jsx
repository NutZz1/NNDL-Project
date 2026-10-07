import React from 'react';
import { Filter, Search, ShieldAlert, Trash2, Activity } from 'lucide-react';

export default function FilterBar({
  selectedDomain,
  onDomainChange,
  statusFilter,
  onStatusChange,
  searchTerm,
  onSearchChange,
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
              }}
            >
              <span style={{ color: isActive ? '#10b981' : '#64748b' }}>{dom.icon}</span>
              <span>{dom.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right Search & Status Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '9px' }} />
          <input
            type="text"
            placeholder="Search address or defect..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              padding: '6px 12px 6px 32px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '0.82rem',
              outline: 'none',
              background: '#ffffff',
              width: '210px',
            }}
          />
        </div>

        {/* Status Dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          style={{
            padding: '7px 12px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: '#0f172a',
            outline: 'none',
            background: '#ffffff',
          }}
        >
          <option value="all">All Statuses</option>
          <option value="Reported">Reported (Unassigned)</option>
          <option value="Assigned">Assigned Crew</option>
          <option value="In Progress">In Progress</option>
          <option value="Resolved">Resolved</option>
        </select>
      </div>
    </div>
  );
}
