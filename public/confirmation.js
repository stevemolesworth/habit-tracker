import { api } from '/api.js'
import { calcScore } from '/score.js'

const params = new URLSearchParams(location.search)
const type = params.get('type') || 'morning'

document.getElementById('panel-type').textContent =
  type === 'morning' ? 'Morning check-in recorded' : 'Evening check-in recorded'

async function loadQuote() {
  try {
    const quote = await api.getRandomQuote()
    document.getElementById('quote-text').textContent = `"${quote.text}"`
    if (quote.author) {
      document.getElementById('quote-author').textContent = `— ${quote.author}`
    }
  } catch {
    document.getElementById('quote-text').textContent = '"Progress, not perfection."'
  }
}

async function loadPreviousScore() {
  try {
    const [checkins, weights] = await Promise.all([
      api.getCheckins(),
      api.getWeights()
    ])

    const currentId = params.get('id')
    const previous = checkins.find(c => c.id !== currentId)
    if (!previous) return

    const score = calcScore(previous, weights)
    const pct = Math.round(score * 100)

    document.getElementById('score-value').textContent = `${pct}%`
    document.getElementById('score-label').textContent =
      `From your last ${previous.check_in_type} check-in (${new Date(previous.check_in_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })})`
    document.getElementById('score-card').style.display = ''
  } catch {
    // silently skip — score is optional
  }
}

loadQuote()
loadPreviousScore()
