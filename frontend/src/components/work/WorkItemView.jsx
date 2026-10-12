import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Copy, MapPin, ExternalLink, Bot, ShieldAlert, Clock, Wrench, CheckCircle2, ArrowRightLeft, Ban, RotateCcw, Hourglass } from 'lucide-react';
import { api } from '../../services/api';
import ImageCompare from './ImageCompare';
import MiniMap from './MiniMap';
import { INK, Card, Button, StatusBadge, SeverityBadge, DueBadge, TeamBadge, ErrorBanner, Spinner, Field, inputStyle, fmtDateTime, classLabel, CLASS_LABELS, TEAM_SHORT } from './ui';

/*
 * The review screen for one work item: original and detected photo side by side,
 * location, what the AI agents decided and why, the timeline, and the actions the
 * current user is allowed to take. The server re-checks every action.
 */
export default function WorkItemView({ code, user, onClose, onChanged }) {
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const closeRef = useRef(null);
  const isOfficer = user && user.role === 'municipal_officer';

  const load = useCallback(async () => {
    setError('');
    try {
      setItem(await api.work.get(code));
    } catch (e) {
      setError(e.message);
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    closeRef.current && closeRef.current.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Runs an action, shows the server's answer, refreshes this item and the list behind it
  const act = async (fn, okMessage) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await fn();
      if (updated && updated.code) setItem(updated);
      else await load();
      setNotice(okMessage);
      onChanged && onChanged();
      return true;
    } catch (e) {
      setError(e.message);
      if (e.status === 409) load();
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={`Work item ${code}`} onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(15,23,42,.5)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: '24px 12px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 1100, background: INK.page, borderRadius: 16, boxShadow: '0 25px 50px -12px rgba(0,0,0,.3)' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px', borderBottom: `1px solid ${INK.line}`, background: '#fff', borderRadius: '16px 16px 0 0', position: 'sticky', top: 0, zIndex: 2 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 800, letterSpacing: '.05em', color: INK.primary }}>{code}</span>
              <button onClick={() => navigator.clipboard && navigator.clipboard.writeText(code)} aria-label="Copy tracking ID" style={{ color: INK.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <Copy size={15} />
              </button>
              {item && <StatusBadge status={item.status} />}
              {item && <SeverityBadge severity={item.severity} />}
              {item && item.status !== 'Needs Review' && <TeamBadge team={item.team} />}
            </div>
            {item && (
              <div style={{ marginTop: 4, color: INK.secondary, fontSize: '0.9rem' }}>
                {item.label} · reported {fmtDateTime(item.createdAt)}
                {item.crew ? ` · crew: ${item.crew}` : ''}
              </div>
            )}
          </div>
          {item && <DueBadge targetBy={item.targetBy} status={item.status} />}
          <button ref={closeRef} onClick={onClose} aria-label="Close" style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', color: INK.secondary }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ErrorBanner error={error} onRetry={!item ? load : undefined} />
          {notice && (
            <div role="status" style={{ padding: '10px 14px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', fontWeight: 700, fontSize: '0.9rem' }}>
              {notice}
            </div>
          )}
          {!item && !error && <Spinner label="Loading work item…" />}

          {item && (
            <>
              <Actions item={item} user={user} isOfficer={isOfficer} busy={busy} act={act} />

              <Card>
                <ImageCompare imageUrl={item.imageUrl} boxes={item.boxes} afterImageUrl={item.resolution && item.resolution.afterImageUrl} />
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                <Card>
                  <h3 style={h3}>
                    <MapPin size={16} aria-hidden="true" /> Location
                  </h3>
                  <MiniMap lat={item.lat} lng={item.lng} />
                  <div style={{ marginTop: 10, fontWeight: 700, color: INK.primary }}>{item.address}</div>
                  {typeof item.lat === 'number' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.84rem', color: INK.muted }}>
                        {item.lat.toFixed(6)}, {item.lng.toFixed(6)}
                      </span>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`} target="_blank" rel="noreferrer" style={link}>
                        Open in Google Maps <ExternalLink size={13} />
                      </a>
                    </div>
                  )}
                </Card>

                <Card>
                  <h3 style={h3}>
                    <Bot size={16} aria-hidden="true" /> What the AI decided
                  </h3>
                  <Row k="Detector">
                    {classLabel((item.aiReview && item.aiReview.original && item.aiReview.original.category) || (item.boxes[0] && item.boxes[0].label) || item.category)} at{' '}
                    {Math.round((((item.aiReview && item.aiReview.original && item.aiReview.original.confidence) || item.confidence) || 0) * 100)}% confidence
                    {item.boxes[0] && item.boxes[0].label !== item.category && !(item.aiReview && item.aiReview.verdict === 'corrected') && (
                      <div style={{ color: INK.muted }}>Class corrected by staff to {classLabel(item.category)}.</div>
                    )}
                  </Row>
                  {item.aiReview ? (
                    <Row k="Verification agent">
                      <strong style={{ textTransform: 'capitalize' }}>{item.aiReview.verdict}</strong>
                      {item.aiReview.original && item.aiReview.original.category !== item.category
                        ? ` (changed from ${classLabel(item.aiReview.original.category)})`
                        : ''}
                      {item.aiReview.summary ? `. ${item.aiReview.summary}` : ''}
                      {(item.aiReview.notes || []).map((n, i) => (
                        <div key={i} style={{ marginTop: 4, color: INK.muted }}>{n}</div>
                      ))}
                    </Row>
                  ) : (
                    <Row k="Verification agent">Not run for this report.</Row>
                  )}
                  {item.dispatch && item.dispatch.reason && <Row k="Dispatch agent">{item.dispatch.reason}</Row>}
                  {(item.reassignments || []).length > 1 && (
                    <Row k="Team changes">
                      {item.reassignments.slice(1).map((r, i) => (
                        <div key={i}>
                          {TEAM_SHORT[r.from] || 'triage'} → {TEAM_SHORT[r.to] || r.to} ({r.kind}, {r.by}){r.reason ? `: ${r.reason}` : ''}
                        </div>
                      ))}
                    </Row>
                  )}
                </Card>
              </div>

              {item.resolution && (
                <Card>
                  <h3 style={h3}>
                    <CheckCircle2 size={16} aria-hidden="true" /> Resolution
                  </h3>
                  <div style={{ color: INK.primary }}>{item.resolution.note}</div>
                  <div style={{ fontSize: '0.82rem', color: INK.muted, marginTop: 4 }}>
                    by {item.resolution.by} {item.resolvedAt ? `on ${fmtDateTime(item.resolvedAt)}` : ''}
                  </div>
                </Card>
              )}

              <Card>
                <h3 style={h3}>
                  <Clock size={16} aria-hidden="true" /> Timeline
                </h3>
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[...item.history].reverse().map((h, i) => (
                    <li key={i} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, fontSize: '0.86rem' }}>
                      <span style={{ color: INK.muted }}>{fmtDateTime(h.at)}</span>
                      <span>
                        <strong style={{ color: INK.primary }}>{h.status}</strong> · {h.note}
                        <span style={{ color: INK.faint }}> — {h.by}</span>
                        {h.visibility === 'internal' && (
                          <span style={{ marginLeft: 6, fontSize: '0.7rem', fontWeight: 800, color: INK.muted, border: `1px solid ${INK.line}`, borderRadius: 4, padding: '0 4px' }}>staff only</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const h3 = { display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.95rem', fontWeight: 800, color: INK.primary, margin: '0 0 12px' };
const link = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.84rem', fontWeight: 700, color: '#047857' };

function Row({ k, children }) {
  return (
    <div style={{ marginBottom: 10, fontSize: '0.86rem', color: INK.secondary, lineHeight: 1.5 }}>
      <div style={{ fontSize: '0.74rem', fontWeight: 800, color: INK.muted, textTransform: 'uppercase', letterSpacing: '.04em' }}>{k}</div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- actions by role and status
function Actions({ item, user, isOfficer, busy, act }) {
  const [form, setForm] = useState(null); // which inline form is open
  const [text, setText] = useState('');
  const [team, setTeam] = useState('');
  const [category, setCategory] = useState('');
  const [photo, setPhoto] = useState(null);
  const open = ['Assigned', 'In Progress'].includes(item.status);
  const pending = (item.requests || []).find((r) => r.state === 'pending');
  const otherTeam = (t) => (t === 'litter' ? 'roads' : 'litter');

  const openForm = (name, defaults = {}) => {
    setForm(name);
    setText('');
    setPhoto(null);
    setTeam(defaults.team || '');
    setCategory(defaults.category || '');
  };
  const done = async (fn, msg) => {
    if (await act(fn, msg)) setForm(null);
  };

  const buttons = [];
  if (!isOfficer) {
    if (item.status === 'Assigned') buttons.push(<Button key="start" disabled={busy} onClick={() => act(() => api.work.start(item.code), 'Marked as in progress.')}><Wrench size={15} /> Start work</Button>);
    if (open) buttons.push(<Button key="resolve" variant="dark" disabled={busy} onClick={() => openForm('resolve')}><CheckCircle2 size={15} /> Mark resolved</Button>);
    if (open && !pending) {
      buttons.push(<Button key="reassign" variant="secondary" disabled={busy} onClick={() => openForm('request-reassign', { team: otherTeam(item.team) })}><ArrowRightLeft size={15} /> Wrong team</Button>);
      buttons.push(<Button key="nd" variant="danger" disabled={busy} onClick={() => openForm('request-not-defect')}><Ban size={15} /> Not a defect</Button>);
    }
  } else {
    if (item.status === 'Needs Review') {
      buttons.push(<Button key="triage" disabled={busy} onClick={() => openForm('triage', { team: item.team || (['litter', 'illegal_dumping'].includes(item.category) ? 'litter' : 'roads'), category: item.category })}><ArrowRightLeft size={15} /> Assign to a team</Button>);
      buttons.push(<Button key="rej" variant="danger" disabled={busy} onClick={() => openForm('reject')}><Ban size={15} /> Close as not a defect</Button>);
    }
    if (open) {
      buttons.push(<Button key="move" variant="secondary" disabled={busy} onClick={() => openForm('reassign', { team: otherTeam(item.team) })}><ArrowRightLeft size={15} /> Reassign</Button>);
      buttons.push(<Button key="close" variant="danger" disabled={busy} onClick={() => openForm('reject')}><Ban size={15} /> Close as not a defect</Button>);
    }
    if (item.status === 'Resolved') buttons.push(<Button key="reopen" variant="secondary" disabled={busy} onClick={() => openForm('reopen')}><RotateCcw size={15} /> Reopen</Button>);
  }

  return (
    <Card style={{ padding: 16 }}>
      {pending && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', marginBottom: buttons.length || isOfficer ? 12 : 0 }}>
          <Hourglass size={18} aria-hidden="true" style={{ color: '#92400e', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, fontSize: '0.88rem', color: '#78350f' }}>
            <strong>{pending.kind === 'reassign' ? `Reassignment to the ${TEAM_SHORT[pending.suggestedTeam] || ''} team requested` : 'Marked "not a defect" by the team'}</strong> by {pending.by}, {fmtDateTime(pending.at)}
            <div>Reason: {pending.reason}</div>
            {!isOfficer && <div style={{ marginTop: 4 }}>Waiting for the Municipal Officer. The item stays with your team until then.</div>}
            {isOfficer && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {pending.kind === 'reassign' && (
                  <Field label="Move to">
                    <select value={team || pending.suggestedTeam} onChange={(e) => setTeam(e.target.value)} style={inputStyle}>
                      <option value="litter">Litter team</option>
                      <option value="roads">Road team</option>
                    </select>
                  </Field>
                )}
                <Button disabled={busy} onClick={() => act(() => api.municipal.decide(item.code, pending.id, true, team || pending.suggestedTeam), pending.kind === 'reassign' ? 'Request approved: the item was moved.' : 'Request approved: the item was closed.')}>
                  Approve
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => act(() => api.municipal.decide(item.code, pending.id, false, undefined, 'Declined by the Municipal Officer'), 'Request declined: the item stays with the team.')}>
                  Decline
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {buttons.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{buttons}</div>}
      {!buttons.length && !pending && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: INK.muted, fontSize: '0.88rem' }}>
          <ShieldAlert size={16} aria-hidden="true" /> No actions available for this item in its current status.
        </div>
      )}

      {form && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const c = item.code;
            if (form === 'resolve') done(() => api.work.resolve(c, text, photo), 'Resolved. The citizen has been notified.');
            if (form === 'request-reassign') done(() => api.work.requestReassign(c, text, team), 'Request sent to the Municipal Officer.');
            if (form === 'request-not-defect') done(() => api.work.requestNotDefect(c, text), 'Request sent to the Municipal Officer.');
            if (form === 'triage') done(() => api.municipal.triageAssign(c, team, category, text), 'Assigned. The team will see it in their queue.');
            if (form === 'reject') done(() => (item.status === 'Needs Review' ? api.municipal.triageReject(c, text) : api.municipal.reject(c, text)), 'Closed as not a defect.');
            if (form === 'reassign') done(() => api.municipal.reassign(c, team, text), 'Reassigned with a new crew.');
            if (form === 'reopen') done(() => api.municipal.reopen(c, text), 'Reopened.');
          }}
          style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${INK.line}`, display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {(form === 'request-reassign' || form === 'triage' || form === 'reassign') && (
            <Field label={form === 'request-reassign' ? 'Which team should handle it?' : 'Team'}>
              <select value={team} onChange={(e) => setTeam(e.target.value)} style={{ ...inputStyle, maxWidth: 280 }} required>
                {['litter', 'roads']
                  .filter((t) => form !== 'request-reassign' || t !== item.team)
                  .filter((t) => form !== 'reassign' || t !== item.team)
                  .map((t) => (
                    <option key={t} value={t}>{TEAM_SHORT[t]} team</option>
                  ))}
              </select>
            </Field>
          )}
          {form === 'triage' && (
            <Field label="Defect class (correct it if the AI was wrong)">
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, maxWidth: 280 }}>
                {Object.entries(CLASS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label={form === 'resolve' ? 'What was done? (required, kept for the record)' : form === 'triage' ? 'Note (optional)' : 'Reason (required)'}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} required={form !== 'triage'} minLength={form === 'triage' ? 0 : 3} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
          {form === 'resolve' && (
            <Field label="After photo (optional, JPEG/PNG/WebP)">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files && e.target.files[0])} />
            </Field>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Confirm'}</Button>
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
