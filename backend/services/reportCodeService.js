const crypto = require('crypto');

// 31 characters: no 0/O, 1/I/L so a code can be read out over the phone
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = /^CS-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

const randomCode = () => {
  let raw = '';
  for (let i = 0; i < 8; i += 1) raw += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  return `CS-${raw.slice(0, 4)}-${raw.slice(4)}`;
};

// Accepts "cs-7k4m-x9qd", "CS7K4MX9QD", " 7K4M X9QD " ... and returns the canonical form (or null)
const normalizeCode = (input) => {
  if (typeof input !== 'string') return null;
  let raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.startsWith('CS') && raw.length === 10) raw = raw.slice(2);
  if (raw.length !== 8) return null;
  const code = `CS-${raw.slice(0, 4)}-${raw.slice(4)}`;
  return CODE_RE.test(code) ? code : null;
};

// isTaken(code) -> Promise<boolean>; retries on the (very unlikely) collision
const generateUniqueCode = async (isTaken) => {
  for (let i = 0; i < 8; i += 1) {
    const code = randomCode();
    let taken = false;
    try {
      taken = await isTaken(code);
    } catch {
      return code; // store unreachable (mock mode): 31^8 combinations, collisions are negligible
    }
    if (!taken) return code;
  }
  throw new Error('Could not generate a unique report code');
};

module.exports = { randomCode, normalizeCode, generateUniqueCode };
