const crypto = require('crypto');

/**
 * Uploaded photos are no longer reachable by guessing a path: every URL the API hands
 * out carries an expiry and an HMAC signature, and /uploads refuses anything else.
 *
 *   SIGNED_UPLOADS=false     switch the check off (e.g. while debugging)
 *   UPLOAD_URL_SECRET        signing key (falls back to JWT_SECRET)
 */

const TTL_MS = 12 * 3600 * 1000;

const enabled = () => String(process.env.SIGNED_UPLOADS || 'true').toLowerCase() !== 'false';
const key = () => process.env.UPLOAD_URL_SECRET || process.env.JWT_SECRET || '';

const hmac = (p, exp) => crypto.createHmac('sha256', key()).update(`${p}|${exp}`).digest('base64url');

// Accepts "/uploads/x.jpg" or "http://host/uploads/x.jpg"; anything else is returned unchanged
const uploadPath = (url) => {
  if (typeof url !== 'string') return null;
  const i = url.indexOf('/uploads/');
  if (i === -1) return null;
  return url.slice(i).split('?')[0];
};

const sign = (url) => {
  const p = uploadPath(url);
  if (!p || !enabled() || !key()) return p || url || '';
  const exp = Date.now() + TTL_MS;
  return `${p}?exp=${exp}&sig=${hmac(p, exp)}`;
};

// Express middleware for the /uploads static folder
const verify = (req, res, next) => {
  if (!enabled()) return next();
  const p = `/uploads${req.path}`;
  const exp = Number(req.query.exp);
  const sig = String(req.query.sig || '');
  if (!exp || exp < Date.now() || !sig) return res.status(403).send('This photo link has expired.');
  const expected = Buffer.from(hmac(p, exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return res.status(403).send('Invalid photo link.');
  }
  next();
};

module.exports = { sign, verify, uploadPath };
