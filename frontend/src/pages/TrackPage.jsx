import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import { Search, CheckCircle2, Circle, MapPin, Users, Clock, Loader2, AlertCircle, UploadCloud } from 'lucide-react';
import { api } from '../services/api';
import { resolveImageUrl, handleImageError } from '../services/imageService';
import { getMyReports } from '../services/myReports';

const STEPS = ['Reported', 'Assigned', 'In Progress', 'Resolved'];

const SEVERITY_STYLE = {
  Critical: { bg: '#fee2e2', color: '#b91c1c' },
  High: { bg: '#ffedd5', color: '#c2410c' },
  Medium: { bg: '#e0f2fe', color: '#0369a1' },
  Low: { bg: '#fef3c7', color: '#92400e' },
};

const pretty = (s) => String(s || '').replace(/_/g, ' ');
const fmt = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

const card = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '24px',
  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
};

export default function TrackPage({ onNavigate, onOpenLogin, isLoggedIn, initialCode = '' }) {
  const [codeInput, setCodeInput] = useState(initialCode);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const myReports = getMyReports();

  const lookup = useCallback(async (code) => {
    const trimmed = String(code || '').trim();
    if (!trimmed) {
      setError('Enter the report ID from your email, for example CS-7K4M-X9QD.');
      return;
    }
    setLoading(true);
    setError('');
    setReport(null);
    try {
      setReport(await api.trackReport(trimmed));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialCode) lookup(initialCode);
  }, [initialCode, lookup]);

  const stepIndex = report ? Math.max(0, STEPS.indexOf(report.status)) : 0;
  const sev = report ? SEVERITY_STYLE[report.severity] || SEVERITY_STYLE.Medium : null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <style>{'@keyframes civic-spin { to { transform: rotate(360deg); } }'}</style>
      <Navbar currentPage="track" onNavigate={onNavigate} onOpenLogin={onOpenLogin} isLoggedIn={isLoggedIn} />

      <main style={{ flex: 1, padding: '48px 24px' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 3vw, 2.3rem)', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
              Track Your Report
            </h1>
            <p style={{ color: '#64748b', maxWidth: '560px', margin: '0 auto', lineHeight: 1.6 }}>
              Enter the report ID we emailed you to see where your report stands.
            </p>
          </div>

          {/* Lookup box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              lookup(codeInput);
            }}
            style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginBottom: '16px' }}
          >
            <label htmlFor="track-code" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              Report ID
            </label>
            <input
              id="track-code"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="CS-7K4M-X9QD"
              autoComplete="off"
              spellCheck={false}
              style={{
                flex: '1 1 240px',
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                fontFamily: 'monospace',
                fontSize: '1.15rem',
                letterSpacing: '0.06em',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 22px',
                borderRadius: '10px',
                background: '#059669',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.95rem',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? <Loader2 size={18} style={{ animation: 'civic-spin 0.9s linear infinite' }} /> : <Search size={18} />}
              <span>{loading ? 'Looking up...' : 'Track report'}</span>
            </button>
          </form>

          {/* Reports remembered on this device */}
          {myReports.length > 0 && !report && (
            <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>Your recent reports:</span>
              {myReports.slice(0, 6).map((r) => (
                <button
                  key={r.code}
                  onClick={() => {
                    setCodeInput(r.code);
                    lookup(r.code);
                  }}
                  style={{ padding: '5px 10px', borderRadius: '8px', background: '#e6f7ef', color: '#047857', fontFamily: 'monospace', fontWeight: 700, fontSize: '0.84rem', border: '1px solid #bbf7d0' }}
                >
                  {r.code}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '14px 16px', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 600, marginBottom: '16px' }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{error}</span>
            </div>
          )}

          {report && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeIn 0.3s ease' }}>
              {/* Summary + progress */}
              <div style={card}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px', marginBottom: '22px' }}>
                  <div>
                    <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Report ID</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.06em', color: '#0f172a' }}>{report.reportCode}</div>
                    <div style={{ color: '#475569', marginTop: '2px', textTransform: 'capitalize' }}>{report.title}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ padding: '5px 12px', borderRadius: '8px', background: sev.bg, color: sev.color, fontWeight: 700, fontSize: '0.84rem' }}>
                      {report.severity} severity
                    </span>
                    <span style={{ padding: '5px 12px', borderRadius: '8px', background: report.status === 'Resolved' ? '#dcfce7' : '#0f172a', color: report.status === 'Resolved' ? '#166534' : '#ffffff', fontWeight: 700, fontSize: '0.84rem' }}>
                      {report.status}
                    </span>
                  </div>
                </div>

                {/* Progress */}
                <ol style={{ listStyle: 'none', display: 'flex', margin: 0, padding: 0 }} aria-label="Report progress">
                  {STEPS.map((step, i) => {
                    const done = i <= stepIndex;
                    return (
                      <li key={step} style={{ flex: 1, textAlign: 'center', position: 'relative' }} aria-current={i === stepIndex ? 'step' : undefined}>
                        {i > 0 && (
                          <div style={{ position: 'absolute', top: '12px', left: '-50%', width: '100%', height: '3px', background: i <= stepIndex ? '#10b981' : '#e2e8f0' }} />
                        )}
                        <div style={{ position: 'relative', display: 'inline-flex', background: '#ffffff', borderRadius: '50%' }}>
                          {done ? <CheckCircle2 size={26} color="#10b981" /> : <Circle size={26} color="#cbd5e1" />}
                        </div>
                        <div style={{ fontSize: '0.8rem', marginTop: '6px', fontWeight: i === stepIndex ? 800 : 600, color: done ? '#0f172a' : '#94a3b8' }}>{step}</div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {(report.status === 'Closed' || report.underReview || report.afterImageUrl) && (
                <div style={{ ...card, padding: '16px 20px' }}>
                  {report.status === 'Closed' && (
                    <p style={{ margin: 0, color: '#334155' }}>
                      <strong>Closed after review.</strong> A municipal officer looked at the photo and found no defect that needs work. Thank you for reporting it.
                    </p>
                  )}
                  {report.underReview && (
                    <p style={{ margin: 0, color: '#334155' }}>
                      <strong>Under review.</strong> A municipal officer is checking your report before it is handed to a team.
                    </p>
                  )}
                  {report.afterImageUrl && (
                    <figure style={{ margin: 0 }}>
                      <figcaption style={{ fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>After the work</figcaption>
                      <img src={resolveImageUrl(report.afterImageUrl)} alt="Photo taken after the issue was fixed" style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 12 }} />
                    </figure>
                  )}
                </div>
              )}

              {/* Photo + details */}
              <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#0f172a', alignSelf: 'start' }}>
                  <img
                    src={resolveImageUrl(report.imageUrl, report.category)}
                    alt={`Photo of ${pretty(report.category)}`}
                    onError={(e) => handleImageError(e, report.category)}
                    style={{ width: '100%', display: 'block', maxHeight: '320px', objectFit: 'cover' }}
                  />
                  {(report.detectedBboxes || []).map((b, i) => {
                    const box = b.box || [];
                    if (box.length !== 4) return null;
                    return (
                      <div
                        key={i}
                        style={{
                          position: 'absolute',
                          top: `${box[0] * 100}%`,
                          left: `${box[1] * 100}%`,
                          height: `${(box[2] - box[0]) * 100}%`,
                          width: `${(box[3] - box[1]) * 100}%`,
                          border: '2.5px solid #10b981',
                          background: 'rgba(16, 185, 129, 0.15)',
                          borderRadius: '4px',
                          pointerEvents: 'none',
                        }}
                      />
                    );
                  })}
                </div>

                <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {[
                    ['Issue detected', `${pretty(report.category)} (AI confidence ${Math.round((report.confidence || 0) * 100)}%)`],
                    ['Reported', fmt(report.reportedAt)],
                    ['Last update', fmt(report.updatedAt)],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</dt>
                      <dd style={{ margin: 0, color: '#0f172a', fontWeight: 600, textTransform: k === 'Issue detected' ? 'capitalize' : 'none' }}>{v}</dd>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <MapPin size={17} color="#059669" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{report.address}</div>
                      {typeof report.lat === 'number' && (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}#map=18/${report.lat}/${report.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '0.84rem', color: '#059669', fontWeight: 700 }}
                        >
                          View on map
                        </a>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <Users size={17} color="#059669" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{report.team}</div>
                      <div style={{ fontSize: '0.86rem', color: '#64748b' }}>
                        {report.crew ? `Assigned crew: ${report.crew}` : 'Waiting for a crew to be assigned'}
                      </div>
                    </div>
                  </div>
                  {report.targetBy && report.status !== 'Resolved' && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <Clock size={17} color="#059669" style={{ marginTop: '2px', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>Target response by {fmt(report.targetBy)}</div>
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>This is a target, not a guarantee.</div>
                      </div>
                    </div>
                  )}
                </dl>
              </div>

              {/* Timeline */}
              <div style={card}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: '14px' }}>Timeline</h2>
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {[...report.history].reverse().map((h, i) => (
                    <li key={`${h.at}-${i}`} style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: i === 0 ? '#10b981' : '#cbd5e1', marginTop: '6px', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{h.status}</div>
                        {h.note && <div style={{ fontSize: '0.88rem', color: '#475569' }}>{h.note}</div>}
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{fmt(h.at)}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={() => onNavigate('upload')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '10px', background: '#f1f5f9', color: '#334155', fontWeight: 700 }}
                >
                  <UploadCloud size={16} />
                  <span>Report another issue</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
