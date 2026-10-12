import React from 'react';
import {
  X,
  MapPin,
  Clock,
  User,
  ShieldCheck,
  CheckCircle,
  Truck,
  AlertTriangle,
  Send,
  ExternalLink,
} from 'lucide-react';
import { resolveImageUrl, handleImageError } from '../../services/imageService';

export default function IncidentDetailModal({
  incident,
  onClose,
  onUpdateStatus,
}) {
  const [showBboxes, setShowBboxes] = React.useState(true);
  if (!incident) return null;

  const getSeverityStyle = (sev) => {
    switch (sev) {
      case 'Critical':
        return { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
      case 'High':
        return { bg: '#ffedd5', color: '#c2410c', border: '#fdba74' };
      case 'Low':
        return { bg: '#fef3c7', color: '#92400e', border: '#fde68a' };
      default:
        return { bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd' };
    }
  };

  const sevStyle = getSeverityStyle(incident.severity);

  // Safe bounding boxes
  const bboxes =
    Array.isArray(incident.detectedBboxes) && incident.detectedBboxes.length > 0
      ? incident.detectedBboxes
      : Array.isArray(incident.bboxes) && incident.bboxes.length > 0
      ? incident.bboxes
      : [{ box: [0.22, 0.2, 0.78, 0.8], label: incident.category || 'defect', score: incident.confidence || 0.92 }];

  const getBorderColor = () => {
    if (incident.domain === 'hazard' || incident.category?.includes('manhole')) return '#ef4444';
    if (incident.domain === 'road_damage') return '#3b82f6';
    return '#10b981';
  };
  const themeColor = getBorderColor();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '540px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Image Header with Bounding Box Overlay & Toggle */}
        <div style={{ position: 'relative', height: '240px', width: '100%', background: '#0f172a', overflow: 'hidden' }}>
          <img
            src={resolveImageUrl(incident.imageUrl, incident.category)}
            alt={incident.title}
            onError={(e) => handleImageError(e, incident.category)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />

          {/* Bounding Box Visualizer Overlay */}
          {showBboxes &&
            bboxes.map((b, i) => {
              const box = b.box || [0.2, 0.2, 0.8, 0.8];
              const top = box[0] * 100;
              const left = box[1] * 100;
              const height = (box[2] - box[0]) * 100;
              const width = (box[3] - box[1]) * 100;

              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: `${top}%`,
                    left: `${left}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    border: `2.5px solid ${themeColor}`,
                    background: `${themeColor}22`,
                    borderRadius: '4px',
                    boxShadow: `0 0 12px ${themeColor}80`,
                    pointerEvents: 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '-20px',
                      left: 0,
                      background: themeColor,
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '3px',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    }}
                  >
                    {(b.label || incident.category).replace('_', ' ')} {b.score ? `${Math.round(b.score * 100)}%` : ''}
                  </span>
                </div>
              );
            })}

          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '14px',
              right: '14px',
              background: 'rgba(15, 23, 42, 0.75)',
              color: '#ffffff',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <X size={18} />
          </button>

          {/* View Toggle: Bounding Boxes vs Clear Image */}
          <div
            style={{
              position: 'absolute',
              top: '14px',
              left: '14px',
              zIndex: 10,
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(6px)',
              borderRadius: '8px',
              padding: '3px',
              display: 'flex',
              gap: '4px',
            }}
          >
            <button
              onClick={() => setShowBboxes(true)}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                fontSize: '0.72rem',
                fontWeight: showBboxes ? 700 : 500,
                background: showBboxes ? themeColor : 'transparent',
                color: '#ffffff',
                transition: 'all 0.15s ease',
              }}
            >
              🎯 RF-DETR Boxes
            </button>
            <button
              onClick={() => setShowBboxes(false)}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                fontSize: '0.72rem',
                fontWeight: !showBboxes ? 700 : 500,
                background: !showBboxes ? '#334155' : 'transparent',
                color: '#ffffff',
                transition: 'all 0.15s ease',
              }}
            >
              🖼️ Clear Image
            </button>
          </div>

          {/* Floating Severity & Status Badge */}
          <div style={{ position: 'absolute', bottom: '12px', left: '14px', display: 'flex', gap: '8px', zIndex: 10 }}>
            <span
              style={{
                background: sevStyle.bg,
                color: sevStyle.color,
                border: `1px solid ${sevStyle.border}`,
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              {incident.severity} Severity
            </span>
            <span
              style={{
                background: '#ffffff',
                color: '#0f172a',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              {incident.status}
            </span>
          </div>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>
              {incident.category.replace('_', ' ')} • AI Conf: {Math.round(incident.confidence * 100)}%
            </span>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              {incident.reportedAt || 'Recent'}
            </span>
          </div>

          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '12px' }}>
            {incident.title}
          </h3>

          <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.6, marginBottom: '20px' }}>
            {incident.description || 'Defect flagged by automatic visual inspection feed.'}
          </p>

          {/* Auto-dispatch agent decision */}
          {incident.dispatch?.reason && (
            <div
              style={{
                background: incident.dispatch.needsReview ? '#fffbeb' : '#f0fdf4',
                border: `1px solid ${incident.dispatch.needsReview ? '#fde68a' : '#bbf7d0'}`,
                borderRadius: '10px',
                padding: '12px 14px',
                marginBottom: '16px',
                fontSize: '0.82rem',
                color: '#334155',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 800, color: incident.dispatch.needsReview ? '#92400e' : '#166534', marginBottom: '4px' }}>
                {incident.dispatch.needsReview ? 'Needs officer review' : 'Auto-dispatched'}
                {incident.reportCode ? ` • ${incident.reportCode}` : ''}
              </div>
              {incident.dispatch.reason}
              {incident.dispatch.targetBy && !incident.dispatch.needsReview && (
                <div style={{ marginTop: '4px', color: '#64748b' }}>
                  Due by {new Date(incident.dispatch.targetBy).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              )}
            </div>
          )}

          {/* Location & Meta info */}
          <div
            style={{
              background: '#f8fafc',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginBottom: '20px',
              fontSize: '0.82rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155' }}>
              <MapPin size={16} color="#059669" />
              <span style={{ fontWeight: 600 }}>{incident.address}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
              <span style={{ fontFamily: 'monospace' }}>
                GPS: {incident.lat.toFixed(5)}° N, {incident.lng.toFixed(5)}° W • {incident.ward}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
              <Truck size={15} />
              <span>Assigned Crew: <strong>{incident.assignedTeam || 'Unassigned'}</strong></span>
            </div>
          </div>

          {/* Officer Action Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {incident.status !== 'Resolved' ? (
              <>
                <button
                  onClick={() => onUpdateStatus(incident.id, 'Assigned', 'Ward 7 Rapid Crew')}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    background: '#0f172a',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Truck size={16} />
                  <span>Dispatch Crew</span>
                </button>

                <button
                  onClick={() => onUpdateStatus(incident.id, 'Resolved')}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    background: '#059669',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <CheckCircle size={16} />
                  <span>Mark Cleaned</span>
                </button>
              </>
            ) : (
              <div
                style={{
                  gridColumn: 'span 2',
                  padding: '10px',
                  borderRadius: '8px',
                  background: '#ecfdf5',
                  color: '#047857',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <CheckCircle size={16} />
                <span>Issue Successfully Resolved</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
