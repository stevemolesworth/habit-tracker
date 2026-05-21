import { getToken } from '/auth.js'

// In-memory cache for data that rarely changes within a session
const _cache = {}
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function cached(key, fn) {
  return async () => {
    const entry = _cache[key]
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data
    const data = await fn()
    _cache[key] = { ts: Date.now(), data }
    return data
  }
}

export function clearCache(...keys) {
  const targets = keys.length ? keys : Object.keys(_cache)
  targets.forEach(k => delete _cache[k])
}

async function request(path, options = {}) {
  const token = getToken()
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    },
    ...options
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  submitCheckin: (data) => request('/api/checkin', { method: 'POST', body: JSON.stringify(data) }),
  getCheckin: (id) => request(`/api/checkin/${id}`),
  updateCheckin: (id, data) => request(`/api/checkin/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCheckin: (id) => request(`/api/checkin/${id}`, { method: 'DELETE' }),
  getCheckins: (month) => request(`/api/checkins${month ? `?month=${month}` : ''}`),
  getSupplements: cached('supplements', () => request('/api/supplements')),
  addSupplement: (name) => request('/api/supplements', { method: 'POST', body: JSON.stringify({ name }) }),
  updateSupplement: (id, name) => request(`/api/supplements?id=${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteSupplement: (id) => request(`/api/supplements?id=${id}`, { method: 'DELETE' }),
  getBehaviours: cached('behaviours', () => request('/api/behaviours')),
  addBehaviour: (name, weight) => request('/api/behaviours', { method: 'POST', body: JSON.stringify({ name, weight }) }),
  updateBehaviour: (id, name, weight) => request(`/api/behaviours?id=${id}`, { method: 'PUT', body: JSON.stringify({ name, weight }) }),
  deleteBehaviour: (id) => request(`/api/behaviours?id=${id}`, { method: 'DELETE' }),
  getMoodDimensions: cached('moodDimensions', () => request('/api/mood-dimensions')),
  addMoodDimension: (name) => request('/api/mood-dimensions', { method: 'POST', body: JSON.stringify({ name }) }),
  updateMoodDimension: (id, data) => request(`/api/mood-dimensions?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMoodDimension: (id) => request(`/api/mood-dimensions?id=${id}`, { method: 'DELETE' }),
  getWeights: cached('weights', () => request('/api/weights')),
  updateWeights: (data) => request('/api/weights', { method: 'PUT', body: JSON.stringify(data) }),
  getRandomQuote: () => request('/api/quote-random'),
  getTodayCheckin: (type, date) => request(`/api/today-checkin?type=${type}&date=${date}`),
  getReport: (from, to) => request(`/api/report?from=${from}&to=${to}`),
  deleteRange: (from, to) => request(`/api/delete-range?from=${from}&to=${to}`, { method: 'DELETE' }),
  deleteAccount: () => request('/api/delete-account', { method: 'DELETE' }),
}
