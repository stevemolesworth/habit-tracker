import { api } from '/api.js'
import { authReady } from '/auth.js'

const liveTimers = []

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatDDHHMMSS(ms) {
  const total = Math.floor(Math.abs(ms) / 1000)
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600) % 24
  const d = Math.floor(total / 86400)
  return `${d}:${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function renderCard(e) {
  const target = new Date(`${e.event_date}T${e.event_time || '00:00:00'}`)
  const targetMs = target.getTime()
  const dirLabel = e.direction === 'countdown' ? 'until' : 'since'

  const safeUrl = e.url && (e.url.startsWith('http://') || e.url.startsWith('https://')) ? e.url : null
  const headingContent = safeUrl
    ? `<a href="${escHtml(safeUrl)}" class="nhsuk-card__link" target="_blank" rel="noopener noreferrer">${escHtml(e.name)}</a>`
    : escHtml(e.name)

  return `
    <div class="nhsuk-card">
      <div class="nhsuk-card__content">
        <h2 class="nhsuk-card__heading nhsuk-heading-m">${headingContent}</h2>
        ${e.description ? `<p class="nhsuk-card__description nhsuk-body-s" style="margin-bottom:8px">${escHtml(e.description)}</p>` : ''}
        <p style="font-size:1.75rem;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:0.03em;margin:8px 0 2px;line-height:1">
          <span data-live-target="${targetMs}" data-direction="${e.direction}">--:--:--:--</span>
        </p>
        <p class="nhsuk-body-s nhsuk-u-secondary-text-color" style="margin:0">${dirLabel}</p>
      </div>
    </div>`
}

function startLiveTimers() {
  liveTimers.forEach(clearInterval)
  liveTimers.length = 0
  document.querySelectorAll('[data-live-target]').forEach(el => {
    const targetMs = +el.dataset.liveTarget
    const isCountdown = el.dataset.direction === 'countdown'

    function tick() {
      const now = Date.now()
      const diff = isCountdown ? targetMs - now : now - targetMs
      if (diff <= 0 && isCountdown) { el.textContent = '0:00:00:00'; return }
      el.textContent = formatDDHHMMSS(Math.max(diff, 0))
    }

    tick()
    const id = setInterval(tick, 1000)
    liveTimers.push(id)
  })
}

async function loadEvents() {
  const loading = document.getElementById('events-loading')
  const grid = document.getElementById('events-grid')
  const empty = document.getElementById('events-empty')
  const errorEl = document.getElementById('events-error')
  const errorMsg = document.getElementById('events-error-msg')

  loading.style.display = ''
  grid.style.display = 'none'
  empty.style.display = 'none'
  errorEl.style.display = 'none'

  try {
    const events = await api.getEvents()
    loading.style.display = 'none'
    if (!events.length) {
      empty.style.display = ''
      return
    }
    grid.innerHTML = events.map(renderCard).join('')
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px'
    startLiveTimers()
  } catch (err) {
    loading.style.display = 'none'
    errorMsg.textContent = err.message
    errorEl.style.display = ''
  }
}

authReady.then(() => loadEvents())
