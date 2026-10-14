import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, RefreshCw, UploadCloud, Search, AlertCircle, CheckCircle2, Image as ImageIcon, Info } from 'lucide-react';
import heic2any from 'heic2any';
import { api } from '../../services/api';
import { resolveImageUrl } from '../../services/imageService';
import { Card, SectionTitle, Button, Spinner, ErrorBanner, EmptyState, StatusBadge, INK, SERIES, inputStyle, classLabel, fmtDateTime } from './ui';

// RF-DETR decides every report; RT-DETR and YOLOv11 are run on the same photo for comparison only
const MODELS = [
  { key: 'rfdetr', name: 'RF-DETR-Small', role: 'production', color: SERIES[2] },
  { key: 'rtdetr', name: 'RT-DETR (ResNet-18)', role: 'comparison', color: SERIES[0] },
  { key: 'yolov11', name: 'YOLOv11-s', role: 'comparison', color: SERIES[1] },
];
const MODEL_BY_KEY = Object.fromEntries(MODELS.map((m) => [m.key, m]));
const CLASS_KEYS = ['crack_longitudinal', 'crack_transverse', 'crack_alligator', 'pothole', 'crack_structural', 'litter', 'manhole_damaged', 'manhole_missing'];

const pct = (v, d = 0) => (typeof v === 'number' ? `${(v * 100).toFixed(d)}%` : '—');
const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.74rem', color: INK.muted, fontWeight: 700, borderBottom: `1px solid ${INK.line}`, whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.85rem', color: INK.primary, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };

/** One shape for a model's output, whether it came from a stored report or a live test */
const normalize = (key, r) => {
  const meta = MODEL_BY_KEY[key];
  if (!r) return { ...meta, available: false, missing: true, error: 'Not run on this photo yet' };
  if (r.available === false) return { ...meta, available: false, error: r.error || 'Model not available' };
  return {
    ...meta,
    name: r.name || r.model || meta.name,
    available: true,
    hasDefect: Boolean(r.hasDefect),
    category: r.category,
    confidence: r.confidence || 0,
    detectionsCount: r.detectionsCount ?? (r.bboxes || []).length,
    bboxes: r.bboxes || [],
    candidates: r.candidates || [],
    threshold: r.threshold ?? r.thresholds?.default,
    resolution: r.resolution,
    inferenceMs: r.inferenceMs,
    device: r.device,
    gan: r.gan
      ? {
          applied: Boolean(r.gan.applied),
          name: r.gan.name,
          ms: r.gan.ms,
          reason: r.gan.reason,
          src: r.gan.restoredPreview || (r.gan.restoredUrl ? resolveImageUrl(r.gan.restoredUrl) : null),
        }
      : null,
  };
};
const fromStored = (rows = []) => MODELS.map((m) => normalize(m.key, rows.find((r) => r.key === m.key)));
const fromLive = (results = {}) => MODELS.map((m) => normalize(m.key, results[m.key]));
const finding = (r) => (!r || !r.available ? null : r.hasDefect ? r.category : 'clean');

