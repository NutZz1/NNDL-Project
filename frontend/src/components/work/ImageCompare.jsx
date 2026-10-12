import React, { useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Eye, EyeOff } from 'lucide-react';
import { resolveImageUrl } from '../../services/imageService';
import { INK, SERIES, classLabel, Button } from './ui';

/*
 * Original photo | detected photo (same pixels + the detector's boxes), side by side.
 * Zoom and scrolling are shared, so both views always show the same area.
 * The detector reads photos upright (EXIF rotation applied), the same way the browser
 * shows them, so the boxes line up with the picture.
 */
export default function ImageCompare({ imageUrl, boxes = [], afterImageUrl }) {
  const [zoom, setZoom] = useState(1);
  const [showBoxes, setShowBoxes] = useState(true);
  const left = useRef(null);
  const right = useRef(null);
  const syncing = useRef(false);
  const src = resolveImageUrl(imageUrl);
  const after = afterImageUrl ? resolveImageUrl(afterImageUrl) : null;

  const sync = (from, to) => () => {
    if (syncing.current || !from.current || !to.current) return;
    syncing.current = true;
    to.current.scrollLeft = from.current.scrollLeft;
    to.current.scrollTop = from.current.scrollTop;
    requestAnimationFrame(() => (syncing.current = false));
  };

  const panel = (ref, onScroll, label, withBoxes) => (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <figcaption style={{ fontSize: '0.78rem', fontWeight: 800, color: INK.muted, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>{label}</figcaption>
      <div ref={ref} onScroll={onScroll} style={{ height: 300, overflow: 'auto', borderRadius: 10, background: '#0f172a', border: `1px solid ${INK.line}` }}>
        <div style={{ position: 'relative', width: `${zoom * 100}%` }}>
          {src ? (
            <img src={src} alt={withBoxes ? 'Photo with the detected defects outlined' : 'Original photo from the citizen'} style={{ display: 'block', width: '100%' }} />
          ) : (
            <div style={{ height: 300, display: 'grid', placeItems: 'center', color: '#cbd5e1' }}>No photo</div>
          )}
          {withBoxes &&
            showBoxes &&
            boxes.map((b, i) => {
              const [y0, x0, y1, x1] = b.box || [];
              if ([y0, x0, y1, x1].some((v) => typeof v !== 'number')) return null;
              return (
                <div key={i} style={{ position: 'absolute', top: `${y0 * 100}%`, left: `${x0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%`, border: `2.5px solid ${SERIES[0]}`, boxShadow: '0 0 0 1.5px rgba(255,255,255,.85)', borderRadius: 3, pointerEvents: 'none' }}>
                  <span style={{ position: 'absolute', top: -20, left: -2, background: SERIES[0], color: '#fff', fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                    {i + 1}. {classLabel(b.label)} {b.score ? `${Math.round(b.score * 100)}%` : ''}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </figure>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="Zoom out" style={{ padding: '6px 9px' }}>
          <ZoomOut size={15} />
        </Button>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: INK.secondary, minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <Button variant="secondary" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} disabled={zoom >= 4} aria-label="Zoom in" style={{ padding: '6px 9px' }}>
          <ZoomIn size={15} />
        </Button>
        <Button variant="secondary" onClick={() => setShowBoxes((v) => !v)} aria-pressed={showBoxes} style={{ padding: '6px 10px' }}>
          {showBoxes ? <EyeOff size={15} /> : <Eye size={15} />}
          {showBoxes ? 'Hide boxes' : 'Show boxes'}
        </Button>
        <span style={{ fontSize: '0.78rem', color: INK.muted }}>Zoom and scroll move both photos together.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {panel(left, sync(left, right), 'Original photo', false)}
        {panel(right, sync(right, left), `Detected (${boxes.length} box${boxes.length === 1 ? '' : 'es'})`, true)}
      </div>
      {boxes.length > 0 && (
        <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: '0.82rem', color: INK.secondary, display: 'flex', flexWrap: 'wrap', gap: '4px 18px' }}>
          {boxes.map((b, i) => (
            <li key={i}>
              {classLabel(b.label)} <span style={{ color: INK.muted }}>({Math.round((b.score || 0) * 100)}% confidence)</span>
            </li>
          ))}
        </ol>
      )}
      {after && (
        <figure style={{ margin: '16px 0 0' }}>
          <figcaption style={{ fontSize: '0.78rem', fontWeight: 800, color: INK.muted, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>After the work</figcaption>
          <img src={after} alt="Photo taken after the work was done" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 10, border: `1px solid ${INK.line}` }} />
        </figure>
      )}
    </div>
  );
}
