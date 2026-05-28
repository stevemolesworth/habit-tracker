import { api, clearCache } from '/api.js'
import { authReady } from '/auth.js'
import { geocode, reverseGeocode, fetchWeather, buildWeatherStrip } from '/weather.js'
import { initDurationInput } from '/duration-input.js'
import { showToast } from '/toast.js'

// Splash background — responsive random image
const _bgIdx = Math.floor(Math.random() * 3) + 1
const _bgSize = window.innerWidth < 768 ? 'sm' : 'lg'
document.getElementById('app-splash').style.backgroundImage =
  `url('/gfx/bg${String(_bgIdx).padStart(3, '0')}-${_bgSize}@1x.jpg')`
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

let type = params.get('type') || (localHour < 17 ? 'morning' : 'evening')

const isMorning = type === 'morning'

// State
let existingRecord = null
let currentLocation = null
let currentWeatherData = null
let isDirty = false
const dirtyCategories = new Set()
let alcoholLogged = null // null = not answered, true = yes, false = no

const FIELD_CATEGORY = {
  bedtime: 'Sleep', wake_time: 'Sleep', sleep_quality: 'Sleep',
  primary_mood: 'Mood', secondary_mood_: 'Mood',
  momentum_: 'Projects',
  exercise_types: 'Exercise', exercise_sessions: 'Exercise', exercise_duration_minutes: 'Exercise',
  alcohol_logged: 'Alcohol', alcohol_spirits: 'Alcohol', alcohol_beer: 'Alcohol', alcohol_wine: 'Alcohol',
  supplement: 'Supplements',
  behaviour: 'Events',
  goals_today_: 'Reflections', highlights_: 'Reflections', goals_tomorrow_: 'Reflections',
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
  `${isMorning ? 'Morning check-in ☀️' : 'End of day check-in 🌙'}<span class="nhsuk-caption-l">${dateCaption}</span>`

const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: userTZ }).format(new Date(Date.now() - 86400000))

// Show/hide sections
if (!isMorning) document.getElementById('sleep-section').style.display = 'none' // renderEodSleep shows it after data loads
document.getElementById('events-section').style.display = isMorning ? 'none' : ''
document.getElementById('momentum-section').style.display = 'none' // renderMomentum shows it if items exist
document.getElementById('checkin-inpage-nav').style.display = isMorning ? 'none' : ''
document.getElementById('goals-today-section').style.display = isMorning ? '' : 'none'
document.getElementById('reflections-section').style.display = isMorning ? 'none' : ''

