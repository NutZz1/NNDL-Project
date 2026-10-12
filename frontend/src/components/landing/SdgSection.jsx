import React from 'react';
import { Target, Building2, Recycle, CloudRain, HeartPulse } from 'lucide-react';

export default function SdgSection() {
  const sdgs = [
    {
      number: '11',
      title: 'Sustainable Cities & Communities',
      color: '#d97706',
      bgColor: '#fef3c7',
      icon: <Building2 size={22} />,
      role: 'Detects potholes and road hazards for safer municipalities.',
    },
    {
      number: '12',
      title: 'Responsible Consumption & Waste',
      color: '#ea580c',
      bgColor: '#ffedd5',
      icon: <Recycle size={22} />,
      role: 'Pinpoints street litter for efficient municipal dispatch.',
    },
    {
      number: '13',
      title: 'Climate Action',
      color: '#059669',
      bgColor: '#d1fae5',
      icon: <CloudRain size={22} />,
      role: 'Flags drainage debris to prevent urban flooding.',
    },
    {
      number: '3',
      title: 'Good Health & Well-Being',
      color: '#16a34a',
      bgColor: '#dcfce7',
      icon: <HeartPulse size={22} />,
      role: 'Detects open manholes early to prevent pedestrian injuries.',
    },
  ];

  return (
    <section
      id="aim-sdg"
      style={{
        padding: '64px 24px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '9999px',
              background: '#e6f7ef',
              color: '#059669',
              fontSize: '0.8rem',
              fontWeight: 700,
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            <Target size={15} />
            <span>Project Aim & Alignment</span>
          </div>

          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.6rem, 3vw, 2.1rem)',
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: 1.25,
              letterSpacing: '-0.02em',
              marginBottom: '10px',
            }}
          >
            UN SDG Alignment
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#64748b' }}>
            Deep learning + GPS imagery to detect civic defects and waste.
          </p>
        </div>

        {/* SDG Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '16px',
          }}
        >
          {sdgs.map((sdg) => (
            <div
              key={sdg.number}
              style={{
                background: '#ffffff',
                borderRadius: '14px',
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.borderColor = sdg.color;
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.06)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
              }}
            >
              {/* Icon + Badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: sdg.bgColor,
                    color: sdg.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {sdg.icon}
                </div>
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: sdg.color,
                    background: sdg.bgColor,
                    padding: '3px 9px',
                    borderRadius: '6px',
                  }}
                >
                  SDG {sdg.number}
                </span>
              </div>

              <h3 style={{ fontSize: '0.97rem', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                {sdg.title}
              </h3>
              <p style={{ fontSize: '0.83rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                {sdg.role}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
