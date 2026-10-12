// Tiny in-memory rate limiter (per IP) so the public tracking lookup cannot be used to guess codes
const rateLimit = ({ windowMs = 60_000, max = 30 } = {}) => {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, times] of hits) {
      const recent = times.filter((t) => t > cutoff);
      if (recent.length) hits.set(ip, recent);
      else hits.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const times = (hits.get(req.ip) || []).filter((t) => t > now - windowMs);
    if (times.length >= max) {
      return res.status(429).json({ success: false, error: 'Too many lookups. Please wait a minute and try again.' });
    }
    times.push(now);
    hits.set(req.ip, times);
    next();
  };
};

module.exports = rateLimit;