// --- Weather ---
function setLocationLabel(label) {
  const el = document.getElementById('weather-location-label')
  const btn = document.getElementById('weather-toggle-location-btn')
  if (label) {
    el.textContent = `📍 ${label}`
    btn.textContent = 'Change'
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
    currentWeatherData = await fetchWeather(currentLocation, today, (fresh) => {
      currentWeatherData = fresh
      strip.innerHTML = buildWeatherStrip(fresh, type)
    })
    strip.innerHTML = buildWeatherStrip(currentWeatherData, type)
    if (existingRecord) {
      const locationChanged = currentLocation.lat !== existingRecord.weather_lat || currentLocation.lng !== existingRecord.weather_lng
      const snapshotChanged = JSON.stringify(currentWeatherData.hourly) !== JSON.stringify(existingRecord.weather_snapshot?.hourly)
      if (locationChanged || snapshotChanged) { scheduleAutoSave() }
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

  // Alcohol — backward compat: infer true if units recorded but no alcohol_logged column yet
  const inferredLogged = record.alcohol_logged !== null && record.alcohol_logged !== undefined
    ? record.alcohol_logged
    : (record.alcohol_spirits !== null || record.alcohol_beer !== null || record.alcohol_wine !== null) ? true : null
  if (inferredLogged !== null) {
    setAlcohol(inferredLogged)
    document.getElementById(inferredLogged ? 'alcohol_logged_yes' : 'alcohol_logged_no').checked = true
    if (inferredLogged) {
      setVal('alcohol_spirits', record.alcohol_spirits ?? 0)
      setVal('alcohol_beer', record.alcohol_beer ?? 0)
      setVal('alcohol_wine', record.alcohol_wine ?? 0)
    }
  }

  ;['goals_today', 'highlights', 'goals_tomorrow'].forEach(field => {
    record[field]?.forEach((v, i) => {
      const el = document.getElementById(`${field}_${i + 1}`)
      if (el && v) el.value = v
    })
  })

  if (record.weather_lat) {
    currentLocation = { lat: record.weather_lat, lng: record.weather_lng, label: record.weather_location_label || '' }
    document.getElementById('weather-location-input').value = record.weather_location_label || ''
    setLocationLabel(currentLocation.label)
  } else if (record.weather_postcode) {
    document.getElementById('weather-location-input').value = record.weather_postcode
  }
}

// --- EOD sleep summary ---
const SLEEP_QUALITY_LABEL = { 1: 'Bad', 2: 'Not great', 3: 'Okay', 4: 'Good', 5: 'Excellent' }

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
    if (quality) text += (text ? ` · Quality: ${quality}` : `Quality: ${quality}`)
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

function moodDots(val) {
  const dots = Array.from({ length: 5 }, (_, i) => i < val ? '●' : '○').join('')
  return `<span aria-hidden="true">${dots}</span><span class="nhsuk-u-visually-hidden">${val} out of 5</span>`
}

// --- Morning mood shown on EOD check-in ---
function renderMorningMood(morningRecord) {
  const display = document.getElementById('morning-mood-display')
  const value = document.getElementById('morning-mood-value')
  if (!isMorning && morningRecord?.primary_mood_morning) {
    value.innerHTML = moodDots(morningRecord.primary_mood_morning)
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
      ? `<span class="app-mood-morning-hint"> — this morning: ${moodDots(morningVal)}</span>`
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
            ${[1,2,3,4,5].map(n => `
              <div class="nhsuk-radios__item">
                <input class="nhsuk-radios__input" id="sm-${dim.id}-${n}" name="secondary_mood_${dim.id}" type="radio" value="${n}" />
                <label class="nhsuk-label nhsuk-radios__label" for="sm-${dim.id}-${n}">${n}</label>
              </div>`).join('')}
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
          ${[1,2,3,4,5].map(n => `
            <div class="nhsuk-radios__item">
              <input class="nhsuk-radios__input" id="mom-${item.id}-${n}" name="momentum_${item.id}" type="radio" value="${n}" />
              <label class="nhsuk-label nhsuk-radios__label" for="mom-${item.id}-${n}">${n}</label>
            </div>`).join('')}
          <span class="app-mood-anchor" aria-hidden="true">🔥</span>
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
}

// --- Alcohol yes/no + unit count ---
function setAlcohol(val) {
  alcoholLogged = val
  const units = document.getElementById('alcohol-units')
  if (units) units.style.display = val ? '' : 'none'
  if (val === false) {
    ;['alcohol_spirits', 'alcohol_beer', 'alcohol_wine'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.value = 0
    })
  }
  updateAlcoholCount()
}

function updateAlcoholCount() {
  const el = document.getElementById('alcohol-unit-count')
  if (!el) return
  if (alcoholLogged === null) { el.textContent = '— not logged'; return }
  if (alcoholLogged === false) { el.textContent = '— none'; return }
  const total = ['alcohol_spirits', 'alcohol_beer', 'alcohol_wine']
    .reduce((sum, id) => sum + (Number(document.getElementById(id)?.value) || 0), 0)
  el.textContent = total > 0 ? `(${total} unit${total === 1 ? '' : 's'})` : '(0 units)'
}

// --- Steppers ---
const ALCOHOL_IDS = new Set(['alcohol_spirits', 'alcohol_beer', 'alcohol_wine'])

function setupSteppers() {
  document.querySelectorAll('.app-stepper__btn[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target)
      if (!input) return
      if (ALCOHOL_IDS.has(btn.dataset.target)) { setAlcohol(true); document.getElementById('alcohol_logged_yes').checked = true }
      const delta = Number(btn.dataset.delta)
      input.value = Math.max(0, (Number(input.value) || 0) + delta)
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  })
  // Update alcohol count when unit inputs change
  ;['alcohol_spirits', 'alcohol_beer', 'alcohol_wine'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateAlcoholCount)
    document.getElementById(id)?.addEventListener('input', updateAlcoholCount)
  })
  // Wire Yes/No radios
  document.querySelectorAll('input[name="alcohol_logged"]').forEach(radio => {
    radio.addEventListener('change', () => setAlcohol(radio.value === 'yes'))
  })
}

