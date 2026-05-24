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
    mood: evening?.primary_mood_eod ?? morning?.primary_mood_morning ?? evening?.global_mood ?? morning?.global_mood ?? null,
    mood_morning: morning?.primary_mood_morning ?? morning?.global_mood ?? null,
    mood_evening: evening?.primary_mood_eod ?? evening?.global_mood ?? null,
    secondary_moods: { ...(morning?.secondary_moods ?? {}), ...(evening?.secondary_moods ?? {}) },
    bedtime: morning?.bedtime ?? null,
    wake_time: morning?.wake_time ?? null,
    hours_slept: morning?.hours_slept ?? null,
    sleep_quality: morning?.sleep_quality ?? null,
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
const TEAL   = '#00838a'

const DIM_COLOURS = [ORANGE, GREEN, PURPLE, RED, TEAL]

const charts = {}

function mkChart(id, config) {
  if (charts[id]) { charts[id].destroy(); delete charts[id] }
  const canvas = document.getElementById(id)
  if (canvas) {
    config.options = { ...config.options, animation: false }
    charts[id] = new Chart(canvas.getContext('2d'), config)  // eslint-disable-line no-undef
  }
  return charts[id]
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
  if (d.evening_id) return `/?type=evening&date=${d.date}`
  if (d.morning_id) return `/?type=morning&date=${d.date}`
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

function renderMoodToggles(chart) {
  const container = document.getElementById('mood-toggles')
  if (!container) return

  const dimStart = 3 // 0=Morning, 1=Evening, 2=Trend, 3+=secondary dims
  const hasDims = chart.data.datasets.length > dimStart

  const checkboxesHtml = chart.data.datasets.map((ds, i) => {
    const swatch = ds.showLine === false
      ? `<span style="display:inline-block;width:10px;height:10px;background:${ds.backgroundColor};border-radius:50%;flex-shrink:0"></span>`
      : `<span style="display:inline-block;width:18px;height:3px;background:${ds.borderColor};border-radius:2px;flex-shrink:0"></span>`
    return `<label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;font-size:14px">
      <input type="checkbox" checked data-idx="${i}" style="margin:0">
      ${swatch}
      ${ds.label}
    </label>`
  }).join('')

  container.style.cssText = 'margin-bottom:10px'
  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:8px">${checkboxesHtml}</div>
    <div id="mood-btn-group" class="nhsuk-button-group" style="margin-bottom:0;gap:8px"></div>
  `

  const btnGroup = container.querySelector('#mood-btn-group')
  const btnStyle = 'margin:0;padding:3px 12px;font-size:13px;height:auto;line-height:1.5'

  const mkBtn = (label, onClick) => {
    const btn = document.createElement('button')
    btn.className = 'nhsuk-button nhsuk-button--secondary nhsuk-button--small'
    btn.style.cssText = btnStyle
    btn.textContent = label
    btn.addEventListener('click', onClick)
    btnGroup.appendChild(btn)
    return btn
  }

  const setAll = (visible) => {
    for (let i = 0; i < chart.data.datasets.length; i++) {
      chart.getDatasetMeta(i).hidden = !visible
      const cb = container.querySelector(`input[data-idx="${i}"]`)
      if (cb) cb.checked = visible
    }
    if (hasDims) dimsBtn.textContent = visible ? 'Hide secondary moods' : 'Show secondary moods'
    chart.update()
  }

  mkBtn('Show all', () => setAll(true))
  mkBtn('Hide all', () => setAll(false))

  let dimsBtn
  if (hasDims) {
    let dimsVisible = true
    dimsBtn = mkBtn('Hide secondary moods', () => {
      dimsVisible = !dimsVisible
      dimsBtn.textContent = dimsVisible ? 'Hide secondary moods' : 'Show secondary moods'
      for (let i = dimStart; i < chart.data.datasets.length; i++) {
        chart.getDatasetMeta(i).hidden = !dimsVisible
        const cb = container.querySelector(`input[data-idx="${i}"]`)
        if (cb) cb.checked = dimsVisible
      }
      chart.update()
    })
  }

  container.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const meta = chart.getDatasetMeta(Number(cb.dataset.idx))
      meta.hidden = !cb.checked
      chart.update()
    })
  })
}

function renderMood(days, labels, moodDims) {
  const avgMood = days.map(d => {
    const vals = [d.mood_morning, d.mood_evening].filter(v => v !== null)
    return vals.length === 2 ? (vals[0] + vals[1]) / 2 : vals[0] ?? null
  })

  const datasets = [
    {
      label: 'Morning',
      data: days.map(d => d.mood_morning),
      showLine: false, spanGaps: false,
      pointRadius: 7, pointHoverRadius: 9,
      borderColor: BLUE, backgroundColor: BLUE,
    },
    {
      label: 'Evening',
      data: days.map(d => d.mood_evening),
      showLine: false, spanGaps: false,
      pointRadius: 7, pointHoverRadius: 9,
      borderColor: PURPLE, backgroundColor: PURPLE,
    },
    {
      label: 'Trend',
      data: avgMood,
      showLine: true, spanGaps: true, tension: 0.4,
      pointRadius: 0, pointHoverRadius: 0,
      borderColor: 'rgba(120,120,120,0.5)', backgroundColor: 'rgba(120,120,120,0.5)',
      borderDash: [5, 4], borderWidth: 1.5,
    },
    ...moodDims.map((dim, i) => ({
      label: dim.name,
      data: days.map(d => d.secondary_moods?.[dim.id] ?? null),
      showLine: true, spanGaps: true, tension: 0.4,
      pointRadius: 4, pointHoverRadius: 6,
      borderColor: DIM_COLOURS[i % DIM_COLOURS.length],
      backgroundColor: DIM_COLOURS[i % DIM_COLOURS.length],
    }))
  ]

  const dumbbellPlugin = {
    id: 'dumbbell-connectors',
    afterDatasetsDraw(chart) {
      const { ctx, scales: { y } } = chart
      const morningMeta = chart.getDatasetMeta(0)
      const eveningMeta = chart.getDatasetMeta(1)
      if (morningMeta.hidden || eveningMeta.hidden) return
      ctx.save()
      ctx.strokeStyle = 'rgba(150,150,150,0.4)'
      ctx.lineWidth = 2
      days.forEach((d, i) => {
        if (d.mood_morning === null || d.mood_evening === null) return
        const el = morningMeta.data[i]
        if (!el) return
        const y1 = y.getPixelForValue(d.mood_morning)
        const y2 = y.getPixelForValue(d.mood_evening)
        ctx.beginPath()
        ctx.moveTo(el.x, y1)
        ctx.lineTo(el.x, y2)
        ctx.stroke()
      })
      ctx.restore()
    }
  }

  const chart = mkChart('chart-mood', {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: xAxis(labels),
        y: {
          min: 0.5, max: 5.5,
          ticks: { stepSize: 1, callback: v => { if (v === 1) return '1 😢'; if (v === 5) return '5 😁'; return Number.isInteger(v) ? v : '' } },
          grid: { color: '#f0f4f5' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => fmtLong(days[items[0].dataIndex].date),
            label: item => item.parsed.y !== null ? `${item.dataset.label}: ${item.parsed.y}` : '',
          },
          filter: item => item.dataset.label !== 'Trend' && item.parsed.y !== null,
        }
      },
      onClick: chartOnClick(days)
    },
    plugins: [dumbbellPlugin]
  })

  if (chart) renderMoodToggles(chart)
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

// ── Alcohol ───────────────────────────────────────────────────

function renderAlcohol(days, labels) {
  const val = (d, key) => d.alcohol === null ? null : d[key]

  const totalUnitsAll = days.reduce((sum, d) => sum + (d.alcohol ?? 0), 0)
  const avg = totalUnitsAll / days.length
  const avgEl = document.getElementById('alcohol-avg')
  if (avgEl) avgEl.textContent = `Average ${avg.toFixed(1)} units per day over this period.`

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

// ── Habits chart ──────────────────────────────────────────────

function habitDone(value) {
  return value !== null && value !== undefined && value !== false
}

function renderHabitsChart(days, labels, behaviourDefs) {
  const suppNames = []
  const suppSet = new Set()
  days.forEach(d => {
    if (d.supplements) Object.keys(d.supplements).forEach(k => { if (!suppSet.has(k)) { suppSet.add(k); suppNames.push(k) } })
  })

  const weightEmoji = w => w > 0 ? ' 👍' : w < 0 ? ' 💩' : ''

  const habits = [
    { name: 'Exercise', label: '🏃 Exercise', fn: d => d.exercised, weight: 1 },
    ...suppNames.map(name => ({ name, label: `💊 ${name}`, fn: d => d.supplements?.[name] ?? null, weight: 1 })),
    ...behaviourDefs.map(b => ({ name: b.name, label: `${b.name}${weightEmoji(b.weight)}`, fn: d => d.behaviours?.[b.name] ?? null, weight: b.weight })),
  ]

  const wrap = document.getElementById('habits-chart-wrap')
  if (!wrap) return

  if (!habits.length) {
    wrap.innerHTML = '<p class="nhsuk-hint">No habits tracked yet.</p>'
    return
  }

  wrap.innerHTML = '<canvas id="chart-habits"></canvas>'
  wrap.style.height = `${Math.max(150, habits.length * 38 + 50)}px`

  const datasets = habits.map((habit, i) => ({
    label: habit.name,
    data: days.map(d => habitDone(habit.fn(d)) ? i : null),
    showLine: false,
    spanGaps: false,
    pointRadius: 7,
    pointHoverRadius: 9,
    borderColor: habit.weight < 0 ? RED : GREEN,
    backgroundColor: habit.weight < 0 ? RED : GREEN,
  }))

  mkChart('chart-habits', {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: xAxis(labels),
        y: {
          type: 'linear',
          reverse: true,
          min: -0.5,
          max: habits.length - 0.5,
          ticks: {
            stepSize: 1,
            font: { size: 12 },
            callback: v => {
              const i = Math.round(v)
              if (i < 0 || i >= habits.length) return ''
              const lbl = habits[i].label
              return lbl.length > 24 ? lbl.slice(0, 23) + '…' : lbl
            },
          },
          grid: { color: '#f0f4f5' },
          afterFit: ctx => { ctx.width = Math.max(ctx.width, 160) },
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => fmtLong(days[items[0].dataIndex].date),
            label: item => {
              const i = Math.round(item.parsed.y)
              return i >= 0 && i < habits.length ? habits[i].label : ''
            },
          }
        }
      },
      onClick: (evt, elements) => {
        if (!elements.length) return
        const href = dayHref(days[elements[0].index])
        if (href) location.href = href
      }
    }
  })
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
    const [checkins, behaviourDefs, moodDims] = await Promise.all([
      api.getReport(from, to),
      api.getBehaviours(),
      api.getMoodDimensions(),
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
    renderMood(days, labels, moodDims)
    renderSleep(days, labels)
    renderAlcohol(days, labels)
    renderHabitsChart(days, labels, behaviourDefs)
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

function last7Range() {
  const to = new Date()
  const from = new Date(to)
  from.setDate(to.getDate() - 6)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  }
}

function applyPreset(value) {
  const dateRangeInputs = document.getElementById('date-range-inputs')
  if (value === 'date-range') {
    dateRangeInputs.style.display = 'flex'
    return
  }
  dateRangeInputs.style.display = 'none'
  const ranges = {
    'last-7': last7Range(),
    'this-week': weekRange(0),
    'last-week': weekRange(-1),
    'this-month': monthRange(0),
    'last-month': monthRange(-1)
  }
  const { from, to } = ranges[value] || last7Range()
  document.getElementById('date-from').value = from
  document.getElementById('date-to').value = to
  loadReport()
}

document.getElementById('period-select').addEventListener('change', e => applyPreset(e.target.value))
document.getElementById('apply-btn').addEventListener('click', loadReport)

// Default to last 7 days on load
authReady.then(async () => {
  try {
    const config = await api.getWeights()
    if (config?.track_alcohol === false) {
      document.getElementById('alcohol-section').style.display = 'none'
    }
  } catch { /* non-fatal */ }

  document.getElementById('period-select').value = 'last-7'
  applyPreset('last-7')
})

// Resize charts when a collapsed <details> is opened (Chart.js renders at 0px when hidden)
document.querySelectorAll('details[data-charts]').forEach(el => {
  el.addEventListener('toggle', () => {
    if (!el.open) return
    el.dataset.charts.split(',').forEach(id => { if (charts[id]) charts[id].resize() })
  })
})
