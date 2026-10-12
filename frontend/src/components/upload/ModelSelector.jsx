import React, { useEffect, useState } from 'react';
import { Cpu, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';

// Shown until /api/upload/models answers (or if the model service is offline)
export const MODEL_OPTIONS = [
  { key: 'rfdetr', name: 'RF-DETR-Small', role: 'production' },
  { key: 'yolov11', name: 'YOLOv11-s', role: 'comparison' },
  { key: 'rtdetr', name: 'RT-DETR (ResNet-50)', role: 'comparison' },
];

const pct = (v) => (typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '—');

/** Lets the user pick which trained detector analyses the photo. */
export default function ModelSelector({ value, onChange, disabled = false }) {
  const [models, setModels] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listModels()
      .then((d) => alive && setModels(d.models || []))
      .catch(() => alive && setOffline(true));
    return () => {
      alive = false;
    };
  }, []);

  const list = models || MODEL_OPTIONS.map((m) => ({ ...m, available: !offline && m.key === 'rfdetr' }));

  // If the chosen model turns out to be unavailable, fall back to the production model
  useEffect(() => {
    if (models && !models.some((m) => m.key === value && m.available)) onChange('rfdetr');
  }, [models, value, onChange]);

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '18px 24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
        <Cpu size={18} color="#059669" />
        <span>Detection model</span>
      </div>
      <p style={{ fontSize: '0.84rem', color: '#64748b', marginBottom: '12px', lineHeight: 1.5 }}>
        RF-DETR is the production model. YOLOv11 and RT-DETR can be chosen to see how the other trained models handle
        the same photo.
      </p>
      <div role="radiogroup" aria-label="Detection model" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
        {list.map((m) => {
          const selected = value === m.key;
          const usable = m.available && !disabled;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${m.name}${m.available ? '' : ' (not available)'}`}
              disabled={!usable}
              onClick={() => usable && onChange(m.key)}
              style={{
                textAlign: 'left',
                padding: '10px 14px',
                borderRadius: '10px',
                border: selected ? '2px solid #059669' : '1px solid #e2e8f0',
                background: selected ? '#ecfdf5' : m.available ? '#ffffff' : '#f8fafc',
                opacity: m.available ? 1 : 0.6,
                cursor: usable ? 'pointer' : 'not-allowed',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.92rem' }}>{m.name}</span>
                <span
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: m.role === 'production' ? '#d1fae5' : '#e0e7ff',
                    color: m.role === 'production' ? '#047857' : '#3730a3',
                  }}
                >
                  {m.role === 'production' ? 'Production' : 'Comparison'}
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '4px' }}>
                {m.available
                  ? m.metrics
                    ? `${m.metrics.split === 'test' ? 'Test' : 'Val'} mAP@50 ${pct(m.metrics.mAP50)}`
                    : 'Ready'
                  : models
                    ? 'Checkpoint not added yet'
                    : 'Model service offline'}
              </div>
            </button>
          );
        })}
      </div>
      {offline && (
        <div role="alert" style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center', color: '#b45309', fontSize: '0.84rem', fontWeight: 600 }}>
          <AlertCircle size={16} />
          <span>The model service is not reachable. Start it with: python backend/inference_server.py</span>
        </div>
      )}
    </div>
  );
}
