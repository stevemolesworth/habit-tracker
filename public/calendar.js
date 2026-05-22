import { api } from '/api.js'
import { authReady } from '/auth.js'
import { wmoEmoji } from '/weather.js'

const today = new Date()
let viewYear = today.getFullYear()
let viewMonth = today.getMonth() + 1 // 1-based

let cachedCheckins = []
let behaviourEmojiMap = {} // name → emoji string
let moodDimMap = {}        // id → { name, five_is_good }
let momentumItemMap = {}   // id → name

async function loadMonth() {
  const monthStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`
  document.getElementById('month-label').textContent =
    new Date(viewYear, viewMonth - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  try {
    const mapsLoaded = Object.keys(behaviourEmojiMap).length > 0
    const [checkins, behaviours, moodDims, momentumItems] = await Promise.all([
      api.getCheckins(monthStr),
      mapsLoaded ? Promise.resolve(null) : api.getBehaviours(),
      mapsLoaded ? Promise.resolve(null) : api.getMoodDimensions(),
      mapsLoaded ? Promise.resolve(null) : api.getMomentumItems(),
    ])
    cachedCheckins = checkins
    if (behaviours) {
      behaviourEmojiMap = Object.fromEntries(
        behaviours.map(b => [b.name, b.weight > 0 ? '👍'.repeat(b.weight) : b.weight < 0 ? '💩'.repeat(-b.weight) : ''])
      )
    }
    if (moodDims) moodDimMap = Object.fromEntries(moodDims.map(d => [String(d.id), d]))
    if (momentumItems) momentumItemMap = Object.fromEntries(momentumItems.map(i => [String(i.id), i.name]))
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
        const score = morning.primary_mood_morning ?? ''
        badges.insertAdjacentHTML('beforeend', `<span class="app-badge app-badge--morning">M${score}</span>`)
      }
      if (evening) {
        const score = evening.primary_mood_eod ?? ''
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

const SLEEP_LABELS = { 1: 'Bad', 2: 'Average', 3: 'Good' }

function showDayDetail(dateStr, entries) {
  const panel = document.getElementById('day-detail')
  const title = document.getElementById('day-detail-title')
  const content = document.getElementById('day-detail-content')

  title.textContent = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const morning = entries.find(e => e.check_in_type === 'morning')
  const evening = entries.find(e => e.check_in_type === 'evening')

  if (!entries.length) {
    content.innerHTML = `
      <a href="/?type=morning&date=${dateStr}" class="nhsuk-button nhsuk-button--secondary" style="margin-right:12px">Add morning check-in</a>
      <a href="/?type=evening&date=${dateStr}" class="nhsuk-button nhsuk-button--secondary">Add end of day check-in</a>`
    panel.style.display = ''
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    return
  }

  const row = (label, value) => value
    ? `<p class="nhsuk-body-s" style="margin-bottom:6px"><strong>${label}</strong> &middot; ${value}</p>`
    : ''

  const listBlock = (label, items) => {
    const filtered = items?.filter(Boolean)
    if (!filtered?.length) return ''
    return `<p class="nhsuk-body-s nhsuk-u-margin-bottom-1"><strong>${label}</strong></p>
      <ul class="nhsuk-list nhsuk-list--bullet nhsuk-body-s" style="margin-bottom:8px">${filtered.map(i => `<li>${i}</li>`).join('')}</ul>`
  }

  // Sleep
  let sleepText = ''
  const sleepSrc = morning || evening
  if (sleepSrc?.hours_slept || sleepSrc?.sleep_quality) {
    const h = sleepSrc.hours_slept ? Math.floor(sleepSrc.hours_slept) : 0
    const m = sleepSrc.hours_slept ? Math.round((sleepSrc.hours_slept % 1) * 60) : 0
    const parts = [...(h > 0 ? [`${h}h`] : []), ...(m > 0 ? [`${m}m`] : [])]
    sleepText = [...(parts.length ? [`Slept ${parts.join(' ')}`] : []), ...(SLEEP_LABELS[sleepSrc.sleep_quality] ? [SLEEP_LABELS[sleepSrc.sleep_quality]] : [])].join(' · ')
  }

  // Exercise
  let exerciseText = ''
  if (evening?.exercised) {
    const types = evening.exercise_types?.length ? evening.exercise_types.join(', ') : 'Yes'
    const dur = evening.exercise_duration_minutes
    const durStr = dur ? (() => { const h = Math.floor(dur / 60); const m = dur % 60; return [h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : ''].filter(Boolean).join(' ') })() : ''
    exerciseText = [types, durStr].filter(Boolean).join(' · ')
  }

  // Secondary moods (morning + evening combined)
  let secondaryMoodsText = ''
  const allSecondary = { ...(morning?.secondary_moods ?? {}), ...(evening?.secondary_moods ?? {}) }
  const secondaryEntries = Object.entries(allSecondary)
    .map(([id, score]) => moodDimMap[id] ? `${moodDimMap[id].name}: ${score}` : null)
    .filter(Boolean)
  if (secondaryEntries.length) secondaryMoodsText = secondaryEntries.join(', ')

  // Momentum
  let momentumText = ''
  if (evening?.momentum_scores) {
    const entries = Object.entries(evening.momentum_scores)
      .map(([id, score]) => momentumItemMap[id] ? `${momentumItemMap[id]}: ${score}` : null)
      .filter(Boolean)
    if (entries.length) momentumText = entries.join(', ')
  }

  // Behaviours
  let behavioursText = ''
  if (evening?.behaviours) {
    const checked = Object.entries(evening.behaviours)
      .filter(([, v]) => v)
      .map(([k]) => { const emoji = behaviourEmojiMap[k]; return emoji ? `${k} ${emoji}` : k })
    if (checked.length) behavioursText = checked.join(', ')
  }

  // Moods
  const mMorning = morning?.primary_mood_morning ?? '—'
  const mEvening = evening?.primary_mood_eod ?? '—'

  const addButtons = [
    !morning ? `<a href="/?type=morning&date=${dateStr}" class="nhsuk-button nhsuk-button--secondary nhsuk-button--small" style="margin:0">Add morning check-in</a>` : '',
    !evening ? `<a href="/?type=evening&date=${dateStr}" class="nhsuk-button nhsuk-button--secondary nhsuk-button--small" style="margin:0">Add end of day check-in</a>` : ''
  ].filter(Boolean)

  content.innerHTML = `
    <div class="nhsuk-card">
      <div class="nhsuk-card__content">
        <div style="display:flex;gap:16px;margin-bottom:12px">
          <div style="flex:1">
            <p class="nhsuk-body-s nhsuk-u-secondary-text-color" style="margin-bottom:2px">Morning mood</p>
            <p class="nhsuk-heading-s" style="margin:0">${mMorning}</p>
          </div>
          <div style="flex:1">
            <p class="nhsuk-body-s nhsuk-u-secondary-text-color" style="margin-bottom:2px">Evening mood</p>
            <p class="nhsuk-heading-s" style="margin:0">${mEvening}</p>
          </div>
        </div>
        <hr class="nhsuk-section-break nhsuk-section-break--s nhsuk-section-break--visible" style="margin-bottom:10px" />
        ${row('Sleep', sleepText)}
        ${row('Exercise', exerciseText)}
        ${row('Moods', secondaryMoodsText)}
        ${row('Momentum', momentumText)}
        ${row('Events', behavioursText)}
        ${listBlock('What would make today great?', morning?.goals_today)}
        ${listBlock('Memorable moments', evening?.highlights)}
        ${listBlock('Goals for tomorrow', evening?.goals_tomorrow)}
        ${addButtons.length ? `<div style="display:flex;gap:8px;margin-bottom:12px">${addButtons.join('')}</div>` : ''}
        <a href="/?type=evening&date=${dateStr}" class="nhsuk-button nhsuk-u-margin-bottom-0">Edit this check-in</a>
      </div>
    </div>`

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
