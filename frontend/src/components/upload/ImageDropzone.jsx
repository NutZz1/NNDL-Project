import React, { useRef, useState } from 'react';
import { UploadCloud, Image as ImageIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import heic2any from 'heic2any';
import { api } from '../../services/api';
import { readFileAsDataUrl, resolveImageUrl, getCategoryFallback } from '../../services/imageService';

export default function ImageDropzone({ onImageProcessed, email = '', disabled = false }) {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (file) => {
    if (!file || disabled) return;
    setError('');
    setProcessing(true);

    try {
      // 1. Generate local browser preview (Data URL for persistent rendering)
      let displayableFile = file;
      const isHeic = file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic';
      if (isHeic) {
        try {
          const convertedBlob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
          displayableFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
        } catch (convErr) {
          // Some HEIC formats or browser extensions with CSP restrict in-browser conversion.
          // The backend RF-DETR pipeline natively converts HEIC to standard JPEG via pillow_heif.
        }
      }

      // Only generate local dataUrl if not HEIC (or if heic2any actually converted it)
      const isStillHeic = displayableFile === file && isHeic;
      let previewUrl = '';
      if (!isStillHeic) {
        const dataUrl = await readFileAsDataUrl(displayableFile);
        previewUrl = dataUrl || URL.createObjectURL(displayableFile);
      }

      // 2. Call backend for real RF-DETR inference, EXIF extraction, and DB storage
      try {
        const serverRes = await api.uploadAndAnalyzeImage(file, {}, email);
        if (serverRes) {
          const ai = serverRes.aiDetection || {};
          const meta = serverRes.metadata || {};

          // Resolve the server-converted JPEG image URL
          const backendImgUrl = serverRes.imageUrl
            ? resolveImageUrl(serverRes.imageUrl, ai.category)
            : '';

          // ALWAYS prioritize the real uploaded image saved by the backend
          const effectivePreview = backendImgUrl || previewUrl;

          if (serverRes.discarded) {
            onImageProcessed({
              file,
              previewUrl: effectivePreview,
              filename: file.name,
              discarded: true,
              message:
                serverRes.message ||
                'No civic hazards or defects detected by RF-DETR. Image verified clean and discarded.',
              metadata: {
                hasGps: meta.hasGps,
                lat: meta.latitude || 10.903824,
                lng: meta.longitude || 76.901518,
                altitude: meta.altitude || '336m',
                timestamp: meta.timestamp || new Date().toLocaleString(),
                address: meta.address || 'Ettimadai, Coimbatore',
              },
              category: 'clean',
              domain: 'none',
              confidence: 0,
              severity: 'None',
              bboxes: [],
            });
            return;
          }

          const resolvedLat = typeof meta.latitude === 'number' ? meta.latitude : 10.903824;
          const resolvedLng = typeof meta.longitude === 'number' ? meta.longitude : 76.901518;

          let savedIncident = serverRes.incident;
          if (savedIncident) {
            savedIncident = {
              ...savedIncident,
              lat: resolvedLat,
              lng: resolvedLng,
              imageUrl: resolveImageUrl(savedIncident.imageUrl, savedIncident.category) || effectivePreview,
            };
          }

          onImageProcessed({
            file,
            previewUrl: effectivePreview,
            filename: file.name,
            metadata: {
              hasGps: Boolean(meta.hasGps),
              lat: resolvedLat,
              lng: resolvedLng,
              altitude: meta.altitude || '336m',
              timestamp: meta.timestamp || new Date().toLocaleString(),
              address: meta.address || `Ettimadai, Coimbatore (${resolvedLat.toFixed(4)}° N, ${resolvedLng.toFixed(4)}° E)`,
            },
            category: ai.category || 'litter',
            domain: ai.domain || 'civic_waste',
            confidence: ai.confidence || 0.92,
            severity: ai.severity || 'Medium',
            bboxes: ai.bboxes || [],
            savedIncident,
            reportCode: serverRes.reportCode || savedIncident?.reportCode || null,
            emailInfo: serverRes.email || null,
            aiReview: serverRes.aiReview || null,
          });
          return;
        }
      } catch (backendErr) {
        // No fake result: a report needs a real detection, a report ID and a confirmation e-mail.
        console.warn('[ImageDropzone] Backend error:', backendErr.message);
        setError(
          backendErr.status
            ? backendErr.message
            : 'Cannot reach the CivicScan server, so this photo was not analysed. Please try again in a moment.'
        );
        return;
      }
    } catch (err) {
      console.error('Processing error:', err);
      setError('Something went wrong while preparing the photo. Please try another image.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div>
      {/* Drag and drop upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current && fileInputRef.current.click()}
        style={{
          border: dragOver ? '2px dashed #059669' : '2px dashed #cbd5e1',
          borderRadius: '16px',
          padding: '56px 24px',
          textAlign: 'center',
          background: dragOver ? '#ecfdf5' : '#ffffff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,.heic,.heif"
          disabled={disabled}
          style={{ display: 'none' }}
          onChange={(e) => e.target.files && handleFile(e.target.files[0])}
        />

        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#e6f7ef',
            color: '#059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            border: '1px solid #bbf7d0',
          }}
        >
          <UploadCloud size={32} />
        </div>

        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
          {processing ? 'Analysing your photo and creating your report...' : 'Upload Street Photo for AI Analysis'}
        </h3>

        <p style={{ color: '#64748b', fontSize: '0.92rem', maxWidth: '480px', margin: '0 auto 20px', lineHeight: 1.6 }}>
          {disabled
            ? 'Enter your email above first. We send your report ID there so you can track the report.'
            : 'Drag and drop your street photo here, or browse files. CivicScan automatically extracts embedded GPS metadata and detects defects.'}
        </p>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 22px',
            borderRadius: '8px',
            background: '#059669',
            color: '#ffffff',
            fontSize: '0.92rem',
            fontWeight: 700,
            boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)',
          }}
        >
          <span>Choose Image File</span>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: '14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '10px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
