import React, { useState, useEffect } from 'react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import ImageDropzone from '../components/upload/ImageDropzone';
import ExifDataViewer from '../components/upload/ExifDataViewer';
import LocationPickerMap from '../components/upload/LocationPickerMap';
import { CheckCircle2, ArrowRight, UploadCloud, MapPin, Sparkles, Mail, Copy, Search, Check, Clock } from 'lucide-react';
import { EMAIL_RE, getSavedEmail, saveEmail, saveMyReport } from '../services/myReports';
import { resolveImageUrl, getCategoryFallback } from '../services/imageService';

export default function UploadPage({
  onNavigate,
  onOpenLogin,
  isLoggedIn,
  onAddIncident,
}) {
  const [imageData, setImageData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submittedIncident, setSubmittedIncident] = useState(null);
  const [countdown, setCountdown] = useState(5);
  const [autoRedirectPaused, setAutoRedirectPaused] = useState(false);
  const [email, setEmail] = useState(getSavedEmail);
  const [emailTouched, setEmailTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  // Optional: restore the photo with the Pix2Pix GAN before RF-DETR analyses it (off by default)
  const [enhanceGan, setEnhanceGan] = useState(false);

  const emailValid = EMAIL_RE.test(email.trim());
  const showEmailError = emailTouched && !emailValid;

  useEffect(() => {
    if (emailValid) saveEmail(email.trim());
  }, [email, emailValid]);

  // 5-second countdown timer for auto-redirecting to landing home page
  useEffect(() => {
    if (!submitSuccess || autoRedirectPaused) return;

    if (countdown <= 0) {
      onNavigate('landing');
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [submitSuccess, countdown, autoRedirectPaused, onNavigate]);

  const handleImageProcessed = (processedData) => {
    setImageData(processedData);
    setSubmitSuccess(false);
    setSubmittedIncident(null);
    setCopied(false);
    if (processedData?.reportCode) {
      saveMyReport({ code: processedData.reportCode, category: processedData.category });
    }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked: the code is still visible on screen */
    }
  };

  const handleCategoryChange = (newCat) => {
    setImageData((prev) => ({ ...prev, category: newCat }));
  };

  const handleSeverityChange = (newSev) => {
    setImageData((prev) => ({ ...prev, severity: newSev }));
  };

  const handleLocationChange = (newLat, newLng) => {
    console.log(
      `%c📌 [CivicScan Pin Updated] Latitude: ${newLat}, Longitude: ${newLng}`,
      'color: #059669; font-weight: bold;'
    );
    setImageData((prev) => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        lat: newLat,
        lng: newLng,
        address: `Custom Geotag Point (${newLat.toFixed(4)}, ${newLng.toFixed(4)})`,
      },
    }));
  };

  const handleUseBrowserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const bLat = Number(pos.coords.latitude.toFixed(6));
          const bLng = Number(pos.coords.longitude.toFixed(6));
          console.log(
            `%c🛰️ [Browser GPS Detected] Device Latitude: ${bLat}, Longitude: ${bLng}`,
            'background: #dbeafe; color: #1d4ed8; font-weight: bold; padding: 4px 8px; border-radius: 4px;'
          );
          handleLocationChange(bLat, bLng);
        },
        (err) => {
          alert('Could not retrieve browser GPS location: ' + err.message);
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

  const handleSubmitReport = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);

      const category = imageData?.category || 'litter';
      const severity = imageData?.severity || 'Medium';
      const lat = typeof imageData?.metadata?.lat === 'number' ? imageData.metadata.lat : 10.903824;
      const lng = typeof imageData?.metadata?.lng === 'number' ? imageData.metadata.lng : 76.901518;

      const baseIncident = imageData?.savedIncident || {
        _id: `inc-${Date.now()}`,
        id: `inc-${Date.now()}`,
        status: 'Reported',
        domain: imageData?.domain || 'civic_waste',
        ward: 'Ettimadai Ward',
        reportedAt: 'Just now',
        confidence: imageData?.confidence || 0.92,
        daysUnresolved: 0,
        assignedTeam: 'Unassigned',
        reportedBy: 'Citizen Mobile Web App',
      };

      const trackingCode =
        imageData?.reportCode ||
        baseIncident.reportCode ||
        baseIncident.id ||
        `CS-${Math.floor(100000 + Math.random() * 900000)}`;

      const finalIncident = {
        ...baseIncident,
        reportCode: trackingCode,
        id: baseIncident._id || baseIncident.id,
        _id: baseIncident._id || baseIncident.id,
        title: `Reported ${category.replace('_', ' ')}`,
        category,
        severity,
        lat,
        lng,
        address: imageData?.metadata?.address || `Ettimadai, Coimbatore (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`,
        imageUrl: resolveImageUrl(baseIncident.imageUrl || imageData?.previewUrl, category),
      };

      setSubmittedIncident(finalIncident);
      setCountdown(5);
      setAutoRedirectPaused(false);
      setSubmitSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      console.log(
        `%c🚀 [CivicScan Ingestion Complete] Incident Dispatched:
- Title: ${finalIncident.title}
- Category: ${finalIncident.category} (${finalIncident.domain})
- Severity: ${finalIncident.severity}
- Coordinates: Lat ${finalIncident.lat || (finalIncident.location && finalIncident.location.coordinates[1])}, Lng ${finalIncident.lng || (finalIncident.location && finalIncident.location.coordinates[0])}
- Ward: ${finalIncident.ward}`,
        'background: #059669; color: #ffffff; font-weight: bold; font-size: 13px; padding: 8px 12px; border-radius: 6px;'
      );

      onAddIncident(finalIncident);
    }, 400);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      <Navbar
        currentPage="upload"
        onNavigate={onNavigate}
        onOpenLogin={onOpenLogin}
        isLoggedIn={isLoggedIn}
      />

      <main style={{ flex: 1, padding: '48px 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          {submitSuccess ? (
            /* Dedicated Thank You & Confirmation Page */
            <div
              style={{
                maxWidth: '760px',
                margin: '0 auto',
                textAlign: 'center',
                padding: '24px 0',
                animation: 'fadeIn 0.35s ease',
              }}
            >
              {/* Pulsing check circle badge */}
              <div
                style={{
                  width: '92px',
                  height: '92px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 12px 30px rgba(16, 185, 129, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px auto',
                  color: '#ffffff',
                }}
              >
                <CheckCircle2 size={54} strokeWidth={2.4} />
              </div>

              {/* Tag pill */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 16px',
                  borderRadius: '9999px',
                  background: '#e6f7ef',
                  color: '#059669',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  marginBottom: '16px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <Sparkles size={15} />
                <span>CivicScan AI Ingestion Confirmed</span>
              </div>

              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(2.1rem, 3.6vw, 2.75rem)',
                  fontWeight: 800,
                  color: '#0f172a',
                  marginBottom: '16px',
                  lineHeight: 1.25,
                }}
              >
                Thank You for Submitting!
              </h1>

              <p
                style={{
                  fontSize: '1.05rem',
                  color: '#475569',
                  maxWidth: '640px',
                  margin: '0 auto 32px auto',
                  lineHeight: 1.65,
                }}
              >
                Your report has been analyzed by our <strong>CivicScan Eco-Infrastructure AI</strong> model and successfully
                registered with municipal authorities. The ticket and geotagged telemetry have been dispatched to the{' '}
                <strong>Ettimadai Ward Maintenance Crew</strong> for on-site resolution.
              </p>

              {/* Tracking ID Card */}
              {(() => {
                const trackingId =
                  submittedIncident?.reportCode ||
                  imageData?.reportCode ||
                  imageData?.savedIncident?.reportCode ||
                  submittedIncident?.id ||
                  imageData?.id ||
                  'CS-847291';

                return (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '20px',
                      padding: '28px 32px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
                      marginBottom: '24px',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '14px',
                        marginBottom: '18px',
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            color: '#64748b',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Civic Tracking ID
                        </span>
                        <div
                          style={{
                            fontSize: '1.75rem',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            color: '#0f172a',
                            letterSpacing: '0.06em',
                            marginTop: '2px',
                          }}
                        >
                          {trackingId}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => copyCode(trackingId)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 20px',
                          borderRadius: '10px',
                          background: copied ? '#059669' : '#f1f5f9',
                          color: copied ? '#ffffff' : '#0f172a',
                          fontSize: '0.92rem',
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: copied ? '0 4px 12px rgba(5, 150, 105, 0.3)' : 'none',
                        }}
                      >
                        {copied ? <Check size={18} /> : <Copy size={18} />}
                        <span>{copied ? 'Copied to Clipboard!' : 'Copy Tracking ID'}</span>
                      </button>
                    </div>

                    <div style={{ height: '1px', background: '#f1f5f9', marginBottom: '18px' }} />

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                        gap: '16px',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Defect Class</div>
                        <div
                          style={{
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            color: '#0f172a',
                            textTransform: 'capitalize',
                            marginTop: '2px',
                          }}
                        >
                          {(submittedIncident?.category || imageData?.category || 'litter').replace('_', ' ')}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Assigned Ward</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                          {submittedIncident?.ward || 'Ettimadai Ward'}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Verified Coordinates</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                          {(submittedIncident?.lat ?? imageData?.metadata?.lat ?? 10.9038).toFixed(4)}° N,{' '}
                          {(submittedIncident?.lng ?? imageData?.metadata?.lng ?? 76.9015).toFixed(4)}° E
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Workflow Status</div>
                        <div
                          style={{
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            color: '#059669',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginTop: '2px',
                          }}
                        >
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: '#10b981',
                              display: 'inline-block',
                            }}
                          />
                          Queued for Crew
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 5-second Auto-Redirect Timer Banner */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: '32px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left' }}>
                  <Clock size={22} color={autoRedirectPaused ? '#94a3b8' : '#059669'} />
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                      {autoRedirectPaused ? (
                        'Auto-redirect paused'
                      ) : (
                        <>
                          Redirecting to Home page in{' '}
                          <span style={{ color: '#059669', fontWeight: 800 }}>{countdown}</span> second
                          {countdown !== 1 ? 's' : ''}...
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                      {autoRedirectPaused
                        ? 'Click resume whenever you want to be redirected back to the Home page.'
                        : 'You will be automatically returned to the CivicScan About / Home page.'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAutoRedirectPaused((p) => !p)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {autoRedirectPaused ? 'Resume Redirect' : 'Pause'}
                </button>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => onNavigate('landing')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 26px',
                    borderRadius: '10px',
                    background: '#059669',
                    color: '#ffffff',
                    fontSize: '0.96rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)',
                  }}
                >
                  <span>Return to Home Page Now</span>
                  <ArrowRight size={17} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const trackingId =
                      submittedIncident?.reportCode ||
                      imageData?.reportCode ||
                      imageData?.savedIncident?.reportCode ||
                      submittedIncident?.id ||
                      imageData?.id ||
                      '';
                    onNavigate('track', trackingId);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 22px',
                    borderRadius: '10px',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    border: '1.5px solid #cbd5e1',
                    cursor: 'pointer',
                  }}
                >
                  <Search size={17} color="#059669" />
                  <span>Track This Report</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSubmitSuccess(false);
                    setImageData(null);
                    setSubmittedIncident(null);
                  }}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '10px',
                    background: '#f1f5f9',
                    color: '#475569',
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Submit Another Report
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Page Banner */}
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
                  }}
                >
                  <UploadCloud size={15} />
                  <span>Smart Geotagged Ingestion</span>
                </div>

                <h1
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(2rem, 3.2vw, 2.5rem)',
                    fontWeight: 800,
                    color: '#0f172a',
                    marginBottom: '12px',
                  }}
                >
                  Upload Street Photo & Extract Geolocation
                </h1>

                <p style={{ color: '#64748b', fontSize: '1rem', maxWidth: '600px', margin: '0 auto' }}>
                  Upload any street picture. CivicScan reads embedded EXIF GPS tags directly from the file,
                  infers the defect category with deep computer vision, and maps it for municipal dispatch.
                </p>
              </div>

          {/* Main Upload Flow Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* Step 0: email (required). The report ID is sent here */}
            <div
              style={{
                background: '#ffffff',
                border: `1.5px solid ${showEmailError ? '#f87171' : '#e2e8f0'}`,
                borderRadius: '16px',
                padding: '20px 24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              }}
            >
              <label
                htmlFor="reporter-email"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}
              >
                <Mail size={18} color="#059669" />
                <span>Your email address</span>
                <span style={{ color: '#b91c1c', fontWeight: 700 }} aria-hidden="true">*</span>
              </label>
              <p style={{ fontSize: '0.86rem', color: '#64748b', marginBottom: '12px', lineHeight: 1.5 }}>
                We email you a <strong>report ID</strong> so you can follow your report on the Track Report page.
                Your address is used only for this and is never shown publicly. To double-check results, a resized
                copy of your photo (with its location data removed) is reviewed by a second AI service.
              </p>
              <input
                id="reporter-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                aria-invalid={showEmailError}
                aria-describedby={showEmailError ? 'reporter-email-error' : undefined}
                style={{
                  width: '100%',
                  maxWidth: '420px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: `1px solid ${showEmailError ? '#f87171' : '#cbd5e1'}`,
                  fontSize: '1rem',
                  outline: 'none',
                }}
              />
              {showEmailError && (
                <div id="reporter-email-error" role="alert" style={{ color: '#b91c1c', fontSize: '0.84rem', marginTop: '6px', fontWeight: 600 }}>
                  Please enter a valid email address to continue.
                </div>
              )}
            </div>

            {/* Optional GAN enhancement before detection */}
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                background: '#ffffff',
                border: `1px solid ${enhanceGan ? '#10b981' : '#e2e8f0'}`,
                borderRadius: '12px',
                padding: '12px 16px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={enhanceGan}
                onChange={(e) => setEnhanceGan(e.target.checked)}
                style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: '#059669', flexShrink: 0 }}
              />
              <span>
                <span style={{ display: 'block', fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>Enhance photo with GAN before analysis</span>
                <span style={{ display: 'block', color: '#64748b', fontSize: '0.82rem', lineHeight: 1.5, marginTop: '2px' }}>
                  Optional, for dark, blurred or noisy photos. A Pix2Pix GAN restores the photo and RF-DETR analyses the restored version. Your original
                  photo is kept as the evidence. On clear photos it can make detection worse, so leave it off unless the photo is poor.
                </span>
              </span>
            </label>

            {/* Step 1: Dropzone (enabled once a valid email is entered) */}
            <ImageDropzone onImageProcessed={handleImageProcessed} email={email.trim()} disabled={!emailValid} enhance={enhanceGan} />

            {/* GAN enhancement result (only when the citizen ticked the box) */}
            {imageData && !imageData.discarded && imageData.gan && (
              <div
                style={{
                  borderRadius: '12px',
                  padding: '12px 16px',
                  fontSize: '0.88rem',
                  lineHeight: 1.5,
                  background: imageData.gan.applied ? '#f5f3ff' : '#f8fafc',
                  border: `1px solid ${imageData.gan.applied ? '#ddd6fe' : '#e2e8f0'}`,
                  color: '#334155',
                  display: 'flex',
                  gap: '14px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {imageData.gan.applied && imageData.gan.restoredImageUrl && (
                  <img
                    src={imageData.gan.restoredImageUrl}
                    alt="Photo after GAN enhancement"
                    style={{ width: '120px', height: '90px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #ddd6fe' }}
                  />
                )}
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <strong>{imageData.gan.applied ? 'Photo enhanced with GAN' : 'GAN enhancement was not applied'}</strong>
                  <div>
                    {imageData.gan.applied
                      ? `${imageData.gan.name || 'Pix2Pix GAN'} restored the photo${imageData.gan.ms ? ` in ${Math.round(imageData.gan.ms)} ms` : ''}; RF-DETR analysed the restored version.`
                      : `${imageData.gan.reason || 'The GAN is not available'}. RF-DETR analysed your original photo.`}
                  </div>
                </div>
              </div>
            )}

            {/* Second AI check on the detector's result */}
            {imageData && !imageData.discarded && imageData.aiReview && (
              <div
                style={{
                  borderRadius: '12px',
                  padding: '12px 16px',
                  fontSize: '0.88rem',
                  lineHeight: 1.5,
                  background: imageData.aiReview.verdict === 'confirmed' ? '#f0fdf4' : imageData.aiReview.verdict === 'corrected' ? '#eff6ff' : '#fffbeb',
                  border: `1px solid ${imageData.aiReview.verdict === 'confirmed' ? '#bbf7d0' : imageData.aiReview.verdict === 'corrected' ? '#bfdbfe' : '#fde68a'}`,
                  color: '#334155',
                }}
              >
                <strong>
                  {imageData.aiReview.verdict === 'confirmed' && 'Second AI check: detection confirmed'}
                  {imageData.aiReview.verdict === 'corrected' && 'Second AI check: detection corrected'}
                  {(imageData.aiReview.verdict === 'disputed' || imageData.aiReview.verdict === 'unsure') && 'Second AI check: needs officer review'}
                </strong>
                {imageData.aiReview.changes?.map((c, i) => (
                  <div key={i}>
                    {c.kind === 'relabeled'
                      ? `Changed "${String(c.from).replace(/_/g, ' ')}" to "${String(c.to).replace(/_/g, ' ')}": ${c.reason}`
                      : `Removed a false "${String(c.from).replace(/_/g, ' ')}" box: ${c.reason}`}
                  </div>
                ))}
                {!imageData.aiReview.changes?.length && imageData.aiReview.summary && <div>{imageData.aiReview.summary}</div>}
              </div>
            )}

            {/* Report created: show the tracking ID */}
            {imageData && !imageData.discarded && imageData.reportCode && (
              <div
                style={{
                  background: '#ecfdf5',
                  border: '1.5px solid #10b981',
                  borderRadius: '16px',
                  padding: '22px 24px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  animation: 'fadeIn 0.3s ease',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Your report ID
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.7rem', fontWeight: 800, letterSpacing: '0.06em', color: '#064e3b' }}>
                    {imageData.reportCode}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: '#047857', marginTop: '4px', lineHeight: 1.5 }}>
                    {imageData.emailInfo?.sent
                      ? `We emailed this ID to ${email.trim()}.`
                      : 'We could not send the email right now. Please note down this ID: it is the only way to track your report.'}
                    {imageData.emailInfo?.testInbox && imageData.emailInfo?.previewUrl && (
                      <>
                        {' '}
                        <a href={imageData.emailInfo.previewUrl} target="_blank" rel="noreferrer" style={{ color: '#065f46', fontWeight: 700 }}>
                          Open the test email
                        </a>{' '}
                        <span style={{ opacity: 0.8 }}>(demo inbox: nothing is delivered to a real address)</span>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => copyCode(imageData.reportCode)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '8px', background: '#ffffff', color: '#065f46', fontWeight: 700, fontSize: '0.88rem', border: '1px solid #a7f3d0' }}
                  >
                    <Copy size={15} />
                    <span>{copied ? 'Copied' : 'Copy ID'}</span>
                  </button>
                  <button
                    onClick={() => onNavigate('track', imageData.reportCode)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '8px', background: '#059669', color: '#ffffff', fontWeight: 700, fontSize: '0.88rem' }}
                  >
                    <Search size={15} />
                    <span>Track this report</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Extracted EXIF Metadata & AI Preview (Only shown once an image is uploaded) */}
            {imageData && imageData.discarded && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '16px',
                  padding: '36px 24px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: '16px',
                  animation: 'fadeIn 0.3s ease',
                }}
              >
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: '#f0fdf4',
                    border: '2px solid #86efac',
                    color: '#16a34a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={32} />
                </div>

                <div>
                  <div
                    style={{
                      display: 'inline-block',
                      background: '#dcfce7',
                      color: '#15803d',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      padding: '4px 12px',
                      borderRadius: '9999px',
                      marginBottom: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Clean Infrastructure Verified
                  </div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                    No Civic Defects Detected — Image Discarded
                  </h3>
                  <p
                    style={{
                      fontSize: '0.92rem',
                      color: '#64748b',
                      maxWidth: '600px',
                      margin: '0 auto',
                      lineHeight: 1.6,
                    }}
                  >
                    The {imageData.modelName || 'RF-DETR'} model analyzed your image and found <strong>zero civic defects</strong> (no potholes,
                    no structural cracks, no damaged manholes, and no litter).
                    <br />
                    Per quality control policy, <strong>clean images are immediately discarded</strong> and no ticket is
                    created in the municipal database.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                  <button
                    onClick={() => setImageData(null)}
                    style={{
                      padding: '10px 22px',
                      borderRadius: '8px',
                      background: '#059669',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                    }}
                  >
                    Upload Another Image
                  </button>
                  <button
                    onClick={() => onNavigate('landing')}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      background: '#f1f5f9',
                      color: '#334155',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                    }}
                  >
                    Back to home
                  </button>
                </div>
              </div>
            )}

            {imageData && !imageData.discarded && (
              <>
                <ExifDataViewer
                  imageData={imageData}
                  onSubmitReport={handleSubmitReport}
                  isSubmitting={isSubmitting}
                />

                {/* Step 3: Interactive Verification Map */}
                <LocationPickerMap
                  lat={imageData.metadata.lat}
                  lng={imageData.metadata.lng}
                  onLocationChange={handleLocationChange}
                  onUseBrowserLocation={handleUseBrowserLocation}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
