import { api, clearCache } from '/api.js'
import { authReady } from '/auth.js'
import { geocode, reverseGeocode, fetchWeather, buildWeatherStrip } from '/weather.js'
import { initDurationInput } from '/duration-input.js'

// Splash background — random chicken image
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

const params = new URLSearchParams(location.search)
const today = params.get('date') || todayLocal
const isPastDate = today !== todayLocal

let type = params.get('type') || (!isPastDate && sessionStorage.getItem('checkin_type')) || (localHour < 17 ? 'morning' : 'evening')
if (params.get('type')) sessionStorage.setItem('checkin_type', type)

const isMorning = type === 'morning'

// State
let existingRecord = null
let currentLocation = null
let currentWeatherData = null
let isDirty = false
const dirtyCategories = new Set()

const FIELD_CATEGORY = {
  bedtime: 'Sleep', wake_time: 'Sleep', sleep_quality: 'Sleep',
  primary_mood: 'Mood', secondary_mood_: 'Mood',
  momentum_: 'Momentum',
  exercise_types: 'Exercise', exercise_sessions: 'Exercise', exercise_duration_minutes: 'Exercise',
  alcohol_spirits: 'Alcohol', alcohol_beer: 'Alcohol', alcohol_wine: 'Alcohol',
  supplement: 'Supplements',
  behaviour: 'Events',
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
if (!isMorning) document.getElementById('sleep-section').style.display = 'none' // renderEodSleep shows it after data loads
document.getElementById('events-section').style.display = isMorning ? 'none' : ''
document.getElementById('momentum-section').style.display = 'none' // renderMomentum shows it if items exist
document.getElementById('checkin-inpage-nav').style.display = isMorning ? 'none' : ''
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
      if (locationChanged || snapshotChanged) { markDirty('weather'); scheduleAutoSave() }
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
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('weather-search-btn').click() }
})

document.getElementById('weather-geo-btn').addEventListener('click', () => {
  if (!navigator.geolocation) {
    document.getElementById('weather-strip').innerHTML = '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">Geolocation not supported</span>'
    return
  }
  document.getElementById('weather-strip').innerHTML = '<span class="nhsuk-u-secondary-text-color nhsuk-body-s">Getting your location…</span>'
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
      : err.code === 2 ? 'Location unavailable. Try entering a postcode instead.'
      : 'Location request timed out. Try again or enter a postcode.'
    document.getElementById('weather-strip').innerHTML = `<span class="nhsuk-u-secondary-text-color nhsuk-body-s">${msg}</span>`
  }, { timeout: 10000 })
})

// --- Form population from existing record ---
function populateForm(record) {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== null && val !== undefined) el.value = val }
  const setRadio = (name, val) => {
    if (val === null || val === undefined) return
    const el = document.querySelector(`[name="${name}"][value="${val}"]`)
    if (el) el.checked = true
  }

  setVal('bedtime', record.bedtime?.slice(0, 5))
  setVal('wake_time', record.wake_time?.slice(0, 5))
  updateSleepDuration()

  setRadio('sleep_quality', record.sleep_quality)

  // Primary mood — use the field matching this check-in type
  const primaryVal = isMorning ? record.primary_mood_morning : record.primary_mood_eod
  setRadio('primary_mood', primaryVal)

  // Secondary moods
  if (record.secondary_moods) {
    Object.entries(record.secondary_moods).forEach(([dimId, score]) => {
      const el = document.querySelector(`[name="secondary_mood_${dimId}"][value="${score}"]`)
      if (el) el.checked = true
    })
  }

  // Exercise
  setVal('exercise_sessions', record.exercise_sessions ?? 0)
  if (record.exercise_duration_minutes != null) {
    durationControl?.setValue(record.exercise_duration_minutes)
  }
  if (record.exercise_types?.length) {
    record.exercise_types.forEach(t => {
      const el = document.querySelector(`[name="exercise_types"][value="${t}"]`)
      if (el) el.checked = true
    })
  }

  // Alcohol
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

