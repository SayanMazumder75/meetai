// utils/api.js – NO PACKING, just raw WebSocket and fetch

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export const api = {
  // REST endpoints
  async createSession(title) {
    const res = await fetch(`${BACKEND_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    return res.json();
  },

  async summarizeSession(sessionId) {
    const res = await fetch(`${BACKEND_URL}/sessions/${sessionId}/summarize`, {
      method: 'POST',
    });
    return res.json();
  },

  exportUrl(sessionId) {
    return `${BACKEND_URL}/sessions/${sessionId}/export`;
  },

  // WebSocket – returns a clean, unwrapped WebSocket
  wsUrl(sessionId) {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Assumes backend is on same host (or use env var)
    const backendHost = BACKEND_URL.replace(/^https?:\/\//, '');
    return `${wsProtocol}//${backendHost}/ws/${sessionId}`;
  }
};