const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    req.user = {
      _id: 'officer-01',
      name: 'Tom Miller',
      role: 'municipal_officer',
      wardAssigned: 'Ward 7 - Central Urban',
    };
    return next();
  }
  // Soft bypass for initial UI phase testing
  req.user = {
    _id: 'officer-01',
    name: 'Tom Miller',
    role: 'municipal_officer',
  };
  next();
};

module.exports = { protect };
