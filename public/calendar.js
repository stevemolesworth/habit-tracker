import { api } from '/api.js'

const today = new Date()
let viewYear = today.getFullYear()
let viewMonth = today.getMonth() + 1 // 1-based

let cachedCheckins = []

async function loadMonth() {
  const monthStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`
  document.getElementById('month-label').textContent =
    new Date(viewYear, viewMonth - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  try {
    const checkins = await api.getCheckins(monthStr)
    cachedCheckins = checkins
    renderGrid(checkins, viewYear, viewMonth)
  } catch (err) {
    console.error('Failed to load month:', err)
  }
}

function renderGrid(checkins, year, month) {
  const grid = document.getElementById('calendar-grid')
  // Remove day cells (keep the 7 header cells)
  const cells = grid.querySelectorAll('.app-calendar__day, .app-calendar__day--empty')
  cells.forEach(c => c.remove())

  const firstDay = new Date(year, month - 1, 1)
  // ISO week: Monday=0 … Sunday=6
  const startOffset = (firstDay.getDay() + 6) % 7

  const daysInMonth = new Date(year, month, 0).getDate()
  const todayStr = today.toISOString().slice(0, 10)

  // Index checkins by date
  const byDate = {}
  for (const c of checkins) {
    if (!byDate[c.check_in_date]) byDate[c.check_in_date] = []
    byDate[c.check_in_date].push(c)
  }

  // Blank cells before first day
  for (let i = 0; i < startOffset; i++) {
    const blank = document.createElement('div')
    blank.className = 'app-calendar__day app-calendar__day--empty'
    grid.appendChild(blank)
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const entries = byDate[dateStr] || []

    const cell = document.createElement('div')
    cell.className = 'app-calendar__day' + (dateStr === todayStr ? ' app-calendar__day--today' : '')
    cell.dataset.date = dateStr

    const num = document.createElement('span')
    num.className = 'app-calendar__day-number'
    num.textContent = d
    cell.appendChild(num)

    if (entries.length) {
      const badges = document.createElement('div')
      badges.className = 'app-calendar__badges'
      if (entries.find(e => e.check_in_type === 'morning')) {
        badges.insertAdjacentHTML('beforeend', '<span class="app-badge app-badge--morning">M</span>')
      }
      if (entries.find(e => e.check_in_type === 'evening')) {
        badges.insertAdjacentHTML('beforeend', '<span class="app-badge app-badge--evening">E</span>')
      }
      cell.appendChild(badges)

      cell.addEventListener('click', () => showDayDetail(dateStr, entries))
      cell.style.cursor = 'pointer'
    }

    grid.appendChild(cell)
  }
}

function showDayDetail(dateStr, entries) {
  const panel = document.getElementById('day-detail')
  const title = document.getElementById('day-detail-title')
  const content = document.getElementById('day-detail-content')

  title.textContent = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const hasMorning = entries.some(e => e.check_in_type === 'morning')
  const hasEvening = entries.some(e => e.check_in_type === 'evening')

  const cards = entries.map(entry => {
    const typeLabel = entry.check_in_type === 'morning' ? 'Morning' : 'Evening'
    const badge = entry.check_in_type === 'morning'
      ? '<span class="app-badge app-badge--morning" style="font-size:0.75rem;padding:2px 6px">M</span>'
      : '<span class="app-badge app-badge--evening" style="font-size:0.75rem;padding:2px 6px">E</span>'

    return `
      <div class="nhsuk-card" style="margin-bottom:16px">
        <div class="nhsuk-card__content">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
            <h3 class="nhsuk-heading-s" style="margin:0">${badge} ${typeLabel}</h3>
            <a href="/edit.html?id=${entry.id}" class="nhsuk-link">Edit</a>
          </div>
          ${entry.global_mood ? `<p class="nhsuk-body-s" style="margin:0">Mood: ${entry.global_mood}/5</p>` : ''}
          ${entry.exercised ? `<p class="nhsuk-body-s" style="margin:0">Exercised ✓</p>` : ''}
          ${entry.notes ? `<p class="nhsuk-body-s" style="margin:4px 0 0;color:#4c6272">"${entry.notes}"</p>` : ''}
        </div>
      </div>
    `
  }).join('')

  const addButtons = [
    !hasMorning ? `<a href="/?type=morning&date=${dateStr}" class="nhsuk-button nhsuk-button--secondary" style="margin-right:12px">Add morning check-in</a>` : '',
    !hasEvening ? `<a href="/?type=evening&date=${dateStr}" class="nhsuk-button nhsuk-button--secondary">Add evening check-in</a>` : ''
  ].filter(Boolean).join('')

  content.innerHTML = cards + (addButtons ? `<div style="margin-top:8px">${addButtons}</div>` : '')

  panel.style.display = ''
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

document.getElementById('prev-month').addEventListener('click', () => {
  viewMonth--
  if (viewMonth < 1) { viewMonth = 12; viewYear-- }
  loadMonth()
})

document.getElementById('next-month').addEventListener('click', () => {
  viewMonth++
  if (viewMonth > 12) { viewMonth = 1; viewYear++ }
  loadMonth()
})

loadMonth()
