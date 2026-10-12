import React, { useState } from 'react';
import { INK, SERIES, srOnly } from './ui';

/*
 * Small chart pieces for the analytics views (dataviz method):
 *   StatTile   a headline number (no chart needed)
 *   BarList    one series, horizontal bars, value labels, hover detail
 *   TrendChart two series (reported vs resolved) per day, legend + tooltip + table view
 * Colours: SERIES[0] blue / SERIES[1] orange (validated pair); text always in ink colours.
 */

export function StatTile({ label, value, sub, tone, icon: Icon }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${INK.line}`, borderRadius: 12, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: INK.muted }}>
        {Icon && <Icon size={14} aria-hidden="true" style={{ color: tone || INK.muted }} />}
        <span>{label}</span>
      </div>
      <div style={{ fontSize: '1.65rem', fontWeight: 800, color: INK.primary, marginTop: 4, lineHeight: 1.1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: '0.78rem', color: tone || INK.muted, marginTop: 4, fontWeight: tone ? 700 : 500 }}>{sub}</div>}
    </div>
  );
}

export function BarList({ title, rows, valueKey = 'value', labelKey = 'label', color = SERIES[0], format = (v) => v, empty = 'No data yet', detail }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  const [hover, setHover] = useState(null);
  return (
    <figure style={{ margin: 0 }}>
      {title && <figcaption style={{ fontSize: '0.86rem', fontWeight: 800, color: INK.primary, marginBottom: 10 }}>{title}</figcaption>}
      {!rows.length ? (
        <div style={{ color: INK.muted, fontSize: '0.86rem' }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r, i) => {
            const v = Number(r[valueKey]) || 0;
            return (
              <div
                key={`${r[labelKey]}-${i}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 38%) 1fr auto', alignItems: 'center', gap: 10, padding: '2px 0' }}
              >
                <span style={{ fontSize: '0.82rem', color: INK.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r[labelKey]}>
                  {r[labelKey]}
                </span>
                <span style={{ position: 'relative', height: 10, background: '#f1f5f9', borderRadius: 4 }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(v / max) * 100}%`, minWidth: v ? 4 : 0, background: color, borderRadius: 4, opacity: hover === null || hover === i ? 1 : 0.55, transition: 'opacity .12s' }} />
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: INK.primary, minWidth: 28, textAlign: 'right' }}>{format(v)}</span>
                {hover === i && detail && (
                  <span style={{ gridColumn: '1 / -1', fontSize: '0.76rem', color: INK.muted, marginTop: -2 }}>{detail(r)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </figure>
  );
}

export function TrendChart({ title, data, series = [{ key: 'created', label: 'Reported' }, { key: 'resolved', label: 'Resolved' }] }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
  const H = 120;
  const day = (k) => new Date(`${k}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });

  return (
    <figure style={{ margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <figcaption style={{ fontSize: '0.86rem', fontWeight: 800, color: INK.primary }}>{title}</figcaption>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.78rem', color: INK.secondary }}>
          {series.map((s, i) => (
            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: SERIES[i] }} />
              {s.label}
            </span>
          ))}
          <button onClick={() => setAsTable((v) => !v)} style={{ fontSize: '0.76rem', color: INK.muted, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
            {asTable ? 'Show chart' : 'Show table'}
          </button>
        </div>
      </div>

      {asTable ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 4, color: INK.muted }}>Day</th>
              {series.map((s) => (
                <th key={s.key} style={{ textAlign: 'right', padding: 4, color: INK.muted }}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} style={{ borderTop: `1px solid ${INK.line}` }}>
                <td style={{ padding: 4 }}>{day(d.day)}</td>
                {series.map((s) => (
                  <td key={s.key} style={{ padding: 4, textAlign: 'right', fontWeight: 700 }}>{d[s.key] || 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ position: 'relative' }}>
          <div role="img" aria-label={`${title}: ${data.map((d) => `${day(d.day)} ${series.map((s) => `${s.label} ${d[s.key] || 0}`).join(', ')}`).join('; ')}`} style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: H, borderBottom: `1px solid ${INK.line}` }}>
            {data.map((d, i) => (
              <div
                key={d.day}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, background: hover === i ? '#f1f5f9' : 'transparent', borderRadius: 4, cursor: 'default' }}
              >
                {series.map((s, si) => {
                  const v = d[s.key] || 0;
                  return <span key={s.key} style={{ width: '38%', maxWidth: 12, height: `${(v / max) * (H - 8)}px`, minHeight: v ? 3 : 0, background: SERIES[si], borderRadius: '4px 4px 0 0' }} />;
                })}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {data.map((d, i) => (
              <span key={d.day} style={{ flex: 1, textAlign: 'center', fontSize: '0.66rem', color: INK.faint, visibility: i % 2 === 0 || i === data.length - 1 ? 'visible' : 'hidden' }}>
                {day(d.day)}
              </span>
            ))}
          </div>
          {hover !== null && data[hover] && (
            <div style={{ position: 'absolute', top: 0, left: `${Math.min(80, (hover / data.length) * 100)}%`, background: INK.primary, color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: '0.76rem', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              <div style={{ fontWeight: 800 }}>{day(data[hover].day)}</div>
              {series.map((s) => (
                <div key={s.key}>
                  {s.label}: <strong>{data[hover][s.key] || 0}</strong>
                </div>
              ))}
            </div>
          )}
          <span style={srOnly}>Use “Show table” for the exact numbers.</span>
        </div>
      )}
    </figure>
  );
}
