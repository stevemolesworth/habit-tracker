import { api, clearCache } from '/api.js'
import { authReady } from '/auth.js'
import { geocode, reverseGeocode, fetchWeather, buildWeatherStrip } from '/weather.js'

// Splash background — random chicken image, minimum 2s display
const splashImages = ['/gfx/chicken001.avif', '/gfx/chicken002.avif', '/gfx/chicken003.avif']
document.getElementById('app-splash').style.backgroundImage =
  `url('${splashImages[Math.floor(Math.random() * splashImages.length)]}')`
function hideSplash() {
  document.getElementById('app-splash').style.display = 'none'
}

// Device-local date/time
const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const localHour = parseInt(
  new Intl.DateTimeFormat('en-GB', { timeZone: userTZ, hour: 'numeric', hour12: false }).format(new Date())
)
const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: userTZ }).format(new Date())

// Allow a specific date to be passed (e.g. from calendar for past days)
const params = new URLSearchParams(location.search)
const today = params.get('date') || todayLocal
const isPastDate = today !== todayLocal

// Determine type: explicit ?type param → stored preference → time-based (17:00 cutoff)
let type = params.get('type') || (!isPastDate && sessionStorage.getItem('checkin_type')) || (localHour < 17 ? 'morning' : 'evening')
if (params.get('type')) sessionStorage.setItem('checkin_type', type)

const isMorning = type === 'morning'

// State
let existingRecord = null
let currentLocation = null  // { lat, lng, label }
let currentWeatherData = null
let isDirty = false
const dirtyCategories = new Set()

const FIELD_CATEGORY = {
  bedtime: 'Sleep', wake_time: 'Sleep', sleep_quality: 'Sleep',
  global_mood: 'Mood',
  exercised: 'Exercise', exercise_types: 'Exercise',
  alcohol_spirits: 'Alcohol', alcohol_beer: 'Alcohol', alcohol_wine: 'Alcohol',
  supplement: 'Supplements',
  behaviour: 'Behaviours',
  notes: 'Notes',
  weather: 'Weather'
}
let bypassGuard = false
let pendingNavContinue = null

// --- Static DOM setup ---
const dateStr = new Date().toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: userTZ
})
const dateCaption = isPastDate
  ? new Date(today + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  : `Today (${dateStr})`
document.getElementById('page-heading').innerHTML =
  `${isMorning ? 'Morning' : 'End of day'} check-in<span class="nhsuk-caption-l">${dateCaption}</span>`

// Show/hide sections
document.getElementById('focus-section').style.display = isMorning ? 'none' : ''
document.getElementById('exercise-section').style.display = isMorning ? 'none' : ''
document.getElementById('alcohol-section').style.display = isMorning ? 'none' : ''
document.getElementById('behaviours-section').style.display = isMorning ? 'none' : ''
document.getElementById('mood-legend').textContent = isMorning ? 'Overall mood' : 'Mood now'
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

document.getElementById('weather-toggle-location-btn').addEventListener('click', (e) => {
  e.preventDefault()
  const form = document.getElementById('weather-location-form')
  form.style.display = form.style.display === 'none' ? '' : 'none'
})

async function loadWeather() {
  const strip = document.getElementById('weather-strip')

  // Past check-ins: always show the snapshot captured at submission time
  if (isPastDate && existingRecord?.weather_snapshot?.hourly?.length) {
    currentWeatherData = existingRecord.weather_snapshot
    strip.innerHTML = buildWeatherStrip(existingRecord.weather_snapshot, type)
    return
  }

  if (!currentLocation) {
    strip.innerHTML = '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">No location set</span>'
    return
  }
  strip.innerHTML = '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">Loading weather…</span>'
  try {
    currentWeatherData = await fetchWeather(currentLocation, today)
    strip.innerHTML = buildWeatherStrip(currentWeatherData, type)
    if (existingRecord) {
      const locationChanged = currentLocation.lat !== existingRecord.weather_lat || currentLocation.lng !== existingRecord.weather_lng
      const snapshotChanged = JSON.stringify(currentWeatherData.hourly) !== JSON.stringify(existingRecord.weather_snapshot?.hourly)
      if (locationChanged || snapshotChanged) markDirty('weather')
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
    markDirty('weather')
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
    markDirty('weather')
    await loadWeather()
  }, (err) => {
    const msg = err.code === 1
      ? 'Location blocked — check your browser\'s site permissions and try again.'
      : err.code === 2
        ? 'Location unavailable. Try entering a postcode instead.'
        : 'Location request timed out. Try again or enter a postcode.'
    document.getElementById('weather-strip').innerHTML =
      `<span class="nhsuk-u-secondary-text-color nhsuk-body-s">${msg}</span>`
  }, { timeout: 10000 })
})


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
  savedNotesValue = record.notes || null

  if (record.weather_lat) {
    currentLocation = { lat: record.weather_lat, lng: record.weather_lng, label: record.weather_location_label || '' }
    document.getElementById('weather-location-input').value = record.weather_location_label || ''
    setLocationLabel(currentLocation.label)
  } else if (record.weather_postcode) {
    document.getElementById('weather-location-input').value = record.weather_postcode
  }
}

