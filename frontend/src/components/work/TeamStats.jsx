import React, { useCallback, useEffect, useState } from 'react';
import { Inbox, AlertTriangle, CheckCircle2, Timer, Target, Wrench } from 'lucide-react';
import { api } from '../../services/api';
import { INK, Card, ErrorBanner, Spinner, STATUS_COLORS, inputStyle } from './ui';
import { StatTile, BarList, TrendChart } from './charts';

export function PeriodPicker({ value, onChange }) {
  return (
    <select aria-label="Period" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
      <option value="7d">Last 7 days</option>
      <option value="30d">Last 30 days</option>
      <option value="90d">Last 90 days</option>
    </select>
  );
}

const hours = (h) => (h === null || h === undefined ? '—' : h >= 48 ? `${Math.round(h / 24)} d` : `${h} h`);

export function TeamMetrics({ m }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatTile label="Open work" value={m.backlog} sub={`${m.assigned} not started · ${m.inProgress} in progress`} icon={Inbox} />
        <StatTile label="Overdue" value={m.overdue} sub={m.overdue ? 'past target response time' : 'none overdue'} tone={m.overdue ? STATUS_COLORS.critical : undefined} icon={AlertTriangle} />
        <StatTile label="Resolved today" value={m.resolvedToday} sub={`${m.resolved} in the period`} icon={CheckCircle2} />
        <StatTile label="Mean time to resolve" value={hours(m.meanHoursToResolve)} sub="report to resolution" icon={Timer} />
        <StatTile label="Within target" value={m.withinTargetPct === null ? '—' : `${m.withinTargetPct}%`} sub="of resolved items" icon={Target} />
        <StatTile label="New reports" value={m.created} sub="in the period" icon={Wrench} />
      </div>

      <Card>
        <TrendChart title="Reported vs resolved, last 14 days" data={m.trend} />
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Card>
          <BarList
            title="Open work by defect class"
            rows={m.byClass.filter((c) => c.open > 0).map((c) => ({ label: c.label, value: c.open, c }))}
            empty="No open work."
            detail={(r) => `${r.c.resolved} resolved in the period${r.c.meanHours !== null ? `, ${hours(r.c.meanHours)} on average` : ''}`}
          />
        </Card>
        <Card>
          <BarList title="Open work by severity" rows={m.bySeverity.map((s) => ({ label: s.severity, value: s.open }))} />
        </Card>
        <Card>
          <BarList title="How long open items have waited" rows={m.ageing.map((a) => ({ label: a.bucket, value: a.count }))} />
        </Card>
        <Card>
          <BarList title="Open work per crew" rows={m.crewLoad.map((c) => ({ label: c.crew, value: c.open }))} empty="No crew has open work." />
        </Card>
      </div>
    </div>
  );
}

// The team dashboard's numbers (the server always returns the manager's own team)
export default function TeamStats({ team }) {
  const [period, setPeriod] = useState('7d');
  const [m, setM] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setM(await api.analytics.team(period, team));
    } catch (e) {
      setError(e.message);
    }
  }, [period, team]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: INK.primary }}>{m ? m.teamName : 'Team'} at a glance</h2>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      <ErrorBanner error={error} onRetry={load} />
      {!m && !error && <Spinner label="Loading numbers…" />}
      {m && <TeamMetrics m={m} />}
    </div>
  );
}
