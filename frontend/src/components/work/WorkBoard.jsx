import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Hourglass } from 'lucide-react';
import { api } from '../../services/api';
import { INK, Button, ErrorBanner, Spinner, SeverityBadge, DueBadge, TeamBadge, inputStyle } from './ui';

const COLUMNS = [
  ['needs_review', 'Needs review'],
  ['assigned', 'Assigned'],
  ['in_progress', 'In progress'],
  ['resolved', 'Resolved'],
];

// The officer's "All work" board: every item by status, both teams
export default function WorkBoard({ onOpen, refreshKey = 0 }) {
  const [team, setTeam] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api.municipal.board(team || undefined));
    } catch (e) {
      setError(e.message);
    }
  }, [team]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: INK.primary }}>All work</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)} style={inputStyle}>
            <option value="">Both teams</option>
            <option value="litter">Litter team</option>
            <option value="roads">Road team</option>
          </select>
          <Button variant="secondary" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
      </div>
      <ErrorBanner error={error} onRetry={load} />
      {!data && !error && <Spinner />}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, alignItems: 'start' }}>
          {COLUMNS.map(([key, label]) => {
            const col = data[key] || { items: [], total: 0 };
            return (
              <section key={key} aria-label={label} style={{ background: '#f1f5f9', borderRadius: 12, padding: 10 }}>
                <h3 style={{ margin: '2px 4px 10px', fontSize: '0.86rem', fontWeight: 800, color: INK.primary }}>
                  {label} <span style={{ color: INK.muted, fontWeight: 600 }}>({col.total})</span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 560, overflowY: 'auto' }}>
                  {col.items.length === 0 && <div style={{ fontSize: '0.82rem', color: INK.muted, padding: 6 }}>Nothing here.</div>}
                  {col.items.map((i) => (
                    <button
                      key={i.code}
                      onClick={() => onOpen(i.code)}
                      style={{ textAlign: 'left', background: '#fff', border: `1px solid ${i.overdue ? '#fecaca' : INK.line}`, borderRadius: 10, padding: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 5 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.84rem', color: INK.primary }}>{i.code}</span>
                        {key !== 'needs_review' && <TeamBadge team={i.team} />}
                      </div>
                      <div style={{ fontSize: '0.84rem', color: INK.secondary }}>{i.label}</div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <SeverityBadge severity={i.severity} />
                        <DueBadge targetBy={i.targetBy} status={i.status} />
                      </div>
                      {i.crew && <div style={{ fontSize: '0.76rem', color: INK.muted }}>{i.crew}</div>}
                      {i.pendingRequest && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', fontWeight: 800, color: '#92400e' }}>
                          <Hourglass size={12} aria-hidden="true" /> team request waiting
                        </div>
                      )}
                    </button>
                  ))}
                  {col.total > col.items.length && <div style={{ fontSize: '0.76rem', color: INK.muted, padding: 4 }}>Showing the first {col.items.length}. Use the lists to see all.</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
