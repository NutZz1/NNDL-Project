import React, { useState } from 'react';
import { Layers, AlertTriangle, Trash2, Activity, ShieldAlert, Sparkles } from 'lucide-react';
import { CIVIC_CLASSES } from '../../services/mockData';

export default function AboutSection() {
  const [selectedDomain, setSelectedDomain] = useState('all');

  const filteredClasses =
    selectedDomain === 'all'
      ? CIVIC_CLASSES
      : CIVIC_CLASSES.filter((c) => c.domain === selectedDomain);

  return (
    <section
      id="about"
      style={{
        padding: '96px 24px',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Section Header */}
        <div style={{ textAlign: 'center', maxWidth: '780px', margin: '0 auto 60px' }}>
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
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <Layers size={15} />
            <span>Section 1 • About the Product</span>
          </div>

          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2rem, 3.5vw, 2.75rem)',
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: 1.2,
              marginBottom: '18px',
              letterSpacing: '-0.02em',
            }}
          >
            Autonomous Civic Health Auditing for Modern Municipalities
          </h2>

          <p style={{ fontSize: '1.05rem', color: '#64748b', lineHeight: 1.7 }}>
            Traditional municipal maintenance relies on slow, irregular citizen complaints that take weeks
            to catalog. <strong>CivicScan</strong> continuously parses visual feeds from patrol vehicles,
            municipal street sweepers, and citizen smartphones to autonomously spot road decay and hazardous
            litter before they cause accidents or flash flooding.
          </p>
        </div>

        {/* 3 Core Value Pillars */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '28px',
            marginBottom: '64px',
          }}
        >
          <div
            style={{
              background: '#f8fafc',
              borderRadius: '16px',
              padding: '32px 24px',
              border: '1px solid #e2e8f0',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px -10px rgba(5, 150, 105, 0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#e6f7ef',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}
            >
              <Trash2 size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
              Civic Waste & Litter Detection
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.92rem', lineHeight: 1.6 }}>
              Detects street plastic, trash accumulation, and applies downstream spatial clustering
              to flag illegal commercial dumping sites automatically.
            </p>
          </div>

          <div
            style={{
              background: '#f8fafc',
              borderRadius: '16px',
              padding: '32px 24px',
              border: '1px solid #e2e8f0',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px -10px rgba(5, 150, 105, 0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}
            >
              <Activity size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
              Road & Structural Decay
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.92rem', lineHeight: 1.6 }}>
              Identifies potholes, longitudinal, transverse, and alligator fatigue cracking on roads,
              as well as critical structural cracks on bridges and public buildings.
            </p>
          </div>

          <div
            style={{
              background: '#f8fafc',
              borderRadius: '16px',
              padding: '32px 24px',
              border: '1px solid #e2e8f0',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 12px 24px -10px rgba(5, 150, 105, 0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: '#fef2f2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
              }}
            >
              <ShieldAlert size={24} />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
              High-Risk Hazard Prevention
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.92rem', lineHeight: 1.6 }}>
              Damaged or missing manhole covers are recognized instantly, generating high-priority red alerts
              to avoid catastrophic pedestrian falls and vehicle axle breakdowns.
            </p>
          </div>
        </div>

        {/* 8 Locked Detection Classes Interactive Explorer */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            padding: '36px 32px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              marginBottom: '28px',
            }}
          >
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                CivicScan's 8 Locked Computer Vision Classes
              </h3>
              <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
                Unified across 8 public street-view datasets with strict domain boundaries.
              </p>
            </div>

            {/* Filter Domain Tabs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {[
                { id: 'all', label: 'All 8 Classes' },
                { id: 'road_damage', label: 'Road Damage' },
                { id: 'civic_waste', label: 'Civic Waste' },
                { id: 'structural_damage', label: 'Structural' },
                { id: 'hazard', label: 'Hazards' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedDomain(tab.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: selectedDomain === tab.id ? '#059669' : '#f1f5f9',
                    color: selectedDomain === tab.id ? '#ffffff' : '#475569',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: '16px',
            }}
          >
            {filteredClasses.map((item) => (
              <div
                key={item.id}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: `${item.color}15`,
                    color: item.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                  }}
                >
                  {item.id}
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'capitalize' }}>
                    Domain: {item.domain.replace('_', ' ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
