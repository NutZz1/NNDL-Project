// Remembers the report IDs this browser has submitted, so the Track page can list them
// without any account. Everything is best-effort: storage can be blocked or full.
const KEY = 'civicscan_my_reports';
const EMAIL_KEY = 'civicscan_email';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function getMyReports() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveMyReport({ code, category }) {
  if (!code) return;
  try {
    const rest = getMyReports().filter((r) => r.code !== code);
    const entry = { code, category, at: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify([entry, ...rest].slice(0, 20)));
  } catch {
    /* ignore */
  }
}

export function getSavedEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

export function saveEmail(email) {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* ignore */
  }
}
