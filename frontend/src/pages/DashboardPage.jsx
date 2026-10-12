import React, { useCallback, useState } from 'react';
import Sidebar from '../components/dashboard/Sidebar';
import Header from '../components/dashboard/Header';
import KpiCardRow from '../components/dashboard/KpiCardRow';
import CivicAnalyticsPage from '../components/dashboard/CivicAnalyticsPage';
import FilterBar from '../components/dashboard/FilterBar';
import CivicMap from '../components/dashboard/CivicMap';
import IncidentDetailModal from '../components/dashboard/IncidentDetailModal';
import { Layers, ArrowLeft, Plus, MapPin, TrendingUp, LayoutGrid, LayoutDashboard, Gauge, Columns3, Eye, ArrowRightLeft, CheckCircle2, Bot, Search } from 'lucide-react';
import WorkQueue from '../components/work/WorkQueue';
import WorkBoard from '../components/work/WorkBoard';
import WorkItemView from '../components/work/WorkItemView';
import OpsAnalytics from '../components/work/OpsAnalytics';
import AssistantPanel from '../components/work/AssistantPanel';
import useNotifications from '../components/work/useNotifications';
import { Card, Button, inputStyle, INK } from '../components/work/ui';
import { api } from '../services/api';

// Stable fetchers for the officer's lists (module level, so they never change identity)
const triageFetcher = (params) => api.municipal.triage(params);
const requestsFetcher = (params) => api.municipal.requests(params);
const ALL_CLASSES = ['litter', 'illegal_dumping', 'pothole', 'crack_longitudinal', 'crack_transverse', 'crack_alligator', 'crack_structural', 'manhole_damaged', 'manhole_missing'];

