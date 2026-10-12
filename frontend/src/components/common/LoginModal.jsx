import React, { useState } from 'react';
import { X, ShieldCheck, KeyRound, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';

// Demo accounts for local development only: read from frontend/.env.local (git-ignored) and
// shown only by the dev server, never in a production build.
const DEMO_LOGINS = (() => {
  if (!import.meta.env.DEV || !import.meta.env.VITE_DEMO_LOGINS) return [];
  try {
    const list = JSON.parse(import.meta.env.VITE_DEMO_LOGINS);
    return Array.isArray(list) ? list.filter((a) => a && a.email && a.password) : [];
  } catch {
    return [];
  }
})();

export default function LoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const res = await api.login(email, password);
      if (res.success && res.data && res.data.token) {
        setPassword('');
        onLoginSuccess(res.data);
        onClose();
      } else {
        setErrorMessage(res.error || 'Invalid credentials. Please check your email and password.');
      }
    } catch (err) {
      setErrorMessage(err.message || 'Login error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '440px',
          padding: '32px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          animation: 'fadeIn 0.25s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            color: '#94a3b8',
            padding: '4px',
            borderRadius: '6px',
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = '#0f172a')}
          onMouseOut={(e) => (e.currentTarget.style.color = '#94a3b8')}
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              background: '#e6f7ef',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              border: '1px solid #bbf7d0',
            }}
          >
            <ShieldCheck size={28} />
          </div>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.4rem',
              fontWeight: 800,
              color: '#0f172a',
              marginBottom: '6px',
            }}
          >
            Staff sign-in
          </h3>
          <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
            For the Municipal Officer and the Litter and Road team managers. Citizens do not need an account.
          </p>
        </div>

        {/* Error notification if any */}
        {errorMessage && (
          <div
            style={{
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              padding: '10px 14px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.82rem',
              color: '#b91c1c',
              fontWeight: 600,
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
              Official Email
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#059669')}
                onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#059669')}
                onBlur={(e) => (e.target.style.borderColor = '#cbd5e1')}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '8px',
              padding: '12px',
              borderRadius: '8px',
              background: '#059669',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = '#047857')}
            onMouseOut={(e) => (e.currentTarget.style.background = '#059669')}
          >
            {loading ? 'Signing in...' : 'Sign in'}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>

        {DEMO_LOGINS.length > 0 && (
          <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>
              Demo accounts (local only): click one to fill the form
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {DEMO_LOGINS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(a.password);
                    setErrorMessage('');
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${email === a.email ? '#10b981' : '#e2e8f0'}`,
                    background: email === a.email ? '#ecfdf5' : '#f8fafc',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>{a.role || 'Account'}</span>
                  <span style={{ fontSize: '0.78rem', color: '#64748b', fontFamily: 'monospace' }}>{a.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
