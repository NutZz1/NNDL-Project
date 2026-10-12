import React, { useCallback, useEffect, useState } from 'react';
import { Search, RefreshCw, Hourglass } from 'lucide-react';
import { api } from '../../services/api';
import { INK, Card, Button, StatusBadge, SeverityBadge, DueBadge, TeamBadge, ErrorBanner, Spinner, EmptyState, inputStyle, fmtDate, classLabel, srOnly } from './ui';

/*
 * The list of work items. Used for a team's pending work, a team's completed work,
 * and the officer's triage / requests / all-work views. The server decides what the
 * caller may see; the filters here only narrow it down.
 *
 * props: title, status (default filter), lockStatus, showTeam, fetcher(params) (optional),
 *        classes (for the class filter), onOpen(code), refreshKey, emptyTitle, emptyText
 */
export default function WorkQueue({
  title,
  status = 'open',
  lockStatus = false,
  showTeam = false,
  teamFilter = false,
  fetcher,
  classes = [],
  onOpen,
  refreshKey = 0,
  emptyTitle = 'Nothing here',
  emptyText,
  defaultSort,
}) {
  const [filters, setFilters] = useState({ status, severity: '', category: '', overdue: false, q: '', team: '', sort: defaultSort || '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        status: filters.status,
        severity: filters.severity,
        category: filters.category,
        overdue: filters.overdue ? 'true' : '',
        q: filters.q,
        team: filters.team,
        sort: filters.sort,
        page,
        limit: 20,
      };
      setData(await (fetcher ? fetcher(params) : api.work.list(params)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page, fetcher]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const set = (k, v) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };
  const statusTabs = [
    ['open', 'Open'],
    ['assigned', 'Not started'],
    ['in_progress', 'In progress'],
    ['completed', 'Completed'],
    ['all', 'All'],
  ];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <Card style={{ padding: 0 }}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${INK.line}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: INK.primary }}>
            {title} {data && <span style={{ color: INK.muted, fontWeight: 600 }}>({data.total})</span>}
          </h2>
          <Button variant="secondary" onClick={load} disabled={loading} aria-label="Refresh" style={{ padding: '6px 10px' }}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>

        {/* one row of filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!lockStatus && (
            <div role="tablist" aria-label="Status" style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 3, borderRadius: 9 }}>
              {statusTabs.map(([k, label]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={filters.status === k}
                  onClick={() => set('status', k)}
                  style={{ padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, background: filters.status === k ? '#fff' : 'transparent', color: filters.status === k ? INK.primary : INK.muted, boxShadow: filters.status === k ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <label style={srOnly} htmlFor={`sev-${title}`}>Severity</label>
          <select id={`sev-${title}`} value={filters.severity} onChange={(e) => set('severity', e.target.value)} style={inputStyle}>
            <option value="">All severities</option>
            {['Critical', 'High', 'Medium', 'Low'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          {classes.length > 1 && (
            <>
              <label style={srOnly} htmlFor={`cls-${title}`}>Defect class</label>
              <select id={`cls-${title}`} value={filters.category} onChange={(e) => set('category', e.target.value)} style={inputStyle}>
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c} value={c}>{classLabel(c)}</option>
                ))}
              </select>
            </>
          )}
          {teamFilter && (
            <select aria-label="Team" value={filters.team} onChange={(e) => set('team', e.target.value)} style={inputStyle}>
              <option value="">Both teams</option>
              <option value="litter">Litter team</option>
              <option value="roads">Road team</option>
            </select>
          )}
          {!lockStatus && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: INK.secondary }}>
              <input type="checkbox" checked={filters.overdue} onChange={(e) => set('overdue', e.target.checked)} /> Overdue only
            </label>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              set('q', search.trim());
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
          >
            <label style={srOnly} htmlFor={`q-${title}`}>Search by tracking ID or address</label>
            <input id={`q-${title}`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tracking ID or address" style={{ ...inputStyle, width: 200 }} />
            <Button type="submit" variant="secondary" style={{ padding: '7px 10px' }} aria-label="Search">
              <Search size={14} />
            </Button>
          </form>
        </div>
      </div>

      <div style={{ padding: '6px 6px 12px' }}>
        <ErrorBanner error={error} onRetry={load} />
        {!data && loading && <Spinner />}
        {data && data.items.length === 0 && <EmptyState title={emptyTitle} text={emptyText} />}
        {data && data.items.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', opacity: loading ? 0.6 : 1 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: INK.muted, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  <th style={th}>Tracking ID</th>
                  <th style={th}>Defect</th>
                  <th style={th}>Severity</th>
                  <th style={th}>Status</th>
                  {showTeam && <th style={th}>Team</th>}
                  <th style={th}>Crew</th>
                  <th style={th}>Due</th>
                  <th style={th}>Location</th>
                  <th style={th}>Reported</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr
                    key={i.code}
                    onClick={() => onOpen(i.code)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(i.code))}
                    tabIndex={0}
                    aria-label={`Open ${i.code}`}
                    style={{ borderTop: `1px solid ${INK.line}`, cursor: 'pointer', background: i.overdue ? '#fffafa' : 'transparent' }}
                    onMouseOver={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseOut={(e) => (e.currentTarget.style.background = i.overdue ? '#fffafa' : 'transparent')}
                  >
                    <td style={td}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: INK.primary }}>{i.code}</span>
                      {i.pendingRequest && (
                        <span title="A request is waiting for the Municipal Officer" style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', fontWeight: 800, color: '#92400e' }}>
                          <Hourglass size={12} aria-hidden="true" /> request
                        </span>
                      )}
                    </td>
                    <td style={td}>{i.label}</td>
                    <td style={td}><SeverityBadge severity={i.severity} /></td>
                    <td style={td}><StatusBadge status={i.status} /></td>
                    {showTeam && <td style={td}><TeamBadge team={i.status === 'Needs Review' ? null : i.team} /></td>}
                    <td style={{ ...td, color: INK.secondary }}>{i.crew || '—'}</td>
                    <td style={td}><DueBadge targetBy={i.targetBy} status={i.status} /></td>
                    <td style={{ ...td, color: INK.secondary, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.address}>{i.address}</td>
                    <td style={{ ...td, color: INK.muted, whiteSpace: 'nowrap' }}>{fmtDate(i.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span style={{ fontSize: '0.84rem', color: INK.muted }}>Page {page} of {pages}</span>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

const th = { padding: '10px 10px', fontWeight: 800 };
const td = { padding: '11px 10px', verticalAlign: 'middle' };