// --- Dirty tracking ---
function markDirty(fieldName) {
  if (fieldName?.startsWith('secondary_mood_')) dirtyCategories.add('Mood')
  if (fieldName?.startsWith('momentum_')) dirtyCategories.add('Projects')
  if (fieldName?.startsWith('goals_today_') || fieldName?.startsWith('highlights_') || fieldName?.startsWith('goals_tomorrow_')) dirtyCategories.add('Reflections')
  const cat = FIELD_CATEGORY[fieldName]
  if (cat) dirtyCategories.add(cat)
  if (isDirty) return
  isDirty = true
  const btn = document.getElementById('checkin-save-btn')
  if (btn) btn.disabled = false
}

function setupDirtyTracking() {
  const form = document.getElementById('checkin-form')
  form.addEventListener('input', e => { markDirty(e.target.name || e.target.id); scheduleAutoSave() })
  form.addEventListener('change', e => { markDirty(e.target.name || e.target.id); scheduleAutoSave() })
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
  if (link.getAttribute('href').startsWith('#')) return
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
  if (isDirty && !bypassGuard) { e.preventDefault(); e.returnValue = '' }
})

document.getElementById('nav-logout-btn')?.addEventListener('click', () => { bypassGuard = true })


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
function buildPayload() {
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
    alcohol_logged: alcoholLogged,
    alcohol_spirits: alcoholLogged ? Number(get('alcohol_spirits') || 0) : null,
    alcohol_beer: alcoholLogged ? Number(get('alcohol_beer') || 0) : null,
    alcohol_wine: alcoholLogged ? Number(get('alcohol_wine') || 0) : null,
    supplements: Object.keys(supplementsObj).length ? supplementsObj : null,
    behaviours: Object.keys(behavioursObj).length ? behavioursObj : null,
    goals_today: [1,2,3].map(n => document.getElementById(`goals_today_${n}`)?.value.trim() || null).filter(Boolean) || null,
    goals_today_completed: isMorning ? null : (() => {
      const divs = document.querySelectorAll('#morning-goals-list .app-goal-completion')
      if (!divs.length) return null
      return Array.from(divs).map((_, i) => document.querySelector(`input[name="goal_completed_${i}"]:checked`)?.value ?? null)
    })(),
    highlights: [1,2,3].map(n => document.getElementById(`highlights_${n}`)?.value.trim() || null).filter(Boolean) || null,
    goals_tomorrow: [1,2,3].map(n => document.getElementById(`goals_tomorrow_${n}`)?.value.trim() || null).filter(Boolean) || null,
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
  }
  if (currentLocation) {
    api.updateWeights({ default_location_lat: currentLocation.lat, default_location_lng: currentLocation.lng, default_location_label: currentLocation.label }).catch(() => {})
  }
  return result
}

// --- Auto-save ---
let autoSaveTimer = null
let autoSaveToastTimer = null

async function autoSave() {
  try {
    const payload = buildPayload()
    await doSave(payload)
    const saved = [...dirtyCategories]
    dirtyCategories.clear()
    isDirty = false
    const btn = document.getElementById('checkin-save-btn')
    if (btn) btn.disabled = true
    clearTimeout(autoSaveToastTimer)
    const label = saved.length ? `Saved · ${saved.join(', ')}` : 'Saved'
    autoSaveToastTimer = setTimeout(() => showToast(label), 1500)
  } catch {
    clearTimeout(autoSaveToastTimer)
    showToast('Could not auto-save', 'error')
  }
}

