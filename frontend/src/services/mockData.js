/**
 * Mock Data for CivicScan - Phase 1 UI
 * Strictly adheres to the 8 locked detection classes + illegal_dumping cluster rule.
 * Region: Amrita Vishwa Vidyapeetham, Ettimadai, Coimbatore
 */

export const INITIAL_KPIS = {
  totalReports: 0,
  activeAssets: 0,
  notSeenDays: 0,
  issuesBySeverity: {
    low: 0,
    critical: 0,
  },
  unassignedDevices: 0,
  totalLocationUpdates: 0,
  officer: {
    name: 'Tom Miller',
    role: 'Municipal Field Supervisor',
    ward: 'Amrita Campus - Ettimadai Ward',
    organization: 'Amrita Civic & Infrastructure Authority',
    lastSync: 'Live',
  },
};

export const CIVIC_CLASSES = [
  { id: 1, name: 'crack_longitudinal', label: 'Longitudinal Crack', domain: 'road_damage', color: '#3B82F6' },
  { id: 2, name: 'crack_transverse', label: 'Transverse Crack', domain: 'road_damage', color: '#0EA5E9' },
  { id: 3, name: 'crack_alligator', label: 'Alligator Cracking', domain: 'road_damage', color: '#F59E0B' },
  { id: 4, name: 'pothole', label: 'Pothole Decay', domain: 'road_damage', color: '#EF4444' },
  { id: 5, name: 'crack_structural', label: 'Structural Bridge/Wall Crack', domain: 'structural_damage', color: '#DC2626' },
  { id: 6, name: 'litter', label: 'Street Litter & Plastic', domain: 'civic_waste', color: '#10B981' },
  { id: 7, name: 'manhole_damaged', label: 'Damaged Manhole Rim', domain: 'hazard', color: '#F97316' },
  { id: 8, name: 'manhole_missing', label: 'Missing Manhole Cover (Hazard)', domain: 'hazard', color: '#B91C1C' },
  { id: 9, name: 'illegal_dumping', label: 'Illegal Dumping Cluster', domain: 'civic_waste', color: '#047857' },
];

// Clean state: zero static fake incidents
export const INITIAL_INCIDENTS = [];

// Zero static clusters
export const SAMPLE_CLUSTERS = [];

// Zero static demo preset images
export const DEMO_PRESET_IMAGES = [];

