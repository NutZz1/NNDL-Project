const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken, publicUser, normalizeRole } = require('../middlewares/auth');

const sameString = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// POST /api/auth/login  { email, password }
exports.login = async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please enter your email and password.' });
    }

    const user = await User.findOne({ email }).select('+password');
    // One message for every failure, so the form does not reveal which emails exist
    const fail = () => res.status(401).json({ success: false, error: 'Incorrect email or password.' });
    if (!user || !user.active || !normalizeRole(user.role)) return fail();

    let ok = false;
    if (user.passwordHash) {
      ok = await bcrypt.compare(password, user.passwordHash);
    } else if (user.password) {
      // Legacy plaintext account: accept once, then store a hash and drop the plaintext
      ok = sameString(password, user.password);
      if (ok) {
        user.passwordHash = await bcrypt.hash(password, 12);
        user.password = undefined;
      }
    }
    if (!ok) return fail();

    if (normalizeRole(user.role) === 'team_manager' && !user.team) {
      return res.status(403).json({ success: false, error: 'This account has no team assigned. Ask the Municipal Officer.' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    res.json({ success: true, data: { token: signToken(user), user: publicUser(user) } });
  } catch (err) {
    console.error('[Auth] login error:', err.message);
    res.status(500).json({ success: false, error: 'Login is unavailable right now. Please try again.' });
  }
};

// GET /api/auth/me  (protect)
exports.me = async (req, res) => {
  res.json({ success: true, data: req.user });
};

// POST /api/auth/users  (municipal officer only) { name, email, password, role, team }
// Open self-registration was removed: staff accounts are created by the officer or the seed script.
exports.createUser = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    const role = req.body.role === 'municipal_officer' ? 'municipal_officer' : 'team_manager';
    const team = role === 'team_manager' ? req.body.team : null;

    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ success: false, error: 'A name and a valid email are required.' });
    }
    if (password.length < 10) {
      return res.status(400).json({ success: false, error: 'The password must have at least 10 characters.' });
    }
    if (role === 'team_manager' && !['litter', 'roads'].includes(team)) {
      return res.status(400).json({ success: false, error: 'A team manager needs a team: litter or roads.' });
    }
    if (await User.exists({ email })) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
    }

    const user = await User.create({ name, email, role, team, passwordHash: await bcrypt.hash(password, 12) });
    res.status(201).json({ success: true, data: publicUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
