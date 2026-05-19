import { api } from '/api.js'

const MESSAGES = [
  'Well done!',
  'Nice one!',
  'Excellent work!',
  'Yippee!',
  'Brilliant!',
  "That's the one!",
  'Keep it up!',
  'Smashing it!',
  'You legend!',
  'Nailed it!',
]

const params = new URLSearchParams(location.search)
const id = params.get('id')
const type = params.get('type') || 'morning'

// Random celebratory heading
document.getElementById('celebration-heading').textContent =
  MESSAGES[Math.floor(Math.random() * MESSAGES.length)]

// "Edit this check-in" links back to the check-in page for today's type
// (the check-in page now pre-populates from the existing record)
document.getElementById('edit-link').href = `/?type=${type}`

async function init() {
  try {
    // Fetch the just-saved record and all recent check-ins in parallel
    const [current, allCheckins] = await Promise.all([
      api.getCheckin(id),
      api.getCheckins()
    ])

    renderStatus(current)
    renderMood(current, allCheckins)
  } catch {
    document.getElementById('status-message').textContent =
      type === 'morning' ? 'Morning check-in recorded' : 'Evening check-in recorded'
  }
}

function renderStatus(record) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
  const isToday = record.check_in_date === today
  const period = record.check_in_type === 'morning' ? 'morning' : 'evening'

  let when
  if (isToday) {
    when = record.check_in_type === 'morning' ? 'this morning' : 'this evening'
  } else {
    // Parse as local noon to avoid timezone date shifts
    const dt = new Date(record.check_in_date + 'T12:00:00')
    const dayName = dt.toLocaleDateString('en-GB', { weekday: 'long' })
    const datePart = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    when = `${dayName}, ${datePart}`
  }

  document.getElementById('status-message').textContent =
    `Check-in data recorded for ${when}`
}

function renderMood(current, allCheckins) {
  const currentMood = current.global_mood
  if (currentMood === null || currentMood === undefined) return

  // Find the most recent prior check-in with a mood rating (exclude current)
  const previous = allCheckins
    .filter(c => c.id !== current.id && c.global_mood !== null && c.global_mood !== undefined)
    .sort((a, b) => {
      const da = (a.submitted_at || a.check_in_date)
      const db = (b.submitted_at || b.check_in_date)
      return db > da ? 1 : -1
    })[0]

  document.getElementById('mood-value').textContent = currentMood
  document.getElementById('mood-card').style.display = ''

  const deltaEl = document.getElementById('mood-delta')
  if (!previous) {
    deltaEl.textContent = 'First mood rating recorded'
    return
  }

  const diff = currentMood - previous.global_mood
  if (diff > 0) {
    deltaEl.textContent = `↑ Up ${diff} point${diff === 1 ? '' : 's'} on your previous mood rating`
    deltaEl.style.color = '#007f3b'
  } else if (diff < 0) {
    deltaEl.textContent = `↓ Down ${Math.abs(diff)} point${Math.abs(diff) === 1 ? '' : 's'} on your previous mood rating`
    deltaEl.style.color = '#d5281b'
  } else {
    deltaEl.textContent = '→ Same as your previous mood rating'
  }
}

init()
