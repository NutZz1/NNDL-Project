// Kept for older imports: the team configuration now lives in services/teams.js
const { teamForCategory: teamKeyForCategory, teamName, TEAMS } = require('./teams');

// Returns the team's display name for a detected class
const teamForCategory = (category) => teamName(teamKeyForCategory(category));

const TEAM_BY_CATEGORY = Object.fromEntries(
  Object.values(TEAMS).flatMap((t) => t.classes.map((c) => [c, t.name]))
);

module.exports = { teamForCategory, TEAM_BY_CATEGORY };
