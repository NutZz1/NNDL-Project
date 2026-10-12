import React, { useCallback, useEffect, useState } from 'react';
import { LayoutDashboard, ListTodo, CheckCircle2, Bot, Map as MapIcon } from 'lucide-react';
import Sidebar from '../components/dashboard/Sidebar';
import CivicMap from '../components/dashboard/CivicMap';
import WorkQueue from '../components/work/WorkQueue';
import WorkItemView from '../components/work/WorkItemView';
import TeamStats from '../components/work/TeamStats';
import AssistantPanel from '../components/work/AssistantPanel';
import useNotifications from '../components/work/useNotifications';
import { INK, Card, ErrorBanner } from '../components/work/ui';
import { api } from '../services/api';
import { teamLabel } from '../services/auth';

/*
 * Workspace for a team manager (Litter Manager or Road Manager).
 * Everything here is limited to their own team by the server.
 */
export default function TeamWorkspacePage({ user, onLogout, onNavigateHome }) {
  const [tab, setTab] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [openCode, setOpenCode] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [classes, setClasses] = useState([]);
  const counts = useNotifications(refreshKey);

  useEffect(() => {
    api.work.meta().then((m) => setClasses(m.classes)).catch(() => {});
  }, []);

  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    {
      id: 'pending',
      label: 'Pending work',
      icon: <ListTodo size={18} />,
      badge: counts ? counts.overdue || counts.newToday || '' : '',
      badgeAlert: Boolean(counts && counts.overdue),
    },
    { id: 'map', label: 'Map', icon: <MapIcon size={18} /> },
    { id: 'completed', label: 'Completed', icon: <CheckCircle2 size={18} /> },
    { id: 'assistant', label: 'Assistant', icon: <Bot size={18} /> },
  ];

  const changed = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: INK.page }}>
      <Sidebar
        items={items}
        activeTab={tab}
        onTabChange={(t) => t !== 'settings' && setTab(t)}
        isCollapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onNavigateHome={onNavigateHome}
        user={user}
        onLogout={onLogout}
      />
      <main style={{ flex: 1, minWidth: 0, padding: '24px clamp(16px, 3vw, 32px)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <header>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: '.05em' }}>{teamLabel(user.team)}</div>
          <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, color: INK.primary }}>Welcome, {user.name}</h1>
          {counts && (
            <p style={{ margin: '6px 0 0', color: INK.secondary }}>
              {counts.newToday} new in the last 24 h · {counts.overdue} overdue · {counts.pendingRequests} request{counts.pendingRequests === 1 ? '' : 's'} waiting for the Municipal Officer
            </p>
          )}
        </header>

        {tab === 'dashboard' && <TeamStats />}
        {tab === 'pending' && (
          <WorkQueue title="Pending work" status="open" classes={classes} onOpen={setOpenCode} refreshKey={refreshKey} emptyTitle="Nothing pending" emptyText="New reports for your team appear here automatically." />
        )}
        {tab === 'completed' && (
          <WorkQueue title="Completed work" status="completed" lockStatus classes={classes} onOpen={setOpenCode} refreshKey={refreshKey} emptyTitle="No completed work yet" />
        )}
        {tab === 'map' && <TeamMap onOpen={setOpenCode} refreshKey={refreshKey} />}
        {tab === 'assistant' && <AssistantPanel user={user} onOpen={setOpenCode} />}
      </main>

      {openCode && <WorkItemView code={openCode} user={user} onClose={() => setOpenCode(null)} onChanged={changed} />}
    </div>
  );
}

// The team's open items on the existing map component
function TeamMap({ onOpen, refreshKey }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.work
      .list({ status: 'open', limit: 100 })
      .then((r) => setItems(r.items.filter((i) => typeof i.lat === 'number').map((i) => ({ ...i, title: `${i.label} · ${i.code}` }))))
      .catch((e) => setError(e.message));
  }, [refreshKey]);
  return (
    <Card>
      <h2 style={{ margin: '0 0 12px', fontSize: '1.05rem', fontWeight: 800, color: INK.primary }}>Open work on the map</h2>
      <ErrorBanner error={error} />
      {items && <CivicMap incidents={items} onSelectIncident={(inc) => inc && inc.code && onOpen(inc.code)} selectedIncident={null} />}
    </Card>
  );
}
