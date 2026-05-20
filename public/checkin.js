import { api } from '/api.js'
import { authReady } from '/auth.js'
import { geocode, reverseGeocode, fetchWeather, buildWeatherStrip } from '/weather.js'

// Device-local date/time
const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const londonHour = parseInt(
  new Intl.DateTimeFormat('en-GB', { timeZone: userTZ, hour: 'numeric', hour12: false }).format(new Date())
)
const todayLondon = new Intl.DateTimeFormat('en-CA', { timeZone: userTZ }).format(new Date())

// Allow a specific date to be passed (e.g. from calendar for past days)
const params = new URLSearchParams(location.search)
const today = params.get('date') || todayLondon
const isPastDate = today !== todayLondon

// Determine type: explicit ?type param → stored preference → time-based (17:00 cutoff)
let type = params.get('type') || (!isPastDate && sessionStorage.getItem('checkin_type')) || (londonHour < 17 ? 'morning' : 'evening')
if (params.get('type')) sessionStorage.setItem('checkin_type', type)

const isMorning = type === 'morning'

// State
let existingRecord = null
let currentLocation = null  // { lat, lng, label }
let currentWeatherData = null
let isDirty = false
let bypassGuard = false
let pendingNavContinue = null

// --- Static DOM setup ---
const dateStr = new Date().toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London'
})
const dateCaption = isPastDate
  ? new Date(today + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  : `Today (${dateStr})`
document.getElementById('page-heading').innerHTML =
  `${isMorning ? 'Morning' : 'Evening'} check-in<span class="nhsuk-caption-l">${dateCaption}</span>`
document.getElementById('toggle-morning').classList.toggle('active', isMorning)
document.getElementById('toggle-evening').classList.toggle('active', !isMorning)

// Show/hide sections
document.getElementById('sleep-section').style.display = isMorning ? '' : 'none'
document.getElementById('focus-section').style.display = isMorning ? 'none' : ''
document.getElementById('exercise-section').style.display = isMorning ? 'none' : ''
document.getElementById('alcohol-section').style.display = isMorning ? 'none' : ''
document.getElementById('behaviours-section').style.display = isMorning ? 'none' : ''
document.getElementById('notes-label').textContent = isMorning
  ? 'What would make today good?'
  : "What made today good? Anything you'd like to achieve tomorrow?"

// --- Weather ---
function setLocationLabel(label) {
  const el = document.getElementById('weather-location-label')
  const btn = document.getElementById('weather-toggle-location-btn')
  if (label) {
    el.textContent = `📍 ${label}`
    btn.textContent = 'Change location'
    document.getElementById('weather-location-form').style.display = 'none'
  } else {
    el.textContent = ''
    btn.textContent = 'Add location'
  }
}

document.getElementById('weather-toggle-location-btn').addEventListener('click', () => {
  const form = document.getElementById('weather-location-form')
  form.style.display = form.style.display === 'none' ? '' : 'none'
})

async function loadWeather() {
  const strip = document.getElementById('weather-strip')
  if (!currentLocation) {
    strip.innerHTML = '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">No location set</span>'
    return
  }
  strip.innerHTML = '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">Loading weather…</span>'
  try {
    currentWeatherData = await fetchWeather(currentLocation, today)
    strip.innerHTML = buildWeatherStrip(currentWeatherData, isPastDate ? 'evening' : type)
    if (existingRecord) {
      const locationChanged = currentLocation.lat !== existingRecord.weather_lat || currentLocation.lng !== existingRecord.weather_lng
      const snapshotChanged = JSON.stringify(currentWeatherData.hourly) !== JSON.stringify(existingRecord.weather_snapshot?.hourly)
      if (locationChanged || snapshotChanged) markDirty()
    }
  } catch {
    strip.innerHTML = `<span class="nhsuk-u-secondary-text-color nhsuk-body-s">${isPastDate ? 'Historic weather data not available' : 'Could not load weather'}</span>`
  }
}

document.getElementById('weather-search-btn').addEventListener('click', async () => {
  const q = document.getElementById('weather-location-input').value.trim()
  if (!q) return
  const strip = document.getElementById('weather-strip')
  strip.innerHTML = '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">Searching…</span>'
  try {
    currentLocation = await geocode(q)
    setLocationLabel(currentLocation.label)
    markDirty()
    await loadWeather()
  } catch (err) {
    strip.innerHTML = `<span class="nhsuk-u-secondary-text-color nhsuk-body-s">${err.message}</span>`
  }
})

document.getElementById('weather-location-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    document.getElementById('weather-search-btn').click()
  }
})

