import { api } from '/api.js'

const params = new URLSearchParams(location.search)
const id = params.get('id')

if (!id) {
  location.href = '/calendar.html'
}

let checkinType = 'morning'

function setRadio(name, value) {
  if (value == null) return
  const el = document.querySelector(`[name="${name}"][value="${value}"]`)
  if (el) el.checked = true
}

function setCheck(name, value) {
  const el = document.querySelector(`[name="${name}"]`)
  if (el) el.checked = !!value
}

function setInput(id, value) {
  const el = document.getElementById(id)
  if (el && value != null) el.value = value
}

async function loadCheckin() {
  try {
    const [checkin, supplements] = await Promise.all([
      api.getCheckin(id),
      api.getSupplements()
    ])

    checkinType = checkin.check_in_type

    document.getElementById('loading-msg').style.display = 'none'
    document.getElementById('checkin-form').style.display = ''
    document.getElementById('checkin-meta').textContent =
      `${checkin.check_in_type === 'morning' ? 'Morning' : 'Evening'} • ${new Date(checkin.check_in_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`

    // Sleep section
    const sleepSection = document.getElementById('sleep-section')
    sleepSection.style.display = checkin.check_in_type === 'morning' ? '' : 'none'
    if (checkin.check_in_type === 'morning') {
      setInput('bedtime', checkin.bedtime?.slice(0, 5))
      setInput('wake_time', checkin.wake_time?.slice(0, 5))
      setRadio('sleep_quality', checkin.sleep_quality)
    }

    // Mood & focus
    setRadio('global_mood', checkin.global_mood)
    setRadio('focus_financial', checkin.focus_financial)
    setRadio('focus_consulting', checkin.focus_consulting)
    setRadio('focus_opiner', checkin.focus_opiner)

    // Exercise
    setCheck('exercised', checkin.exercised)
    const exerciseDetails = document.getElementById('exercise-details')
    exerciseDetails.style.display = checkin.exercised ? '' : 'none'
    if (checkin.exercise_types) {
      for (const t of checkin.exercise_types) {
        const el = document.querySelector(`[name="exercise_types"][value="${t}"]`)
        if (el) el.checked = true
      }
    }
    setInput('session_count', checkin.session_count)

    // Alcohol
    setInput('alcohol_spirits', checkin.alcohol_spirits ?? 0)
    setInput('alcohol_beer', checkin.alcohol_beer ?? 0)
    setInput('alcohol_wine', checkin.alcohol_wine ?? 0)

    // Mindfulness
    setCheck('mindfulness_meditation', checkin.mindfulness_meditation)
    setCheck('mindfulness_yoga', checkin.mindfulness_yoga)

    // Supplements
    const suppList = document.getElementById('supplements-list')
    if (supplements.length) {
      suppList.innerHTML = supplements.map(s => `
        <div class="nhsuk-checkboxes__item">
          <input class="nhsuk-checkboxes__input" id="supp-${s.id}" name="supplement" type="checkbox" value="${s.name}"${checkin.supplements?.[s.name] ? ' checked' : ''}>
          <label class="nhsuk-label nhsuk-checkboxes__label" for="supp-${s.id}">${s.name}</label>
        </div>
      `).join('')
    } else {
      suppList.innerHTML = '<p class="nhsuk-body nhsuk-u-secondary-text-color">No supplements configured.</p>'
    }

    // Behaviours
    setCheck('outside_time', checkin.outside_time)
    setCheck('social_media', checkin.social_media)
    setCheck('p', checkin.p)
    setCheck('m', checkin.m)
    setCheck('s', checkin.s)

    // Notes
    setInput('notes', checkin.notes)

    // Exercise toggle
    document.getElementById('exercised').addEventListener('change', (e) => {
      document.getElementById('exercise-details').style.display = e.target.checked ? '' : 'none'
    })

  } catch (err) {
    document.getElementById('loading-msg').textContent = `Failed to load check-in: ${err.message}`
  }
}

document.getElementById('checkin-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = document.getElementById('submit-btn')
  btn.disabled = true
  btn.textContent = 'Saving…'
  hideError()

  const form = e.target
  const get = (name) => form.elements[name]?.value || null
  const bool = (name) => form.elements[name]?.checked || false

  const exerciseTypes = [...form.querySelectorAll('[name="exercise_types"]:checked')].map(el => el.value)
  const supplementsObj = {}
  form.querySelectorAll('[name="supplement"]').forEach(el => { supplementsObj[el.value] = el.checked })

  const payload = {
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

  if (checkinType === 'morning') {
    payload.bedtime = get('bedtime') || null
    payload.wake_time = get('wake_time') || null
    payload.sleep_quality = get('sleep_quality') ? Number(get('sleep_quality')) : null
  }

  try {
    await api.updateCheckin(id, payload)
    history.back()
  } catch (err) {
    showError(err.message)
    btn.disabled = false
    btn.textContent = 'Save changes'
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
    await api.deleteCheckin(id)
    location.href = '/calendar.html'
  } catch (err) {
    document.getElementById('delete-modal').style.display = 'none'
    showError(`Could not delete: ${err.message}`)
    btn.disabled = false
    btn.textContent = 'Delete'
  }
})

loadCheckin()
