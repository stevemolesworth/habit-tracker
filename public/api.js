import { getToken } from '/auth.js'

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
  getSupplements: () => request('/api/supplements'),
  addSupplement: (name) => request('/api/supplements', { method: 'POST', body: JSON.stringify({ name }) }),
  updateSupplement: (id, name) => request(`/api/supplements?id=${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteSupplement: (id) => request(`/api/supplements?id=${id}`, { method: 'DELETE' }),
  getBehaviours: () => request('/api/behaviours'),
  addBehaviour: (name, weight) => request('/api/behaviours', { method: 'POST', body: JSON.stringify({ name, weight }) }),
  updateBehaviour: (id, name, weight) => request(`/api/behaviours?id=${id}`, { method: 'PUT', body: JSON.stringify({ name, weight }) }),
  deleteBehaviour: (id) => request(`/api/behaviours?id=${id}`, { method: 'DELETE' }),
  getFocuses: () => request('/api/focuses'),
  addFocus: (title) => request('/api/focuses', { method: 'POST', body: JSON.stringify({ title }) }),
  updateFocus: (id, data) => request(`/api/focuses?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFocus: (id) => request(`/api/focuses?id=${id}`, { method: 'DELETE' }),
  getWeights: () => request('/api/weights'),
  updateWeights: (data) => request('/api/weights', { method: 'PUT', body: JSON.stringify(data) }),
  getRandomQuote: () => request('/api/quote-random'),
  getTodayCheckin: (type, date) => request(`/api/today-checkin?type=${type}&date=${date}`),
  getReport: (from, to) => request(`/api/report?from=${from}&to=${to}`),
  deleteRange: (from, to) => request(`/api/delete-range?from=${from}&to=${to}`, { method: 'DELETE' }),
  deleteAccount: () => request('/api/delete-account', { method: 'DELETE' }),
}
