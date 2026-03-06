import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('aura_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401 clear auth and redirect to login
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && !err.config.url?.includes('/auth/')) {
      localStorage.removeItem('aura_token')
      localStorage.removeItem('aura_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Auth
export const loginUser = (data) => api.post('/auth/login', data)
export const signupUser = (data) => api.post('/auth/signup', data)
export const getMe = () => api.get('/auth/me')
export const updateUserStage = (data) => api.put('/auth/stage', data)

// Features
export const getGuidance = (data) => api.post('/guidance', data)
export const assessMood = (data) => api.post('/mood/assess', data)
export const getMoodHistory = () => api.get('/mood/history')
export const logKicks = (data) => api.post('/kicks/log', data)
export const getKickStatus = () => api.get('/kicks/status')
export const addJournalEntry = (data) => api.post('/journal/entry', data)
export const getJournalEntries = () => api.get('/journal/entries')

// Postnatal Dashboard
export const saveDailyLog = (data) => api.post('/postnatal/daily-log', data)
export const getDailyLog = (logDate) => api.get('/postnatal/daily-log', { params: logDate ? { log_date: logDate } : {} })
export const getDailyStatus = () => api.get('/postnatal/daily-status')
export const saveGrowthLog = (data) => api.post('/postnatal/growth', data)
export const getGrowthLogs = () => api.get('/postnatal/growth')
export const getVaccinations = () => api.get('/postnatal/vaccinations')
export const completeVaccination = (name) => api.put(`/postnatal/vaccinations/${encodeURIComponent(name)}/complete`)
export const getRecoveryTips = () => api.get('/postnatal/recovery-tips')

// Chat
export const sendChatMessage = (data) => api.post('/chat/message', data)
export const getChatSuggestions = () => api.get('/chat/suggestions')

// Voice (Whisper)
export const transcribeAudio = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/voice/transcribe', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}
export const processVoice = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/voice/process', form, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export default api
