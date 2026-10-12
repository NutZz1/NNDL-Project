import React, { useState, useEffect } from 'react';
import { UploadCloud, ArrowRight } from 'lucide-react';

export default function AboutSection({ onNavigate }) {
  const [slideIndex, setSlideIndex] = useState(0);

  const slides = [
    '/slide_litter.jpg',
    '/slide_pothole.jpg',
    '/slide_manhole.jpg',
    '/slide_crack.jpg',
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  return (
    <section
      id="about"
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderBottom: '1px solid #1e3a2f',
      }}
    >
      {/* Sliding background images */}
      {slides.map((src, i) => (
        <div
          key={src}
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("${src}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: i === slideIndex ? 1 : 0,
            transition: 'opacity 1.2s ease-in-out',
            zIndex: 0,
          }}
        />
      ))}

      {/* Dark overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(5, 18, 10, 0.72)',
        zIndex: 1,
      }} />

      {/* Centered content */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          textAlign: 'center',
          maxWidth: '680px',
          padding: '0 24px',
        }}
      >


        {/* Headline */}
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.6rem, 5vw, 4rem)',
            fontWeight: 800,
            lineHeight: 1.1,
            color: '#ffffff',
            letterSpacing: '-0.03em',
            marginBottom: '20px',
          }}
        >
          Detecting Urban Decay &amp; Civic Waste with{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Deep Vision
          </span>
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: '1.1rem',
            color: '#94a3b8',
            lineHeight: 1.65,
            marginBottom: '36px',
          }}
        >
          AI-powered detection of road defects and civic waste from geotagged street photos.
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => onNavigate && onNavigate('upload')}
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
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(5,150,105,0.45)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = '#047857')}
            onMouseOut={(e) => (e.currentTarget.style.background = '#059669')}
          >
            <UploadCloud size={20} />
            Upload Street Photo
          </button>

          <button
            onClick={() => onNavigate && onNavigate('dashboard')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 24px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.1)',
              color: '#f1f5f9',
              fontSize: '1rem',
              fontWeight: 600,
              border: '1px solid rgba(255,255,255,0.2)',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
          >
            Explore Dashboard
            <ArrowRight size={17} />
          </button>
        </div>
      </div>

      {/* Slide dot indicators */}
      <div style={{
        position: 'absolute',
        bottom: '28px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '8px',
        zIndex: 3,
      }}>
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setSlideIndex(i)}
            style={{
              width: i === slideIndex ? '24px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: i === slideIndex ? '#10b981' : 'rgba(255,255,255,0.3)',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>
    </section>
  );
}
