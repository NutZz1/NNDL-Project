import React, { useState, useEffect, useRef } from 'react';
import { Activity, Building2, Trash2, AlertTriangle } from 'lucide-react';

const CLASSES = [
  {
    id: '01',
    name: 'Longitudinal Crack',
    domain: 'Road Damage',
    severity: 'Low',
    image: '/photo_long_crack.jpg',
    color: '#0284c7',
  },
  {
    id: '02',
    name: 'Transverse Crack',
    domain: 'Road Damage',
    severity: 'Low',
    image: '/photo_trans_crack.jpg',
    color: '#0284c7',
  },
  {
    id: '03',
    name: 'Alligator Cracking',
    domain: 'Road Damage',
    severity: 'Medium',
    image: '/photo_alligator_crack.jpg',
    color: '#d97706',
  },
  {
    id: '04',
    name: 'Pothole',
    domain: 'Road Damage',
    severity: 'High',
    image: '/photo_pothole.jpg',
    color: '#dc2626',
  },
  {
    id: '05',
    name: 'Structural Crack',
    domain: 'Structural Damage',
    severity: 'Critical',
    image: '/photo_structural_crack.jpg',
    color: '#b91c1c',
  },
  {
    id: '06',
    name: 'Street Litter',
    domain: 'Civic Waste',
    severity: 'Medium',
    image: '/photo_litter.jpg',
    color: '#059669',
  },
  {
    id: '07',
    name: 'Damaged Manhole',
    domain: 'Public Hazard',
    severity: 'High',
    image: '/photo_manhole_damaged.jpg',
    color: '#ea580c',
  },
  {
    id: '08',
    name: 'Missing Manhole',
    domain: 'Public Hazard',
    severity: 'Critical',
    image: '/photo_manhole_missing.jpg',
    color: '#991b1b',
  },
];

const domainIcon = {
  'Road Damage': <Activity size={18} />,
  'Structural Damage': <Building2 size={18} />,
  'Civic Waste': <Trash2 size={18} />,
  'Public Hazard': <AlertTriangle size={18} />,
};

export default function DetectionClassesSection() {
  // Defaults to Longitudinal Crack (Class 01)
  const [activeImage, setActiveImage] = useState(CLASSES[0].image);
  const sectionRef = useRef(null);

  // Keep Longitudinal Crack highlighted whenever the user scrolls into this section
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActiveImage(CLASSES[0].image);
        }
      },
      { threshold: 0.25 }
    );

    const currentElem = sectionRef.current;
    if (currentElem) observer.observe(currentElem);

    return () => {
      if (currentElem) observer.unobserve(currentElem);
    };
  }, []);

  return (
    <section
      id="detection-classes"
      ref={sectionRef}
      style={{
        position: 'relative',
        padding: '72px 24px',
        background: '#0a101e',
        borderBottom: '1px solid #1e293b',
        overflow: 'hidden',
      }}
    >
      {/* Background Images: Keeps the active/hovered class image visible until another is hovered */}
      {CLASSES.map((cls) => {
        const isActive = activeImage === cls.image;
        return (
          <div
            key={`bg-${cls.id}`}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url("${cls.image}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: isActive ? 1 : 0,
              transform: isActive ? 'scale(1.03)' : 'scale(1)',
              transition: 'opacity 0.5s ease-in-out, transform 0.7s ease-out',
              zIndex: 0,
              pointerEvents: 'none',
              filter: 'blur(3px)',
            }}
          />
        );
      })}

      {/* Darkened overlay layer over the active background image */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(10, 16, 30, 0.78)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* Foreground Content */}
      <div style={{ position: 'relative', zIndex: 2, maxWidth: '960px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 14px',
              borderRadius: '9999px',
              background: 'rgba(255,255,255,0.18)',
              color: '#ffffff',
              fontSize: '0.78rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '10px',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.22)',
            }}
          >
            <span>Model Classes</span>
          </div>

          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.8rem, 3vw, 2.3rem)',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.02em',
              marginBottom: '8px',
              textShadow: '0 2px 10px rgba(0,0,0,0.5)',
            }}
          >
            Detected Defect Classes
          </h2>
          <p
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: '0.94rem',
              maxWidth: '520px',
              margin: '0 auto',
              textShadow: '0 1px 4px rgba(0,0,0,0.5)',
            }}
          >
            The 8 locked defect categories autonomously detected and classified by CivicScan.
          </p>
        </div>

        {/* Classes Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 218px))',
            justifyContent: 'center',
            gap: '16px',
          }}
        >
          {CLASSES.map((cls) => {
            const isSelected = activeImage === cls.image;
            return (
              <div
                key={cls.id}
                onMouseEnter={() => setActiveImage(cls.image)}
                style={{
                  position: 'relative',
                  height: '190px',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: isSelected
                    ? '0 16px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.3)'
                    : '0 4px 14px rgba(0,0,0,0.15)',
                  cursor: 'pointer',
                  transform: isSelected ? 'translateY(-6px) scale(1.025)' : 'translateY(0)',
                  border: isSelected
                    ? '2px solid rgba(255,255,255,0.95)'
                    : '2px solid transparent',
                  opacity: isSelected ? 1 : 0.78,
                  transition: 'transform 0.25s ease, box-shadow 0.25s ease, border 0.25s ease, opacity 0.25s ease',
                }}
              >
                {/* Full Background Image */}
                <img
                  src={cls.image}
                  alt={cls.name}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                    transition: 'transform 0.35s ease',
                  }}
                />

                {/* Tinted Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(15,23,42,0.22) 0%, rgba(15,23,42,0.88) 100%)',
                  }}
                />

                {/* Card Contents */}
                <div
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '14px',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Top: Class ID badge & Severity */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        background: isSelected ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.2)',
                        backdropFilter: 'blur(6px)',
                        color: '#ffffff',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        letterSpacing: '0.04em',
                        border: isSelected ? '1px solid rgba(255,255,255,0.4)' : 'none',
                      }}
                    >
                      #{cls.id}
                    </span>
                    <span
                      style={{
                        background: cls.color,
                        color: '#ffffff',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '6px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                      }}
                    >
                      {cls.severity}
                    </span>
                  </div>

                  {/* Center / Bottom: Icon + Class Name + Domain */}
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: isSelected ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.18)',
                        backdropFilter: 'blur(8px)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 8px auto',
                        boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.3)' : 'none',
                      }}
                    >
                      {domainIcon[cls.domain]}
                    </div>

                    <h3
                      style={{
                        fontSize: '0.96rem',
                        fontWeight: 800,
                        color: '#ffffff',
                        marginBottom: '3px',
                        letterSpacing: '-0.01em',
                        textShadow: '0 2px 4px rgba(0,0,0,0.6)',
                        lineHeight: 1.25,
                      }}
                    >
                      {cls.name}
                    </h3>

                    <p
                      style={{
                        fontSize: '0.74rem',
                        color: 'rgba(255,255,255,0.85)',
                        margin: 0,
                        fontWeight: 600,
                      }}
                    >
                      {cls.domain}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