// --- EOD sleep summary ---
const SLEEP_QUALITY_LABEL = { 1: 'Bad', 2: 'Average', 3: 'Good' }

function renderEodSleep(morningRecord) {
  if (isMorning) return

  const section = document.getElementById('sleep-section')
  const summaryDiv = document.getElementById('eod-sleep-summary')
  const noneDiv = document.getElementById('eod-sleep-none')
  const fields = document.getElementById('sleep-fields')

  section.style.display = ''
  fields.style.display = 'none'

  // Prefer existing EOD record data, fall back to morning record
  const src = (existingRecord?.hours_slept || existingRecord?.sleep_quality || existingRecord?.bedtime)
    ? existingRecord
    : (morningRecord?.hours_slept || morningRecord?.sleep_quality || morningRecord?.bedtime)
      ? morningRecord
      : null

  if (src) {
    const parts = []
    if (src.hours_slept) {
      const h = Math.floor(src.hours_slept)
      const m = Math.round((src.hours_slept % 1) * 60)
      if (h > 0) parts.push(`${h}h`)
      if (m > 0) parts.push(`${m}m`)
    }
    const quality = src.sleep_quality ? SLEEP_QUALITY_LABEL[src.sleep_quality] : null
    let text = parts.length ? `Slept ${parts.join(' ')}` : ''
    if (quality) text += (text ? ` · ${quality}` : quality)
    document.getElementById('eod-sleep-text').textContent = text || 'Sleep data recorded'

    summaryDiv.style.display = ''
    noneDiv.style.display = 'none'

    document.getElementById('eod-sleep-edit-link').addEventListener('click', e => {
      e.preventDefault()
      const open = fields.style.display !== 'none'
      fields.style.display = open ? 'none' : ''
      e.target.textContent = open ? 'Edit' : 'Hide'
    })
  } else {
    summaryDiv.style.display = 'none'
    noneDiv.style.display = ''

    document.getElementById('eod-sleep-add-link').addEventListener('click', e => {
      e.preventDefault()
      noneDiv.style.display = 'none'
      fields.style.display = ''
    })
  }
}

// --- Morning mood shown on EOD check-in ---
function renderMorningMood(morningRecord) {
  const display = document.getElementById('morning-mood-display')
  const value = document.getElementById('morning-mood-value')
  if (!isMorning && morningRecord?.primary_mood_morning) {
    value.textContent = morningRecord.primary_mood_morning
    display.style.display = ''
  }
}

// --- Secondary moods rendering ---
function renderSecondaryMoods(dims, morningRecord) {
  const container = document.getElementById('secondary-moods-list')
  if (!dims.length) { container.innerHTML = ''; return }

  container.innerHTML = dims.map(dim => {
    const morningVal = !isMorning ? (morningRecord?.secondary_moods?.[dim.id] ?? null) : null
    const morningHint = morningVal !== null
      ? `<span class="app-mood-morning-hint"> — this morning: ${morningVal}</span>`
      : ''
    const emoji1 = dim.five_is_good !== false ? '😢' : '😊'
    const emoji5 = dim.five_is_good !== false ? '😊' : '😢'
    return `
      <div class="nhsuk-form-group nhsuk-u-margin-top-3">
        <fieldset class="nhsuk-fieldset">
          <legend class="nhsuk-fieldset__legend nhsuk-label">
            <strong>${dim.name}</strong>${morningHint}
          </legend>
          <div class="app-mood-scale-row">
            <span class="app-mood-anchor" aria-hidden="true">${emoji1}</span>
            <div class="nhsuk-radios nhsuk-radios--inline nhsuk-radios--small">
              ${[1,2,3,4,5].map(n => `
                <div class="nhsuk-radios__item">
                  <input class="nhsuk-radios__input" id="sm-${dim.id}-${n}" name="secondary_mood_${dim.id}" type="radio" value="${n}" />
                  <label class="nhsuk-label nhsuk-radios__label" for="sm-${dim.id}-${n}">${n}</label>
                </div>`).join('')}
            </div>
            <span class="app-mood-anchor" aria-hidden="true">${emoji5}</span>
          </div>
        </fieldset>
      </div>`
  }).join('')
}