document.getElementById('weather-geo-btn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    document.getElementById('weather-strip').innerHTML =
      '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">Geolocation not supported</span>'
    return
  }
  document.getElementById('weather-strip').innerHTML =
    '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">Getting your location…</span>'
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude
    const lng = pos.coords.longitude
    try {
      const { label } = await reverseGeocode(lat, lng)
      currentLocation = { lat, lng, label }
    } catch {
      currentLocation = { lat, lng, label: `${lat.toFixed(3)}, ${lng.toFixed(3)}` }
    }
    setLocationLabel(currentLocation.label)
    markDirty()
    await loadWeather()
  }, () => {
    document.getElementById('weather-strip').innerHTML =
      '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">Location access denied</span>'
  })
})

document.getElementById('weather-refresh-btn').addEventListener('click', loadWeather)

// --- Form population from existing record ---
function populateForm(record) {
  const setVal = (id, val) => {
    const el = document.getElementById(id)
    if (el && val !== null && val !== undefined) el.value = val
  }
  const setCheck = (id, val) => {
    const el = document.getElementById(id)
    if (el) el.checked = !!val
  }
  const setRadio = (name, val) => {
    if (val === null || val === undefined) return
    const el = document.querySelector(`[name="${name}"][value="${val}"]`)
    if (el) el.checked = true
  }

  setVal('bedtime', record.bedtime?.slice(0, 5))
  setVal('wake_time', record.wake_time?.slice(0, 5))
  updateSleepDuration()
  setRadio('sleep_quality', record.sleep_quality)
  setRadio('global_mood', record.global_mood)
  setRadio('focus_financial', record.focus_financial)
  setRadio('focus_consulting', record.focus_consulting)
  setRadio('focus_opiner', record.focus_opiner)
  setCheck('exercised', record.exercised)
  if (record.exercised) document.getElementById('exercise-details').style.display = ''
  if (record.exercise_types?.length) {
    record.exercise_types.forEach(t => {
      const el = document.querySelector(`[name="exercise_types"][value="${t}"]`)
      if (el) el.checked = true
    })
  }
  setVal('alcohol_spirits', record.alcohol_spirits ?? 0)
  setVal('alcohol_beer', record.alcohol_beer ?? 0)
  setVal('alcohol_wine', record.alcohol_wine ?? 0)
  setVal('notes', record.notes)

  if (record.weather_lat) {
    currentLocation = { lat: record.weather_lat, lng: record.weather_lng, label: record.weather_location_label || '' }
    document.getElementById('weather-location-input').value = record.weather_location_label || ''
    setLocationLabel(currentLocation.label)
  } else if (record.weather_postcode) {
    document.getElementById('weather-location-input').value = record.weather_postcode
  }
}

// --- Behaviours ---
async function loadBehaviours() {
  const list = document.getElementById('behaviours-list')
  try {
    const behaviours = await api.getBehaviours()
    if (!behaviours.length) {
      list.innerHTML = '<p class="nhsuk-body nhsuk-u-secondary-text-color">No behaviours configured. Add them in <a href="/settings.html">Settings</a>.</p>'
      return
    }
    list.innerHTML = behaviours.map(b => {
      const emoji = b.weight > 0 ? '👍'.repeat(b.weight) : b.weight < 0 ? '💩'.repeat(-b.weight) : ''
      return `
      <div class="nhsuk-checkboxes__item">
        <input class="nhsuk-checkboxes__input" id="beh-${b.id}" name="behaviour" type="checkbox" value="${b.name}" tabindex="0">
        <label class="nhsuk-label nhsuk-checkboxes__label" for="beh-${b.id}">${b.name}${emoji ? ` <span style="letter-spacing:1px">${emoji}</span>` : ''}</label>
      </div>`
    }).join('')

    if (existingRecord?.behaviours) {
      Object.entries(existingRecord.behaviours).forEach(([name, checked]) => {
        const el = document.querySelector(`[name="behaviour"][value="${name}"]`)
        if (el) el.checked = checked
      })
    }
  } catch {
    list.innerHTML = '<p class="nhsuk-body nhsuk-u-secondary-text-color">Could not load behaviours.</p>'
  }
}

