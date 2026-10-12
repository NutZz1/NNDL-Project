import React, { useState, useEffect } from 'react';
import { ShieldCheck, LogIn, LayoutDashboard, Menu, X, Leaf, UploadCloud, Search } from 'lucide-react';

export default function Navbar({ currentPage, onNavigate, onOpenLogin, isLoggedIn }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavClick = (sectionId) => {
    setMobileMenuOpen(false);
    if (currentPage !== 'landing') {
      onNavigate('landing');
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        transition: 'all 0.3s ease',
        background: scrolled ? 'rgba(255, 255, 255, 0.95)' : '#ffffff',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: '1px solid var(--border-color)',
        boxShadow: scrolled ? '0 4px 20px rgba(0,0,0,0.06)' : 'none',
        padding: '0 24px',
      }}
    >
      <div
        className="navbar-inner"
        style={{
          width: '100%',
          maxWidth: '1280px',
          margin: '0 auto',
          height: '72px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Brand Logo & Name */}
        <div
          onClick={() => onNavigate('landing')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            userSelect: 'none',
            justifySelf: 'start',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
            }}
          >
            <ShieldCheck size={24} strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.28rem',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#0f172a',
                }}
              >
                Civic<span style={{ color: '#059669' }}>Scan</span>
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: '#e6f7ef',
                  color: '#059669',
                  border: '1px solid #bbf7d0',
                }}
              >
                AI
              </span>
            </div>
            <span
              style={{
                display: 'block',
                fontSize: '0.74rem',
                color: '#64748b',
                fontWeight: 500,
                marginTop: '-3px',
              }}
            >
              Eco-Infrastructure AI
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav
          style={{
            display: 'none',
            alignItems: 'center',
            gap: '24px',
          }}
          className="desktop-nav"
        >
          <button
            onClick={() => handleNavClick('about')}
            style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#334155',
              padding: '6px 2px',
              borderBottom: '2px solid transparent',
              transition: 'all 0.2s',
              background: 'none',
              cursor: 'pointer',
            }}
            onMouseOver={(e) => (e.target.style.color = '#059669')}
            onMouseOut={(e) => (e.target.style.color = '#334155')}
          >
            About
          </button>
          <button
            onClick={() => handleNavClick('how-it-works')}
            style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#334155',
              padding: '6px 2px',
              borderBottom: '2px solid transparent',
              transition: 'all 0.2s',
              background: 'none',
              cursor: 'pointer',
            }}
            onMouseOver={(e) => (e.target.style.color = '#059669')}
            onMouseOut={(e) => (e.target.style.color = '#334155')}
          >
            How It Works
          </button>
          <button
            onClick={() => handleNavClick('detection-classes')}
            style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#334155',
              padding: '6px 2px',
              borderBottom: '2px solid transparent',
              transition: 'all 0.2s',
              background: 'none',
              cursor: 'pointer',
            }}
            onMouseOver={(e) => (e.target.style.color = '#059669')}
            onMouseOut={(e) => (e.target.style.color = '#334155')}
          >
            Detection Classes
          </button>
          <button
            onClick={() => handleNavClick('aim-sdg')}
            style={{
              fontSize: '0.9rem',
              fontWeight: 600,
              color: '#334155',
              padding: '6px 2px',
              borderBottom: '2px solid transparent',
              transition: 'all 0.2s',
              background: 'none',
              cursor: 'pointer',
            }}
            onMouseOver={(e) => (e.target.style.color = '#059669')}
            onMouseOut={(e) => (e.target.style.color = '#334155')}
          >
            UN SDGs
          </button>
        </nav>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifySelf: 'end' }}>
          {/* Prominent Upload CTA button */}
          <button
            onClick={() => onNavigate('upload')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.86rem',
              fontWeight: 700,
              background: currentPage === 'upload' ? '#047857' : '#059669',
              color: '#ffffff',
              boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = '#047857')}
            onMouseOut={(e) => (e.currentTarget.style.background = currentPage === 'upload' ? '#047857' : '#059669')}
          >
            <UploadCloud size={16} />
            <span>Upload Photo</span>
          </button>

          {/* Track a report by its ID */}
          <button
            onClick={() => onNavigate('track')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.86rem',
              fontWeight: 700,
              background: currentPage === 'track' ? '#e6f7ef' : '#ffffff',
              color: '#047857',
              border: '1px solid #bbf7d0',
              cursor: 'pointer',
            }}
          >
            <Search size={16} />
            <span>Track Report</span>
          </button>

          {/* Login or Dashboard Button */}
          {isLoggedIn ? (
            <button
              onClick={() => onNavigate('dashboard')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.86rem',
                fontWeight: 600,
                background: currentPage === 'dashboard' ? '#0f172a' : '#1e293b',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#0f172a')}
              onMouseOut={(e) => (e.currentTarget.style.background = currentPage === 'dashboard' ? '#0f172a' : '#1e293b')}
            >
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </button>
          ) : (
            <button
              onClick={onOpenLogin}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.86rem',
                fontWeight: 600,
                background: '#0f172a',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#1e293b')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#0f172a')}
            >
              <LogIn size={16} />
              <span>Login</span>
            </button>
          )}

          {/* Mobile hamburger button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              padding: '8px',
              color: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
            aria-label="Toggle menu"
            className="mobile-toggle"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          style={{
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            padding: '16px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onNavigate('upload');
            }}
            style={{
              textAlign: 'left',
              padding: '8px 0',
              fontSize: '1rem',
              fontWeight: 700,
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <UploadCloud size={18} />
            <span>Upload Street Photo</span>
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              onNavigate('track');
            }}
            style={{
              textAlign: 'left',
              padding: '8px 0',
              fontSize: '1rem',
              fontWeight: 700,
              color: '#047857',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Search size={18} />
            <span>Track Report</span>
          </button>
          <button
            onClick={() => handleNavClick('about')}
            style={{ textAlign: 'left', padding: '8px 0', fontSize: '1rem', fontWeight: 600, color: '#1e293b', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            About
          </button>
          <button
            onClick={() => handleNavClick('how-it-works')}
            style={{ textAlign: 'left', padding: '8px 0', fontSize: '1rem', fontWeight: 600, color: '#1e293b', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            How It Works
          </button>
          <button
            onClick={() => handleNavClick('detection-classes')}
            style={{ textAlign: 'left', padding: '8px 0', fontSize: '1rem', fontWeight: 600, color: '#1e293b', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Detection Classes
          </button>
          <button
            onClick={() => handleNavClick('aim-sdg')}
            style={{ textAlign: 'left', padding: '8px 0', fontSize: '1rem', fontWeight: 600, color: '#1e293b', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            UN SDGs
          </button>
        </div>
      )}

      {/* Responsive Inline Media Query Style */}
      <style>{`
        @media (min-width: 900px) {
          .navbar-inner {
            display: grid !important;
            grid-template-columns: 1fr auto 1fr !important;
          }
          .desktop-nav { 
            display: flex !important;
            justify-self: center !important;
          }
          .mobile-toggle { display: none !important; }
        }
        @media (max-width: 899px) {
          .desktop-nav { display: none !important; }
          .mobile-toggle { display: flex !important; }
        }
      `}</style>
    </header>
  );
}
