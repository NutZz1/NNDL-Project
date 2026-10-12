import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Loader2, Inbox, XCircle, Eye, Wrench, UserCheck } from 'lucide-react';

/* Shared building blocks for the role-based workspaces (team managers + Municipal Officer). */

export const INK = { primary: '#0f172a', secondary: '#475569', muted: '#64748b', faint: '#94a3b8', line: '#e2e8f0', surface: '#ffffff', page: '#f8fafc' };
export const BRAND = '#059669';

// Chart series (validated pair, see the dataviz palette): 1 = blue, 2 = orange, 3 = aqua
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
// Status colours are reserved for state and always shown with an icon + a label
export const STATUS_COLORS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };

export const CLASS_LABELS = {
  litter: 'Litter',
  illegal_dumping: 'Illegal dumping',
  pothole: 'Pothole',
  crack_longitudinal: 'Longitudinal crack',
  crack_transverse: 'Transverse crack',
  crack_alligator: 'Alligator cracking',
  crack_structural: 'Structural crack',
  manhole_damaged: 'Damaged manhole',
  manhole_missing: 'Missing manhole',
};
export const classLabel = (c) => CLASS_LABELS[c] || String(c || '').replace(/_/g, ' ');
export const TEAM_SHORT = { litter: 'Litter', roads: 'Road' };

export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '');

// "due in 3 h" / "overdue by 2 d"
export function dueText(targetBy, status) {
  if (!targetBy || !['Assigned', 'In Progress'].includes(status)) return null;
  const ms = new Date(targetBy) - Date.now();
  const abs = Math.abs(ms);
  const span = abs >= 48 * 3600e3 ? `${Math.round(abs / (24 * 3600e3))} d` : abs >= 3600e3 ? `${Math.round(abs / 3600e3)} h` : `${Math.max(1, Math.round(abs / 60e3))} min`;
  return ms < 0 ? { text: `Overdue by ${span}`, overdue: true } : { text: `Due in ${span}`, overdue: false };
}

const STATUS_STYLE = {
  'Needs Review': { bg: '#fef3c7', fg: '#92400e', icon: Eye },
  Assigned: { bg: '#e0f2fe', fg: '#075985', icon: UserCheck },
  'In Progress': { bg: '#ede9fe', fg: '#5b21b6', icon: Wrench },
  Resolved: { bg: '#dcfce7', fg: '#166534', icon: CheckCircle2 },
  Rejected: { bg: '#f1f5f9', fg: '#475569', icon: XCircle },
};

export function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Assigned;
  const Icon = s.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: s.bg, color: s.fg, fontSize: '0.76rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      <Icon size={13} aria-hidden="true" />
      {status === 'Rejected' ? 'Closed (not a defect)' : status}
    </span>
  );
}

const SEV = { Critical: STATUS_COLORS.critical, High: STATUS_COLORS.serious, Medium: STATUS_COLORS.warning, Low: '#64748b' };
export function SeverityBadge({ severity }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', fontWeight: 700, color: INK.secondary, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 2, background: SEV[severity] || '#64748b' }} />
      {severity}
    </span>
  );
}

export function DueBadge({ targetBy, status }) {
  const d = dueText(targetBy, status);
  if (!d) return <span style={{ color: INK.faint, fontSize: '0.8rem' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', fontWeight: d.overdue ? 800 : 600, color: d.overdue ? STATUS_COLORS.critical : INK.secondary, whiteSpace: 'nowrap' }}>
      {d.overdue ? <AlertTriangle size={13} aria-hidden="true" /> : <Clock size={13} aria-hidden="true" />}
      {d.text}
    </span>
  );
}

export function TeamBadge({ team }) {
  if (!team) return <span style={{ color: INK.faint, fontSize: '0.8rem' }}>Unassigned</span>;
  return (
    <span style={{ padding: '2px 8px', borderRadius: 6, border: `1px solid ${INK.line}`, fontSize: '0.74rem', fontWeight: 700, color: INK.secondary, whiteSpace: 'nowrap' }}>
      {TEAM_SHORT[team] || team} team
    </span>
  );
}

export function Card({ children, style, ...rest }) {
  return (
    <div style={{ background: INK.surface, border: `1px solid ${INK.line}`, borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(15,23,42,0.04)', ...style }} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, color: INK.primary, margin: 0 }}>{children}</h2>
      {right}
    </div>
  );
}

export function Button({ children, variant = 'primary', disabled, style, ...rest }) {
  const v = {
    primary: { background: BRAND, color: '#fff', border: `1px solid ${BRAND}` },
    dark: { background: INK.primary, color: '#fff', border: `1px solid ${INK.primary}` },
    secondary: { background: '#fff', color: INK.primary, border: `1px solid #cbd5e1` },
    danger: { background: '#fff', color: '#b91c1c', border: '1px solid #fecaca' },
    ghost: { background: 'transparent', color: INK.secondary, border: '1px solid transparent' },
  }[variant];
  return (
    <button
      disabled={disabled}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, fontSize: '0.86rem', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, ...v, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, color: INK.muted, padding: 24, justifyContent: 'center' }}>
      <Loader2 size={18} style={{ animation: 'civic-spin 0.9s linear infinite' }} aria-hidden="true" />
      <span>{label}</span>
      <style>{'@keyframes civic-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem' }}>
      <AlertCircle size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{error}</span>
      {onRetry && (
        <Button variant="danger" onClick={onRetry} style={{ padding: '5px 10px' }}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, text }) {
  return (
    <div style={{ textAlign: 'center', padding: '36px 16px', color: INK.muted }}>
      <Inbox size={30} aria-hidden="true" style={{ color: INK.faint, marginBottom: 8 }} />
      <div style={{ fontWeight: 800, color: INK.primary }}>{title}</div>
      {text && <div style={{ fontSize: '0.9rem', marginTop: 4 }}>{text}</div>}
    </div>
  );
}

export const inputStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.86rem', background: '#fff', color: INK.primary, outline: 'none' };

export function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.8rem', fontWeight: 700, color: INK.secondary }}>
      {label}
      {children}
    </label>
  );
}

// Visually hidden but read by screen readers
export const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 };