// --- Supplements ---
async function loadSupplements() {
  const list = document.getElementById('supplements-list')
  try {
    const supplements = await api.getSupplements()
    if (!supplements.length) {
      list.innerHTML = '<p class="nhsuk-body nhsuk-u-secondary-text-color">No supplements configured. Add them in <a href="/settings.html">Settings</a>.</p>'
      return
    }
    list.innerHTML = supplements.map(s => `
      <div class="nhsuk-checkboxes__item">
        <input class="nhsuk-checkboxes__input" id="supp-${s.id}" name="supplement" type="checkbox" value="${s.name}" tabindex="0">
        <label class="nhsuk-label nhsuk-checkboxes__label" for="supp-${s.id}">${s.name}</label>
      </div>
    `).join('')

    if (existingRecord?.supplements) {
      Object.entries(existingRecord.supplements).forEach(([name, checked]) => {
        const el = document.querySelector(`[name="supplement"][value="${name}"]`)
        if (el) el.checked = checked
      })
    }
  } catch {
    list.innerHTML = '<p class="nhsuk-body nhsuk-u-secondary-text-color">Could not load supplements.</p>'
  }
}

// --- Sleep duration ---
function updateSleepDuration() {
  const bedtime = document.getElementById('bedtime').value
  const wakeTime = document.getElementById('wake_time').value
  const el = document.getElementById('sleep-duration')
  if (!bedtime || !wakeTime) { el.style.display = 'none'; return }
  const [bh, bm] = bedtime.split(':').map(Number)
  const [wh, wm] = wakeTime.split(':').map(Number)
  let diff = (wh * 60 + wm) - (bh * 60 + bm)
  if (diff < 0) diff += 24 * 60
  const hours = Math.floor(diff / 60)
  const mins = diff % 60
  const parts = []
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
  if (mins > 0) parts.push(`${mins} minute${mins !== 1 ? 's' : ''}`)
  el.textContent = `You slept for ${parts.join(' and ') || '0 minutes'}`
  el.style.display = ''
}

document.getElementById('bedtime').addEventListener('change', updateSleepDuration)
document.getElementById('wake_time').addEventListener('change', updateSleepDuration)

// --- Dirty tracking ---
function markDirty() {
  if (isDirty) return
  isDirty = true
  if (existingRecord) {
    const btn = document.getElementById('submit-btn')
    btn.disabled = false
  }
}

function setupDirtyTracking() {
  const form = document.getElementById('checkin-form')
  form.addEventListener('input', markDirty)
  form.addEventListener('change', markDirty)
}

// --- Navigation guard ---
function showNavGuard(onContinue) {
  pendingNavContinue = onContinue
  document.getElementById('nav-guard-modal').style.display = 'flex'
}

document.getElementById('nav-guard-cancel').addEventListener('click', () => {
  document.getElementById('nav-guard-modal').style.display = 'none'
  pendingNavContinue = null
})

document.getElementById('nav-guard-continue').addEventListener('click', () => {
  isDirty = false
  document.getElementById('nav-guard-modal').style.display = 'none'
  if (pendingNavContinue) pendingNavContinue()
})

// Intercept all nav link clicks
document.querySelectorAll('a[href]').forEach(link => {
  link.addEventListener('click', (e) => {
    if (!isDirty) return
    e.preventDefault()
    showNavGuard(() => { location.href = link.href })
  })
})

// Back button guard
history.replaceState({ guard: true }, '')
window.addEventListener('popstate', () => {
  if (bypassGuard || !isDirty) return
  history.pushState({ guard: true }, '')
  showNavGuard(() => {
    bypassGuard = true
    history.go(-2)
  })
})

// Tab/window close
window.addEventListener('beforeunload', (e) => {
  if (isDirty) {
    e.preventDefault()
    e.returnValue = ''
  }
})

// --- Last updated display ---
function showLastUpdated(submittedAt) {
  const el = document.getElementById('last-updated')
  if (!el || !submittedAt) return
  const dt = new Date(submittedAt)
  const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/London' })
  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
  el.textContent = `Last updated: ${dateStr} at ${timeStr} (${relativeTime(submittedAt)})`
  el.style.display = ''
}