// --- Morning mood (shown on evening check-in) ---
function renderMorningMood(record) {
  const display = document.getElementById('morning-mood-display')
  const value = document.getElementById('morning-mood-value')
  value.textContent = record?.global_mood ?? 'Not recorded'
  display.style.display = ''
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

// --- Focuses ---
async function loadFocuses() {
  const container = document.getElementById('focuses-list')
  try {
    const focuses = await api.getFocuses()
    const active = focuses.filter(f => f.is_active)
    if (!active.length) {
      container.innerHTML = '<p class="nhsuk-body nhsuk-u-secondary-text-color">No focuses configured. Add them in <a href="/settings.html">Settings</a>.</p>'
      return
    }
    container.innerHTML = active.map(f => `
      <div class="nhsuk-form-group" data-focus-id="${f.id}">
        <fieldset class="nhsuk-fieldset">
          <legend class="nhsuk-fieldset__legend nhsuk-label">${f.title}</legend>
          <div class="nhsuk-radios nhsuk-radios--inline">
            ${[1,2,3,4,5].map(n => `
              <div class="nhsuk-radios__item">
                <input class="nhsuk-radios__input" id="focus-${f.id}-${n}" name="focus_${f.id}" type="radio" value="${n}">
                <label class="nhsuk-label nhsuk-radios__label" for="focus-${f.id}-${n}">${n}</label>
              </div>`).join('')}
          </div>
        </fieldset>
      </div>`).join('')
    if (existingRecord?.focuses) {
      for (const [id, score] of Object.entries(existingRecord.focuses)) {
        if (score) {
          const input = container.querySelector(`[name="focus_${id}"][value="${score}"]`)
          if (input) input.checked = true
        }
      }
    }
  } catch {
    container.innerHTML = '<p class="nhsuk-body nhsuk-u-secondary-text-color">Could not load focuses.</p>'
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

document.getElementById('bedtime').addEventListener('change', () => {
  document.getElementById('bedtime-group').classList.remove('nhsuk-form-group--error')
  document.getElementById('bedtime-error').style.display = 'none'
  updateSleepDuration()
})
document.getElementById('wake_time').addEventListener('change', () => {
  document.getElementById('wake-time-group').classList.remove('nhsuk-form-group--error')
  document.getElementById('wake-time-error').style.display = 'none'
  updateSleepDuration()
})

// --- Dirty tracking ---
function markDirty(fieldName) {
  if (fieldName?.startsWith('focus_')) dirtyCategories.add('Focus')
  const cat = FIELD_CATEGORY[fieldName]
  if (cat) dirtyCategories.add(cat)
  if (isDirty) return
  isDirty = true
  if (existingRecord) {
    document.getElementById('submit-btn').disabled = false
  }
}

function setupDirtyTracking() {
  const form = document.getElementById('checkin-form')
  form.addEventListener('input', e => {
    markDirty(e.target.name || e.target.id)
    if (e.target.name !== 'notes' && e.target.id !== 'notes') scheduleAutoSave()
  })
  form.addEventListener('change', e => {
    markDirty(e.target.name || e.target.id)
    if (e.target.name !== 'notes' && e.target.id !== 'notes') scheduleAutoSave()
  })
}

// --- Navigation guard ---
function showNavGuard(onContinue) {
  pendingNavContinue = onContinue
  const list = document.getElementById('nav-guard-changes')
  list.innerHTML = [...dirtyCategories].map(c => `<li>${c}</li>`).join('')
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
  if (link.closest('#app-splash')) return
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
  const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: userTZ })
  const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: userTZ })
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

