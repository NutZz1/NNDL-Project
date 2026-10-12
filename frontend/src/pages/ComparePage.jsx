import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Cpu, Clock, UploadCloud, AlertCircle, CheckCircle2, Image as ImageIcon, Trash2 } from 'lucide-react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import { api } from '../services/api';
import { MODEL_OPTIONS } from '../components/upload/ModelSelector';

const MODEL_COLORS = { rfdetr: '#059669', yolov11: '#d97706', rtdetr: '#4f46e5' };
const CLASS_LABELS = {
  crack_longitudinal: 'Longitudinal crack',
  crack_transverse: 'Transverse crack',
  crack_alligator: 'Alligator crack',
  pothole: 'Pothole',
  crack_structural: 'Structural crack',
  litter: 'Litter',
  manhole_damaged: 'Damaged manhole',
  manhole_missing: 'Missing manhole',
};
const CLASS_KEYS = Object.keys(CLASS_LABELS);
const SAMPLE_PHOTOS = [
  ['photo_pothole.jpg', 'Pothole'],
  ['photo_alligator_crack.jpg', 'Alligator crack'],
  ['photo_long_crack.jpg', 'Longitudinal crack'],
  ['photo_trans_crack.jpg', 'Transverse crack'],
  ['photo_structural_crack.jpg', 'Structural crack'],
  ['photo_litter.jpg', 'Litter'],
  ['photo_manhole_damaged.jpg', 'Damaged manhole'],
  ['photo_manhole_missing.jpg', 'Missing manhole'],
];

const pct = (v, d = 1) => (typeof v === 'number' ? `${(v * 100).toFixed(d)}%` : '—');
const nice = (s) => CLASS_LABELS[s] || String(s || '').replace(/_/g, ' ');

const card = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '22px 24px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
};
const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.76rem', color: '#64748b', fontWeight: 700, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '0.86rem', color: '#0f172a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };

