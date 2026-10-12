import React from 'react';
import { UploadCloud, MapPin, ScanSearch, LayoutDashboard } from 'lucide-react';

const steps = [
  {
    icon: <UploadCloud size={28} />,
    color: '#059669',
    bg: 'rgba(5,150,105,0.12)',
    border: 'rgba(5,150,105,0.3)',
    label: 'Upload Image',
    desc: 'Citizen or patrol vehicle uploads a street photo via the web interface.',
  },
  {
    icon: <MapPin size={28} />,
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.12)',
    border: 'rgba(37,99,235,0.3)',
    label: 'Location Extraction',
    desc: 'EXIF metadata is decoded to extract GPS coordinates with ±1.8m precision.',
  },
  {
    icon: <ScanSearch size={28} />,
    color: '#d97706',
    bg: 'rgba(217,119,6,0.12)',
    border: 'rgba(217,119,6,0.3)',
    label: 'AI Detection',
    desc: 'RF-DETR model classifies defects and waste across 8 locked civic categories.',
  },
  {
    icon: <LayoutDashboard size={28} />,
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.12)',
    border: 'rgba(124,58,237,0.3)',
    label: 'Dashboard Mapping',
    desc: 'Incident is geoplotted on the live map and routed to the responsible ward.',
  },
];

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      style={{
        padding: '120px 24px',
        background: '#0f172a',
        borderBottom: '1px solid #1e293b',
      }}
    >
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '72px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 14px',
              borderRadius: '9999px',
              background: 'rgba(16,185,129,0.15)',
              border: '1px solid rgba(16,185,129,0.25)',
              color: '#6ee7b7',
              fontSize: '0.78rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '14px',
            }}
          >
            <span>How It Works</span>
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2.2rem, 3.5vw, 3rem)',
              fontWeight: 800,
              color: '#f8fafc',
              letterSpacing: '-0.02em',
              marginBottom: '10px',
            }}
          >
            From Street Photo to Actionable Insight
          </h2>

        </div>

        {/* Steps */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0',
            position: 'relative',
          }}
        >
          {steps.map((step, i) => (
            <div key={step.label} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 28px' }}>
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '36px',
                    right: '-1px',
                    width: '50%',
                    height: '2px',
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
                    zIndex: 0,
                  }}
                />
              )}

              {/* Step number */}
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', letterSpacing: '0.06em', marginBottom: '16px' }}>
                STEP {String(i + 1).padStart(2, '0')}
              </div>

              {/* Icon circle */}
              <div
                style={{
                  width: '92px',
                  height: '92px',
                  borderRadius: '24px',
                  background: step.bg,
                  border: `1px solid ${step.border}`,
                  color: step.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                {step.icon}
              </div>

              {/* Text */}
              <h3
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: '#f1f5f9',
                  marginBottom: '8px',
                  textAlign: 'center',
                }}
              >
                {step.label}
              </h3>
              <p
                style={{
                  fontSize: '0.92rem',
                  color: '#64748b',
                  lineHeight: 1.6,
                  textAlign: 'center',
                  maxWidth: '230px',
                }}
              >
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
