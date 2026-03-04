import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
})

export const getGuidance = (data) => api.post('/guidance', data)
export const assessMood = (data) => api.post('/mood/assess', data)
export const getMoodHistory = (sessionId) => api.get(`/mood/history/${sessionId}`)
export const logKicks = (data) => api.post('/kicks/log', data)
export const getKickStatus = (sessionId) => api.get(`/kicks/status/${sessionId}`)
export const addJournalEntry = (data) => api.post('/journal/entry', data)
export const getJournalEntries = (sessionId) => api.get(`/journal/entries/${sessionId}`)

export default api
