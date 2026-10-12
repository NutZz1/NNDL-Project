import React from 'react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import AboutSection from '../components/landing/AboutSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import DetectionClassesSection from '../components/landing/DetectionClassesSection';
import SdgSection from '../components/landing/SdgSection';

export default function LandingPage({ onNavigate, onOpenLogin, isLoggedIn }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        currentPage="landing"
        onNavigate={onNavigate}
        onOpenLogin={onOpenLogin}
        isLoggedIn={isLoggedIn}
      />
      <main style={{ flex: 1 }}>
        <AboutSection onNavigate={onNavigate} />
        <HowItWorksSection />
        <DetectionClassesSection />
        {/* Project Aim & UN SDG Alignment */}
        <SdgSection />
      </main>
      {/* Footer Section */}
      <Footer onNavigate={onNavigate} />
    </div>
  );
}