function relativeTime(isoStr) {
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} minutes ago`
  if (hours < 2) return '1 hour ago'
  if (hours < 24) return `${hours} hours ago`
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

// --- Delete ---
document.getElementById('delete-btn').addEventListener('click', () => {
  document.getElementById('delete-modal').style.display = 'flex'
})

document.getElementById('delete-cancel-btn').addEventListener('click', () => {
  document.getElementById('delete-modal').style.display = 'none'
})

document.getElementById('delete-confirm-btn').addEventListener('click', async () => {
  const btn = document.getElementById('delete-confirm-btn')
  btn.disabled = true
  btn.textContent = 'Deleting…'
  try {
    await api.deleteCheckin(existingRecord.id)
    isDirty = false
    location.href = '/'
  } catch (err) {
    document.getElementById('delete-modal').style.display = 'none'
    showError(`Could not delete: ${err.message}`)
    btn.disabled = false
    btn.textContent = 'Delete'
  }
})

// --- Exercise toggle ---
document.getElementById('exercised').addEventListener('change', (e) => {
  document.getElementById('exercise-details').style.display = e.target.checked ? '' : 'none'
})

// --- Form submission ---
document.getElementById('checkin-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = document.getElementById('submit-btn')
  btn.disabled = true
  btn.textContent = existingRecord ? 'Saving…' : 'Submitting…'
  hideError()

  const form = e.target
  const get = (name) => form.elements[name]?.value || null
  const bool = (name) => form.elements[name]?.checked || false

  const exerciseTypes = [...form.querySelectorAll('[name="exercise_types"]:checked')].map(el => el.value)
  const supplementsObj = {}
  form.querySelectorAll('[name="supplement"]').forEach(el => { supplementsObj[el.value] = el.checked })
  const behavioursObj = {}
  form.querySelectorAll('[name="behaviour"]').forEach(el => { behavioursObj[el.value] = el.checked })

  const payload = {
    check_in_type: type,
    check_in_date: today,
    global_mood: get('global_mood') ? Number(get('global_mood')) : null,
    focus_financial: get('focus_financial') ? Number(get('focus_financial')) : null,
    focus_consulting: get('focus_consulting') ? Number(get('focus_consulting')) : null,
    focus_opiner: get('focus_opiner') ? Number(get('focus_opiner')) : null,
    exercised: bool('exercised'),
    exercise_types: exerciseTypes.length ? exerciseTypes : null,
    alcohol_spirits: Number(get('alcohol_spirits') || 0),
    alcohol_beer: Number(get('alcohol_beer') || 0),
    alcohol_wine: Number(get('alcohol_wine') || 0),
    supplements: Object.keys(supplementsObj).length ? supplementsObj : null,
    behaviours: Object.keys(behavioursObj).length ? behavioursObj : null,
    notes: get('notes') || null,
    weather_lat: currentLocation?.lat ?? null,
    weather_lng: currentLocation?.lng ?? null,
    weather_location_label: currentLocation?.label ?? null,
    weather_snapshot: currentWeatherData ? { current: currentWeatherData.current, hourly: currentWeatherData.hourly } : null
  }

  if (isMorning) {
    payload.bedtime = get('bedtime') || null
    payload.wake_time = get('wake_time') || null
    payload.sleep_quality = get('sleep_quality') ? Number(get('sleep_quality')) : null
  }

  try {
    let result
    if (existingRecord) {
      result = await api.updateCheckin(existingRecord.id, payload)
    } else {
      result = await api.submitCheckin(payload)
    }
    if (currentLocation) {
      api.updateWeights({
        default_location_lat: currentLocation.lat,
        default_location_lng: currentLocation.lng,
        default_location_label: currentLocation.label
      }).catch(() => {})
    }
    isDirty = false
    location.href = `/confirmation.html?id=${result.id}&type=${type}`
  } catch (err) {
    showError(err.message)
    btn.disabled = false
    btn.textContent = existingRecord ? 'Save Changes' : 'Submit check-in'
  }
})

function showError(msg) {
  const banner = document.getElementById('error-banner')
  document.getElementById('error-message').textContent = msg
  banner.style.display = ''
  banner.scrollIntoView({ behavior: 'smooth' })
}

function hideError() {
  document.getElementById('error-banner').style.display = 'none'
}

// --- Init ---
async function init() {
  await authReady

  try {
    existingRecord = await api.getTodayCheckin(type, today)
  } catch {
    existingRecord = null
  }

  if (existingRecord) {
    document.getElementById('already-submitted-banner').style.display = ''
    const btn = document.getElementById('submit-btn')
    btn.textContent = 'Save Changes'
    btn.disabled = true
    populateForm(existingRecord)
    showLastUpdated(existingRecord.submitted_at)
    document.getElementById('delete-section').style.display = ''
  }

  // Load supplements and behaviours (also re-populates from existing record)
  loadSupplements()
  loadBehaviours()

  // Load weather: existing record location takes precedence over settings default
  if (!currentLocation) {
    try {
      const config = await api.getWeights()
      if (config?.default_location_lat) {
        currentLocation = {
          lat: config.default_location_lat,
          lng: config.default_location_lng,
          label: config.default_location_label || ''
        }
        document.getElementById('weather-location-input').value = config.default_location_label || ''
        setLocationLabel(currentLocation.label)
      }
    } catch { /* leave without location */ }
  }

  await loadWeather()

  setupDirtyTracking()
  document.getElementById('page-loader').style.display = 'none'
  document.getElementById('main-content-row').style.display = ''
}

init()
