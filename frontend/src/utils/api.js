// All API calls to backend
// Set VITE_API_URL in your Vercel env vars to your Render backend URL
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const WS_BASE = BASE.replace(/^http/, 'ws')

export const api = {
  async createSession(title = '') {
    const res = await fetch(`${BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    return res.json()
  },

  async listSessions() {
    const res = await fetch(`${BASE}/sessions`)
    return res.json()
  },

  async getSession(id) {
    const res = await fetch(`${BASE}/sessions/${id}`)
    return res.json()
  },

  async summarizeSession(id) {
    const res = await fetch(`${BASE}/sessions/${id}/summarize`, { method: 'POST' })
    return res.json()
  },

  async deleteSession(id) {
    await fetch(`${BASE}/sessions/${id}`, { method: 'DELETE' })
  },

  exportUrl(id) {
    return `${BASE}/sessions/${id}/export`
  },

  wsUrl(sessionId) {
    return `${WS_BASE}/ws/${sessionId}`
  },
}
