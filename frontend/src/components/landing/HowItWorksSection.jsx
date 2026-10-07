import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  MapPin,
  Cpu,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Satellite,
  Activity,
  FileCheck,
  Layers,
  ArrowDown,
  Navigation,
  Sparkles,
  Truck,
  Eye,
  Crosshair,
  Maximize2
} from 'lucide-react';

export default function HowItWorksSection({ onNavigate }) {
  const containerRef = useRef(null);
  const [activeStage, setActiveStage] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [resolutionStatus, setResolutionStatus] = useState('pending'); // 'pending' | 'dispatched' | 'resolved'

  const stages = [
    {
      id: 'upload',
      index: '01',
      tag: 'STAGE 01 • INGESTION',
      title: 'Upload Image',
      headline: 'Citizen photo capture & automatic stream ingestion.',
      summary:
        'Citizens and patrol crews capture street-level defects directly from smartphones or dashcams. Raw high-resolution files (HEIC, JPEG, PNG) are validated and streamed into the processing pipeline.',
      badge: 'Client Binary Stream • Mobile & Dashcam Capture',
      color: '#10b981',
    },
    {
      id: 'gps',
      index: '02',
      tag: 'STAGE 02 • GPS EXTRACTION',
      title: 'GPS Extraction',
      headline: 'Instant satellite telemetry extracted from EXIF metadata.',
      summary:
        'The backend binary decoder reads embedded EXIF header packets, extracting decimal coordinates (Latitude, Longitude, Altitude, Timestamp) with pinpoint precision—no manual map pin required.',
      badge: 'Exifr Engine • DMS to Decimal • ±1.8m Satellite Precision',
      color: '#3b82f6',
    },
    {
      id: 'model',
      index: '03',
      tag: 'STAGE 03 • NEURAL INFERENCE',
      title: 'Model Prediction',
      headline: 'Deep neural network detects & bounds defects in real-time.',
      summary:
        'Input pixel tensors pass through an RF-DETR transformer backbone with an attention mechanism and YOLO detection head, localizing hazards across 8 locked civic defect classes in 28ms.',
      badge: 'RF-DETR + YOLO • CUDA PyTorch • 8 Locked Classes',
      color: '#8b5cf6',
    },
    {
      id: 'dashboard',
      index: '04',
      tag: 'STAGE 04 • MUNICIPAL RESOLUTION',
      title: 'Mapping onto Dashboard',
      headline: 'Incident plotted onto GIS dashboard for officer triage.',
      summary:
        'Geotagged bounding detections are instantly mapped to the municipal supervisor portal. Ward officers dispatch field maintenance crews and update the incident lifecycle to full resolution.',
      badge: 'Live GIS Mapping • Real-Time Status Lifecycle',
      color: '#f59e0b',
    },
  ];

  // Continuous scroll listener to calculate overall progress and stage sub-progress
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const containerHeight = rect.height - window.innerHeight;
      if (containerHeight <= 0) return;

      const scrolled = -rect.top;
      const progress = Math.min(Math.max(scrolled / containerHeight, 0), 1);
      setScrollProgress(progress);

      let stage = 0;
      if (progress >= 0.72) stage = 3;
      else if (progress >= 0.48) stage = 2;
      else if (progress >= 0.24) stage = 1;
      else stage = 0;

      setActiveStage(stage);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Compute local progress within current stage (0.0 to 1.0)
  const getStageProgress = () => {
    if (activeStage === 0) return Math.min(scrollProgress / 0.24, 1);
    if (activeStage === 1) return Math.min((scrollProgress - 0.24) / 0.24, 1);
    if (activeStage === 2) return Math.min((scrollProgress - 0.48) / 0.24, 1);
    return Math.min((scrollProgress - 0.72) / 0.28, 1);
  };

  const stageProgress = getStageProgress();

  // Smooth scroll jump to target stage
  const scrollToStage = (stageIdx) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const containerTop = rect.top + scrollTop;
    const containerHeight = rect.height - window.innerHeight;
    const targetFractions = [0.02, 0.28, 0.54, 0.82];
    const targetScroll = containerTop + targetFractions[stageIdx] * containerHeight;

    window.scrollTo({
      top: targetScroll,
      behavior: 'smooth',
    });
  };

  return (
    <section
      id="how-it-works"
      ref={containerRef}
      style={{
        position: 'relative',
        height: '420vh', // Extended scroll runway for fluid animation pacing
        background: '#070b14',
        color: '#f8fafc',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* Sticky Fullscreen Presentation Viewport */}
      <div
        style={{
          position: 'sticky',
          top: '72px',
          height: 'calc(100vh - 72px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '24px 24px 28px',
          maxWidth: '1280px',
          margin: '0 auto',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* TOP HUD: Title + Stage Pill Switcher + Real-time Scroll Progress Bar */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              marginBottom: '14px',
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: stages[activeStage].color,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '4px',
                }}
              >
                <Sparkles size={13} />
                <span>Scroll to Advance Pipeline • Stage {stages[activeStage].index} of 04</span>
              </div>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.6rem, 2.5vw, 2.2rem)',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                How CivicScan Operates
              </h2>
            </div>

            {/* Apple-Style Glass Stage Switcher */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(15, 23, 42, 0.85)',
                backdropFilter: 'blur(16px)',
                padding: '4px 6px',
                borderRadius: '9999px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
              }}
            >
              {stages.map((st, i) => {
                const isActive = activeStage === i;
                return (
                  <button
                    key={st.id}
                    onClick={() => scrollToStage(i)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '7px 13px',
                      borderRadius: '9999px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      background: isActive ? `${st.color}22` : 'transparent',
                      color: isActive ? '#ffffff' : '#94a3b8',
                      border: isActive ? `1px solid ${st.color}88` : '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontFamily: 'monospace',
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: isActive ? st.color : 'rgba(255, 255, 255, 0.1)',
                        color: isActive ? '#0f172a' : '#94a3b8',
                      }}
                    >
                      {st.index}
                    </span>
                    <span style={{ display: 'inline' }}>{st.title}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Master Glowing Progress Line */}
          <div
            style={{
              width: '100%',
              height: '3px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '9999px',
              overflow: 'hidden',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                width: `${scrollProgress * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #10b981 0%, #3b82f6 33%, #8b5cf6 66%, #f59e0b 100%)',
                boxShadow: '0 0 10px rgba(16, 185, 129, 0.6)',
                transition: 'width 0.1s ease-out',
              }}
            />
          </div>
        </div>

        {/* MAIN STAGE CANVAS: Left Story Details & Right Animated Dynamic Blocks */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'minmax(300px, 1fr) minmax(360px, 1.3fr)',
            gap: '36px',
            alignItems: 'center',
            position: 'relative',
            minHeight: 0,
          }}
        >
          {/* LEFT COLUMN: Stage Narrative with Dynamic Fade & Slide on Scroll */}
          <div
            key={`text-stage-${activeStage}`}
            style={{
              animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              paddingRight: '12px',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                fontWeight: 800,
                color: stages[activeStage].color,
                letterSpacing: '0.06em',
                marginBottom: '10px',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: stages[activeStage].color,
                  boxShadow: `0 0 10px ${stages[activeStage].color}`,
                }}
              />
              <span>{stages[activeStage].tag}</span>
            </div>

            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(1.7rem, 2.6vw, 2.3rem)',
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.22,
                letterSpacing: '-0.02em',
                marginBottom: '14px',
              }}
            >
              {stages[activeStage].headline}
            </h3>

            <p
              style={{
                fontSize: '0.98rem',
                color: '#94a3b8',
                lineHeight: 1.65,
                marginBottom: '20px',
              }}
            >
              {stages[activeStage].summary}
            </p>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                color: '#cbd5e1',
                width: 'fit-content',
                marginBottom: '20px',
              }}
            >
              <Sparkles size={14} color={stages[activeStage].color} />
              <span>{stages[activeStage].badge}</span>
            </div>

            {/* Quick Upload CTA when on Stage 0 */}
            {activeStage === 0 && (
              <button
                onClick={() => onNavigate('upload')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  background: '#10b981',
                  color: '#ffffff',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                  cursor: 'pointer',
                  border: 'none',
                  width: 'fit-content',
                  marginBottom: '16px',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#059669')}
                onMouseOut={(e) => (e.currentTarget.style.background = '#10b981')}
              >
                <UploadCloud size={16} />
                <span>Go to Live Upload Page →</span>
              </button>
            )}

            {/* Micro Scroll Hint */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.76rem' }}>
              <ArrowDown size={14} className="animate-bounce" />
              <span>Continue scrolling down to watch the next stage materialize</span>
            </div>
          </div>

          {/* RIGHT COLUMN: Dynamic Blocks Created & Destroyed on Scroll */}
          <div
            style={{
              position: 'relative',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '380px',
            }}
          >
            {/* ========================================================
                STAGE 01: Upload Image (Blocks Created & Fading on Scroll)
                ======================================================== */}
            {activeStage === 0 && (
              <div
                key="stage-0-blocks"
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  animation: 'fadeIn 0.45s ease',
                }}
              >
                {/* Block 1: Camera & Ingestion Dropzone */}
                <div
                  onClick={() => onNavigate('upload')}
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    backdropFilter: 'blur(16px)',
                    border: '2px dashed rgba(16, 185, 129, 0.45)',
                    borderRadius: '20px',
                    padding: '28px 24px',
                    textAlign: 'center',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                    position: 'relative',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.borderColor = '#10b981')}
                  onMouseOut={(e) => (e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.45)')}
                >
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '16px',
                      background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      margin: '0 auto 14px',
                      boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4)',
                    }}
                    className="animate-float-soft"
                  >
                    <UploadCloud size={30} />
                  </div>

                  <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                    Photo Ingestion Dropzone
                  </h4>
                  <p style={{ fontSize: '0.84rem', color: '#94a3b8', maxWidth: '340px', margin: '0 auto 14px' }}>
                    Citizens photograph road defects. Direct support for Apple HEIC, JPEG, and PNG.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 16px',
                        borderRadius: '9999px',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#34d399',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                      }}
                    >
                      <CheckCircle2 size={15} />
                      <span>Auto Sensor Validation Active</span>
                    </div>

                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '7px 16px',
                        borderRadius: '8px',
                        background: '#10b981',
                        color: '#ffffff',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                      }}
                    >
                      <UploadCloud size={15} />
                      <span>Click to Upload Your Image →</span>
                    </div>
                  </div>
                </div>

                {/* Block 2 (Dynamically Materialized): Citizen File Upload Simulation */}
                <div
                  style={{
                    background: 'rgba(30, 41, 59, 0.9)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '14px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                    transform: stageProgress > 0.3 ? 'translateY(0)' : 'translateY(12px)',
                    opacity: stageProgress > 0.2 ? 1 : 0.6,
                    transition: 'all 0.4s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FileCheck size={26} color="#10b981" />
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>IMG_9822.HEIC</div>
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                        3.4 MB • 4032 × 3024 • Apple iPhone Camera
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontFamily: 'monospace',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#34d399',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      fontWeight: 700,
                    }}
                  >
                    ✓ EXIF STREAMED
                  </span>
                </div>

                {/* Block 3: Dynamic Verification Pipeline Pill Array */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {['iOS HEIC Encoded', 'Raw EXIF Present', 'No Lossy Resizing'].map((badge, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontSize: '0.72rem',
                        fontFamily: 'monospace',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#94a3b8',
                      }}
                    >
                      • {badge}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ========================================================
                STAGE 02: GPS Extraction (Radar Pulse & Telemetry HUD)
                ======================================================== */}
            {activeStage === 1 && (
              <div
                key="stage-1-blocks"
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  animation: 'fadeIn 0.45s ease',
                }}
              >
                {/* Block 1: Concentric Radar & Satellite Beacon */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '20px',
                    padding: '28px 24px',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '140px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  >
                    {/* Concentric Radar Ring 1 */}
                    <div
                      style={{
                        position: 'absolute',
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        border: '2px solid rgba(59, 130, 246, 0.6)',
                        animation: 'radarRing 2.6s linear infinite',
                      }}
                    />
                    {/* Concentric Radar Ring 2 */}
                    <div
                      style={{
                        position: 'absolute',
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        border: '2px solid rgba(59, 130, 246, 0.4)',
                        animation: 'radarRing 2.6s linear infinite 1.3s',
                      }}
                    />

                    {/* Radar Sweep Rotating Gradient */}
                    <div
                      style={{
                        position: 'absolute',
                        width: '130px',
                        height: '130px',
                        borderRadius: '50%',
                        background:
                          'conic-gradient(from 0deg, transparent 70%, rgba(59, 130, 246, 0.4) 100%)',
                      }}
                      className="animate-radar-sweep"
                    />

                    {/* Central Satellite Lock Node */}
                    <div
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        zIndex: 2,
                        boxShadow: '0 0 24px rgba(59, 130, 246, 0.8)',
                      }}
                    >
                      <Satellite size={26} />
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', marginTop: '6px' }}>
                    <div style={{ fontSize: '0.78rem', color: '#93c5fd', fontFamily: 'monospace', fontWeight: 700 }}>
                      SATELLITE EPHEMERIS LOCKED
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
                      10.903824° N, 76.901518° E
                    </div>
                  </div>
                </div>

                {/* Block 2: Telemetry HUD Card (Calibrated to Coimbatore) */}
                <div
                  style={{
                    background: 'rgba(30, 41, 59, 0.9)',
                    backdropFilter: 'blur(12px)',
                    borderRadius: '14px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '14px 18px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '10px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '8px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>LOCATION</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
                      Ettimadai Ward
                    </div>
                  </div>
                  <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '8px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>ALTITUDE</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginTop: '2px' }}>
                      336.4m ASL
                    </div>
                  </div>
                  <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '8px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>PRECISION</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34d399', marginTop: '2px' }}>
                      ±1.8m Real-Time
                    </div>
                  </div>
                </div>

                {/* Block 3: Raw EXIF Hex Decode Stream */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    padding: '10px 14px',
                    fontFamily: 'monospace',
                    fontSize: '0.74rem',
                    color: '#94a3b8',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>GPSLatitude: 10/1, 54/1, 13.76/1 [N]</span>
                  <span style={{ color: '#38bdf8' }}>GPSRef: WGS84</span>
                </div>
              </div>
            )}

            {/* ========================================================
                STAGE 03: Neural Model Prediction (Animated Network & Laser Scan)
                ======================================================== */}
            {activeStage === 2 && (
              <div
                key="stage-2-blocks"
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  animation: 'fadeIn 0.45s ease',
                }}
              >
                {/* Block 1: Real-world Street Defect Photo with Sweeping Laser Scan */}
                <div
                  style={{
                    position: 'relative',
                    height: '210px',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    border: '1px solid rgba(139, 92, 246, 0.4)',
                    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <img
                    src="https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=900&q=80"
                    alt="Neural Defect Scan"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      filter: 'brightness(0.9)',
                    }}
                  />

                  {/* Sweeping Neon Laser Beam */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      height: '3px',
                      background: 'linear-gradient(90deg, transparent, #10b981 30%, #34d399 70%, transparent)',
                      boxShadow: '0 0 16px #10b981, 0 0 32px #34d399',
                      animation: 'laserScan 2.4s ease-in-out infinite',
                      zIndex: 3,
                    }}
                  />

                  {/* Bounding Box 1: Litter Detection */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '32%',
                      left: '26%',
                      width: '42%',
                      height: '46%',
                      border: '2px solid #10b981',
                      background: 'rgba(16, 185, 129, 0.18)',
                      borderRadius: '4px',
                      boxShadow: '0 0 14px rgba(16, 185, 129, 0.6)',
                      zIndex: 2,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '-24px',
                        left: '-2px',
                        background: '#10b981',
                        color: '#ffffff',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '4px 4px 0 0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Crosshair size={12} />
                      <span>litter 94.2%</span>
                    </div>
                  </div>

                  {/* Model Telemetry HUD Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '10px',
                      background: 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(8px)',
                      color: '#ffffff',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontFamily: 'monospace',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      zIndex: 4,
                    }}
                  >
                    <span style={{ color: '#10b981' }}>●</span>
                    <span>Inference: 28ms (CUDA TensorRT)</span>
                  </div>
                </div>

                {/* Block 2: Animated SVG Neural Network Architecture (Input -> Transformer -> Output) */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    padding: '14px 18px',
                    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontFamily: 'monospace',
                        color: '#c084fc',
                        fontWeight: 700,
                      }}
                    >
                      NEURAL SYNAPSE MATRIX • RF-DETR ARCHITECTURE
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>8 Locked Classes</span>
                  </div>

                  {/* Custom SVG Neural Graph with Flowing Synaptic Pulses */}
                  <svg
                    viewBox="0 0 460 90"
                    style={{ width: '100%', height: '80px', display: 'block' }}
                  >
                    <defs>
                      <linearGradient id="synPulse" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.2" />
                        <stop offset="50%" stopColor="#38bdf8" stopOpacity="1" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.2" />
                      </linearGradient>
                    </defs>

                    {/* Synaptic Curve Connections with Flow Animation */}
                    {[
                      'M 40 25 C 120 15, 160 20, 230 30',
                      'M 40 25 C 120 40, 160 55, 230 60',
                      'M 40 50 C 120 40, 160 30, 230 30',
                      'M 40 50 C 120 60, 160 55, 230 60',
                      'M 40 75 C 120 65, 160 40, 230 30',
                      'M 40 75 C 120 70, 160 65, 230 60',
                      'M 230 30 C 310 20, 350 20, 420 25',
                      'M 230 30 C 310 35, 350 45, 420 50',
                      'M 230 60 C 310 50, 350 50, 420 50',
                      'M 230 60 C 310 65, 350 70, 420 75',
                    ].map((d, idx) => (
                      <path
                        key={idx}
                        d={d}
                        fill="none"
                        stroke="url(#synPulse)"
                        strokeWidth="1.8"
                        strokeDasharray="8 4"
                        style={{ animation: 'synapseFlow 1.8s linear infinite' }}
                      />
                    ))}

                    {/* Layer 1: Input Nodes */}
                    <circle cx="40" cy="25" r="6" fill="#10b981" />
                    <circle cx="40" cy="50" r="6" fill="#10b981" />
                    <circle cx="40" cy="75" r="6" fill="#10b981" />
                    <text x="18" y="14" fill="#94a3b8" fontSize="8" fontFamily="monospace">INPUT</text>

                    {/* Layer 2: Transformer Backbone Nodes */}
                    <circle cx="230" cy="30" r="7" fill="#8b5cf6" className="pulse-glow" />
                    <circle cx="230" cy="60" r="7" fill="#8b5cf6" className="pulse-glow" />
                    <text x="200" y="16" fill="#c084fc" fontSize="8" fontFamily="monospace">TRANSFORMER</text>

                    {/* Layer 3: Output Classification Heads */}
                    <circle cx="420" cy="25" r="6" fill="#38bdf8" />
                    <circle cx="420" cy="50" r="6" fill="#38bdf8" />
                    <circle cx="420" cy="75" r="6" fill="#38bdf8" />
                    <text x="400" y="14" fill="#94a3b8" fontSize="8" fontFamily="monospace">HEADS</text>
                  </svg>
                </div>
              </div>
            )}

            {/* ========================================================
                STAGE 04: Mapping onto Dashboard (Municipal Triage Lifecycle)
                ======================================================== */}
            {activeStage === 3 && (
              <div
                key="stage-3-blocks"
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  animation: 'fadeIn 0.45s ease',
                }}
              >
                {/* Block 1: Interactive Municipal Incident Resolution Card */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '20px',
                    padding: '24px 22px',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background:
                            resolutionStatus === 'resolved'
                              ? '#10b981'
                              : resolutionStatus === 'dispatched'
                              ? '#3b82f6'
                              : '#f59e0b',
                        }}
                      />
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff' }}>
                        Incident #CS-4092 • Ettimadai Ward
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: '9999px',
                        background:
                          resolutionStatus === 'resolved'
                            ? 'rgba(16, 185, 129, 0.2)'
                            : resolutionStatus === 'dispatched'
                            ? 'rgba(59, 130, 246, 0.2)'
                            : 'rgba(245, 158, 11, 0.2)',
                        color:
                          resolutionStatus === 'resolved'
                            ? '#34d399'
                            : resolutionStatus === 'dispatched'
                            ? '#60a5fa'
                            : '#fbbf24',
                        border: '1px solid currentColor',
                        textTransform: 'uppercase',
                      }}
                    >
                      {resolutionStatus}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.88rem', color: '#cbd5e1', marginBottom: '14px', lineHeight: 1.5 }}>
                    <strong>Detected:</strong> Roadside Garbage & Litter Accumulation
                    <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: '3px' }}>
                      Coordinates: 10.903824° N, 76.901518° E • Priority: Level 2
                    </div>
                  </div>

                  {/* Interactive Status Selector for the Officer */}
                  <div style={{ marginBottom: '16px' }}>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: '#94a3b8',
                        fontFamily: 'monospace',
                        marginBottom: '8px',
                      }}
                    >
                      OFFICER WORKFLOW (CLICK TO TEST TRANSITION):
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px',
                      }}
                    >
                      {[
                        { id: 'pending', label: '1. Pending', icon: '⏳' },
                        { id: 'dispatched', label: '2. Dispatched', icon: '🚚' },
                        { id: 'resolved', label: '3. Resolved ✓', icon: '✅' },
                      ].map((btn) => (
                        <button
                          key={btn.id}
                          onClick={() => setResolutionStatus(btn.id)}
                          style={{
                            padding: '8px 6px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background:
                              resolutionStatus === btn.id
                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                : 'rgba(255, 255, 255, 0.05)',
                            color: resolutionStatus === btn.id ? '#ffffff' : '#94a3b8',
                            border:
                              resolutionStatus === btn.id
                                ? '1px solid #10b981'
                                : '1px solid rgba(255, 255, 255, 0.1)',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Live Status Audit Log */}
                  <div
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '0.74rem',
                      fontFamily: 'monospace',
                      color: '#94a3b8',
                    }}
                  >
                    {resolutionStatus === 'pending' && '• Status: Pending triage by municipal dispatch officer.'}
                    {resolutionStatus === 'dispatched' && '• Status: Sanitation team #4 en route to Ettimadai location.'}
                    {resolutionStatus === 'resolved' && '• Status: Roadway cleared and verified by field supervisor.'}
                  </div>
                </div>

                {/* Block 2: Quick Jump to Live Officer Dashboard */}
                <button
                  onClick={() => onNavigate && onNavigate('dashboard')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '12px 20px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(5, 150, 105, 0.4)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Navigation size={17} />
                  <span>Open Full Municipal Dashboard</span>
                  <ChevronRight size={17} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM HUD: Stage Indicators & Progress Counter */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            fontSize: '0.78rem',
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: stages[activeStage].color, fontWeight: 700 }}>
              {stages[activeStage].tag}
            </span>
            <span>•</span>
            <span>Scroll progress: {Math.round(scrollProgress * 100)}%</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {stages.map((_, idx) => (
              <span
                key={idx}
                onClick={() => scrollToStage(idx)}
                style={{
                  width: activeStage === idx ? '24px' : '8px',
                  height: '6px',
                  borderRadius: '9999px',
                  background: activeStage === idx ? stages[activeStage].color : 'rgba(255, 255, 255, 0.2)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
