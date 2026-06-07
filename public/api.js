import { getToken } from '/auth.js'

// ── Cache helpers ─────────────────────────────────────────────
const _cache = {}
const MEM_TTL = 5 * 60 * 1000    // 5 min in-memory
const LS_CFG_TTL = 60 * 60 * 1000  // 1 hour for config tables
const LS_CI_TTL  = 5 * 60 * 1000   // 5 min for check-in records

// Namespace all localStorage keys by user ID so different users can never share cached data
function uid() { try { return localStorage.getItem('cci-user-id') || '' } catch { return '' } }

function lsGet(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const { data, exp } = JSON.parse(raw)
    if (exp > Date.now()) return data
    localStorage.removeItem(key)
  } catch {}
  return undefined
}

function lsSet(key, data, ttl) {
  try { localStorage.setItem(key, JSON.stringify({ data, exp: Date.now() + ttl })) } catch {}
}

function lsDel(key) {
  try { localStorage.removeItem(key) } catch {}
}

// Config cache: memory (5 min) → localStorage (1 hr) → network
function cached(key, fn) {
  return async () => {
    const mem = _cache[key]
    if (mem && Date.now() - mem.ts < MEM_TTL) return mem.data
    const lsKey = `cci-cfg-${uid()}-${key}`
    const ls = lsGet(lsKey)
    if (ls !== undefined) { _cache[key] = { ts: Date.now(), data: ls }; return ls }
    const data = await fn()
    _cache[key] = { ts: Date.now(), data }
    lsSet(lsKey, data, LS_CFG_TTL)
    return data
  }
}

export function clearCache(...keys) {
  const targets = keys.length ? keys : Object.keys(_cache)
  targets.forEach(k => { delete _cache[k]; lsDel(`cci-cfg-${uid()}-${k}`) })
}

// Check-in cache helpers
function ciKey(type, date) { return `cci-ci-${uid()}-${type}-${date}` }

function clearAllCheckinCache() {
  try {
    const prefix = `cci-ci-${uid()}-`
    Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k))
  } catch {}
}

async function request(path, options = {}) {
  const token = getToken()
  const controller = new AbortController()

  // Promise.race guarantees rejection at 8 s even when Netlify's CDN holds
  // the TCP connection open during a cold-start (AbortController alone can't
  // force the browser to drop a connection that the network layer is still
  // trying to establish).
  let timerId
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => { controller.abort(); reject(new Error('timeout')) }, 8000)
  })

  try {
    const res = await Promise.race([
      fetch(path, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers
        },
        ...options
      }),
      timeout,
    ])
    clearTimeout(timerId)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || res.statusText)
    }
    if (res.status === 204) return null
    return res.json()
  } catch (err) {
    clearTimeout(timerId)
    throw err
  }
}