// --- Payload builder ---
function buildPayload(includeNotes = true) {
  const form = document.getElementById('checkin-form')
  const get = (name) => form.elements[name]?.value || null
  const bool = (name) => form.elements[name]?.checked || false
  const exerciseTypes = [...form.querySelectorAll('[name="exercise_types"]:checked')].map(el => el.value)
  const supplementsObj = {}
  form.querySelectorAll('[name="supplement"]').forEach(el => { supplementsObj[el.value] = el.checked })
  const behavioursObj = {}
  form.querySelectorAll('[name="behaviour"]').forEach(el => { behavioursObj[el.value] = el.checked })
  const focusesObj = {}
  document.querySelectorAll('#focuses-list [data-focus-id]').forEach(fieldset => {
    const id = fieldset.dataset.focusId
    const checked = fieldset.querySelector(`[name="focus_${id}"]:checked`)
    focusesObj[id] = checked ? Number(checked.value) : null
  })
  return {
    check_in_type: type,
    check_in_date: today,
    global_mood: get('global_mood') ? Number(get('global_mood')) : null,
    focuses: focusesObj,
    exercised: bool('exercised'),
    exercise_types: exerciseTypes.length ? exerciseTypes : null,
    alcohol_spirits: Number(get('alcohol_spirits') || 0),
    alcohol_beer: Number(get('alcohol_beer') || 0),
    alcohol_wine: Number(get('alcohol_wine') || 0),
    supplements: Object.keys(supplementsObj).length ? supplementsObj : null,
    behaviours: Object.keys(behavioursObj).length ? behavioursObj : null,
    notes: includeNotes ? (get('notes') || null) : (existingRecord?.notes ?? null),
    bedtime: get('bedtime') || null,
    wake_time: get('wake_time') || null,
    sleep_quality: get('sleep_quality') ? Number(get('sleep_quality')) : null,
    weather_lat: currentLocation?.lat ?? null,
    weather_lng: currentLocation?.lng ?? null,
    weather_location_label: currentLocation?.label ?? null,
    weather_snapshot: currentWeatherData ? { current: currentWeatherData.current, hourly: currentWeatherData.hourly } : null
  }
}

// --- Core save ---
async function doSave(payload) {
  let result
  if (existingRecord) {
    result = await api.updateCheckin(existingRecord.id, payload)
  } else {
    result = await api.submitCheckin(payload)
    existingRecord = result
    document.getElementById('delete-section').style.display = ''
    document.getElementById('submit-btn').textContent = 'Save changes'
  }
  if (currentLocation) {
    api.updateWeights({ default_location_lat: currentLocation.lat, default_location_lng: currentLocation.lng, default_location_label: currentLocation.label }).catch(() => {})
  }
  showLastUpdated(result.submitted_at)
  return result
}

// --- Auto-save (all fields except notes) ---
let autoSaveTimer = null

function setAutoSaveStatus(msg) {
  const el = document.getElementById('autosave-status')
  el.textContent = msg
  el.style.display = msg ? '' : 'none'
}

async function autoSave() {
  try {
    setAutoSaveStatus('Saving…')
    const payload = buildPayload(false)
    await doSave(payload)
    setAutoSaveStatus('Saved')
    setTimeout(() => setAutoSaveStatus(''), 2000)
    const notesWasDirty = dirtyCategories.has('Notes')
    dirtyCategories.clear()
    if (notesWasDirty) dirtyCategories.add('Notes')
    isDirty = notesWasDirty
  } catch {
    setAutoSaveStatus('Could not auto-save')
  }
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(autoSave, 1200)
}

// --- Notes save button ---
let savedNotesValue = null

function updateNotesBtnState() {
  const current = document.getElementById('notes').value
  document.getElementById('save-notes-btn').disabled = current === savedNotesValue || (!current && !savedNotesValue)
}

document.getElementById('notes').addEventListener('input', updateNotesBtnState)

document.getElementById('save-notes-btn').addEventListener('click', async () => {
  const btn = document.getElementById('save-notes-btn')
  btn.disabled = true
  btn.textContent = 'Saving…'
  try {
    const payload = buildPayload(true)
    await doSave(payload)
    savedNotesValue = document.getElementById('notes').value || null
    btn.textContent = 'Save notes'
    updateNotesBtnState()
  } catch {
    btn.disabled = false
    btn.textContent = 'Save notes'
  }
})

