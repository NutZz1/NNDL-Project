import React, { useState, useEffect } from 'react';
import LandingPage from './pages/LandingPage';
import UploadPage from './pages/UploadPage';
import DashboardPage from './pages/DashboardPage';
import LoginModal from './components/common/LoginModal';
import { INITIAL_KPIS, INITIAL_INCIDENTS } from './services/mockData';
import { api } from './services/api';
import { resolveImageUrl } from './services/imageService';

export default function App() {
  const [currentPage, setCurrentPage] = useState('landing');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [kpis, setKpis] = useState(INITIAL_KPIS);
  const [incidents, setIncidents] = useState(INITIAL_INCIDENTS);

  // Attempt backend API sync on mount
  useEffect(() => {
    async function loadData() {
      try {
        const fetchedKpis = await api.getKpis();
        if (fetchedKpis) setKpis(fetchedKpis);

        const fetchedIncidents = await api.getIncidents();
        if (fetchedIncidents && fetchedIncidents.length > 0) {
          const normalized = fetchedIncidents.map((item) => {
            const finalImg = resolveImageUrl(item.imageUrl, item.category);

            return {
              id: item._id || item.id,
              _id: item._id || item.id,
              title: item.title,
              category: item.category || 'litter',
              domain: item.domain || 'civic_waste',
              severity: item.severity || 'Medium',
              status: item.status || 'Reported',
              lat:
                typeof item.lat === 'number'
                  ? item.lat
                  : item.location?.coordinates
                  ? item.location.coordinates[1]
                  : 10.9038,
              lng:
                typeof item.lng === 'number'
                  ? item.lng
                  : item.location?.coordinates
                  ? item.location.coordinates[0]
                  : 76.9015,
              address: item.address || 'Ettimadai, Coimbatore',
              ward: item.ward || 'Ettimadai Ward',
              reportedAt: item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Recent',
              confidence: item.confidence || 0.92,
              imageUrl: finalImg,
              detectedBboxes: item.detectedBboxes || item.bboxes || [],
              daysUnresolved: item.daysUnresolved || 1,
              assignedTeam: item.assignedTeam || 'Unassigned',
              reportedBy: item.reportedBy?.name || 'Citizen Patrol',
              description: item.description || 'Defect flagged by automatic visual inspection feed.',
            };
          });
          setIncidents(normalized);
        } else {
          setIncidents([]);
        }
      } catch (e) {
        console.warn('API sync notice:', e);
        setIncidents([]);
      }
    }
    loadData();
  }, []);

  const handleNavigate = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLoginSuccess = (officerData) => {
    setIsLoggedIn(true);
    setKpis((prev) => ({
      ...prev,
      officer: {
        name: officerData.name || 'Tom Miller',
        role: officerData.role || 'Municipal Field Supervisor',
        ward: officerData.wardAssigned || officerData.ward || 'Amrita Campus - Ettimadai Ward',
        organization: officerData.organization || 'Amrita Civic & Infrastructure Authority',
        lastSync: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    }));
    setCurrentPage('dashboard');
  };

  const handleAddIncident = (newIncident) => {
    const incId = newIncident.id || newIncident._id;
    const normalized = {
      ...newIncident,
      id: incId,
      _id: incId,
      lat:
        typeof newIncident.lat === 'number'
          ? newIncident.lat
          : newIncident.location?.coordinates
          ? newIncident.location.coordinates[1]
          : 10.903824,
      lng:
        typeof newIncident.lng === 'number'
          ? newIncident.lng
          : newIncident.location?.coordinates
          ? newIncident.location.coordinates[0]
          : 76.901518,
      imageUrl: resolveImageUrl(newIncident.imageUrl, newIncident.category),
    };

    // Deduplicate in React state: replace if already exists, else prepend
    setIncidents((prev) => {
      const exists = prev.some((inc) => (inc.id || inc._id) === incId);
      if (exists) {
        return prev.map((inc) => ((inc.id || inc._id) === incId ? normalized : inc));
      }
      return [normalized, ...prev];
    });

    // Check if incident was already saved to MongoDB Atlas during initial image upload
    const isAlreadySavedInDb = newIncident._id && !String(newIncident._id).startsWith('inc-');

    if (isAlreadySavedInDb) {
      // Sync any edited fields (e.g. customized pin coordinates or category) without duplicating!
      api.updateIncident(newIncident._id, normalized);
    } else {
      // Offline fallback: persist newly created ticket
      setKpis((prev) => ({
        ...prev,
        activeAssets: (prev.activeAssets || 0) + 1,
      }));
      api.createIncident(normalized);
    }
  };

  const handleUpdateIncidentStatus = (id, newStatus, assignedTeam) => {
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id ? { ...inc, status: newStatus, assignedTeam: assignedTeam || inc.assignedTeam } : inc
      )
    );
    api.updateIncidentStatus(id, newStatus, assignedTeam);
  };

  return (
    <div className="civicscan-app">
      {currentPage === 'landing' && (
        <LandingPage
          onNavigate={handleNavigate}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          isLoggedIn={isLoggedIn}
        />
      )}

      {currentPage === 'upload' && (
        <UploadPage
          onNavigate={handleNavigate}
          onOpenLogin={() => setIsLoginModalOpen(true)}
          isLoggedIn={isLoggedIn}
          onAddIncident={handleAddIncident}
        />
      )}

      {currentPage === 'dashboard' && (
        <DashboardPage
          kpis={kpis}
          incidents={incidents}
          onUpdateIncidentStatus={handleUpdateIncidentStatus}
          onNavigateHome={() => handleNavigate('landing')}
          onNavigateUpload={() => handleNavigate('upload')}
        />
      )}

      {/* Officer Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
}
