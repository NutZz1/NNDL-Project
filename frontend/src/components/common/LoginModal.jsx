import React, { useState } from 'react';
import { X, ShieldCheck, KeyRound, Mail, ArrowRight, UserCheck, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';

export default function LoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [email, setEmail] = useState('test1@gmail.com');
  const [password, setPassword] = useState('test123');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');

    try {
      const res = await api.login(email, password);
      if (res.success && res.data) {
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

  const handleQuickDemoLogin = async () => {
    setEmail('test1@gmail.com');
    setPassword('test123');
    setLoading(true);
    setErrorMessage('');

    try {
      const res = await api.login('test1@gmail.com', 'test123');
      if (res.success && res.data) {
        onLoginSuccess(res.data);
        onClose();
      } else {
        setErrorMessage(res.error || 'Authentication error');
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
            Municipal Officer Portal
          </h3>
          <p style={{ fontSize: '0.88rem', color: '#64748b' }}>
            Connected to Live MongoDB Atlas Cluster
          </p>
        </div>

        {/* Quick Demo One-Click Access */}
        <div
          onClick={handleQuickDemoLogin}
          style={{
            background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
            border: '1.5px solid #10b981',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '18px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UserCheck size={20} color="#059669" />
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#065f46' }}>
                1-Click Login: test1@gmail.com
              </div>
              <div style={{ fontSize: '0.75rem', color: '#047857' }}>
                Password: test123 • Municipal Officer
              </div>
            </div>
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#059669' }}>
            Sign In →
          </span>
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
            {loading ? 'Authenticating with MongoDB Atlas...' : 'Sign In as Officer'}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>
      </div>
    </div>
  );
}