export default function DashboardPage({
  kpis,
  incidents,
  onUpdateIncidentStatus,
  onNavigateHome,
  onNavigateUpload,
  user,
  onLogout,
}) {
  // Municipal Officer console: the original map + analytics, plus the workflow sections
  const [openCode, setOpenCode] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lookup, setLookup] = useState('');
  const counts = useNotifications(refreshKey);
  const changed = useCallback(() => setRefreshKey((k) => k + 1), []);
  const officerItems = [
    { id: 'dashboard', label: 'Map overview', icon: <LayoutDashboard size={18} /> },
    { id: 'ops', label: 'Operations', icon: <Gauge size={18} /> },
    { id: 'work', label: 'All work', icon: <Columns3 size={18} /> },
    { id: 'triage', label: 'Triage', icon: <Eye size={18} />, badge: counts ? counts.needsReview || '' : '', badgeAlert: Boolean(counts && counts.needsReview) },
    { id: 'requests', label: 'Reassignments', icon: <ArrowRightLeft size={18} />, badge: counts ? counts.pendingRequests || '' : '', badgeAlert: Boolean(counts && counts.pendingRequests) },
    { id: 'completed', label: 'Completed', icon: <CheckCircle2 size={18} /> },
    { id: 'analytics', label: 'Analytics', icon: <TrendingUp size={18} /> },
    { id: 'assistant', label: 'Assistant', icon: <Bot size={18} /> },
  ];
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [dashboardViewMode, setDashboardViewMode] = useState('combined'); // 'combined' | 'map' | 'analytics'

  // If user clicked 'analytics' on the sidebar, reflect in view mode
  const effectiveView = activeTab === 'analytics' ? 'analytics' : dashboardViewMode;

  // Filters
  const [selectedDomain, setSelectedDomain] = useState('all');

  // Filter logic
  const filteredIncidents = incidents.filter((inc) => {
    if (selectedDomain !== 'all' && inc.domain !== selectedDomain) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Left Sidebar matching uploaded reference screenshot */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'analytics') setDashboardViewMode('analytics');
          if (tab === 'dashboard' && dashboardViewMode === 'analytics') setDashboardViewMode('combined');
        }}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onNavigateHome={onNavigateHome}
        items={officerItems}
        user={user}
        onLogout={onLogout}
      />

      {/* Main Dashboard Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header */}
        <Header
          officerName={kpis.officer?.name || 'Tom Miller'}
          organization={kpis.officer?.organization || 'Amrita Civic & Infrastructure Authority'}
        />

        {/* SECTION 1: DASHBOARD PAGE SECTION (activeTab === 'dashboard') */}
        {activeTab === 'dashboard' && (
          <>
            {/* Top Quick Actions Bar */}
            <div
              style={{
                padding: '0 32px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
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
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={14} />
                <span>Back to Public Portal</span>
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#2563eb',
                  background: '#eff6ff',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid #bfdbfe',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <TrendingUp size={14} />
                <span>Open Analytics Section &rarr;</span>
              </button>
            </div>

            {/* CivicScan Product KPI Cards Row + Defect Distribution Widget */}
            <KpiCardRow kpis={kpis} incidents={incidents} />

            {/* Map Filter Controls */}
            <FilterBar
              selectedDomain={selectedDomain}
              onDomainChange={setSelectedDomain}
              totalCount={filteredIncidents.length}
            />

            {/* Interactive Leaflet Map */}
            <div style={{ padding: '0 32px 32px' }}>
              <CivicMap
                incidents={filteredIncidents}
                onSelectIncident={(inc) => (inc && inc.reportCode ? setOpenCode(inc.reportCode) : setSelectedIncident(inc))}
                selectedIncident={selectedIncident}
              />
            </div>
          </>
        )}

        {/* WORKFLOW SECTIONS (Municipal Officer) */}
        {['ops', 'work', 'triage', 'requests', 'completed', 'assistant'].includes(activeTab) && (
          <div style={{ padding: '0 32px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {activeTab === 'ops' && <OpsAnalytics onOpenTriage={() => setActiveTab('triage')} onOpenRequests={() => setActiveTab('requests')} />}
            {activeTab === 'work' && <WorkBoard onOpen={setOpenCode} refreshKey={refreshKey} />}
            {activeTab === 'triage' && (
              <WorkQueue
                title="Triage: reports held by the agents"
                status="needs_review"
                lockStatus
                fetcher={triageFetcher}
                classes={ALL_CLASSES}
                onOpen={setOpenCode}
                refreshKey={refreshKey}
                emptyTitle="Nothing to triage"
                emptyText="Reports the agents were unsure about will appear here."
              />
            )}
            {activeTab === 'requests' && (
              <>
                <Card>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (lookup.trim()) setOpenCode(lookup.trim().toUpperCase());
                    }}
                    style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
                  >
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.8rem', fontWeight: 700, color: INK.secondary }}>
                      Reassign any task: enter its tracking ID
                      <input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="CS-XXXX-XXXX" style={{ ...inputStyle, fontFamily: 'monospace', width: 220 }} />
                    </label>
                    <Button type="submit" variant="dark">
                      <Search size={14} /> Open
                    </Button>
                  </form>
                </Card>
                <WorkQueue
                  title="Requests from the teams"
                  status="all"
                  lockStatus
                  teamFilter
                  showTeam
                  fetcher={requestsFetcher}
                  classes={ALL_CLASSES}
                  onOpen={setOpenCode}
                  refreshKey={refreshKey}
                  emptyTitle="No pending requests"
                  emptyText="When a team says an item belongs to the other team, or is not a defect, it appears here."
                />
              </>
            )}
            {activeTab === 'completed' && (
              <WorkQueue title="Completed work, both teams" status="completed" lockStatus teamFilter showTeam classes={ALL_CLASSES} onOpen={setOpenCode} refreshKey={refreshKey} emptyTitle="No completed work yet" />
            )}
            {activeTab === 'assistant' && user && <AssistantPanel user={user} onOpen={setOpenCode} />}
          </div>
        )}

        {/* SECTION 2: ANALYTICS PAGE SECTION (activeTab === 'analytics') */}
        {activeTab === 'analytics' && (
          <CivicAnalyticsPage
            incidents={incidents}
            kpis={kpis}
            onNavigateHome={onNavigateHome}
            onNavigateMap={() => setActiveTab('dashboard')}
          />
        )}
      </div>

      {openCode && <WorkItemView code={openCode} user={user} onClose={() => setOpenCode(null)} onChanged={changed} />}

      {/* Incident Detail Drawer/Modal (older records without a tracking ID) */}
      {selectedIncident && !selectedIncident.reportCode && (
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
