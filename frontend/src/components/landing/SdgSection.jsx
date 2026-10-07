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
      goal: 'Making cities inclusive, safe, and resilient.',
      role: 'Automates detection of potholes and road hazards to help municipalities maintain safe, functional roadways for everyone.',
    },
    {
      number: '12',
      title: 'Responsible Consumption & Waste',
      color: '#ea580c',
      bgColor: '#ffedd5',
      icon: <Recycle size={22} />,
      goal: 'Encouraging sustainable municipal waste handling.',
      role: 'Pinpoints street litter and localized waste accumulation so municipal cleaning teams can be dispatched effectively.',
    },
    {
      number: '13',
      title: 'Climate Action',
      color: '#059669',
      bgColor: '#d1fae5',
      icon: <CloudRain size={22} />,
      goal: 'Strengthening urban resilience against weather impacts.',
      role: 'Identifies debris near curb gutters and drainage channels, helping prevent waterlogging and urban flooding during rainfall.',
    },
    {
      number: '3',
      title: 'Good Health & Well-Being',
      color: '#16a34a',
      bgColor: '#dcfce7',
      icon: <HeartPulse size={22} />,
      goal: 'Protecting citizen health and public safety.',
      role: 'Flags hazardous missing manhole lids and road craters early, preventing vehicular crashes and pedestrian injuries.',
    },
  ];

  return (
    <section
      id="aim-sdg"
      style={{
        padding: '80px 24px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Project Aim Header */}
        <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 48px' }}>
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
              marginBottom: '14px',
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
              fontSize: 'clamp(1.8rem, 3vw, 2.3rem)',
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: 1.25,
              marginBottom: '16px',
              letterSpacing: '-0.02em',
            }}
          >
            Project Aim & UN SDG Alignment
          </h2>

          <p style={{ fontSize: '1.02rem', color: '#475569', lineHeight: 1.65 }}>
            The objective of <strong>CivicScan</strong> is to apply deep learning computer vision and GPS-tagged imagery to automatically detect civic infrastructure defects and street litter. This enables faster reporting, clearer spatial tracking, and proactive public maintenance.
          </p>
        </div>

        {/* SDG Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '20px',
          }}
        >
          {sdgs.map((sdg) => (
            <div
              key={sdg.number}
              style={{
                background: '#ffffff',
                borderRadius: '14px',
                padding: '24px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.borderColor = sdg.color;
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.06)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)';
              }}
            >
              <div>
                {/* Top Badge & Icon */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
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
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: sdg.color,
                      background: sdg.bgColor,
                      padding: '4px 10px',
                      borderRadius: '6px',
                    }}
                  >
                    SDG {sdg.number}
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    marginBottom: '8px',
                  }}
                >
                  {sdg.title}
                </h3>

                <p
                  style={{
                    fontSize: '0.85rem',
                    color: '#64748b',
                    marginBottom: '16px',
                    lineHeight: 1.45,
                    fontStyle: 'italic',
                  }}
                >
                  "{sdg.goal}"
                </p>
              </div>

              {/* CivicScan Role */}
              <div
                style={{
                  background: '#f8fafc',
                  borderLeft: `3px solid ${sdg.color}`,
                  padding: '10px 12px',
                  borderRadius: '0 8px 8px 0',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: '#64748b',
                    marginBottom: '3px',
                  }}
                >
                  CivicScan Focus
                </span>
                <p style={{ fontSize: '0.83rem', color: '#334155', lineHeight: 1.5, margin: 0 }}>
                  {sdg.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

