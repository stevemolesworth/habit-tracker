import { api } from '/api.js'
import { authReady } from '/auth.js'

// ── Date helpers ─────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n + 1)
  return d.toISOString().slice(0, 10)
}

function getDatesInRange(from, to) {
  const dates = []
  const d = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function fmtShort(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtLong(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Data helpers ─────────────────────────────────────────────

function timeToDecimal(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h + m / 60
}

function totalUnits(ci) {
  if (!ci) return null
  return Math.round((Number(ci.alcohol_spirits || 0) + Number(ci.alcohol_beer || 0) + Number(ci.alcohol_wine || 0)) * 10) / 10
}

function buildDayMap(checkins) {
  const map = {}
  for (const ci of checkins) {
    if (!map[ci.check_in_date]) map[ci.check_in_date] = {}
    map[ci.check_in_date][ci.check_in_type] = ci
  }
  return map
}

function mergeSupplements(a, b) {
  if (!a && !b) return null
  return { ...(a || {}), ...(b || {}) }
}

function mergeDay(date, morning, evening) {
  return {
    date,
    mood: evening?.global_mood ?? morning?.global_mood ?? null,
    bedtime: morning?.bedtime ?? null,
    wake_time: morning?.wake_time ?? null,
    hours_slept: morning?.hours_slept ?? null,
    sleep_quality: morning?.sleep_quality ?? null,
    focus_financial: evening?.focus_financial ?? null,
    focus_consulting: evening?.focus_consulting ?? null,
    focus_opiner: evening?.focus_opiner ?? null,
    exercised: evening?.exercised ?? morning?.exercised ?? null,
    exercise_types: evening?.exercise_types ?? morning?.exercise_types ?? null,
    morning_id: morning?.id ?? null,
    evening_id: evening?.id ?? null,
    alcohol: evening != null ? totalUnits(evening) : morning != null ? totalUnits(morning) : null,
    alcohol_beer: evening != null ? Number(evening.alcohol_beer || 0) : morning != null ? Number(morning.alcohol_beer || 0) : null,
    alcohol_wine: evening != null ? Number(evening.alcohol_wine || 0) : morning != null ? Number(morning.alcohol_wine || 0) : null,
    alcohol_spirits: evening != null ? Number(evening.alcohol_spirits || 0) : morning != null ? Number(morning.alcohol_spirits || 0) : null,
    supplements: mergeSupplements(morning?.supplements, evening?.supplements),
    behaviours: mergeSupplements(morning?.behaviours, evening?.behaviours),
    morning_notes: morning?.notes ?? null,
    evening_notes: evening?.notes ?? null,
  }
}

// ── Chart setup ───────────────────────────────────────────────

const BLUE   = '#005eb8'
const GREEN  = '#007f3b'
const RED    = '#d5281b'
const PURPLE = '#330072'
const ORANGE = '#e8850c'

const charts = {}

function mkChart(id, config) {
  if (charts[id]) { charts[id].destroy(); delete charts[id] }
  const canvas = document.getElementById(id)
  if (canvas) charts[id] = new Chart(canvas.getContext('2d'), config)  // eslint-disable-line no-undef
}

function xAxis(labels) {
  return {
    type: 'category',
    labels,
    ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 15, font: { size: 11 } },
    grid: { color: '#f0f4f5' }
  }
}

const LINE = { fill: false, tension: 0.3, pointRadius: 4, pointHoverRadius: 6, spanGaps: false }

function tooltipTitle(days) {
  return { callbacks: { title: items => fmtLong(days[items[0].dataIndex].date) } }
}

function dayHref(d) {
  if (d.evening_id) return `/edit.html?id=${d.evening_id}`
  if (d.morning_id) return `/edit.html?id=${d.morning_id}`
  return null
}

function chartOnClick(days) {
  return (evt, elements) => {
    if (!elements.length) return
    const href = dayHref(days[elements[0].index])
    if (href) location.href = href
  }
}

// ── Mood ──────────────────────────────────────────────────────

function renderMood(days, labels) {
  mkChart('chart-mood', {
    type: 'line',
    data: { labels, datasets: [{ ...LINE, tension: 0.4, spanGaps: true, label: 'Mood', data: days.map(d => d.mood), borderColor: BLUE, backgroundColor: BLUE }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: xAxis(labels), y: { min: 0.5, max: 5.5, ticks: { stepSize: 1, callback: v => Number.isInteger(v) ? v : '' }, grid: { color: '#f0f4f5' } } },
      plugins: { legend: { display: false }, tooltip: tooltipTitle(days) },
      onClick: chartOnClick(days)
    }
  })
}

// ── Sleep ─────────────────────────────────────────────────────

function renderSleep(days, labels) {
  const qualColor = q => q === 1 ? `rgba(213,40,27,0.65)` : q === 2 ? `rgba(232,133,12,0.65)` : q === 3 ? `rgba(0,127,59,0.65)` : `rgba(0,94,184,0.5)`

  const barData = days.map(d => {
    if (!d.bedtime || !d.wake_time) return null
    let bed = timeToDecimal(d.bedtime)
    let wake = timeToDecimal(d.wake_time)
    if (bed < 12) bed += 24
    if (wake < 12) wake += 24
    if (wake < bed) wake += 24
    return [bed, wake]
  })

  mkChart('chart-sleep-timeline', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Sleep',
        data: barData,
        backgroundColor: days.map(d => qualColor(d.sleep_quality)),
        borderRadius: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: xAxis(labels),
        y: {
          min: 18, max: 32,
          grid: { color: '#f0f4f5' },
          ticks: {
            stepSize: 2,
            callback: v => { const h = Math.round(v) % 24; return `${String(h).padStart(2,'0')}:00` }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: items => fmtLong(days[items[0].dataIndex].date),
          label: item => {
            if (!item.raw) return 'No data'
            const fmt = h => { const hh = Math.floor(h % 24); const mm = Math.round((h % 1) * 60); return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}` }
            return `${fmt(item.raw[0])} → ${fmt(item.raw[1])}`
          }
        }}
      },
      onClick: chartOnClick(days)
    }
  })

  mkChart('chart-sleep-hours', {
    type: 'line',
    data: { labels, datasets: [{ ...LINE, label: 'Hours', data: days.map(d => d.hours_slept), borderColor: PURPLE, backgroundColor: PURPLE }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: xAxis(labels), y: { min: 0, suggestedMax: 10, ticks: { stepSize: 2 }, grid: { color: '#f0f4f5' } } },
      plugins: { legend: { display: false }, tooltip: tooltipTitle(days) },
      onClick: chartOnClick(days)
    }
  })
}

// ── Focus ─────────────────────────────────────────────────────

function renderFocus(days, labels) {
  mkChart('chart-focus', {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Financial', data: days.map(d => d.focus_financial), backgroundColor: BLUE + 'cc',   borderRadius: 2 },
      { label: 'Consulting', data: days.map(d => d.focus_consulting), backgroundColor: GREEN + 'cc',  borderRadius: 2 },
      { label: 'Opiner',    data: days.map(d => d.focus_opiner),    backgroundColor: ORANGE + 'cc', borderRadius: 2 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { ...xAxis(labels), stacked: false }, y: { min: 0, max: 5, ticks: { stepSize: 1 }, grid: { color: '#f0f4f5' } } },
      plugins: { legend: { display: true, position: 'top' }, tooltip: tooltipTitle(days) },
      onClick: chartOnClick(days)
    }
  })
}

// ── Alcohol ───────────────────────────────────────────────────

function renderAlcohol(days, labels) {
  const val = (d, key) => d.alcohol === null ? null : d[key]
  mkChart('chart-alcohol', {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Beer',    data: days.map(d => val(d, 'alcohol_beer')),    backgroundColor: 'rgba(212,160,23,0.85)',  borderRadius: 2 },
      { label: 'Wine',    data: days.map(d => val(d, 'alcohol_wine')),    backgroundColor: 'rgba(148,37,66,0.85)',   borderRadius: 2 },
      { label: 'Spirits', data: days.map(d => val(d, 'alcohol_spirits')), backgroundColor: 'rgba(0,94,184,0.8)',    borderRadius: 2 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ...xAxis(labels), stacked: true },
        y: { min: 0, stacked: true, ticks: { stepSize: 1 }, grid: { color: '#f0f4f5' } }
      },
      plugins: { legend: { display: true }, tooltip: tooltipTitle(days) },
      onClick: chartOnClick(days)
    }
  })
}

// ── Boolean rows ──────────────────────────────────────────────

function habitCell(value, weight, title, href) {
  const done = value !== null && value !== undefined && value !== false
  if (done) {
    const emoji = weight < 0 ? '💩' : '👍'
    const cls = weight < 0 ? 'app-bool-dot--negative' : 'app-bool-dot--positive'
    if (href) return `<a href="${href}" class="app-bool-dot ${cls}" title="${title}">${emoji}</a>`
    return `<span class="app-bool-dot ${cls}" title="${title}">${emoji}</span>`
  }
  if (href) return `<a href="${href}" class="app-bool-dot app-bool-dot--null" title="${title}"></a>`
  return `<span class="app-bool-dot app-bool-dot--null" title="${title}"></span>`
}

function boolRow(label, days, fn, weight = 1) {
  const dots = days.map(d => habitCell(fn(d), weight, fmtShort(d.date), dayHref(d))).join('')
  return `<div class="app-bool-row"><span class="app-bool-label">${label}</span><div class="app-bool-dots">${dots}</div></div>`
}

function renderBoolRows(days, behaviourDefs) {
  const suppNames = new Set()
  days.forEach(d => { if (d.supplements) Object.keys(d.supplements).forEach(k => suppNames.add(k)) })

  let html = boolRow('Exercise', days, d => d.exercised, 1)
  suppNames.forEach(name => { html += boolRow(name, days, d => d.supplements?.[name] ?? null, 1) })
  behaviourDefs.forEach(b => { html += boolRow(b.name, days, d => d.behaviours?.[b.name] ?? null, b.weight) })

  document.getElementById('bool-rows').innerHTML = html
}

// ── Load & render ─────────────────────────────────────────────

async function loadReport() {
  const from = document.getElementById('date-from').value
  const to = document.getElementById('date-to').value
  if (!from || !to) return

  document.getElementById('report-loading').style.display = ''
  document.getElementById('report-content').style.display = 'none'
  document.getElementById('report-empty').style.display = 'none'
  document.getElementById('report-error').style.display = 'none'

  try {
    const [checkins, behaviourDefs] = await Promise.all([
      api.getReport(from, to),
      api.getBehaviours()
    ])
    document.getElementById('report-loading').style.display = 'none'

    if (!checkins.length) {
      document.getElementById('report-empty').style.display = ''
      return
    }

    const dates = getDatesInRange(from, to)
    const dayMap = buildDayMap(checkins)
    const days = dates.map(d => mergeDay(d, dayMap[d]?.morning, dayMap[d]?.evening))
    const labels = dates.map(fmtShort)

    document.getElementById('report-content').style.display = ''
    renderMood(days, labels)
    renderSleep(days, labels)
    renderFocus(days, labels)
    renderAlcohol(days, labels)
    renderBoolRows(days, behaviourDefs)
  } catch (err) {
    document.getElementById('report-loading').style.display = 'none'
    document.getElementById('report-error').style.display = ''
    document.getElementById('report-error-msg').textContent = `Error: ${err.message}`
  }
}

// ── Init ──────────────────────────────────────────────────────

function weekRange(offset = 0) {
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // Monday = 0
  const monday = new Date(now)
  monday.setDate(now.getDate() - day + offset * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10)
  }
}

function monthRange(offset = 0) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + offset
  const first = new Date(y, m, 1)
  const last = new Date(y, m + 1, 0)
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10)
  }
}

function setActivePreset(id) {
  ['preset-this-week', 'preset-last-week', 'preset-this-month', 'preset-last-month', 'preset-date-range'].forEach(bid => {
    document.getElementById(bid).classList.toggle('nhsuk-button--active-preset', bid === id)
  })
}

document.getElementById('preset-this-week').addEventListener('click', () => {
  const { from, to } = weekRange(0)
  document.getElementById('date-range-inputs').style.display = 'none'
  document.getElementById('date-from').value = from
  document.getElementById('date-to').value = to
  setActivePreset('preset-this-week')
  loadReport()
})

document.getElementById('preset-last-week').addEventListener('click', () => {
  const { from, to } = weekRange(-1)
  document.getElementById('date-range-inputs').style.display = 'none'
  document.getElementById('date-from').value = from
  document.getElementById('date-to').value = to
  setActivePreset('preset-last-week')
  loadReport()
})

document.getElementById('preset-this-month').addEventListener('click', () => {
  const { from, to } = monthRange(0)
  document.getElementById('date-range-inputs').style.display = 'none'
  document.getElementById('date-from').value = from
  document.getElementById('date-to').value = to
  setActivePreset('preset-this-month')
  loadReport()
})

document.getElementById('preset-last-month').addEventListener('click', () => {
  const { from, to } = monthRange(-1)
  document.getElementById('date-range-inputs').style.display = 'none'
  document.getElementById('date-from').value = from
  document.getElementById('date-to').value = to
  setActivePreset('preset-last-month')
  loadReport()
})

document.getElementById('preset-date-range').addEventListener('click', () => {
  document.getElementById('date-range-inputs').style.display = 'flex'
  setActivePreset('preset-date-range')
})

document.getElementById('apply-btn').addEventListener('click', loadReport)

// Default to this month on load
authReady.then(() => {
  const { from: initFrom, to: initTo } = monthRange(0)
  document.getElementById('date-from').value = initFrom
  document.getElementById('date-to').value = initTo
  setActivePreset('preset-this-month')
  loadReport()
})