// --- Momentum ---
function renderMomentum(items) {
  if (isMorning || !items?.length) return
  document.getElementById('momentum-section').style.display = ''
  document.getElementById('nav-momentum-item').style.display = ''
  document.getElementById('momentum-list').innerHTML = items.map(item => `
    <div class="nhsuk-form-group nhsuk-u-margin-top-3">
      <fieldset class="nhsuk-fieldset">
        <legend class="nhsuk-fieldset__legend nhsuk-label">
          <strong>${item.name}</strong>
        </legend>
        <div class="app-mood-scale-row">
          <span class="app-mood-anchor" aria-hidden="true">😢</span>
          <div class="nhsuk-radios nhsuk-radios--inline nhsuk-radios--small">
            ${[1,2,3,4,5].map(n => `
              <div class="nhsuk-radios__item">
                <input class="nhsuk-radios__input" id="mom-${item.id}-${n}" name="momentum_${item.id}" type="radio" value="${n}" />
                <label class="nhsuk-label nhsuk-radios__label" for="mom-${item.id}-${n}">${n}</label>
              </div>`).join('')}
          </div>
          <span class="app-mood-anchor" aria-hidden="true">😊</span>
        </div>
      </fieldset>
    </div>`).join('')

  if (existingRecord?.momentum_scores) {
    Object.entries(existingRecord.momentum_scores).forEach(([itemId, score]) => {
      const el = document.querySelector(`[name="momentum_${itemId}"][value="${score}"]`)
      if (el) el.checked = true
    })
  }
}

