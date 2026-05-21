// Reusable duration input component
// Usage: initDurationInput(displayEl, hiddenEl, decBtn, incBtn)
//   displayEl — visible <input type="text"> showing H:MM
//   hiddenEl  — <input type="hidden" name="..."> storing integer minutes
//   decBtn    — button element for −15 min
//   incBtn    — button element for +15 min

const STEP = 15 // minutes

function formatDuration(minutes) {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  return `${h}:${mm}`
}

function parseDuration(raw) {
  const str = String(raw).trim()
  if (!str || str === '0' || str === '0:00') return 0

  if (str.includes(':')) {
    const [hPart, mPart] = str.split(':')
    const h = parseInt(hPart, 10)
    const m = parseInt(mPart, 10)
    if (isNaN(h) || isNaN(m) || m < 0 || m > 59) return null
    return h * 60 + m
  }

  // Plain number → treated as hours
  const h = parseFloat(str)
  if (isNaN(h) || h < 0) return null
  return Math.round(h * 60)
}

export function initDurationInput(displayEl, hiddenEl, decBtn, incBtn) {
  let currentMinutes = parseInt(hiddenEl.value, 10) || 0

  function setMinutes(m) {
    currentMinutes = Math.max(0, m)
    displayEl.value = formatDuration(currentMinutes)
    hiddenEl.value = currentMinutes
    hiddenEl.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // Initialise display from hidden value
  displayEl.value = formatDuration(currentMinutes)

  decBtn.addEventListener('click', () => setMinutes(currentMinutes - STEP))
  incBtn.addEventListener('click', () => setMinutes(currentMinutes + STEP))

  displayEl.addEventListener('blur', () => {
    const parsed = parseDuration(displayEl.value)
    if (parsed === null) {
      // Revert to last valid value
      displayEl.value = formatDuration(currentMinutes)
    } else {
      setMinutes(parsed)
    }
  })

  displayEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      displayEl.blur()
    }
  })

  return {
    getValue: () => currentMinutes,
    setValue: (m) => setMinutes(m),
  }
}
