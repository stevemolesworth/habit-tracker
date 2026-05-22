import { api } from '/api.js'
import { authReady } from '/auth.js'
import { wmoEmoji } from '/weather.js'

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
      const morning = entries.find(e => e.check_in_type === 'morning')
      const evening = entries.find(e => e.check_in_type === 'evening')

      const badges = document.createElement('div')
      badges.className = 'app-calendar__badges'
      if (morning) {
        const score = morning.global_mood ? morning.global_mood : ''
        badges.insertAdjacentHTML('beforeend', `<span class="app-badge app-badge--morning">M${score}</span>`)
      }
      if (evening) {
        const score = evening.global_mood ? evening.global_mood : ''
        badges.insertAdjacentHTML('beforeend', `<span class="app-badge app-badge--evening">E${score}</span>`)
      }
      cell.appendChild(badges)

      const wx = (evening || morning)?.weather_snapshot
      if (wx) {
        const temps = wx.hourly?.map(h => h.temp).filter(t => t != null) ?? []
        const avgTemp = temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : wx.current?.temp
        const codes = wx.hourly?.map(h => h.code).filter(c => c != null) ?? []
        const code = codes.length
          ? codes.sort((a, b) => codes.filter(c => c === b).length - codes.filter(c => c === a).length)[0]
          : wx.current?.code
        if (avgTemp != null || code != null) {
          const wxEl = document.createElement('div')
          wxEl.className = 'app-calendar__weather'
          wxEl.textContent = [code != null ? wmoEmoji(code) : '', avgTemp != null ? `${avgTemp}°` : ''].join(' ').trim()
          cell.appendChild(wxEl)
        }
      }
    }

    if (dateStr <= todayStr) {
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

  const chevron = `<svg class="nhsuk-icon nhsuk-icon__chevron-right" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" height="34" width="34"><path d="M15.5 12a1 1 0 0 1-.29.71l-5 5a1 1 0 0 1-1.42-1.42l4.3-4.29-4.3-4.29a1 1 0 0 1 1.42-1.42l5 5a1 1 0 0 1 .29.71z"></path></svg>`

  const cards = entries.map(entry => {
    const typeLabel = entry.check_in_type === 'morning' ? 'Morning' : 'End of day'
    const badge = entry.check_in_type === 'morning'
      ? '<span class="app-badge app-badge--morning" style="font-size:0.75rem;padding:2px 6px;vertical-align:middle">M</span>'
      : '<span class="app-badge app-badge--evening" style="font-size:0.75rem;padding:2px 6px;vertical-align:middle">E</span>'
    const details = [
      entry.global_mood ? `Mood: ${entry.global_mood}` : '',
      entry.exercised ? 'Exercised ✓' : '',
      entry.notes ? `"${entry.notes}"` : ''
    ].filter(Boolean).join(' · ')

    return `
      <div class="nhsuk-card nhsuk-card--clickable" style="margin-bottom:16px">
        <div class="nhsuk-card__content">
          <h3 class="nhsuk-card__heading nhsuk-heading-s" style="margin-bottom:${details ? '4px' : '0'}">
            <a class="nhsuk-card__link" href="/edit.html?id=${entry.id}">${badge} ${typeLabel}</a>
          </h3>
          ${details ? `<p class="nhsuk-card__description nhsuk-body-s" style="margin:0;color:#4c6272">${details}</p>` : ''}
          ${chevron}
        </div>
      </div>
    `
  }).join('')

  const addButtons = [
    !hasMorning ? `<a href="/?type=morning&date=${dateStr}" class="nhsuk-button nhsuk-button--secondary" style="margin-right:12px">Add morning check-in</a>` : '',
    !hasEvening ? `<a href="/?type=evening&date=${dateStr}" class="nhsuk-button nhsuk-button--secondary">Add end of day check-in</a>` : ''
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

authReady.then(() => loadMonth())
