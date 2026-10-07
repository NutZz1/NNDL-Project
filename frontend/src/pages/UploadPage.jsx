import React, { useState } from 'react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import ImageDropzone from '../components/upload/ImageDropzone';
import ExifDataViewer from '../components/upload/ExifDataViewer';
import LocationPickerMap from '../components/upload/LocationPickerMap';
import { CheckCircle2, ArrowRight, UploadCloud, MapPin, Sparkles } from 'lucide-react';
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

  const handleImageProcessed = (processedData) => {
    setImageData(processedData);
    setSubmitSuccess(false);
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
      setSubmitSuccess(true);

      const category = imageData.category || 'litter';
      const severity = imageData.severity || 'Medium';
      const lat = typeof imageData.metadata?.lat === 'number' ? imageData.metadata.lat : 10.903824;
      const lng = typeof imageData.metadata?.lng === 'number' ? imageData.metadata.lng : 76.901518;

      const baseIncident = imageData.savedIncident || {
        _id: `inc-${Date.now()}`,
        id: `inc-${Date.now()}`,
        status: 'Reported',
        domain: imageData.domain || 'civic_waste',
        ward: 'Ettimadai Ward',
        reportedAt: 'Just now',
        confidence: imageData.confidence || 0.92,
        daysUnresolved: 0,
        assignedTeam: 'Unassigned',
        reportedBy: 'Citizen Mobile Web App',
      };

      const finalIncident = {
        ...baseIncident,
        id: baseIncident._id || baseIncident.id,
        _id: baseIncident._id || baseIncident.id,
        title: `Reported ${category.replace('_', ' ')}`,
        category,
        severity,
        lat,
        lng,
        address: imageData.metadata?.address || `Ettimadai, Coimbatore (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`,
        imageUrl: resolveImageUrl(baseIncident.imageUrl || imageData.previewUrl, category),
      };

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

          {/* Submission Success Banner */}
          {submitSuccess && (
            <div
              style={{
                background: '#ecfdf5',
                border: '1.5px solid #10b981',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '32px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                animation: 'fadeIn 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: '#10b981',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#065f46' }}>
                    Incident Geotagged & Dispatched to Ettimadai Ward!
                  </h4>
                  <p style={{ fontSize: '0.86rem', color: '#047857' }}>
                    Coordinates ({imageData.metadata.lat.toFixed(5)}, {imageData.metadata.lng.toFixed(5)})
                    have been mapped onto the central officer dashboard.
                  </p>
                </div>
              </div>

              <button
                onClick={() => onNavigate('dashboard')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  background: '#059669',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
                }}
              >
                <span>View on Officer Dashboard Map</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Main Upload Flow Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* Step 1: Dropzone & Preset Chooser */}
            <ImageDropzone onImageProcessed={handleImageProcessed} />

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
                    The RF-DETR model analyzed your image and found <strong>zero civic defects</strong> (no potholes,
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
                    onClick={() => onNavigate('dashboard')}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      background: '#f1f5f9',
                      color: '#334155',
                      fontWeight: 600,
                      fontSize: '0.9rem',
                    }}
                  >
                    Go to Dashboard
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
        </div>
      </main>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}
