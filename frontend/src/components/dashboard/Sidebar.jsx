import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Settings,
  ChevronLeft,
  ChevronRight,
  Leaf,
  LogOut,
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  onTabChange,
  isCollapsed,
  onToggleCollapse,
  onNavigateHome,
  items,
  user,
  onLogout,
}) {
  // Role-specific menus are passed in as `items`; the default keeps the original two tabs
  const navItems = items || [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'analytics', label: 'Analytics', icon: <TrendingUp size={18} /> },
  ];

  return (
    <aside
      style={{
        width: isCollapsed ? '72px' : '240px',
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 100,
        userSelect: 'none',
        padding: isCollapsed ? '16px 8px' : '20px 16px',
      }}
    >
      <div>
        {/* Brand Header & Collapse Toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            marginBottom: '28px',
            paddingBottom: '12px',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          {!isCollapsed && (
            <div
              onClick={onNavigateHome}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}
              >
                <Leaf size={18} />
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: '#0f172a',
                }}
              >
                smart<span style={{ color: '#059669' }}>pin</span>
              </span>
            </div>
          )}

          {/* Toggle Button */}
          <button
            onClick={onToggleCollapse}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              cursor: 'pointer',
            }}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Navigation Items List */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isCollapsed ? 'center' : 'space-between',
                  padding: isCollapsed ? '10px 0' : '9px 12px',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#0f172a' : '#64748b',
                  background: isActive ? '#e6f7ef' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative',
                }}
                onMouseOver={(e) => {
                  if (!isActive) e.currentTarget.style.background = '#f8fafc';
                }}
                onMouseOut={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: isActive ? '#059669' : '#64748b' }}>{item.icon}</span>
                  {!isCollapsed && <span>{item.label}</span>}
                </div>

                {!isCollapsed && Boolean(item.badge) && (
                  <span
                    aria-label={`${item.badge} waiting`}
                    style={{
                      background: item.badgeAlert ? '#fee2e2' : '#f1f5f9',
                      color: item.badgeAlert ? '#dc2626' : '#64748b',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: '9999px',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Area: signed-in user, sign out, settings */}
      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {user && !isCollapsed && (
          <div style={{ padding: '0 12px', fontSize: '0.8rem', color: '#64748b' }}>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>{user.name}</div>
            <div>{user.role === 'municipal_officer' ? 'Municipal Officer' : user.team === 'litter' ? 'Litter Management Team' : 'Road & Structural Team'}</div>
          </div>
        )}
        {onLogout && (
          <button
            onClick={onLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              gap: '10px',
              padding: isCollapsed ? '10px 0' : '9px 12px',
              borderRadius: '8px',
              fontSize: '0.88rem',
              color: '#b91c1c',
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
            }}
            title="Sign out"
          >
            <LogOut size={18} />
            {!isCollapsed && <span>Sign out</span>}
          </button>
        )}

        <button
          onClick={() => onTabChange('settings')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            gap: '10px',
            padding: isCollapsed ? '10px 0' : '9px 12px',
            borderRadius: '8px',
            fontSize: '0.88rem',
            color: '#64748b',
            cursor: 'pointer',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#f8fafc')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <Settings size={18} />
          {!isCollapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
}
