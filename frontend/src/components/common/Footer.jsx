import React from 'react';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';

export default function Footer({ onNavigate }) {
  const scrollToSection = (id) => {
    onNavigate('landing');
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return (
    <footer
      style={{
        background: '#0b1120',
        color: '#94a3b8',
        borderTop: '1px solid #1e293b',
        paddingTop: '56px',
        paddingBottom: '32px',
        fontSize: '0.9rem',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 24px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '36px',
            marginBottom: '40px',
          }}
        >
          {/* Col 1: Brand & Mission */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}
              >
                <ShieldCheck size={18} />
              </div>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
                Civic<span style={{ color: '#10b981' }}>Scan</span>
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.86rem', lineHeight: 1.6 }}>
              Automating civic infrastructure defect and waste detection through deep computer vision and geotagged imagery.
            </p>
          </div>

          {/* Col 2: Navigation Links */}
          <div>
            <h4 style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 700, marginBottom: '14px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Navigation
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '0.86rem' }}>
              <li>
                <button
                  onClick={() => scrollToSection('about')}
                  style={{ color: '#94a3b8', textAlign: 'left', transition: 'color 0.15s' }}
                  onMouseOver={(e) => (e.target.style.color = '#f8fafc')}
                  onMouseOut={(e) => (e.target.style.color = '#94a3b8')}
                >
                  About the Product
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('aim-sdg')}
                  style={{ color: '#94a3b8', textAlign: 'left', transition: 'color 0.15s' }}
                  onMouseOver={(e) => (e.target.style.color = '#f8fafc')}
                  onMouseOut={(e) => (e.target.style.color = '#94a3b8')}
                >
                  Aim & SDG Alignment
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('how-it-works')}
                  style={{ color: '#94a3b8', textAlign: 'left', transition: 'color 0.15s' }}
                  onMouseOver={(e) => (e.target.style.color = '#f8fafc')}
                  onMouseOut={(e) => (e.target.style.color = '#94a3b8')}
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('upload')}
                  style={{ color: '#94a3b8', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 0.15s' }}
                  onMouseOver={(e) => (e.target.style.color = '#f8fafc')}
                  onMouseOut={(e) => (e.target.style.color = '#94a3b8')}
                >
                  Report Defect & Geotag <ArrowUpRight size={13} />
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: UN Sustainable Development Goals */}
          <div>
            <h4 style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 700, marginBottom: '14px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              UN SDG Alignment
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.84rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                <span style={{ padding: '2px 7px', borderRadius: '4px', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem' }}>
                  SDG 11
                </span>
                <span>Sustainable Cities & Communities</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                <span style={{ padding: '2px 7px', borderRadius: '4px', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem' }}>
                  SDG 12
                </span>
                <span>Responsible Waste Management</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                <span style={{ padding: '2px 7px', borderRadius: '4px', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem' }}>
                  SDG 13
                </span>
                <span>Climate Action & Drainage</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1' }}>
                <span style={{ padding: '2px 7px', borderRadius: '4px', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontWeight: 700, fontSize: '0.72rem' }}>
                  SDG 3
                </span>
                <span>Good Health & Public Safety</span>
              </div>
            </div>
          </div>

          {/* Col 4: Dashboard Portal */}
          <div>
            <h4 style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 700, marginBottom: '14px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Municipal Portal
            </h4>
            <p style={{ color: '#64748b', fontSize: '0.84rem', lineHeight: 1.5, marginBottom: '14px' }}>
              Interactive incident map and spatial analytics dashboard for municipal teams.
            </p>
            <button
              onClick={() => onNavigate('dashboard')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '6px',
                background: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #334155',
                fontSize: '0.84rem',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = '#334155';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#1e293b';
                e.currentTarget.style.color = '#e2e8f0';
              }}
            >
              Open Dashboard <ArrowUpRight size={14} />
            </button>
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          style={{
            borderTop: '1px solid #1e293b',
            paddingTop: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '0.78rem',
            color: '#475569',
          }}
        >
          <div>
            © {new Date().getFullYear()} CivicScan Project. Deep Learning for Urban Infrastructure.
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>Privacy</span>
            <span>Terms</span>
            <span>Documentation</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
