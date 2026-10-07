import React, { useState, useEffect } from 'react';
import { Layers, Globe, Shield, Bell } from 'lucide-react';

export default function Header({
  officerName = 'Tom Miller',
  organization = 'Amrita Civic & Infrastructure Authority',
  timeStr,
}) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const displayTime =
    timeStr ||
    currentTime.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true,
    });

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '24px 32px 16px',
        background: '#f8fafc',
      }}
    >
      {/* Left Title & Agency */}
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.75rem',
            fontWeight: 800,
            color: '#0f172a',
            marginBottom: '6px',
            letterSpacing: '-0.02em',
          }}
        >
          Welcome back, {officerName}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Fiber Logo / Emblem */}
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#64748b',
              }}
            />
          </div>
          <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>
            {organization}
          </span>
        </div>
      </div>

      {/* Right Time Display */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
          {displayTime}
        </span>
      </div>
    </header>
  );
}
