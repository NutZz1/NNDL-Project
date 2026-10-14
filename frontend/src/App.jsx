import React, { useState, useEffect, useCallback } from 'react';
import LandingPage from './pages/LandingPage';
import UploadPage from './pages/UploadPage';
import DashboardPage from './pages/DashboardPage';
import TrackPage from './pages/TrackPage';
import TeamWorkspacePage from './pages/TeamWorkspacePage';
import LoginModal from './components/common/LoginModal';
import { INITIAL_KPIS } from './services/mockData';
import { api } from './services/api';
import { resolveImageUrl } from './services/imageService';
import { getSession, setSession, clearSession, onSessionChange, isOfficer } from './services/auth';

// Shape the officer map expects for an incident from /api/incidents
const normalizeIncident = (item) => ({
  id: item._id || item.id,
  _id: item._id || item.id,
  title: item.title,
  category: item.category || 'litter',
  domain: item.domain || 'civic_waste',
  severity: item.severity || 'Medium',
  status: item.status === 'Reported' ? 'Needs Review' : item.status || 'Needs Review',
  lat: typeof item.lat === 'number' ? item.lat : item.location?.coordinates ? item.location.coordinates[1] : 10.9038,
  lng: typeof item.lng === 'number' ? item.lng : item.location?.coordinates ? item.location.coordinates[0] : 76.9015,
  address: item.address || 'Ettimadai, Coimbatore',
  ward: item.ward || 'Ettimadai Ward',
  reportedAt: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Recent',
  createdAt: item.createdAt,
  resolvedAt: item.resolvedAt,
  confidence: item.confidence || 0,
  imageUrl: resolveImageUrl(item.imageUrl, item.category),
  detectedBboxes: item.detectedBboxes || item.bboxes || [],
  reportCode: item.reportCode || '',
  team: item.team || '',
  dispatch: item.dispatch || null,
  daysUnresolved: item.daysUnresolved || 1,
  assignedTeam: item.assignedTeam || 'Unassigned',
  reportedBy: item.reportedBy?.name || 'Citizen',
  description: item.description || '',
});

export default function App() {
  // The link in the confirmation email opens the app at /?track=CS-XXXX-XXXX
  const [trackCode, setTrackCode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('track') || '';
    } catch {
      return '';
    }
  });
  const [user, setUser] = useState(() => (getSession() || {}).user || null);
  const [currentPage, setCurrentPage] = useState(() => (trackCode ? 'track' : 'landing'));
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [kpis, setKpis] = useState(INITIAL_KPIS);
  const [incidents, setIncidents] = useState([]);

  // A 401 anywhere (expired token) clears the session: go back to the public site
  useEffect(
    () =>
      onSessionChange((s) => {
        setUser(s ? s.user : null);
        if (!s) setCurrentPage((p) => (p === 'dashboard' || p === 'workspace' ? 'landing' : p));
      }),
    []
  );

  // The officer's map and analytics need every incident; team managers use /api/work instead
  const loadOfficerData = useCallback(async () => {
    try {
      const [k, list] = await Promise.all([api.getKpis(), api.getIncidents()]);
      if (k) setKpis(k);
      setIncidents((list || []).map(normalizeIncident));
    } catch (e) {
      console.warn('Could not load incidents:', e.message);
      setIncidents([]);
    }
  }, []);

  useEffect(() => {
    if (user && isOfficer(user) && currentPage === 'dashboard') loadOfficerData();
  }, [user, currentPage, loadOfficerData]);

  const handleNavigate = (page, code = '') => {
    if (page === 'track') setTrackCode(code);
    // "dashboard" takes each role to its own workspace; signed-out users get the login
    if (page === 'dashboard') {
      if (!user) {
        setIsLoginModalOpen(true);
        return;
      }
      page = isOfficer(user) ? 'dashboard' : 'workspace';
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLoginSuccess = ({ token, user: u }) => {
    setSession({ token, user: u });
    setUser(u);
    setCurrentPage(isOfficer(u) ? 'dashboard' : 'workspace');
  };

  const handleLogout = () => {
    clearSession();
    setCurrentPage('landing');
  };

  // Called when a citizen submits the upload page (possibly after moving the map pin).
  // The report already exists; only the location can still be corrected, using the
  // short-lived edit token from the upload response.
  const handleAddIncident = (newIncident) => {
    const code = newIncident.reportCode;
    if (code && newIncident.editToken && typeof newIncident.lat === 'number' && typeof newIncident.lng === 'number') {
      api.updateReportLocation(code, newIncident.lat, newIncident.lng, newIncident.editToken).catch((e) => console.warn('Location not updated:', e.message));
    }
  };

  const handleUpdateIncidentStatus = (id, newStatus, assignedTeam) => {
    setIncidents((prev) => prev.map((inc) => (inc.id === id ? { ...inc, status: newStatus, assignedTeam: assignedTeam || inc.assignedTeam } : inc)));
    api.updateIncidentStatus(id, newStatus, assignedTeam).catch((e) => console.warn('Status not saved:', e.message));
  };

  const isLoggedIn = Boolean(user);

  return (
    <div className="civicscan-app">
      {currentPage === 'landing' && <LandingPage onNavigate={handleNavigate} onOpenLogin={() => setIsLoginModalOpen(true)} isLoggedIn={isLoggedIn} />}

      {currentPage === 'upload' && <UploadPage onNavigate={handleNavigate} onOpenLogin={() => setIsLoginModalOpen(true)} isLoggedIn={isLoggedIn} onAddIncident={handleAddIncident} />}

      {currentPage === 'track' &&<TrackPage onNavigate={handleNavigate} onOpenLogin={() => setIsLoginModalOpen(true)} isLoggedIn={isLoggedIn} initialCode={trackCode} />}

      {currentPage === 'dashboard' && user && isOfficer(user) && (
        <DashboardPage
          kpis={{ ...kpis, officer: { ...(kpis.officer || {}), name: user.name, organization: user.organization || kpis.officer?.organization } }}
          incidents={incidents}
          onUpdateIncidentStatus={handleUpdateIncidentStatus}
          onNavigateHome={() => handleNavigate('landing')}
          onNavigateUpload={() => handleNavigate('upload')}
          user={user}
          onLogout={handleLogout}
        />
      )}

      {currentPage === 'workspace' && user && !isOfficer(user) && <TeamWorkspacePage user={user} onLogout={handleLogout} onNavigateHome={() => handleNavigate('landing')} />}

      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} onLoginSuccess={handleLoginSuccess} />
    </div>
  );
}
