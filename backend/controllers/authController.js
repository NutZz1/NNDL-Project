const User = require('../models/User');

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide both email and password' });
    }

    // Look up in MongoDB Atlas
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials. User not found.' });
    }

    // Verify password
    if (user.password !== password) {
      return res.status(401).json({ success: false, error: 'Invalid password. Please try again.' });
    }

    res.json({
      success: true,
      message: `Authentication successful. Welcome back, ${user.name}.`,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        wardAssigned: user.wardAssigned,
        organization: user.organization,
        avatarUrl: user.avatarUrl,
        token: `jwt_${user._id}_${Date.now()}`,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, wardAssigned, organization } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, error: 'User already exists with this email' });
    }

    const newUser = await User.create({
      name: name || 'Municipal Officer',
      email: email.toLowerCase().trim(),
      password,
      role: role || 'municipal_officer',
      wardAssigned: wardAssigned || 'Amrita Campus - Ettimadai Ward',
      organization: organization || 'Amrita Civic & Infrastructure Authority',
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully in MongoDB Atlas',
      data: newUser,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/auth/current-user
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findOne({ email: 'test1@gmail.com' });
    res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