/** Photo with one model's boxes. Boxes are [ymin, xmin, ymax, xmax] fractions of the upright photo. */
function BoxedPhoto({ src, boxes = [], color, alt }) {
  return (
    <div style={{ background: INK.primary, borderRadius: 10, overflow: 'hidden', lineHeight: 0 }}>
      <div style={{ position: 'relative' }}>
        <img src={src} alt={alt} style={{ width: '100%', height: 'auto', display: 'block' }} />
        {boxes.map((b, i) => {
          const [y0, x0, y1, x1] = b.box;
          return (
            <div
              key={i}
              title={`${classLabel(b.label)} ${pct(b.score)}${b.candidate ? ' (below threshold)' : ''}`}
              style={{
                position: 'absolute',
                top: `${y0 * 100}%`,
                left: `${x0 * 100}%`,
                width: `${(x1 - x0) * 100}%`,
                height: `${(y1 - y0) * 100}%`,
                border: `2px ${b.candidate ? 'dashed' : 'solid'} ${color}`,
                background: b.candidate ? 'transparent' : `${color}26`,
                borderRadius: 3,
                boxShadow: '0 0 0 1px rgba(255,255,255,0.55)',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: y0 < 0.08 ? 0 : -18,
                  left: -2,
                  background: color,
                  color: '#fff',
                  fontSize: '0.66rem',
                  lineHeight: 1.5,
                  fontWeight: 700,
                  padding: '0 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  opacity: b.candidate ? 0.85 : 1,
                }}
              >
                {classLabel(b.label)} {pct(b.score)}
                {b.candidate ? ' ?' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModelPanel({ r, src, showUnsure, running }) {
  const boxes = r.available ? [...r.bboxes, ...(showUnsure ? r.candidates.map((c) => ({ ...c, candidate: true })) : [])] : [];
  const photo = r.gan && r.gan.applied && r.gan.src ? r.gan.src : src;
  return (
    <div style={{ border: `1.5px solid ${r.color}55`, borderRadius: 12, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800, color: INK.primary, fontSize: '0.9rem' }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: r.color }} />
          {r.name}
        </span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: r.role === 'production' ? '#047857' : INK.muted, textTransform: 'uppercase' }}>
          {r.role === 'production' ? 'Decides report' : 'Comparison'}
        </span>
      </div>
      {running ? (
        <Spinner label="Running…" />
      ) : !r.available ? (
        <div style={{ padding: '28px 10px', textAlign: 'center', color: INK.muted, background: '#f8fafc', borderRadius: 10, fontSize: '0.84rem' }}>{r.error}</div>
      ) : (
        <>
          {r.gan && (
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: r.gan.applied ? '#6d28d9' : INK.muted }}>
              {r.gan.applied
                ? `On its GAN-restored photo${r.gan.ms ? ` · GAN ${Math.round(r.gan.ms)} ms` : ''}`
                : `No GAN: original photo${r.gan.reason ? ` (${r.gan.reason})` : ''}`}
            </div>
          )}
          <BoxedPhoto src={photo} boxes={boxes} color={r.color} alt={`${r.name} detections`} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {r.hasDefect ? <AlertCircle size={16} color={r.color} aria-hidden="true" /> : <CheckCircle2 size={16} color="#16a34a" aria-hidden="true" />}
            <span style={{ fontWeight: 800, color: INK.primary }}>{r.hasDefect ? classLabel(r.category) : 'No defect found'}</span>
            {r.hasDefect && <span style={{ fontSize: '0.82rem', color: INK.muted }}>{pct(r.confidence)}</span>}
          </div>
          <div style={{ fontSize: '0.76rem', color: INK.muted, lineHeight: 1.5 }}>
            {r.detectionsCount} box{r.detectionsCount === 1 ? '' : 'es'} above {pct(r.threshold)}
            {r.candidates.length ? ` · ${r.candidates.length} unsure` : ''}
            <br />
            <Clock size={12} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {Math.round(r.inferenceMs || 0)} ms on {r.device || '—'}
            {r.resolution ? ` · ${r.resolution}px input` : ''}
          </div>
        </>
      )}
    </div>
  );
}

/** Original photo once, then every model's output on it, side by side */
function ComparisonView({ title, subtitle, src, rows, running, report, onRerun, ganMode, onGanMode }) {
  const [showUnsure, setShowUnsure] = useState(false);
  const ran = rows.filter((r) => r.available);
  const cats = new Set(ran.map(finding));
  const agreement = ran.length < 2 ? null : cats.size === 1 ? `All ${ran.length} models agree: ${[...cats][0] === 'clean' ? 'no defect' : classLabel([...cats][0])}` : 'The models disagree';
  const anyUnsure = ran.some((r) => r.candidates.length);

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, color: INK.primary, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <ImageIcon size={17} aria-hidden="true" /> {title}
            {report && <StatusBadge status={report.status} />}
          </div>
          {subtitle && <div style={{ fontSize: '0.82rem', color: INK.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {agreement && !running && (
            <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700, background: cats.size === 1 ? '#dcfce7' : '#fef3c7', color: cats.size === 1 ? '#166534' : '#92400e' }}>
              {agreement}
            </span>
          )}
          {anyUnsure && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: INK.secondary, fontWeight: 600, cursor: 'pointer' }}>
              <input type="checkbox" checked={showUnsure} onChange={(e) => setShowUnsure(e.target.checked)} /> Show unsure boxes
            </label>
          )}
          {onGanMode && (
            <div role="group" aria-label="Photo the models analyse" style={{ display: 'inline-flex', border: `1px solid ${INK.line}`, borderRadius: 9, overflow: 'hidden' }}>
              {[
                [false, 'Original photo'],
                [true, 'With GAN'],
              ].map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={ganMode === v}
                  disabled={running}
                  onClick={() => onGanMode(v)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: running ? 'wait' : 'pointer',
                    background: ganMode === v ? INK.primary : '#fff',
                    color: ganMode === v ? '#fff' : INK.secondary,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {onRerun && (
            <Button variant="secondary" onClick={onRerun} disabled={running} style={{ padding: '6px 12px' }}>
              <RefreshCw size={14} aria-hidden="true" /> Re-run models
            </Button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'start' }}>
        <div style={{ border: `1.5px solid ${INK.line}`, borderRadius: 12, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 800, color: INK.primary, fontSize: '0.9rem' }}>Original photo</span>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: INK.muted, textTransform: 'uppercase' }}>No boxes</span>
          </div>
          <BoxedPhoto src={src} alt="Original photo" color={INK.primary} />
          {report && (
            <div style={{ fontSize: '0.78rem', color: INK.secondary, lineHeight: 1.5 }}>
              <strong>Final report:</strong> {classLabel(report.category)} {pct(report.confidence)}
              {report.aiReview && (
                <>
                  <br />
                  Verification agent: <strong>{report.aiReview.verdict}</strong>
                  {report.aiReview.original && report.aiReview.original.category !== report.category
                    ? ` (RF-DETR said ${classLabel(report.aiReview.original.category)})`
                    : ''}
                </>
              )}
            </div>
          )}
        </div>
        {rows.map((r) => (
          <ModelPanel key={r.key} r={r} src={src} showUnsure={showUnsure} running={running} />
        ))}
      </div>

      {!running && ran.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>Model</th>
                <th style={th}>Finding</th>
                <th style={th}>Confidence</th>
                <th style={th}>Boxes</th>
                <th style={th}>Unsure</th>
                <th style={th}>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: r.color, marginRight: 6 }} />
                    {r.name}
                  </td>
                  <td style={td}>{!r.available ? 'n/a' : r.hasDefect ? classLabel(r.category) : 'No defect'}</td>
                  <td style={td}>{r.available && r.hasDefect ? pct(r.confidence) : '—'}</td>
                  <td style={td}>{r.available ? r.detectionsCount : '—'}</td>
                  <td style={td}>{r.available ? r.candidates.length : '—'}</td>
                  <td style={td}>{r.available ? `${Math.round(r.inferenceMs || 0)} ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** How often each comparison model agrees with RF-DETR, across the listed reports */
function AgreementSummary({ reports }) {
  const stats = MODELS.map((m) => {
    let ran = 0;
    let defect = 0;
    let agree = 0;
    let sumConf = 0;
    reports.forEach((rep) => {
      const rows = rep.modelResults || [];
      const r = rows.find((x) => x.key === m.key);
      const base = rows.find((x) => x.key === 'rfdetr');
      if (!r || !r.available) return;
      ran += 1;
      if (r.hasDefect) {
        defect += 1;
        sumConf += r.confidence || 0;
      }
      if (base && base.available && finding(r) === finding(base)) agree += 1;
    });
    return { ...m, ran, defect, agree, avgConf: defect ? sumConf / defect : null };
  });
  if (!stats.some((s) => s.ran)) return null;
  return (
    <Card>
      <SectionTitle>Across these {reports.length} reports</SectionTitle>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={th}>Model</th>
              <th style={th}>Photos run</th>
              <th style={th}>Found a defect</th>
              <th style={th}>Avg. confidence</th>
              <th style={th}>Same finding as RF-DETR</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.key}>
                <td style={{ ...td, fontWeight: 700 }}>
                  <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 6 }} />
                  {s.name}
                </td>
                <td style={td}>{s.ran || '—'}</td>
                <td style={td}>{s.ran ? `${s.defect} / ${s.ran}` : '—'}</td>
                <td style={td}>{pct(s.avgConf)}</td>
                <td style={td}>{s.key === 'rfdetr' ? 'reference' : s.ran ? `${s.agree} / ${s.ran} (${pct(s.agree / s.ran)})` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Saved test-set metrics for each model (from the model service) */
function Benchmark() {
  const [models, setModels] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api.municipal.comparison
      .models()
      .then((d) => setModels(d.models || []))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const ordered = (models || []).slice().sort((a, b) => MODELS.findIndex((m) => m.key === a.key) - MODELS.findIndex((m) => m.key === b.key));
  const avail = ordered.filter((m) => m.available);
  const metric = [
    ['mAP@50', (m) => m.metrics?.mAP50],
    ['mAP@50-95', (m) => m.metrics?.mAP5095],
    ['Precision', (m) => m.metrics?.precision],
    ['Recall', (m) => m.metrics?.recall],
  ];
  return (
    <Card>
      <SectionTitle>Saved benchmark (same dataset, same evaluation)</SectionTitle>
      <ErrorBanner error={error} onRetry={load} />
      {!models && !error && <Spinner label="Loading models…" />}
      {models && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>Metric</th>
                {ordered.map((m) => (
                  <th key={m.key} style={th}>
                    <span aria-hidden="true" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: MODEL_BY_KEY[m.key]?.color, marginRight: 6 }} />
                    {m.name}
                    <div style={{ fontWeight: 500, color: INK.faint }}>{!m.available ? 'checkpoint not added' : m.metrics?.split === 'test' ? 'test set' : 'validation set'}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...td, color: INK.muted, fontWeight: 600 }}>Input / params / epoch</td>
                {ordered.map((m) => (
                  <td key={m.key} style={td}>
                    {m.available ? `${m.resolution || '—'}px · ${m.params_m ?? '—'} M · ep ${m.epoch ?? '—'}` : '—'}
                  </td>
                ))}
              </tr>
              {metric.map(([label, get]) => {
                const vals = avail.map(get).filter((v) => typeof v === 'number');
                const top = vals.length ? Math.max(...vals) : null;
                return (
                  <tr key={label}>
                    <td style={{ ...td, color: INK.muted, fontWeight: 600 }}>{label}</td>
                    {ordered.map((m) => {
                      const v = m.available ? get(m) : null;
                      const best = typeof v === 'number' && v === top && avail.length > 1;
                      return (
                        <td key={m.key} style={{ ...td, fontWeight: best ? 800 : 500 }}>
                          {pct(v, 1)}
                          {best ? ' (best)' : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {CLASS_KEYS.map((c) => (
                <tr key={c}>
                  <td style={{ ...td, color: INK.secondary }}>{classLabel(c)} AP@50-95</td>
                  {ordered.map((m) => (
                    <td key={m.key} style={td}>
                      {m.available ? pct(m.metrics?.per_class_AP5095?.[c], 1) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function ModelComparison() {
  const [reports, setReports] = useState(null);
  const [listError, setListError] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null); // { kind: 'report', report } | { kind: 'photo', name, src, rows }
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  // "With GAN": each model analyses its own Pix2Pix-restored photo (RT-DETR has no GAN)
  const [ganMode, setGanMode] = useState(false);
  const [testGan, setTestGan] = useState(false);
  // What is on screen now, so a slow answer for an earlier choice cannot replace it
  const shown = useRef(null);

  const loadList = useCallback(async (query = '') => {
    setListError('');
    try {
      setReports(await api.municipal.comparison.list(query ? { q: query } : {}));
    } catch (e) {
      setListError(e.message);
      setReports([]);
    }
  }, []);
  useEffect(() => {
    loadList();
  }, [loadList]);

  const run = async (code, enhance = false) => {
    setRunning(true);
    setError('');
    try {
      const report = await api.municipal.comparison.run(code, { enhance });
      if (shown.current === code) setSelected({ kind: 'report', report });
      const field = enhance ? 'modelResultsGan' : 'modelResults';
      setReports((list) => (list || []).map((r) => (r.reportCode === code ? { ...r, [field]: report[field] } : r)));
    } catch (e) {
      if (shown.current === code) setError(e.message);
    } finally {
      if (shown.current === code) setRunning(false);
    }
  };

  const openReport = async (code) => {
    shown.current = code;
    setError('');
    setRunning(false);
    try {
      const report = await api.municipal.comparison.get(code);
      if (shown.current !== code) return;
      setSelected({ kind: 'report', report });
      // Reports uploaded before every model was run on upload: run them now and store the result
      if (!((ganMode ? report.modelResultsGan : report.modelResults) || []).length) run(code, ganMode);
    } catch (e) {
      setError(e.message);
    }
  };

  // Switching to "With GAN" on a report that has no GAN results yet runs them once and stores them
  const switchGan = (v) => {
    setGanMode(v);
    if (selected && selected.kind === 'report') {
      const r = selected.report;
      if (!((v ? r.modelResultsGan : r.modelResults) || []).length) run(r.reportCode, v);
    }
  };

  // Open the newest report by default
  useEffect(() => {
    if (reports && reports.length && !selected) openReport(reports[0].reportCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  const testPhoto = async (file) => {
    if (!file) return;
    setError('');
    let preview = file;
    if (/\.hei[cf]$/i.test(file.name) || /heic|heif/.test(file.type)) {
      try {
        const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
        preview = Array.isArray(out) ? out[0] : out;
      } catch {
        /* the models still read the HEIC; only the preview may be missing */
      }
    }
    const src = URL.createObjectURL(preview);
    const token = `photo:${Date.now()}`;
    shown.current = token;
    const gan = testGan;
    setSelected({ kind: 'photo', name: file.name, src, rows: null, gan });
    setRunning(true);
    try {
      const data = await api.municipal.comparison.upload(file, { enhance: gan });
      if (shown.current === token) setSelected({ kind: 'photo', name: file.name, src, rows: fromLive(data.results), gan });
    } catch (e) {
      if (shown.current === token) {
        setError(e.message);
        setSelected(null);
      }
    } finally {
      if (shown.current === token) setRunning(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Release the object URL of a tested photo when it is replaced
  const photoSrc = selected && selected.kind === 'photo' ? selected.src : null;
  useEffect(() => () => photoSrc && URL.revokeObjectURL(photoSrc), [photoSrc]);

  const view = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === 'photo') {
      return {
        title: selected.name,
        subtitle: selected.gan
          ? "Test photo: each model on its own GAN-restored photo, nothing stored"
          : 'Test photo: run through every model, nothing stored',
        src: selected.src,
        rows: selected.rows || MODELS.map((m) => normalize(m.key, null)),
      };
    }
    const r = selected.report;
    return {
      title: r.reportCode,
      subtitle: `${r.title || classLabel(r.category)} · reported ${fmtDateTime(r.createdAt)}`,
      src: resolveImageUrl(r.imageUrl, r.category),
      rows: fromStored(ganMode ? r.modelResultsGan : r.modelResults),
      report: r,
      onRerun: () => run(r.reportCode, ganMode),
      ganMode,
      onGanMode: switchGan,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ganMode]);

  const selectedCode = selected && selected.kind === 'report' ? selected.report.reportCode : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <SectionTitle
          right={
            <>
              <input ref={fileRef} type="file" accept="image/*,.heic,.heif" style={{ display: 'none' }} onChange={(e) => testPhoto(e.target.files && e.target.files[0])} />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: INK.secondary, fontWeight: 600, cursor: 'pointer' }}>
                <input type="checkbox" checked={testGan} onChange={(e) => setTestGan(e.target.checked)} /> with GAN
              </label>
              <Button variant="secondary" disabled={running} onClick={() => fileRef.current && fileRef.current.click()}>
                <UploadCloud size={15} aria-hidden="true" /> Test any photo
              </Button>
            </>
          }
        >
          Model comparison: RF-DETR vs RT-DETR vs YOLOv11
        </SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.84rem', color: INK.secondary, lineHeight: 1.55, marginBottom: 14 }}>
          <Info size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: INK.muted }} />
          <span>
            Every photo a citizen uploads is run through all three detectors. Only <strong>RF-DETR</strong> decides the report (then the
            verification agent and dispatch); RT-DETR and YOLOv11 are recorded here for comparison and never create or dispatch anything.
            Pick a report to see the original photo next to each model's output.
          </span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            loadList(q.trim());
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tracking ID, e.g. CS-XXXX-XXXX" aria-label="Tracking ID" style={{ ...inputStyle, fontFamily: 'monospace', width: 280 }} />
          <Button type="submit" variant="dark">
            <Search size={14} aria-hidden="true" /> Find
          </Button>
          {q && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQ('');
                loadList('');
              }}
            >
              Show all
            </Button>
          )}
        </form>

        <ErrorBanner error={listError} onRetry={() => loadList(q.trim())} />
        {!reports && <Spinner label="Loading reports…" />}
        {reports && !reports.length && !listError && <EmptyState title="No reports with a photo" text="Reports appear here once citizens upload photos." />}
        {reports && reports.length > 0 && (
          <div role="listbox" aria-label="Reports" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
            {reports.map((r) => {
              const active = r.reportCode === selectedCode;
              return (
                <button
                  key={r.reportCode}
                  role="option"
                  aria-selected={active}
                  onClick={() => openReport(r.reportCode)}
                  style={{
                    flex: '0 0 168px',
                    textAlign: 'left',
                    padding: 8,
                    borderRadius: 10,
                    border: `2px solid ${active ? INK.primary : INK.line}`,
                    background: active ? '#f1f5f9' : '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <img src={resolveImageUrl(r.imageUrl, r.category)} alt="" style={{ width: '100%', height: 92, objectFit: 'cover', borderRadius: 6, background: INK.line }} />
                  <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700, color: INK.primary }}>
                    {r.reportCode}
                    {r.gan && r.gan.applied && (
                      <span title="The citizen asked for GAN enhancement" style={{ marginLeft: 6, fontFamily: 'inherit', fontSize: '0.64rem', padding: '1px 5px', borderRadius: 4, background: '#ede9fe', color: '#6d28d9' }}>
                        GAN
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: '0.76rem', color: INK.secondary }}>{classLabel(r.category)}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {MODELS.map((m) => {
                      const res = (r.modelResults || []).find((x) => x.key === m.key);
                      const f = finding(res);
                      return (
                        <span key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: INK.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span aria-hidden="true" style={{ flex: '0 0 7px', height: 7, borderRadius: 2, background: m.color }} />
                          {m.name.split(' ')[0]}: {f === null ? (res ? 'n/a' : 'not run') : f === 'clean' ? 'none' : classLabel(f)}
                        </span>
                      );
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <ErrorBanner error={error} />
      {view && <ComparisonView {...view} running={running} />}
      {reports && reports.length > 0 && <AgreementSummary reports={reports} />}
      <Benchmark />
    </div>
  );
}
