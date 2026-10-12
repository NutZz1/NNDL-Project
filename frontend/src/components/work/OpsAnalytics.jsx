import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Eye, Inbox, Hourglass, Gauge, ShieldCheck, Trash2, Sparkles, MapPin } from 'lucide-react';
import { api } from '../../services/api';
import { INK, Card, ErrorBanner, Spinner, SERIES, STATUS_COLORS } from './ui';
import { StatTile, BarList, TrendChart } from './charts';
import { PeriodPicker, TeamMetrics } from './TeamStats';

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const hrs = (h) => (h === null || h === undefined ? '—' : h >= 48 ? `${Math.round(h / 24)} d` : `${h} h`);

// Both teams side by side: one row per measure, each team in its own labelled column
function Comparison({ teams }) {
  const t = [teams.litter, teams.roads];
  const rows = [
    ['Open work', (m) => m.backlog, (v) => v],
    ['Overdue', (m) => m.overdue, (v) => v],
    ['Resolved in period', (m) => m.resolved, (v) => v],
    ['Mean time to resolve', (m) => m.meanHoursToResolve, hrs],
    ['Within target', (m) => m.withinTargetPct, pct],
  ];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
        <caption style={{ textAlign: 'left', fontSize: '0.86rem', fontWeight: 800, color: INK.primary, marginBottom: 8 }}>Litter team vs Road team</caption>
        <thead>
          <tr style={{ color: INK.muted, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Measure</th>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Litter team</th>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Road team</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, get, fmt]) => {
            const vals = t.map((m) => get(m));
            const max = Math.max(1, ...vals.map((v) => Number(v) || 0));
            return (
              <tr key={label} style={{ borderTop: `1px solid ${INK.line}` }}>
                <td style={{ padding: '8px', color: INK.secondary }}>{label}</td>
                {vals.map((v, i) => (
                  <td key={i} style={{ padding: '8px', minWidth: 150 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, position: 'relative' }}>
                        <span style={{ position: 'absolute', inset: 0, width: `${((Number(v) || 0) / max) * 100}%`, minWidth: v ? 4 : 0, background: SERIES[2], borderRadius: 4 }} />
                      </span>
                      <strong style={{ color: INK.primary, minWidth: 44, textAlign: 'right' }}>{fmt(v)}</strong>
                    </div>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Municipal overview: both teams, combined trend, agent performance, hotspots
export default function OpsAnalytics({ onOpenTriage, onOpenRequests }) {
  const [period, setPeriod] = useState('7d');
  const [m, setM] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('both'); // both | litter | roads

  const load = useCallback(async () => {
    setError('');
    try {
      setM(await api.analytics.municipal(period));
    } catch (e) {
      setError(e.message);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const a = m && m.agent;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: INK.primary }}>Operations overview</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select aria-label="Team" value={view} onChange={(e) => setView(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.86rem' }}>
            <option value="both">Both teams</option>
            <option value="litter">Litter team</option>
            <option value="roads">Road team</option>
          </select>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </div>
      <ErrorBanner error={error} onRetry={load} />
      {!m && !error && <Spinner label="Loading numbers…" />}

      {m && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <button onClick={onOpenTriage} style={tileButton}>
              <StatTile label="Waiting for triage" value={m.needsReview} sub="held by the agents" tone={m.needsReview ? '#92400e' : undefined} icon={Eye} />
            </button>
            <button onClick={onOpenRequests} style={tileButton}>
              <StatTile label="Team requests" value={m.requestsPending} sub="reassign / not a defect" tone={m.requestsPending ? '#92400e' : undefined} icon={Hourglass} />
            </button>
            <StatTile label="Open work (both teams)" value={m.combined.backlog} sub={`${m.combined.overdue} overdue`} tone={m.combined.overdue ? STATUS_COLORS.critical : undefined} icon={Inbox} />
            <StatTile label="Resolved in period" value={m.combined.resolved} sub={`${pct(m.combined.withinTargetPct)} within target`} icon={ShieldCheck} />
          </div>

          {view === 'both' ? (
            <>
              <Card>
                <Comparison teams={m.teams} />
              </Card>
              <Card>
                <TrendChart title="Reported vs resolved, both teams, last 14 days" data={m.combined.trend} />
              </Card>
            </>
          ) : (
            <TeamMetrics m={m.teams[view]} />
          )}

          <Card>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 800, color: INK.primary }}>
              <Bot size={16} aria-hidden="true" /> How the AI agents performed
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <StatTile label="Photos scanned" value={a.photosScanned} sub={`${a.reportsCreated} became reports`} icon={Sparkles} />
              <StatTile label="Auto-dispatched" value={pct(a.autoDispatchRatePct)} sub={`${a.autoDispatched} reports`} icon={Bot} />
              <StatTile label="Held for review" value={pct(a.heldRatePct)} sub={`${a.heldForReview} reports`} icon={Eye} />
              <StatTile label="Assignment accuracy" value={pct(a.assignmentAccuracyPct)} sub={`${a.agentAssignmentsOverruled} overruled by the officer`} icon={Gauge} />
              <StatTile label="False positives" value={pct(a.falsePositiveRatePct)} sub="closed as not a defect" icon={Trash2} />
              <StatTile label="Verification corrections" value={pct(a.review.correctionRatePct)} sub={`${a.review.corrected} relabelled, ${a.review.removed} removed of ${a.review.reviewed}`} icon={ShieldCheck} />
            </div>
            <div style={{ fontSize: '0.78rem', color: INK.muted, marginTop: 10 }}>
              Discarded before reporting: {a.discardedClean} with no defect found by the detector, {a.discardedByAi} removed by the verification agent.
            </div>
          </Card>

          <Card>
            <BarList
              title="Hotspots (about 110 m areas with the most reports)"
              rows={m.hotspots.map((h) => ({ label: h.address || `${h.lat}, ${h.lng}`, value: h.count, h }))}
              empty="No reports in this period."
              detail={(r) => `${r.h.open} still open · ${r.h.lat}, ${r.h.lng}`}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', color: INK.muted, marginTop: 8 }}>
              <MapPin size={12} aria-hidden="true" /> Hover a row for the coordinates.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

const tileButton = { padding: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: 12 };