// --- Behaviours ---
async function loadBehaviours() {
  const list = document.getElementById('behaviours-list')
  try {
    const behaviours = await api.getBehaviours()
    if (!behaviours.length) {
      list.innerHTML = '<p class="nhsuk-body nhsuk-u-secondary-text-color">No events configured. Add them in <a href="/settings.html">Settings</a>.</p>'
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
    list.innerHTML = '<p class="nhsuk-body nhsuk-u-secondary-text-color">Could not load events.</p>'
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
      </div>`).join('')

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

// --- Exercise: type checkboxes auto-increment sessions ---
function setupExerciseTypeSync() {
  document.querySelectorAll('[name="exercise_types"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = document.querySelectorAll('[name="exercise_types"]:checked').length
      const input = document.getElementById('exercise_sessions')
      input.value = checked
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  })
}

// --- Duration input ---
let durationControl = null

function setupDurationInput() {
  const display = document.getElementById('exercise-duration-display')
  const hidden = document.getElementById('exercise_duration_minutes')
  const dec = document.getElementById('exercise-duration-dec')
  const inc = document.getElementById('exercise-duration-inc')
  if (!display || !hidden) return
  durationControl = initDurationInput(display, hidden, dec, inc)
  hidden.addEventListener('change', () => {
    markDirty('exercise_duration_minutes')
    scheduleAutoSave()
  })
}

// --- Alcohol unit count ---
function updateAlcoholCount() {
  const total = ['alcohol_spirits', 'alcohol_beer', 'alcohol_wine']
    .reduce((sum, id) => sum + (Number(document.getElementById(id)?.value) || 0), 0)
  const el = document.getElementById('alcohol-unit-count')
  if (!el) return
  el.textContent = total > 0 ? `(${total} unit${total === 1 ? '' : 's'})` : '(units)'
}

// --- Steppers ---
function setupSteppers() {
  document.querySelectorAll('.app-stepper__btn[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target)
      if (!input) return
      const delta = Number(btn.dataset.delta)
      input.value = Math.max(0, (Number(input.value) || 0) + delta)
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  })
  // Also update alcohol count when inputs change directly
  ;['alcohol_spirits', 'alcohol_beer', 'alcohol_wine'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateAlcoholCount)
    document.getElementById(id)?.addEventListener('input', updateAlcoholCount)
  })
}

// --- Dirty tracking ---
function markDirty(fieldName) {
  if (fieldName?.startsWith('secondary_mood_')) dirtyCategories.add('Mood')
  const cat = FIELD_CATEGORY[fieldName]
  if (cat) dirtyCategories.add(cat)
  if (isDirty) return
  isDirty = true
  if (existingRecord) document.getElementById('submit-btn').disabled = false
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

document.querySelectorAll('a[href]').forEach(link => {
  if (link.closest('#app-splash')) return
  link.addEventListener('click', (e) => {
    if (!isDirty) return
    e.preventDefault()
    showNavGuard(() => { location.href = link.href })
  })
})

history.replaceState({ guard: true }, '')
window.addEventListener('popstate', () => {
  if (bypassGuard || !isDirty) return
  history.pushState({ guard: true }, '')
  showNavGuard(() => { bypassGuard = true; history.go(-2) })
})

window.addEventListener('beforeunload', (e) => {
  if (isDirty) { e.preventDefault(); e.returnValue = '' }
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
  btn.disabled = true; btn.textContent = 'Deleting…'
  try {
    await api.deleteCheckin(existingRecord.id)
    isDirty = false
    location.href = '/'
  } catch (err) {
    document.getElementById('delete-modal').style.display = 'none'
    showError(`Could not delete: ${err.message}`)
    btn.disabled = false; btn.textContent = 'Delete'
  }
})

// --- Payload builder ---
function buildPayload(includeNotes = true) {
  const form = document.getElementById('checkin-form')
  const get = (name) => form.elements[name]?.value || null

  const exerciseTypes = [...form.querySelectorAll('[name="exercise_types"]:checked')].map(el => el.value)
  const supplementsObj = {}
  form.querySelectorAll('[name="supplement"]').forEach(el => { supplementsObj[el.value] = el.checked })
  const behavioursObj = {}
  form.querySelectorAll('[name="behaviour"]').forEach(el => { behavioursObj[el.value] = el.checked })

  // Secondary moods
  const secondaryMoods = {}
  form.querySelectorAll('[name^="secondary_mood_"]:checked').forEach(el => {
    const dimId = el.name.replace('secondary_mood_', '')
    secondaryMoods[dimId] = Number(el.value)
  })

  // Momentum scores
  const momentumScores = {}
  form.querySelectorAll('[name^="momentum_"]:checked').forEach(el => {
    const itemId = el.name.replace('momentum_', '')
    momentumScores[itemId] = Number(el.value)
  })

  const primaryMoodVal = get('primary_mood') ? Number(get('primary_mood')) : null

  return {
    check_in_type: type,
    check_in_date: today,
    primary_mood_morning: isMorning ? primaryMoodVal : null,
    primary_mood_eod: !isMorning ? primaryMoodVal : null,
    secondary_moods: Object.keys(secondaryMoods).length ? secondaryMoods : null,
    momentum_scores: Object.keys(momentumScores).length ? momentumScores : null,
    exercised: exerciseTypes.length > 0,
    exercise_types: exerciseTypes.length ? exerciseTypes : null,
    exercise_sessions: Number(get('exercise_sessions') || 0) || null,
    exercise_duration_minutes: durationControl ? (durationControl.getValue() || null) : null,
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

// --- Auto-save ---
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
  btn.disabled = true; btn.textContent = 'Saving…'
  try {
    const payload = buildPayload(true)
    await doSave(payload)
    savedNotesValue = document.getElementById('notes').value || null
    btn.textContent = 'Save notes'
    updateNotesBtnState()
  } catch {
    btn.disabled = false; btn.textContent = 'Save notes'
  }
})

// --- Form submission ---
document.getElementById('checkin-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = document.getElementById('submit-btn')
  btn.disabled = true; btn.textContent = 'Saving…'
  hideError()

  if (isMorning) {
    const bedtimeVal = document.getElementById('bedtime').value
    const wakeVal = document.getElementById('wake_time').value
    let sleepValid = true
    if (!bedtimeVal) {
      document.getElementById('bedtime-group').classList.add('nhsuk-form-group--error')
      document.getElementById('bedtime-error').style.display = ''
      sleepValid = false
    }
    if (!wakeVal) {
      document.getElementById('wake-time-group').classList.add('nhsuk-form-group--error')
      document.getElementById('wake-time-error').style.display = ''
      sleepValid = false
    }
    if (!sleepValid) {
      btn.disabled = false
      btn.textContent = existingRecord ? 'Save changes' : 'Submit check-in'
      document.getElementById('bedtime-group').scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
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
function hideError() { document.getElementById('error-banner').style.display = 'none' }

// --- New-user splash ---
function showNewUserSplash() {
  isDirty = false
  dirtyCategories.clear()
  document.getElementById('splash-loading').style.display = 'none'
  document.getElementById('splash-welcome').style.display = 'flex'
}

document.getElementById('splash-skip-btn')?.addEventListener('click', (e) => {
  e.preventDefault()
  showForm(null, null, [], [])
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

  if (!params.get('type') && !isPastDate && localHour >= 17 && type !== 'evening') {
    location.replace('/?type=evening')
    return
  }

  const fetchExisting = api.getTodayCheckin(type, today)
  const fetchMorning = type === 'morning' ? fetchExisting : api.getTodayCheckin('morning', today)
  const [existingRes, morningRes, configRes, behavioursRes, moodDimsRes, momentumRes] = await Promise.allSettled([
    fetchExisting,
    fetchMorning,
    api.getWeights(),
    api.getBehaviours(),
    api.getMoodDimensions(),
    api.getMomentumItems(),
  ])

  existingRecord = existingRes.status === 'fulfilled' ? existingRes.value : null
  const morningRecord = morningRes.status === 'fulfilled' ? morningRes.value : null
  const config = configRes.status === 'fulfilled' ? configRes.value : null
  const behaviours = behavioursRes.status === 'fulfilled' ? (behavioursRes.value ?? []) : []
  const moodDims = moodDimsRes.status === 'fulfilled' ? (moodDimsRes.value ?? []) : []
  const momentumItems = momentumRes.status === 'fulfilled' ? (momentumRes.value ?? []) : []

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
    updateAlcoholCount()
    showLastUpdated(existingRecord.submitted_at)
    document.getElementById('delete-section').style.display = ''
  }

  // On evening, pre-fill sleep from morning if not on the evening record
  if (!isMorning && !existingRecord?.sleep_quality && morningRecord) {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val }
    const setRadio = (name, val) => { if (!val) return; const el = document.querySelector(`[name="${name}"][value="${val}"]`); if (el) el.checked = true }
    setVal('bedtime', morningRecord.bedtime?.slice(0, 5))
    setVal('wake_time', morningRecord.wake_time?.slice(0, 5))
    setRadio('sleep_quality', morningRecord.sleep_quality)
    updateSleepDuration()
  }

  if (behaviours.length === 0 && moodDims.length === 0) {
    showNewUserSplash()
    return
  }

  await showForm(morningRecord, config, moodDims, momentumItems)
}

async function showForm(morningRecord = null, config = null, moodDims = [], momentumItems = []) {
  // Render dynamic sections before dirty tracking is set up
  renderEodSleep(morningRecord)
  renderMomentum(momentumItems)
  renderSecondaryMoods(moodDims, morningRecord)
  renderMorningMood(morningRecord)

  // Re-populate secondary mood values if editing existing record
  if (existingRecord?.secondary_moods) {
    Object.entries(existingRecord.secondary_moods).forEach(([dimId, score]) => {
      const el = document.querySelector(`[name="secondary_mood_${dimId}"][value="${score}"]`)
      if (el) el.checked = true
    })
  }

  loadSupplements()
  if (!isMorning) {
    loadBehaviours()
  }

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

  setupSteppers()
  setupExerciseTypeSync()
  if (!isMorning) {
    setupDurationInput()
    if (existingRecord?.exercise_duration_minutes) {
      durationControl?.setValue(existingRecord.exercise_duration_minutes)
    }
  }
  setupDirtyTracking()

  document.getElementById('page-loader').style.display = 'none'
  document.getElementById('main-content-row').style.display = ''
  hideSplash()
  loadWeather()
}

init()