/** Photo with one model's boxes drawn on it. Boxes are [ymin, xmin, ymax, xmax] fractions. */
function DetectionImage({ src, boxes = [], color }) {
  return (
    <div style={{ background: '#0f172a', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ position: 'relative' }}>
        <img src={src} alt="Analysed street photo" style={{ width: '100%', height: 'auto', display: 'block' }} />
        {boxes.map((b, i) => {
          const [y0, x0, y1, x1] = b.box;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: `${y0 * 100}%`,
                left: `${x0 * 100}%`,
                width: `${(x1 - x0) * 100}%`,
                height: `${(y1 - y0) * 100}%`,
                border: `2.5px ${b.candidate ? 'dashed' : 'solid'} ${color}`,
                background: b.candidate ? 'transparent' : `${color}22`,
                borderRadius: '3px',
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: y0 < 0.08 ? 0 : '-20px',
                  left: '-2px',
                  background: color,
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '3px',
                  whiteSpace: 'nowrap',
                  opacity: b.candidate ? 0.85 : 1,
                }}
              >
                {nice(b.label)} {Math.round(b.score * 100)}%{b.candidate ? ' (unsure)' : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Saved test-set metrics for every model, side by side */
function BenchmarkTable({ models }) {
  const avail = models.filter((m) => m.available);
  const best = (getter) => {
    const vals = avail.map(getter).filter((v) => typeof v === 'number');
    return vals.length ? Math.max(...vals) : null;
  };
  const rows = [
    ['Role', (m) => (m.role === 'production' ? 'Production' : 'Comparison')],
    ['Architecture', (m) => m.architecture],
    ['Input size', (m) => (m.resolution ? `${m.resolution} × ${m.resolution}` : '—')],
    ['Parameters', (m) => (m.params_m ? `${m.params_m} M` : '—')],
    ['Best epoch', (m) => m.epoch ?? '—'],
  ];
  const metricRows = [
    ['mAP@50', (m) => m.metrics?.mAP50],
    ['mAP@50-95', (m) => m.metrics?.mAP5095],
    ['Precision', (m) => m.metrics?.precision],
    ['Recall', (m) => m.metrics?.recall],
    ['AP small', (m) => m.metrics?.AP_small],
    ['AP medium', (m) => m.metrics?.AP_medium],
    ['AP large', (m) => m.metrics?.AP_large],
  ];
  const splitNote = (m) => (m.metrics ? (m.metrics.split === 'test' ? 'test set' : 'validation (no test file yet)') : '');

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
        <thead>
          <tr>
            <th style={th}>Metric</th>
            {models.map((m) => (
              <th key={m.key} style={{ ...th, color: MODEL_COLORS[m.key] }}>
                {m.name}
                {!m.available && <div style={{ fontWeight: 600, color: '#94a3b8' }}>checkpoint not added</div>}
                {m.available && <div style={{ fontWeight: 500, color: '#94a3b8' }}>{splitNote(m)}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, get]) => (
            <tr key={label}>
              <td style={{ ...td, color: '#64748b', fontWeight: 600 }}>{label}</td>
              {models.map((m) => (
                <td key={m.key} style={{ ...td, fontSize: label === 'Architecture' ? '0.78rem' : td.fontSize }}>
                  {m.available ? get(m) : '—'}
                </td>
              ))}
            </tr>
          ))}
          {metricRows.map(([label, get]) => {
            const top = best(get);
            if (!avail.some((m) => typeof get(m) === 'number')) return null;
            return (
              <tr key={label}>
                <td style={{ ...td, color: '#64748b', fontWeight: 600 }}>{label}</td>
                {models.map((m) => {
                  const v = m.available ? get(m) : null;
                  const isBest = typeof v === 'number' && v === top && avail.length > 1;
                  return (
                    <td key={m.key} style={{ ...td, fontWeight: isBest ? 800 : 500, color: isBest ? '#047857' : td.color }}>
                      {pct(v)}
                      {isBest ? ' ★' : ''}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PerClassTable({ models }) {
  const avail = models.filter((m) => m.available && m.metrics?.per_class_AP5095);
  if (!avail.length) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
        <thead>
          <tr>
            <th style={th}>Class (AP@50-95)</th>
            {avail.map((m) => (
              <th key={m.key} style={{ ...th, color: MODEL_COLORS[m.key] }}>{m.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CLASS_KEYS.map((c) => {
            const vals = avail.map((m) => m.metrics.per_class_AP5095[c]);
            const top = Math.max(...vals.filter((v) => typeof v === 'number'));
            return (
              <tr key={c}>
                <td style={{ ...td, color: '#334155', fontWeight: 600 }}>{nice(c)}</td>
                {avail.map((m, i) => {
                  const v = vals[i];
                  return (
                    <td key={m.key} style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: '0 0 90px', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, (v || 0) * 100 / 0.7)}%`, height: '100%', background: MODEL_COLORS[m.key] }} />
                        </div>
                        <span style={{ fontWeight: v === top && avail.length > 1 ? 800 : 500 }}>{pct(v)}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ComparePage({ onNavigate, onOpenLogin, isLoggedIn }) {
  const [models, setModels] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [preview, setPreview] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);

  const loadModels = () => {
    setCatalogError('');
    api
      .listModels()
      .then((d) => setModels(d.models || []))
      .catch((e) => {
        setCatalogError(e.message);
        setModels(MODEL_OPTIONS.map((m) => ({ ...m, available: false })));
      });
  };
  useEffect(loadModels, []);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const runCompare = async (file, name) => {
    setError('');
    setResult(null);
    setFileName(name || file.name);
    setPreview(URL.createObjectURL(file));
    setRunning(true);
    try {
      const data = await api.compareModels(file);
      setResult(data);
      setHistory((h) => [{ name: name || file.name, results: data.results, at: new Date() }, ...h].slice(0, 20));
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const runSample = async (file, label) => {
    try {
      const blob = await (await fetch(`/${file}`)).blob();
      runCompare(new File([blob], file, { type: blob.type || 'image/jpeg' }), `${label} (sample)`);
    } catch {
      setError('Could not load the sample photo.');
    }
  };

  const keys = (models || MODEL_OPTIONS).map((m) => m.key);

  // Session statistics across every photo tested on this page
  const session = useMemo(() => {
    const s = {};
    keys.forEach((k) => {
      const runs = history.map((h) => h.results[k]).filter((r) => r && r.available);
      s[k] = {
        runs: runs.length,
        avgMs: runs.length ? runs.reduce((a, r) => a + (r.inferenceMs || 0), 0) / runs.length : null,
        withDefect: runs.filter((r) => r.hasDefect).length,
        avgConf: runs.filter((r) => r.hasDefect).length
          ? runs.filter((r) => r.hasDefect).reduce((a, r) => a + r.confidence, 0) / runs.filter((r) => r.hasDefect).length
          : null,
      };
    });
    return s;
  }, [history, keys.join()]);

  const agreement = useMemo(() => {
    if (!result) return null;
    const ran = Object.values(result.results).filter((r) => r.available);
    if (ran.length < 2) return null;
    const cats = new Set(ran.map((r) => r.category));
    return cats.size === 1 ? `All ${ran.length} models agree: ${nice([...cats][0])}` : `Models disagree: ${ran.map((r) => `${r.model} → ${nice(r.category)}`).join(' · ')}`;
  }, [result]);

  const maxMap = models ? Math.max(0.01, ...models.filter((m) => m.available).map((m) => m.metrics?.mAP50 || 0)) : 1;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <Navbar currentPage="compare" onNavigate={onNavigate} onOpenLogin={onOpenLogin} isLoggedIn={isLoggedIn} />
      <main style={{ flex: 1, padding: '40px 24px 64px' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#059669', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '10px' }}>
              <BarChart3 size={15} />
              <span>Deep learning model comparison</span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.9rem, 3vw, 2.4rem)', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
              RF-DETR vs YOLOv11 vs RT-DETR
            </h1>
            <p style={{ color: '#64748b', maxWidth: '720px', margin: '0 auto', lineHeight: 1.6 }}>
              Every model was trained on the same CivicScan dataset (8 classes, seed 42) and evaluated on the same 4,672-image
              test split with masked COCO evaluation. Below: their saved test results, and a live test that runs all of them on
              one photo inside the product.
            </p>
          </div>

          {/* ------------------------------------------------ saved benchmark */}
          <section style={card}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>Test-set benchmark</h2>
            <p style={{ fontSize: '0.84rem', color: '#64748b', marginBottom: '16px' }}>
              Read from each model's run folder (test_eval.json / test_ap50.json), served by the model service. ★ marks the best value.
            </p>
            {!models && <div style={{ color: '#64748b' }}>Loading models…</div>}
            {catalogError && (
              <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#b45309', fontWeight: 600, marginBottom: '12px' }}>
                <AlertCircle size={18} />
                <span>{catalogError}</span>
                <button type="button" onClick={loadModels} style={{ marginLeft: '8px', padding: '4px 12px', borderRadius: '6px', border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e', fontWeight: 700, cursor: 'pointer' }}>
                  Retry
                </button>
              </div>
            )}
            {models && (
              <>
                <div style={{ display: 'grid', gap: '10px', marginBottom: '20px' }}>
                  {models.map((m) => (
                    <div key={m.key} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 70px', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontWeight: 700, color: MODEL_COLORS[m.key], fontSize: '0.9rem' }}>{m.name}</span>
                      <div style={{ height: '14px', background: '#f1f5f9', borderRadius: '7px', overflow: 'hidden' }}>
                        <div style={{ width: `${m.available ? ((m.metrics?.mAP50 || 0) / maxMap) * 100 : 0}%`, height: '100%', background: MODEL_COLORS[m.key], transition: 'width .6s' }} />
                      </div>
                      <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a' }}>{m.available ? pct(m.metrics?.mAP50) : 'n/a'}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>mAP@50 on the test split</div>
                </div>
                <BenchmarkTable models={models} />
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: '22px 0 8px' }}>Per-class accuracy</h3>
                <PerClassTable models={models} />
              </>
            )}
          </section>

          {/* ------------------------------------------------ live test */}
          <section style={card}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>Live test: all models on one photo</h2>
            <p style={{ fontSize: '0.84rem', color: '#64748b', marginBottom: '16px' }}>
              Upload a street photo or pick a sample. Each model runs with its own calibrated threshold; dashed boxes are
              detections below that threshold (shown, but not reported). Nothing is stored.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
              <input
                ref={inputRef}
                type="file"
                accept="image/*,.heic,.heif"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files && e.target.files[0] && runCompare(e.target.files[0])}
              />
              <button
                type="button"
                disabled={running}
                onClick={() => inputRef.current && inputRef.current.click()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', borderRadius: '8px', background: '#059669', color: '#fff', fontWeight: 700, border: 'none', cursor: running ? 'wait' : 'pointer' }}
              >
                <UploadCloud size={17} />
                <span>{running ? 'Running every model…' : 'Upload photo'}</span>
              </button>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>or try a sample:</span>
              {SAMPLE_PHOTOS.map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  disabled={running}
                  onClick={() => runSample(f, label)}
                  style={{ padding: '6px 10px', borderRadius: '999px', border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.78rem', fontWeight: 600, color: '#334155', cursor: running ? 'wait' : 'pointer' }}
                >
                  {label}
                </button>
              ))}
            </div>

            {error && (
              <div role="alert" style={{ display: 'flex', gap: '8px', padding: '12px 14px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 600, marginBottom: '14px' }}>
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {(running || result) && (
              <div style={{ fontSize: '0.86rem', color: '#334155', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ImageIcon size={16} />
                <strong>{fileName}</strong>
                {agreement && <span style={{ marginLeft: '8px', padding: '2px 10px', borderRadius: '999px', background: agreement.startsWith('All') ? '#dcfce7' : '#fef3c7', color: agreement.startsWith('All') ? '#166534' : '#92400e', fontWeight: 700, fontSize: '0.78rem' }}>{agreement}</span>}
              </div>
            )}

            {(running || result) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                {keys.map((k) => {
                  const r = result && result.results[k];
                  const meta = (models || MODEL_OPTIONS).find((m) => m.key === k) || {};
                  const color = MODEL_COLORS[k];
                  const boxes = r && r.available ? [...(r.bboxes || []), ...(r.candidates || []).map((c) => ({ ...c, candidate: true }))] : [];
                  return (
                    <div key={k} style={{ border: `1.5px solid ${color}44`, borderRadius: '14px', padding: '14px', background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 800, color }}>{meta.name || k}</span>
                        {r && r.available && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', color: '#64748b' }}>
                            <Clock size={13} /> {Math.round(r.inferenceMs)} ms · {r.device}
                          </span>
                        )}
                      </div>
                      {running && <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>Running…</div>}
                      {r && !r.available && (
                        <div style={{ padding: '30px 12px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '10px', fontSize: '0.86rem' }}>
                          Not available: {r.error}
                        </div>
                      )}
                      {r && r.available && (
                        <>
                          <DetectionImage src={preview} boxes={boxes} color={color} />
                          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {r.hasDefect ? <AlertCircle size={17} color={color} /> : <CheckCircle2 size={17} color="#16a34a" />}
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>{r.hasDefect ? nice(r.category) : 'No defect found'}</span>
                            {r.hasDefect && <span style={{ fontSize: '0.84rem', color: '#64748b' }}>{pct(r.confidence, 0)} confidence</span>}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
                            {r.detectionsCount} detection{r.detectionsCount === 1 ? '' : 's'} above {pct(r.thresholds?.default, 0)}
                            {r.candidates?.length ? ` · ${r.candidates.length} unsure` : ''} · input {r.resolution}px
                          </div>
                          {r.bboxes?.length > 0 && (
                            <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '0.8rem', color: '#334155' }}>
                              {r.bboxes.map((b, i) => (
                                <li key={i}>
                                  {nice(b.label)} {pct(b.score, 0)}
                                  {b.alternatives?.length ? <span style={{ color: '#94a3b8' }}> (also: {b.alternatives.map((a) => `${nice(a.label)} ${pct(a.score, 0)}`).join(', ')})</span> : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ------------------------------------------------ session results */}
          {history.length > 0 && (
            <section style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  <Cpu size={18} style={{ verticalAlign: '-3px', marginRight: '6px' }} />
                  This session ({history.length} photo{history.length === 1 ? '' : 's'})
                </h2>
                <button type="button" onClick={() => setHistory([])} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Trash2 size={14} /> Clear
                </button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px', marginBottom: '16px' }}>
                  <thead>
                    <tr>
                      <th style={th}>Model</th>
                      <th style={th}>Photos run</th>
                      <th style={th}>Found a defect</th>
                      <th style={th}>Avg. confidence</th>
                      <th style={th}>Avg. inference time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k}>
                        <td style={{ ...td, fontWeight: 700, color: MODEL_COLORS[k] }}>{((models || MODEL_OPTIONS).find((m) => m.key === k) || {}).name}</td>
                        <td style={td}>{session[k].runs || '—'}</td>
                        <td style={td}>{session[k].runs ? `${session[k].withDefect} / ${session[k].runs}` : '—'}</td>
                        <td style={td}>{pct(session[k].avgConf, 0)}</td>
                        <td style={td}>{session[k].avgMs !== null ? `${Math.round(session[k].avgMs)} ms` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                  <thead>
                    <tr>
                      <th style={th}>Photo</th>
                      {keys.map((k) => (
                        <th key={k} style={{ ...th, color: MODEL_COLORS[k] }}>{((models || MODEL_OPTIONS).find((m) => m.key === k) || {}).name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i}>
                        <td style={td}>{h.name}</td>
                        {keys.map((k) => {
                          const r = h.results[k];
                          return (
                            <td key={k} style={td}>
                              {!r || !r.available ? '—' : r.hasDefect ? `${nice(r.category)} ${pct(r.confidence, 0)}` : 'none'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}
