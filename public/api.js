async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const api = {
  submitCheckin: (data) => request('/api/checkin', { method: 'POST', body: JSON.stringify(data) }),
  getCheckin: (id) => request(`/api/checkin/${id}`),
  updateCheckin: (id, data) => request(`/api/checkin/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getCheckins: (month) => request(`/api/checkins${month ? `?month=${month}` : ''}`),
  getSupplements: () => request('/api/supplements'),
  addSupplement: (name) => request('/api/supplements', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteSupplement: (id) => request(`/api/supplements?id=${id}`, { method: 'DELETE' }),
  getWeights: () => request('/api/weights'),
  updateWeights: (data) => request('/api/weights', { method: 'PUT', body: JSON.stringify(data) }),
  getRandomQuote: () => request('/api/quote-random'),
  getReport: (from, to) => request(`/api/report?from=${from}&to=${to}`),
}