export const api = {
  submitCheckin: (data) => request('/api/checkin', { method: 'POST', body: JSON.stringify(data) })
    .then(r => { lsSet(ciKey(r.check_in_type, r.check_in_date), r, LS_CI_TTL); return r }),
  getCheckin: (id) => request(`/api/checkin/${id}`),
  updateCheckin: (id, data) => request(`/api/checkin/${id}`, { method: 'PUT', body: JSON.stringify(data) })
    .then(r => { lsSet(ciKey(r.check_in_type, r.check_in_date), r, LS_CI_TTL); return r }),
  deleteCheckin: (id) => request(`/api/checkin/${id}`, { method: 'DELETE' })
    .then(() => clearAllCheckinCache()),
  getCheckins: (month) => request(`/api/checkins${month ? `?month=${month}` : ''}`),
  getSupplements: cached('supplements', () => request('/api/supplements')),
  addSupplement: (name) => request('/api/supplements', { method: 'POST', body: JSON.stringify({ name }) }),
  updateSupplement: (id, name) => request(`/api/supplements?id=${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteSupplement: (id) => request(`/api/supplements?id=${id}`, { method: 'DELETE' }),
  reorderSupplements: (ids) => { clearCache('supplements'); return request('/api/supplements?reorder=1', { method: 'PUT', body: JSON.stringify({ ids }) }) },
  getBehaviours: cached('behaviours', () => request('/api/behaviours')),
  addBehaviour: (name, weight) => request('/api/behaviours', { method: 'POST', body: JSON.stringify({ name, weight }) }),
  updateBehaviour: (id, name, weight) => request(`/api/behaviours?id=${id}`, { method: 'PUT', body: JSON.stringify({ name, weight }) }),
  deleteBehaviour: (id) => request(`/api/behaviours?id=${id}`, { method: 'DELETE' }),
  getMoodDimensions: cached('moodDimensions', () => request('/api/mood-dimensions')),
  getMoodDimensionsAll: () => request('/api/mood-dimensions?all=1'),
  addMoodDimension: (name, five_is_good = true) => { clearCache('moodDimensions'); return request('/api/mood-dimensions', { method: 'POST', body: JSON.stringify({ name, five_is_good }) }) },
  updateMoodDimension: (id, data) => { clearCache('moodDimensions'); return request(`/api/mood-dimensions?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }) },
  reorderMoodDimensions: (ids) => { clearCache('moodDimensions'); return request('/api/mood-dimensions?reorder=1', { method: 'PUT', body: JSON.stringify({ ids }) }) },
  deleteMoodDimension: (id) => { clearCache('moodDimensions'); return request(`/api/mood-dimensions?id=${id}`, { method: 'DELETE' }) },
  getMomentumItems: cached('momentumItems', () => request('/api/momentum-items')),
  getMomentumItemsAll: () => request('/api/momentum-items?all=1'),
  addMomentumItem: (name) => { clearCache('momentumItems'); return request('/api/momentum-items', { method: 'POST', body: JSON.stringify({ name }) }) },
  updateMomentumItem: (id, data) => { clearCache('momentumItems'); return request(`/api/momentum-items?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }) },
  reorderMomentumItems: (ids) => { clearCache('momentumItems'); return request('/api/momentum-items?reorder=1', { method: 'PUT', body: JSON.stringify({ ids }) }) },
  deleteMomentumItem: (id) => { clearCache('momentumItems'); return request(`/api/momentum-items?id=${id}`, { method: 'DELETE' }) },
  getEvents: cached('events', () => request('/api/events')),
  addEvent: (data) => { clearCache('events'); return request('/api/events', { method: 'POST', body: JSON.stringify(data) }) },
  updateEvent: (id, data) => { clearCache('events'); return request(`/api/events?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }) },
  deleteEvent: (id) => { clearCache('events'); return request(`/api/events?id=${id}`, { method: 'DELETE' }) },
  reorderEvents: (ids) => { clearCache('events'); return request('/api/events?reorder=1', { method: 'PUT', body: JSON.stringify({ ids }) }) },
  reorderBehaviours: (ids) => { clearCache('behaviours'); return request('/api/behaviours?reorder=1', { method: 'PUT', body: JSON.stringify({ ids }) }) },
  getWeights: cached('weights', () => request('/api/weights')),
  updateWeights: (data) => request('/api/weights', { method: 'PUT', body: JSON.stringify(data) }),
  getRandomQuote: () => request('/api/quote-random'),
  getTodayCheckin: (type, date) => {
    const key = ciKey(type, date)
    const hit = lsGet(key)
    if (hit !== undefined) return Promise.resolve(hit)
    return request(`/api/today-checkin?type=${type}&date=${date}`)
      .then(data => { lsSet(key, data, LS_CI_TTL); return data })
  },
  getReport: (from, to) => request(`/api/report?from=${from}&to=${to}`),
  deleteRange: (from, to) => request(`/api/delete-range?from=${from}&to=${to}`, { method: 'DELETE' }),
  deleteAccount: () => request('/api/delete-account', { method: 'DELETE' }),
}
