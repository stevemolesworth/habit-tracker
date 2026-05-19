import { api } from '/api.js'

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
    alcohol: evening != null ? totalUnits(evening) : morning != null ? totalUnits(morning) : null,
    alcohol_beer: evening != null ? Number(evening.alcohol_beer || 0) : morning != null ? Number(morning.alcohol_beer || 0) : null,
    alcohol_wine: evening != null ? Number(evening.alcohol_wine || 0) : morning != null ? Number(morning.alcohol_wine || 0) : null,
    alcohol_spirits: evening != null ? Number(evening.alcohol_spirits || 0) : morning != null ? Number(morning.alcohol_spirits || 0) : null,
    mindfulness_meditation: evening?.mindfulness_meditation ?? morning?.mindfulness_meditation ?? null,
    mindfulness_yoga: evening?.mindfulness_yoga ?? morning?.mindfulness_yoga ?? null,
    supplements: mergeSupplements(morning?.supplements, evening?.supplements),
    outside_time: evening?.outside_time ?? morning?.outside_time ?? null,
    social_media: evening?.social_media ?? morning?.social_media ?? null,
    p: evening?.p ?? morning?.p ?? null,
    m: evening?.m ?? morning?.m ?? null,
    s: evening?.s ?? morning?.s ?? null,
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

// ── Mood ──────────────────────────────────────────────────────

function renderMood(days, labels) {
  mkChart('chart-mood', {
    type: 'line',
    data: { labels, datasets: [{ ...LINE, tension: 0.4, spanGaps: true, label: 'Mood', data: days.map(d => d.mood), borderColor: BLUE, backgroundColor: BLUE }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: xAxis(labels), y: { min: 1, max: 5, ticks: { stepSize: 1 }, grid: { color: '#f0f4f5' } } },
      plugins: { legend: { display: false }, tooltip: tooltipTitle(days) }
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
      }
    }
  })

  mkChart('chart-sleep-hours', {
    type: 'line',
    data: { labels, datasets: [{ ...LINE, label: 'Hours', data: days.map(d => d.hours_slept), borderColor: PURPLE, backgroundColor: PURPLE }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: xAxis(labels), y: { min: 0, suggestedMax: 10, ticks: { stepSize: 2 }, grid: { color: '#f0f4f5' } } },
      plugins: { legend: { display: false }, tooltip: tooltipTitle(days) }
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
      plugins: { legend: { display: true, position: 'top' }, tooltip: tooltipTitle(days) }
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
      plugins: { legend: { display: true }, tooltip: tooltipTitle(days) }
    }
  })
}

// ── Boolean rows ──────────────────────────────────────────────

function dot(value, invert, title) {
  const isYes = value !== null && value !== undefined && (invert ? !value : value)
  const cls = isYes ? 'app-bool-dot--true' : 'app-bool-dot--null'
  return `<span class="app-bool-dot ${cls}" title="${title}"></span>`
}

function boolRow(label, days, fn, invert = false) {
  const dots = days.map(d => dot(fn(d), invert, fmtShort(d.date))).join('')
  return `<div class="app-bool-row"><span class="app-bool-label">${label}</span><div class="app-bool-dots">${dots}</div></div>`
}

function renderBoolRows(days) {
  const suppNames = new Set()
  days.forEach(d => { if (d.supplements) Object.keys(d.supplements).forEach(k => suppNames.add(k)) })

  let html = boolRow('Exercise', days, d => d.exercised)
  html += boolRow('Meditation', days, d => d.mindfulness_meditation)
  html += boolRow('Yoga', days, d => d.mindfulness_yoga)
  suppNames.forEach(name => { html += boolRow(name, days, d => d.supplements?.[name] ?? null) })
  html += boolRow('Outside', days, d => d.outside_time)
  html += boolRow('Avoided social media', days, d => d.social_media)
  html += boolRow('Avoided p... 🍑', days, d => d.p)
  html += boolRow("Didn't m... 🍆💦", days, d => d.m)
  html += boolRow('Had s... 🎆', days, d => d.s)

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
    const checkins = await api.getReport(from, to)
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
    renderBoolRows(days)
  } catch (err) {
    document.getElementById('report-loading').style.display = 'none'
    document.getElementById('report-error').style.display = ''
    document.getElementById('report-error-msg').textContent = `Error: ${err.message}`
  }
}

// ── Init ──────────────────────────────────────────────────────

document.getElementById('date-to').value = todayStr()
document.getElementById('date-from').value = daysAgo(30)

document.getElementById('apply-btn').addEventListener('click', loadReport)

document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('date-to').value = todayStr()
    document.getElementById('date-from').value = daysAgo(Number(btn.dataset.preset))
    loadReport()
  })
})

document.getElementById('notes-modal-close').addEventListener('click', () => {
  document.getElementById('notes-modal').style.display = 'none'
})
document.getElementById('notes-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none'
})

loadReport()