// --- Form submission ---
document.getElementById('checkin-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = document.getElementById('submit-btn')
  btn.disabled = true
  btn.textContent = 'Saving…'
  hideError()

  // Sleep validation
  const bedtimeVal = document.getElementById('bedtime').value
  const wakeVal = document.getElementById('wake_time').value
  const bedtimeGroup = document.getElementById('bedtime-group')
  const wakeGroup = document.getElementById('wake-time-group')
  const bedtimeErr = document.getElementById('bedtime-error')
  const wakeErr = document.getElementById('wake-time-error')
  bedtimeGroup.classList.remove('nhsuk-form-group--error')
  wakeGroup.classList.remove('nhsuk-form-group--error')
  bedtimeErr.style.display = 'none'
  wakeErr.style.display = 'none'
  let sleepValid = true
  if (!bedtimeVal) {
    bedtimeGroup.classList.add('nhsuk-form-group--error')
    bedtimeErr.style.display = ''
    sleepValid = false
  }
  if (!wakeVal) {
    wakeGroup.classList.add('nhsuk-form-group--error')
    wakeErr.style.display = ''
    sleepValid = false
  }
  if (!sleepValid) {
    btn.disabled = false
    btn.textContent = existingRecord ? 'Save changes' : 'Submit check-in'
    document.getElementById('bedtime-group').scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }

  try {
    clearTimeout(autoSaveTimer)
    const result = await doSave(buildPayload(true))
    isDirty = false
    location.href = `/confirmation.html?id=${result.id}&type=${type}`
  } catch (err) {
    showError(err.message)
    btn.disabled = false
    btn.textContent = existingRecord ? 'Save changes' : 'Submit check-in'
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

// --- New-user splash ---
function showNewUserSplash() {
  isDirty = false
  dirtyCategories.clear()
  document.getElementById('splash-loading').style.display = 'none'
  document.getElementById('splash-welcome').style.display = 'flex'
}

document.getElementById('splash-skip-btn')?.addEventListener('click', (e) => {
  e.preventDefault()
  showForm()
})


// --- Init ---
function renderCheckinNav() {
  const el = document.getElementById('checkin-nav')
  if (!el) return
  const dateParam = today !== todayLocal ? `&date=${today}` : ''
  if (isMorning) {
    el.innerHTML = `<a href="/?type=evening${dateParam}" class="nhsuk-link" style="font-size:0.875rem">End of day check-in →</a>`
  } else {
    el.innerHTML = `<a href="/?type=morning${dateParam}" class="nhsuk-link" style="font-size:0.875rem">← Morning check-in</a>`
  }
}

async function init() {
  await authReady

  // After 17:00: sync redirect before any network calls
  if (!params.get('type') && !isPastDate && localHour >= 17 && type !== 'evening') {
    location.replace('/?type=evening')
    return
  }

  // Fire all needed requests in parallel
  const fetchExisting = api.getTodayCheckin(type, today)
  const fetchMorning = type === 'morning' ? fetchExisting : api.getTodayCheckin('morning', today)
  const [existingRes, morningRes, configRes, behavioursRes] = await Promise.allSettled([
    fetchExisting,
    fetchMorning,
    api.getWeights(),
    api.getBehaviours(),
  ])

  existingRecord = existingRes.status === 'fulfilled' ? existingRes.value : null
  const morningRecord = morningRes.status === 'fulfilled' ? morningRes.value : null
  const config = configRes.status === 'fulfilled' ? configRes.value : null
  const behaviours = behavioursRes.status === 'fulfilled' ? (behavioursRes.value ?? []) : []

  // Before 17:00 auto-switch: if morning is done, show evening
  if (!params.get('type') && !isPastDate && localHour < 17 && morningRecord && type !== 'evening') {
    location.replace('/?type=evening')
    return
  }

  renderCheckinNav()

  if (existingRecord) {
    const btn = document.getElementById('submit-btn')
    btn.textContent = 'Save Changes'
    btn.disabled = true
    populateForm(existingRecord)
    showLastUpdated(existingRecord.submitted_at)
    document.getElementById('delete-section').style.display = ''
  }

  // On evening, pre-fill sleep from morning if not already on the evening record
  if (!isMorning && !existingRecord?.sleep_quality && morningRecord) {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val }
    const setRadio = (name, val) => { if (!val) return; const el = document.querySelector(`[name="${name}"][value="${val}"]`); if (el) el.checked = true }
    setVal('bedtime', morningRecord.bedtime?.slice(0, 5))
    setVal('wake_time', morningRecord.wake_time?.slice(0, 5))
    setRadio('sleep_quality', morningRecord.sleep_quality)
    updateSleepDuration()
  }

  if (behaviours.length === 0) {
    showNewUserSplash()
    return
  }

  await showForm(morningRecord, config)
}

async function showForm(morningRecord = null, config = null) {
  loadSupplements()
  if (!isMorning) {
    loadBehaviours()
    loadFocuses()
    renderMorningMood(morningRecord)
  }

  // Apply pre-fetched config, or fetch if not available
  if (!currentLocation) {
    try {
      const cfg = config ?? await api.getWeights()
      if (cfg?.default_location_lat) {
        currentLocation = {
          lat: cfg.default_location_lat,
          lng: cfg.default_location_lng,
          label: cfg.default_location_label || ''
        }
        document.getElementById('weather-location-input').value = cfg.default_location_label || ''
        setLocationLabel(currentLocation.label)
      }
      if (cfg?.track_alcohol === false) {
        document.getElementById('alcohol-section').style.display = 'none'
      }
    } catch { /* leave without location */ }
  }

  setupDirtyTracking()
  document.getElementById('page-loader').style.display = 'none'
  document.getElementById('main-content-row').style.display = ''
  hideSplash()
  loadWeather() // non-blocking — updates the weather widget in-place when ready
}

init()
