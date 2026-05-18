import { api } from '/api.js'

const params = new URLSearchParams(location.search)
const today = new Date().toISOString().slice(0, 10)
const hour = new Date().getHours()

// Determine type: ?type param → stored preference → time-based default
let type = params.get('type') || sessionStorage.getItem('checkin_type') || (hour < 14 ? 'morning' : 'evening')
if (params.get('type')) sessionStorage.setItem('checkin_type', type)

document.getElementById('page-heading').textContent = `${type === 'morning' ? 'Morning' : 'Evening'} check-in`
document.getElementById('checkin-date').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// Toggle active state
document.getElementById('toggle-morning').classList.toggle('active', type === 'morning')
document.getElementById('toggle-evening').classList.toggle('active', type === 'evening')

// Show/hide sleep section
document.getElementById('sleep-section').style.display = type === 'morning' ? '' : 'none'

// Exercise details toggle
document.getElementById('exercised').addEventListener('change', (e) => {
  document.getElementById('exercise-details').style.display = e.target.checked ? '' : 'none'
})

// Load supplements
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
        <input class="nhsuk-checkboxes__input" id="supp-${s.id}" name="supplement" type="checkbox" value="${s.name}">
        <label class="nhsuk-label nhsuk-checkboxes__label" for="supp-${s.id}">${s.name}</label>
      </div>
    `).join('')
  } catch {
    list.innerHTML = '<p class="nhsuk-body nhsuk-u-secondary-text-color">Could not load supplements.</p>'
  }
}

loadSupplements()

// Form submission
document.getElementById('checkin-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = document.getElementById('submit-btn')
  btn.disabled = true
  btn.textContent = 'Submitting…'
  hideError()

  const form = e.target
  const get = (name) => form.elements[name]?.value || null
  const bool = (name) => form.elements[name]?.checked || false

  const exerciseTypes = [...form.querySelectorAll('[name="exercise_types"]:checked')].map(el => el.value)
  const supplementChecks = [...form.querySelectorAll('[name="supplement"]:checked')].map(el => el.value)
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
    notes: get('notes') || null
  }

  if (type === 'morning') {
    payload.bedtime = get('bedtime') || null
    payload.wake_time = get('wake_time') || null
    payload.sleep_quality = get('sleep_quality') ? Number(get('sleep_quality')) : null
  }

  try {
    const result = await api.submitCheckin(payload)
    location.href = `/confirmation.html?id=${result.id}&type=${type}`
  } catch (err) {
    showError(err.message)
    btn.disabled = false
    btn.textContent = 'Submit check-in'
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
