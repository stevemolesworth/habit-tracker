import { api } from '/api.js'
import { fetchWeather, buildWeatherStrip } from '/weather.js'

// London-aware date/time
const londonHour = parseInt(
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).format(new Date())
)
const todayLondon = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())

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
document.getElementById('mindfulness-section').style.display = isMorning ? 'none' : ''
document.getElementById('behaviours-section').style.display = isMorning ? 'none' : ''
document.getElementById('notes-label').textContent = isMorning
  ? 'What would make today good?'
  : "What made today good? Anything you'd like to achieve tomorrow?"

// --- Weather ---
async function loadWeather() {
  const strip = document.getElementById('weather-strip')
  const postcode = document.getElementById('weather-postcode').value.trim()
  if (!postcode) {
    strip.innerHTML = '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">No weather data recorded</span>'
    return
  }
  strip.innerHTML = '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">Loading weather…</span>'
  try {
    currentWeatherData = await fetchWeather(postcode, today)
    strip.innerHTML = buildWeatherStrip(currentWeatherData, isPastDate ? 'evening' : type)
    // If existing record, treat changed weather as a dirty signal
    if (existingRecord) {
      const postcodeChanged = currentWeatherData.postcode !== existingRecord.weather_postcode
      const snapshotChanged = JSON.stringify(currentWeatherData.hourly) !== JSON.stringify(existingRecord.weather_snapshot?.hourly)
      if (postcodeChanged || snapshotChanged) markDirty()
    }
  } catch (err) {
    strip.innerHTML = `<span class="nhsuk-u-secondary-text-color nhsuk-body-s">Could not load weather: ${err.message}</span>`
  }
}

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
  setVal('session_count', record.session_count)
  setVal('alcohol_spirits', record.alcohol_spirits ?? 0)
  setVal('alcohol_beer', record.alcohol_beer ?? 0)
  setVal('alcohol_wine', record.alcohol_wine ?? 0)
  setCheck('mindfulness_meditation', record.mindfulness_meditation)
  setCheck('mindfulness_yoga', record.mindfulness_yoga)
  setCheck('outside_time', record.outside_time)
  setCheck('social_media', record.social_media)
  setCheck('behaviour_p', record.p)
  setCheck('behaviour_m', record.m)
  setCheck('behaviour_s', record.s)
  setVal('notes', record.notes)

  if (record.weather_postcode) {
    document.getElementById('weather-postcode').value = record.weather_postcode
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

  const payload = {
    check_in_type: type,
    check_in_date: today,
    global_mood: get('global_mood') ? Number(get('global_mood')) : null,
    focus_financial: get('focus_financial') ? Number(get('focus_financial')) : null,
    focus_consulting: get('focus_consulting') ? Number(get('focus_consulting')) : null,
    focus_opiner: get('focus_opiner') ? Number(get('focus_opiner')) : null,
    exercised: bool('exercised'),
    exercise_types: exerciseTypes.length ? exerciseTypes : null,
    session_count: get('session_count') ? Number(get('session_count')) : null,
    alcohol_spirits: Number(get('alcohol_spirits') || 0),
    alcohol_beer: Number(get('alcohol_beer') || 0),
    alcohol_wine: Number(get('alcohol_wine') || 0),
    mindfulness_meditation: bool('mindfulness_meditation'),
    mindfulness_yoga: bool('mindfulness_yoga'),
    supplements: Object.keys(supplementsObj).length ? supplementsObj : null,
    outside_time: bool('outside_time'),
    social_media: bool('social_media'),
    p: bool('p'),
    m: bool('m'),
    s: bool('s'),
    notes: get('notes') || null,
    weather_postcode: currentWeatherData?.postcode || null,
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
  // Check for existing submission today
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

  // Load supplements (also re-populates from existing record)
  loadSupplements()

  // Load weather: prefer stored postcode from existing record, else settings default
  try {
    if (!existingRecord?.weather_postcode) {
      const config = await api.getWeights()
      if (config?.default_postcode) {
        document.getElementById('weather-postcode').value = config.default_postcode
      }
    }
  } catch { /* fall back to HTML default */ }

  await loadWeather()

  // Set up dirty tracking after all population is complete
  setupDirtyTracking()
}

init()
