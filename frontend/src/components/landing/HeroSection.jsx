import React from 'react';
import { ShieldCheck, UploadCloud, ArrowRight, Sparkles, CheckCircle2, Eye, MapPin } from 'lucide-react';

export default function HeroSection({ onNavigate, onOpenLogin }) {
  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #f0fdf4 0%, #f8fafc 100%)',
        padding: '72px 24px 88px',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      {/* Background Subtle Accent Grids */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, rgba(255, 255, 255, 0) 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(5, 150, 105, 0.08) 0%, rgba(255, 255, 255, 0) 70%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '48px',
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Left Column: Mission & CTAs */}
        <div>
          {/* Pill Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '9999px',
              background: '#ffffff',
              border: '1px solid #bbf7d0',
              boxShadow: '0 2px 6px rgba(5, 150, 105, 0.1)',
              marginBottom: '24px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.25)',
              }}
            />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#047857' }}>
              AI for Sustainable Cities & Climate Action (UN SDG 11 & 13)
            </span>
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2.4rem, 4.5vw, 3.6rem)',
              fontWeight: 800,
              lineHeight: 1.12,
              color: '#0f172a',
              marginBottom: '20px',
              letterSpacing: '-0.03em',
            }}
          >
            Detecting Urban Decay & Civic Waste with{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Deep Vision
            </span>
          </h1>

          <p
            style={{
              fontSize: '1.05rem',
              color: '#475569',
              lineHeight: 1.6,
              marginBottom: '32px',
              maxWidth: '480px',
            }}
          >
            AI-powered detection of road defects and civic waste from geotagged street photos.
          </p>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '32px' }}>
            <button
              onClick={() => onNavigate('upload')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '9px',
                padding: '14px 28px',
                borderRadius: '10px',
                background: '#059669',
                color: '#ffffff',
                fontSize: '1rem',
                fontWeight: 700,
                boxShadow: '0 4px 16px rgba(5, 150, 105, 0.4)',
                cursor: 'pointer',
                border: 'none',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#047857')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#059669')}
            >
              <UploadCloud size={20} />
              <span>Upload Street Photo</span>
            </button>

            <button
              onClick={() => onNavigate('dashboard')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 22px',
                borderRadius: '10px',
                background: '#ffffff',
                color: '#0f172a',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.96rem',
                fontWeight: 600,
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = '#059669'; e.currentTarget.style.color = '#059669'; }}
              onMouseOut={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#0f172a'; }}
            >
              <span>Explore Dashboard</span>
              <ArrowRight size={17} />
            </button>
          </div>


        </div>

        {/* Right Column: Interactive Visual Showcase Card */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '16px',
              boxShadow: '0 20px 40px -15px rgba(5, 150, 105, 0.15)',
              border: '1px solid #e2e8f0',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Top Bar with Live Tag */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px 14px',
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#10b981',
                  }}
                  className="pulse-glow"
                />
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                  AI Detection Preview
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: '#e6f7ef',
                  color: '#047857',
                  fontWeight: 600,
                }}
              >
                Model: RF-DETR
              </span>
            </div>

            {/* AI Image Simulation with Bounding Box Overlays */}
            <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', marginTop: '12px' }}>
              <img
                src="https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=900&q=80"
                alt="Civic Scan Street Detection"
                style={{
                  width: '100%',
                  height: '320px',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />

              {/* Simulated Bounding Box 1: Street Litter */}
              <div
                style={{
                  position: 'absolute',
                  top: '38%',
                  left: '25%',
                  width: '45%',
                  height: '42%',
                  border: '2px solid #10b981',
                  background: 'rgba(16, 185, 129, 0.15)',
                  borderRadius: '4px',
                  boxShadow: '0 0 12px rgba(16, 185, 129, 0.5)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '-24px',
                    left: '-2px',
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '4px 4px 0 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>litter</span>
                  <span style={{ opacity: 0.9 }}>94.2%</span>
                </div>
              </div>

              {/* Floating Extracted Geotag Pill */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '14px',
                  left: '14px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  backdropFilter: 'blur(8px)',
                  color: '#ffffff',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                }}
              >
                <MapPin size={15} color="#10b981" />
                <span>10.9038° N, 76.9015° E • Ettimadai</span>
              </div>
            </div>

            {/* Bottom Status Ticker */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                marginTop: '12px',
                textAlign: 'center',
              }}
            >
              <div style={{ background: '#f8fafc', padding: '8px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>DOMAIN</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#047857' }}>Civic Waste</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '8px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>DEFECT</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#d97706' }}>Garbage / Litter</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '8px', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>ROUTING</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>Ettimadai Ward</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
