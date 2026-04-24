import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOKEN_KEY = 'alok_lms_token'
const REFRESH_KEY = 'alok_lms_refresh'

const api = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach bearer token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers['Authorization'] = `Bearer ${token}`
  return config
})

// Auto-refresh on 401, then retry the original request once
let isRefreshing = false
let refreshQueue = []

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      // Don't try to refresh the refresh call itself
      if (original.url === '/auth/refresh') {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(REFRESH_KEY)
        localStorage.removeItem('alok_lms_user')
        if (window.location.pathname !== '/login') window.location.href = '/login'
        return Promise.reject(err)
      }

      const refreshToken = localStorage.getItem(REFRESH_KEY)
      if (!refreshToken) {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem('alok_lms_user')
        if (window.location.pathname !== '/login') window.location.href = '/login'
        return Promise.reject(err)
      }

      if (isRefreshing) {
        // Queue this request until the refresh completes
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject })
        }).then(() => {
          original._retry = true
          return api(original)
        })
      }

      isRefreshing = true
      original._retry = true

      try {
        const { data } = await axios.post(`${baseURL}/auth/refresh`, { refresh_token: refreshToken })
        localStorage.setItem(TOKEN_KEY, data.access_token)
        localStorage.setItem(REFRESH_KEY, data.refresh_token)
        localStorage.setItem('alok_lms_user', JSON.stringify(data.user))
        // Retry queued requests
        refreshQueue.forEach(({ resolve }) => resolve())
        refreshQueue = []
        return api(original)
      } catch (refreshErr) {
        refreshQueue.forEach(({ reject }) => reject(refreshErr))
        refreshQueue = []
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(REFRESH_KEY)
        localStorage.removeItem('alok_lms_user')
        if (window.location.pathname !== '/login') window.location.href = '/login'
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  },
)

export const AuthAPI = {
  sendOTP: (emp_code) =>
    api.post('/auth/login', { emp_code }).then(r => r.data),
  verifyOTP: (session_id, otp) =>
    api.post('/auth/verify-otp', { session_id, otp }).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
}

export const LeadsAPI = {
  list: (params) => api.get('/leads', { params }).then(r => r.data),
  get:  (id)     => api.get(`/leads/${id}`).then(r => r.data),
  patch:(id, b)  => api.patch(`/leads/${id}`, b).then(r => r.data),
  bulkPatch: (body) => api.patch('/leads/bulk', body).then(r => r.data),
  autoAssign: (body) => api.post('/leads/auto-assign', body).then(r => r.data),
  myTasks: () => api.get('/leads/my-tasks').then(r => r.data),
}

export const CampaignsAPI = {
  list:        ()              => api.get('/campaigns').then(r => r.data),
  create:      (b)             => api.post('/campaigns', b).then(r => r.data),
  get:         (id)            => api.get(`/campaigns/${id}`).then(r => r.data),
  update:      (id, b)         => api.patch(`/campaigns/${id}`, b).then(r => r.data),
  remove:      (id)            => api.delete(`/campaigns/${id}`),
  steps:       (id)            => api.get(`/campaigns/${id}/steps`).then(r => r.data),
  addStep:     (id, b)         => api.post(`/campaigns/${id}/steps`, b).then(r => r.data),
  updateStep:  (id, sid, b)    => api.patch(`/campaigns/${id}/steps/${sid}`, b).then(r => r.data),
  removeStep:  (id, sid)       => api.delete(`/campaigns/${id}/steps/${sid}`),
  enrollPreview: (id, filters) => api.post(`/campaigns/${id}/enroll/preview`, filters).then(r => r.data),
  enroll:      (id, filters)   => api.post(`/campaigns/${id}/enroll`, filters).then(r => r.data),
}

export const TemplatesAPI = {
  list:   (params) => api.get('/templates', { params }).then(r => r.data),
  get:    (id)     => api.get(`/templates/${id}`).then(r => r.data),
  create: (b)      => api.post('/templates', b).then(r => r.data),
  update: (id, b)  => api.patch(`/templates/${id}`, b).then(r => r.data),
  remove: (id)     => api.delete(`/templates/${id}`),
}

export const UsersAPI = {
  list: (params) => api.get('/users', { params }).then(r => r.data),
}

export const EventsAPI = {
  log:  (b)       => api.post('/events', b).then(r => r.data),
  list: (params)  => api.get('/events', { params }).then(r => r.data),
}

export const DripAPI = {
  get:    (leadId) => api.get(`/drip/lead/${leadId}`).then(r => r.data),
  pause:  (leadId) => api.patch(`/drip/lead/${leadId}`, { status: 'paused' }).then(r => r.data),
  resume: (leadId) => api.patch(`/drip/lead/${leadId}`, { status: 'active' }).then(r => r.data),
}

export const CrmAPI = {
  handoff: (leadId) => api.post(`/crm/handoff/${leadId}`).then(r => r.data),
}

export const ImportAPI = {
  upload: (formData, onProgress) =>
    api.post('/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => onProgress?.(Math.round((e.loaded / (e.total || 1)) * 100)),
    }).then(r => r.data),
  history: () => api.get('/import/history').then(r => r.data),
}

export const NotificationsAPI = {
  list:        (params) => api.get('/notifications', { params }).then(r => r.data),
  unreadCount: () => api.get('/notifications/unread-count').then(r => r.data),
  markRead:    (id) => api.post(`/notifications/mark-read/${id}`).then(r => r.data),
  markAllRead: () => api.post('/notifications/mark-all-read').then(r => r.data),
}

export const DuplicatesAPI = {
  stats: () => api.get('/duplicates/stats').then(r => r.data),
  scan:  (params) => api.get('/duplicates/scan', { params }).then(r => r.data),
  merge: (body) => api.post('/duplicates/merge', body).then(r => r.data),
}

export const CompaniesAPI = {
  list:      (params) => api.get('/companies', { params }).then(r => r.data),
  summary:   ()       => api.get('/companies/summary').then(r => r.data),
  countries: ()       => api.get('/companies/countries').then(r => r.data),
}

export const AnalyticsAPI = {
  funnel:    () => api.get('/analytics/funnel').then(r => r.data),
  segments:  () => api.get('/analytics/segments').then(r => r.data),
  summary:   () => api.get('/analytics/summary').then(r => r.data),
  dashboard: () => api.get('/analytics/dashboard').then(r => r.data),
}

export default api