document.getElementById('checkin-save-btn')?.addEventListener('click', () => {
  clearTimeout(autoSaveTimer)
  autoSave()
})

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(autoSave, 1200)
}



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

// --- Carry-forward display ---
function renderCarryForward(yesterdayEveningRecord, morningRecord) {
  if (isMorning) {
    const goals = yesterdayEveningRecord?.goals_tomorrow?.filter(Boolean)
    if (goals?.length) {
      document.getElementById('goals-carry-forward-list').innerHTML = goals.map(g => `<li>${g}</li>`).join('')
      document.getElementById('goals-carry-forward').style.display = ''
    }
  } else {
    const goals = morningRecord?.goals_today?.filter(Boolean) ?? []
    if (goals.length) {
      const saved = existingRecord?.goals_today_completed ?? []
      document.getElementById('morning-goals-list').innerHTML = goals.map((g, i) => `
        <div class="app-goal-completion nhsuk-u-margin-bottom-3" data-idx="${i}">
          <p class="nhsuk-body-s nhsuk-u-margin-bottom-1">${g}</p>
          <div class="nhsuk-radios nhsuk-radios--inline nhsuk-radios--small">
            <div class="nhsuk-radios__item">
              <input class="nhsuk-radios__input" id="gc-${i}-achieved" name="goal_completed_${i}" type="radio" value="achieved" ${saved[i] === 'achieved' ? 'checked' : ''} />
              <label class="nhsuk-label nhsuk-radios__label" style="white-space:nowrap" for="gc-${i}-achieved">Did it</label>
            </div>
            <div class="nhsuk-radios__item">
              <input class="nhsuk-radios__input" id="gc-${i}-not" name="goal_completed_${i}" type="radio" value="not_achieved" ${saved[i] === 'not_achieved' ? 'checked' : ''} />
              <label class="nhsuk-label nhsuk-radios__label" style="white-space:nowrap" for="gc-${i}-not">Didn't do it</label>
            </div>
          </div>
        </div>
      `).join('')
      goals.forEach((_, i) => {
        document.getElementById(`gc-${i}-achieved`)?.addEventListener('change', () => {
          // eslint-disable-next-line no-undef
          if (typeof confetti === 'function') confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } })
        })
      })
      document.getElementById('morning-goals-display').style.display = ''
    }
  }
}

function fetchAllData() {
  const fetchExisting = api.getTodayCheckin(type, today)
  const fetchMorning = type === 'morning' ? fetchExisting : api.getTodayCheckin('morning', today)
  const fetchYesterdayEvening = api.getTodayCheckin('evening', yesterday)
  return Promise.allSettled([
    fetchExisting,
    fetchMorning,
    fetchYesterdayEvening,
    api.getWeights(),
    api.getBehaviours(),
    api.getMoodDimensions(),
    api.getMomentumItems(),
  ])
}

// --- Init ---
function renderCheckinNav() {
  const el = document.getElementById('checkin-quick-nav')
  if (!el) return
  const btn = (label, href) =>
    `<a href="${href}" class="nhsuk-button nhsuk-button--secondary nhsuk-button--small" style="margin: 0">${label}</a>`
  if (isMorning) {
    el.innerHTML =
      btn('View yesterday', `/?type=evening&date=${yesterday}`) +
      btn('View end of today', `/?type=evening`)
  } else {
    el.innerHTML =
      btn('View this morning', `/?type=morning`) +
      btn('View yesterday', `/?type=evening&date=${yesterday}`)
  }
}

