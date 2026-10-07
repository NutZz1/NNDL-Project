import React from 'react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import HeroSection from '../components/landing/HeroSection';
import SdgSection from '../components/landing/SdgSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';

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
        <HeroSection onNavigate={onNavigate} onOpenLogin={onOpenLogin} />
        {/* Core Narrative: 4-Stage Operating Pipeline (Upload -> GPS -> Neural Inference -> Dashboard) */}
        <HowItWorksSection onNavigate={onNavigate} />
        {/* Project Aim & UN SDG Alignment */}
        <SdgSection />
      </main>
      {/* Footer Section */}
      <Footer onNavigate={onNavigate} />
    </div>
  );
}
