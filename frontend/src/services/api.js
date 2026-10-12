import { INITIAL_KPIS } from './mockData';
import { getToken, clearSession } from './auth';

const BASE_URL = (import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:5000/api';

// Staff requests carry the login token; a 401 anywhere ends the session
async function request(path, { method = 'GET', body, form, auth = true } = {}) {
  const headers = {};
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    const err = new Error('Cannot reach the CivicScan server. Please check your connection and try again.');
    err.status = 0;
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && token) clearSession();
  if (!res.ok) {
    const err = new Error(json.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    err.code = json.code;
    throw err;
  }
  return json;
}

const qs = (params = {}) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all-teams');
  return p.length ? `?${new URLSearchParams(p).toString()}` : '';
};

export const api = {
  // ---------------------------------------------------------------- public (citizens)
  // `email` is required: the report ID is sent there so the citizen can track the report
  async uploadAndAnalyzeImage(file, manualCoords = {}, email = '') {
    const form = new FormData();
    form.append('image', file);
    form.append('email', email);
    if (manualCoords.lat) form.append('manualLat', manualCoords.lat);
    if (manualCoords.lng) form.append('manualLng', manualCoords.lng);
    const json = await request('/upload/process-image', { method: 'POST', form, auth: false });
    return { ...(json.data || {}), discarded: Boolean(json.discarded), message: json.message || '' };
  },

  // The citizen may fix the map pin for 30 minutes after uploading (no account needed)
  async updateReportLocation(code, lat, lng, editToken) {
    const json = await request(`/upload/report/${encodeURIComponent(code)}/location`, {
      method: 'PATCH',
      body: { lat, lng, editToken },
      auth: false,
    });
    return json.data;
  },

  // Public report lookup by tracking ID (no login)
  async trackReport(code) {
    const json = await request(`/track/${encodeURIComponent(code)}`, { auth: false });
    return json.data;
  },

  // ---------------------------------------------------------------- staff login
  async login(email, password) {
    try {
      const json = await request('/auth/login', { method: 'POST', body: { email, password }, auth: false });
      return { success: true, data: json.data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  async me() {
    return (await request('/auth/me')).data;
  },

  // ---------------------------------------------------------------- legacy dashboard (scoped on the server)
  async getKpis() {
    try {
      return (await request('/kpi/summary')).data;
    } catch {
      return INITIAL_KPIS;
    }
  },
  async getIncidents(params = {}) {
    return (await request(`/incidents${qs(params)}`)).data || [];
  },
  async createIncident(incidentData) {
    return (await request('/incidents', { method: 'POST', body: incidentData })).data;
  },
  async updateIncident(id, incidentData) {
    return (await request(`/incidents/${id}`, { method: 'PUT', body: incidentData })).data;
  },
  async updateIncidentStatus(id, status, assignedTeam) {
    return (await request(`/incidents/${id}/status`, { method: 'PATCH', body: { status, assignedTeam } })).data;
  },

  // ---------------------------------------------------------------- work items (team managers + officer)
  work: {
    meta: async () => (await request('/work/meta')).data,
    list: async (params = {}) => (await request(`/work${qs(params)}`)).data,
    get: async (code) => (await request(`/work/${encodeURIComponent(code)}`)).data,
    start: async (code) => (await request(`/work/${encodeURIComponent(code)}/start`, { method: 'POST' })).data,
    resolve: async (code, note, afterPhoto) => {
      const form = new FormData();
      form.append('note', note);
      if (afterPhoto) form.append('afterPhoto', afterPhoto);
      return (await request(`/work/${encodeURIComponent(code)}/resolve`, { method: 'POST', form })).data;
    },
    requestReassign: async (code, reason, suggestedTeam) =>
      (await request(`/work/${encodeURIComponent(code)}/request-reassign`, { method: 'POST', body: { reason, suggestedTeam } })).data,
    requestNotDefect: async (code, reason) =>
      (await request(`/work/${encodeURIComponent(code)}/request-not-defect`, { method: 'POST', body: { reason } })).data,
  },

  // ---------------------------------------------------------------- municipal officer
  municipal: {
    board: async (team) => (await request(`/municipal/board${qs({ team })}`)).data,
    triage: async (params = {}) => (await request(`/municipal/triage${qs(params)}`)).data,
    triageAssign: async (code, team, category, reason) =>
      (await request(`/municipal/triage/${encodeURIComponent(code)}/assign`, { method: 'POST', body: { team, category, reason } })).data,
    triageReject: async (code, reason) =>
      (await request(`/municipal/triage/${encodeURIComponent(code)}/reject`, { method: 'POST', body: { reason } })).data,
    requests: async (params = {}) => (await request(`/municipal/requests${qs(params)}`)).data,
    decide: async (code, requestId, approve, toTeam, note) =>
      (await request(`/municipal/requests/${encodeURIComponent(code)}/${requestId}/decide`, { method: 'POST', body: { approve, toTeam, note } })).data,
    reassign: async (code, toTeam, reason) =>
      (await request(`/municipal/work/${encodeURIComponent(code)}/reassign`, { method: 'POST', body: { toTeam, reason } })).data,
    reopen: async (code, reason) => (await request(`/municipal/work/${encodeURIComponent(code)}/reopen`, { method: 'POST', body: { reason } })).data,
    reject: async (code, reason) => (await request(`/municipal/work/${encodeURIComponent(code)}/reject`, { method: 'POST', body: { reason } })).data,
  },

  // ---------------------------------------------------------------- analytics, badges, assistant
  analytics: {
    team: async (period = '7d', team) => (await request(`/analytics/team${qs({ period, team })}`)).data,
    municipal: async (period = '7d') => (await request(`/analytics/municipal${qs({ period })}`)).data,
  },
  notifications: async () => (await request('/notifications/summary')).data,
  chat: async (messages) => request('/chat', { method: 'POST', body: { messages } }),
};