async function init() {
  const stallTimer = setTimeout(() => {
    document.querySelector('.app-splash__text').textContent = 'Taking longer than expected…'
    document.querySelector('.app-splash__subtext').innerHTML =
      '<button onclick="location.reload()" class="nhsuk-button nhsuk-button--reverse" style="margin-top:12px">Tap to retry</button>'
  }, 12000)

  try {
    await authReady
  } catch {
    clearTimeout(stallTimer)
    document.querySelector('.app-splash__text').textContent = 'Could not connect'
    document.querySelector('.app-splash__subtext').innerHTML =
      '<button onclick="location.reload()" class="nhsuk-button nhsuk-button--reverse" style="margin-top:12px">Tap to retry</button>'
    return
  }

  if (!params.get('type') && !isPastDate && localHour >= 17 && type !== 'evening') {
    location.replace('/?type=evening')
    return
  }

  document.querySelector('.app-splash__text').textContent = 'Loading your check-in'
  document.querySelector('.app-splash__subtext').textContent = 'Almost there…'

  let results = await fetchAllData()
  const failCount = results.filter(r => r.status === 'rejected').length
  if (failCount >= 2) {
    clearTimeout(stallTimer)
    document.querySelector('.app-splash__subtext').textContent = 'Retrying…'
    await new Promise(r => setTimeout(r, 1000))
    results = await fetchAllData()
  }
  const [existingRes, morningRes, yesterdayEveningRes, configRes, behavioursRes, moodDimsRes, momentumRes] = results

  // Discard any cached record that belongs to a different user (stale cache guard)
  const _uid = localStorage.getItem('cci-user-id')
  const _ownedBy = r => !r?.user_id || !_uid || r.user_id === _uid
  existingRecord = existingRes.status === 'fulfilled' && _ownedBy(existingRes.value) ? existingRes.value : null
  const morningRecord = morningRes.status === 'fulfilled' && _ownedBy(morningRes.value) ? morningRes.value : null
  const yesterdayEveningRecord = yesterdayEveningRes.status === 'fulfilled' && _ownedBy(yesterdayEveningRes.value) ? yesterdayEveningRes.value : null
  const config = configRes.status === 'fulfilled' ? configRes.value : null
  const behaviours = behavioursRes.status === 'fulfilled' ? (behavioursRes.value ?? []) : []
  const moodDims = moodDimsRes.status === 'fulfilled' ? (moodDimsRes.value ?? []) : []
  const momentumItems = momentumRes.status === 'fulfilled' ? (momentumRes.value ?? []) : []

  const morningDone = morningRecord && (
    morningRecord.sleep_quality != null ||
    morningRecord.bedtime != null ||
    morningRecord.wake_time != null ||
    morningRecord.primary_mood_morning != null ||
    (morningRecord.secondary_moods && Object.keys(morningRecord.secondary_moods).length > 0) ||
    (morningRecord.goals_today?.filter(Boolean).length > 0)
  )

  if (!params.get('type') && !isPastDate && localHour < 17 && morningDone) {
    location.replace('/?type=evening')
    return
  }

  clearTimeout(stallTimer)
  renderCheckinNav()

  if (existingRecord) {
    populateForm(existingRecord)
    updateAlcoholCount()
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

  await showForm(morningRecord, config, moodDims, momentumItems, yesterdayEveningRecord)
}

async function showForm(morningRecord = null, config = null, moodDims = [], momentumItems = [], yesterdayEveningRecord = null) {
  // Yesterday's alcohol hint
  if (yesterdayEveningRecord) {
    const s = yesterdayEveningRecord.alcohol_spirits, b = yesterdayEveningRecord.alcohol_beer, w = yesterdayEveningRecord.alcohol_wine
    if (s !== null || b !== null || w !== null) {
      const total = Math.round(((s || 0) + (b || 0) + (w || 0)) * 10) / 10
      if (total > 0) {
        const el = document.getElementById('yesterday-alcohol')
        if (el) { el.textContent = `Alcohol yesterday: ${total} unit${total === 1 ? '' : 's'}`; el.style.display = '' }
      }
    }
  }

  // Render dynamic sections before dirty tracking is set up
  renderEodSleep(morningRecord)
  renderMomentum(momentumItems)
  renderSecondaryMoods(moodDims, morningRecord)
  renderMorningMood(morningRecord)
  renderCarryForward(yesterdayEveningRecord, morningRecord)

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
