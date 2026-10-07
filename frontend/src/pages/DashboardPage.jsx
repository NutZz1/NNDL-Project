import React, { useState } from 'react';
import Sidebar from '../components/dashboard/Sidebar';
import Header from '../components/dashboard/Header';
import KpiCardRow from '../components/dashboard/KpiCardRow';
import FilterBar from '../components/dashboard/FilterBar';
import CivicMap from '../components/dashboard/CivicMap';
import IncidentDetailModal from '../components/dashboard/IncidentDetailModal';
import { Layers, ArrowLeft, Plus } from 'lucide-react';

export default function DashboardPage({
  kpis,
  incidents,
  onUpdateIncidentStatus,
  onNavigateHome,
  onNavigateUpload,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedIncident, setSelectedIncident] = useState(null);

  // Filters
  const [selectedDomain, setSelectedDomain] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter logic
  const filteredIncidents = incidents.filter((inc) => {
    if (selectedDomain !== 'all' && inc.domain !== selectedDomain) return false;
    if (statusFilter !== 'all' && inc.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        inc.title.toLowerCase().includes(q) ||
        inc.address.toLowerCase().includes(q) ||
        inc.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Left Sidebar matching uploaded reference screenshot */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onNavigateHome={onNavigateHome}
      />

      {/* Main Dashboard Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header */}
        <Header
          officerName={kpis.officer?.name || 'Tom Miller'}
          organization={kpis.officer?.organization || 'Amrita Civic & Infrastructure Authority'}
        />

        {/* Top Quick Actions Bar */}
        <div
          style={{
            padding: '0 32px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            onClick={onNavigateHome}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: '#059669',
              background: '#e6f7ef',
              padding: '6px 12px',
              borderRadius: '6px',
            }}
          >
            <ArrowLeft size={14} />
            <span>Back to Public Portal</span>
          </button>
        </div>

        {/* CivicScan Product KPI Cards Row */}
        <KpiCardRow kpis={kpis} incidents={incidents} />

        {/* Map Filter Controls */}
        <FilterBar
          selectedDomain={selectedDomain}
          onDomainChange={setSelectedDomain}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          totalCount={filteredIncidents.length}
        />

        {/* Interactive Leaflet Map matching reference screenshot with clusters & pins */}
        <div style={{ padding: '0 32px 32px' }}>
          <CivicMap
            incidents={filteredIncidents}
            onSelectIncident={setSelectedIncident}
            selectedIncident={selectedIncident}
          />
        </div>
      </div>

      {/* Incident Detail Drawer/Modal */}
      {selectedIncident && (
        <IncidentDetailModal
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onUpdateStatus={(id, status, assignedTeam) => {
            onUpdateIncidentStatus(id, status, assignedTeam);
            setSelectedIncident((prev) => (prev ? { ...prev, status, assignedTeam } : null));
          }}
        />
      )}
    </div>
  );
}
