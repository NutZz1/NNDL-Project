// Staff session: the token and user live in sessionStorage so a page refresh keeps you
// signed in, but closing the tab signs you out. Storage can be blocked, so every access is
// guarded; without it the session simply lasts until the page is reloaded.
const KEY = 'civicscan_session';
let memory = null;
const listeners = new Set();

export function getSession() {
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(KEY);
    memory = raw ? JSON.parse(raw) : null;
  } catch {
    memory = null;
  }
  return memory;
}

export function setSession(session) {
  memory = session;
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: keep it in memory only */
  }
  listeners.forEach((fn) => fn(session));
}

export const clearSession = () => setSession(null);

export const getToken = () => (getSession() || {}).token || null;

export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const isOfficer = (user) => Boolean(user && user.role === 'municipal_officer');
export const teamLabel = (team) => (team === 'litter' ? 'Litter Management Team' : team === 'roads' ? 'Road & Structural Maintenance Team' : 'Municipal Office');
