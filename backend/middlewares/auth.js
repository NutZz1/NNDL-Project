const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Real authentication (replaces the old always-allow `protect`).
 *
 *   protect          verifies the Bearer token and loads the user  -> 401 otherwise
 *   requireRole(r)   403 unless req.user.role is one of r
 *
 * After `protect`, `req.scope` tells every query what the caller may see:
 *   { team: 'litter' | 'roads' }  for a team manager  (server-enforced filter)
 *   { team: null }                for the municipal officer (everything)
 * The team ALWAYS comes from the logged-in account, never from the request.
 */

const TOKEN_TTL = process.env.JWT_TTL || '8h';

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s === 'replace_with_a_long_random_string' || s.length < 16) {
    throw new Error('JWT_SECRET is missing or too short in backend/.env');
  }
  return s;
};

// Older role values are mapped onto the two staff roles
const normalizeRole = (role) => {
  if (role === 'team_manager' || role === 'municipal_officer') return role;
  if (role === 'admin' || role === 'field_supervisor') return 'municipal_officer';
  return null; // citizen or unknown: no staff access
};

const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: normalizeRole(u.role),
  team: normalizeRole(u.role) === 'team_manager' ? u.team || null : null,
  organization: u.organization,
  ward: u.wardAssigned,
});

const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: normalizeRole(user.role), team: user.team || null }, secret(), {
    expiresIn: TOKEN_TTL,
  });

const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: 'Please log in.' });

    let payload;
    try {
      payload = jwt.verify(token, secret());
    } catch {
      return res.status(401).json({ success: false, error: 'Your session has expired. Please log in again.' });
    }

    // Re-read the account so a deactivated user or a changed team takes effect immediately
    const user = await User.findById(payload.sub).lean();
    const role = user && normalizeRole(user.role);
    if (!user || !user.active || !role) {
      return res.status(401).json({ success: false, error: 'This account cannot sign in.' });
    }
    if (role === 'team_manager' && !user.team) {
      return res.status(403).json({ success: false, error: 'This account has no team assigned.' });
    }

    req.user = publicUser(user);
    req.scope = { team: role === 'team_manager' ? user.team : null };
    next();
  } catch (err) {
    next(err);
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'You do not have access to this.' });
  }
  next();
};

module.exports = { protect, requireRole, signToken, publicUser, normalizeRole };
