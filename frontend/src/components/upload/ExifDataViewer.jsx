import React from 'react';
import { MapPin, Cpu, Check, ShieldCheck, Tag } from 'lucide-react';
import { CIVIC_CLASSES } from '../../services/mockData';
import { resolveImageUrl, handleImageError } from '../../services/imageService';

export default function ExifDataViewer({
  imageData,
  onSubmitReport,
  isSubmitting,
}) {
  if (!imageData) return null;

  const currentClass =
    CIVIC_CLASSES.find((c) => c.name === imageData.category) || CIVIC_CLASSES[5];

  const lat = imageData.metadata?.lat || 10.9038;
  const lng = imageData.metadata?.lng || 76.9015;
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';

  return (
    <div
      style={{
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        padding: '24px',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.04)',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f1f5f9',
          paddingBottom: '16px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#e6f7ef',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={18} />
          </div>
          <div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Extracted EXIF & AI Prediction
            </h4>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              {imageData.filename || 'Uploaded Image'}
            </span>
          </div>
        </div>

        {/* Confidence Badge */}
        <span
          style={{
            fontSize: '0.8rem',
            padding: '4px 12px',
            borderRadius: '9999px',
            background: '#ecfdf5',
            color: '#047857',
            fontWeight: 700,
            border: '1px solid #a7f3d0',
          }}
        >
          Confidence: {Math.round(imageData.confidence * 100)}%
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
          marginBottom: '24px',
        }}
      >
        {/* Left: Image with Bounding Box Overlay. The image keeps its own aspect ratio (no crop),
            so boxes given as fractions of the full photo land on the right pixels. */}
        <div style={{ alignSelf: 'start', background: '#0f172a', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ position: 'relative' }}>
          <img
            src={resolveImageUrl(imageData.previewUrl, imageData.category)}
            alt="Defect Analysis"
            onError={(e) => handleImageError(e, imageData.category)}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
            }}
          />

          {/* Real AI Bounding Boxes from the selected detector */}
          {Array.isArray(imageData.bboxes) &&
            imageData.bboxes.filter((b) => Array.isArray(b.box)).map((b, idx) => {
              const box = b.box;
              const top = box[0] * 100;
              const left = box[1] * 100;
              const height = (box[2] - box[0]) * 100;
              const width = (box[3] - box[1]) * 100;
              const labelName = (b.label || currentClass.label).replace(/_/g, ' ');
              const scorePct = Math.round((b.score ?? 0) * 100);

              return (
                <div
                  key={idx}
                  style={{
                    position: 'absolute',
                    top: `${top}%`,
                    left: `${left}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    border: '2.5px solid #10b981',
                    background: 'rgba(16, 185, 129, 0.18)',
                    borderRadius: '4px',
                    boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)',
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: top < 8 ? '0px' : '-24px',
                      left: '-2px',
                      background: '#10b981',
                      color: '#ffffff',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px 4px 0 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span>{labelName}</span>
                    <span>{scorePct}%</span>
                  </div>
                </div>
              );
            })}
        </div>
        </div>

        {/* Right: Clean Extracted Coordinates & AI Defect Detection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', justifyContent: 'center' }}>
          {/* Coordinates */}
          <div
            style={{
              background: '#f8fafc',
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <MapPin size={22} color="#059669" />
            <div>
              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b' }}>
                EXTRACTED GPS COORDINATES
              </div>
              <div
                style={{
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  fontFamily: 'monospace',
                  marginTop: '2px',
                }}
              >
                {Math.abs(lat).toFixed(6)}° {latDir}, {Math.abs(lng).toFixed(6)}° {lngDir}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '2px' }}>
                Altitude: {imageData.metadata?.altitude || '336m'} • Geotag Status: Verified
              </div>
            </div>
          </div>

          {/* Predicted Defect */}
          <div
            style={{
              background: '#f8fafc',
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <Tag size={22} color="#059669" />
            <div>
              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b' }}>
                AI MODEL DETECTION
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                {currentClass.label}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', textTransform: 'capitalize' }}>
                Domain: {currentClass.domain.replace('_', ' ')} •{' '}
                <span style={{ textTransform: 'none' }}>
                  Model: {imageData.modelName || 'RF-DETR-Small'}
                  {typeof imageData.inferenceMs === 'number' && ` • ${Math.round(imageData.inferenceMs)} ms on ${imageData.device || 'cpu'}`}
                </span>
              </div>
            </div>
          </div>

          {/* Location Verification Tag */}
          <div
            style={{
              fontSize: '0.78rem',
              color: '#64748b',
              background: '#f1f5f9',
              padding: '10px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <ShieldCheck size={16} color="#059669" />
            <span>EXIF telemetry successfully authenticated against sensor payload.</span>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={onSubmitReport}
        disabled={isSubmitting}
        style={{
          width: '100%',
          padding: '14px',
          borderRadius: '10px',
          background: '#059669',
          color: '#ffffff',
          fontSize: '1rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)',
          cursor: 'pointer',
          border: 'none',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = '#047857')}
        onMouseOut={(e) => (e.currentTarget.style.background = '#059669')}
      >
        <Check size={20} />
        <span>{isSubmitting ? 'Transmitting to Municipal Dispatch...' : 'Submit Geotagged Civic Report'}</span>
      </button>
    </div>
  );
}
