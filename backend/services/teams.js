/**
 * Single source of truth for the municipal teams.
 *
 * The dispatch agent, the role/team scoping of every API route, the analytics and the
 * chat agent all read from here, so they can never disagree about who owns what.
 */

const TEAMS = {
  litter: {
    key: 'litter',
    name: 'Litter Management Team',
    short: 'Litter',
    classes: ['litter', 'illegal_dumping'],
    // `handles` lists the classes a specialist crew is best placed to fix
    crews: [
      { name: 'Sanitation Crew A', handles: [] },
      { name: 'Sanitation Crew B', handles: [] },
    ],
  },
  roads: {
    key: 'roads',
    name: 'Road & Structural Maintenance Team',
    short: 'Road',
    classes: [
      'pothole',
      'crack_longitudinal',
      'crack_transverse',
      'crack_alligator',
      'crack_structural',
      'manhole_damaged',
      'manhole_missing',
    ],
    crews: [
      { name: 'Manhole & Drainage Crew', handles: ['manhole_damaged', 'manhole_missing'] },
      { name: 'Structural Inspection Unit', handles: ['crack_structural'] },
      { name: 'Road Repair Crew 1', handles: ['pothole', 'crack_longitudinal', 'crack_transverse', 'crack_alligator'] },
      { name: 'Road Repair Crew 2', handles: ['pothole', 'crack_longitudinal', 'crack_transverse', 'crack_alligator'] },
    ],
  },
};

const TEAM_KEYS = Object.keys(TEAMS);

// Older records stored the display name; accept both
const LEGACY_NAMES = Object.fromEntries(Object.values(TEAMS).map((t) => [t.name, t.key]));

const normalizeTeam = (value) => {
  if (!value) return null;
  if (TEAMS[value]) return value;
  return LEGACY_NAMES[value] || null;
};

const teamForCategory = (category) =>
  TEAM_KEYS.find((k) => TEAMS[k].classes.includes(category)) || null;

const teamName = (key) => (TEAMS[normalizeTeam(key)] || {}).name || 'Municipal Control Room';

const classesFor = (key) => (TEAMS[normalizeTeam(key)] || {}).classes || [];

const crewsFor = (key) => (TEAMS[normalizeTeam(key)] || {}).crews || [];

module.exports = { TEAMS, TEAM_KEYS, normalizeTeam, teamForCategory, teamName, classesFor, crewsFor };
