import { api } from '/api.js'

// ── Supplements ──────────────────────────────────────────────

async function loadSupplements() {
  const list = document.getElementById('supplement-list')
  try {
    const supplements = await api.getSupplements()
    if (!supplements.length) {
      list.innerHTML = '<li class="nhsuk-u-secondary-text-color">No supplements yet.</li>'
      return
    }
    list.innerHTML = supplements.map(s => `
      <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
        <span>${s.name}</span>
        <button class="nhsuk-button nhsuk-button--secondary" style="margin:0;padding:4px 12px;font-size:0.875rem" data-id="${s.id}" onclick="deleteSupplement('${s.id}')">Remove</button>
      </li>
    `).join('')
  } catch {
    list.innerHTML = '<li class="nhsuk-body nhsuk-u-secondary-text-color">Could not load supplements.</li>'
  }
}

window.deleteSupplement = async function(id) {
  try {
    await api.deleteSupplement(id)
    loadSupplements()
  } catch (err) {
    showFeedback('supp-feedback', `Error: ${err.message}`, true)
  }
}

document.getElementById('add-supplement-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-supplement')
  const name = input.value.trim()
  if (!name) return

  try {
    await api.addSupplement(name)
    input.value = ''
    showFeedback('supp-feedback', `"${name}" added.`)
    loadSupplements()
  } catch (err) {
    showFeedback('supp-feedback', `Error: ${err.message}`, true)
  }
})

document.getElementById('new-supplement').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    document.getElementById('add-supplement-btn').click()
  }
})

// ── Location ─────────────────────────────────────────────────

async function loadPostcode() {
  try {
    const w = await api.getWeights()
    if (w?.default_postcode) {
      document.getElementById('default-postcode').value = w.default_postcode
    }
  } catch { /* leave blank */ }
}

document.getElementById('save-postcode-btn').addEventListener('click', async () => {
  const value = document.getElementById('default-postcode').value.trim().replace(/\s+/g, '').toUpperCase()
  if (!value) {
    showFeedback('postcode-feedback', 'Please enter a postcode.', true)
    return
  }
  try {
    await api.updateWeights({ default_postcode: value })
    showFeedback('postcode-feedback', 'Postcode saved.')
  } catch (err) {
    showFeedback('postcode-feedback', `Error: ${err.message}`, true)
  }
})

// ── Weights ──────────────────────────────────────────────────

const weightKeys = ['mood', 'focus', 'sleep', 'exercise', 'mindfulness', 'alcohol', 'outside']

function updateWeightDisplay() {
  const values = weightKeys.map(k => Number(document.getElementById(`w-${k}`).value))
  const total = values.reduce((a, b) => a + b, 0)
  weightKeys.forEach((k, i) => {
    document.getElementById(`wv-${k}`).textContent = `${values[i]}%`
  })
  document.getElementById('weights-total').textContent = total
  document.getElementById('weights-total').style.color = total !== 100 ? '#d5281b' : 'inherit'
}

async function loadWeights() {
  try {
    const w = await api.getWeights()
    document.getElementById('w-mood').value = Math.round(w.weight_mood * 100)
    document.getElementById('w-focus').value = Math.round(w.weight_focus * 100)
    document.getElementById('w-sleep').value = Math.round(w.weight_sleep * 100)
    document.getElementById('w-exercise').value = Math.round(w.weight_exercise * 100)
    document.getElementById('w-mindfulness').value = Math.round(w.weight_mindfulness * 100)
    document.getElementById('w-alcohol').value = Math.round(w.weight_alcohol * 100)
    document.getElementById('w-outside').value = Math.round(w.weight_outside * 100)
    updateWeightDisplay()
  } catch {
    // silently use defaults already in HTML
  }
}

weightKeys.forEach(k => {
  document.getElementById(`w-${k}`).addEventListener('input', updateWeightDisplay)
})

document.getElementById('save-weights-btn').addEventListener('click', async () => {
  const values = weightKeys.map(k => Number(document.getElementById(`w-${k}`).value))
  const total = values.reduce((a, b) => a + b, 0)

  if (total === 0) {
    showFeedback('weights-feedback', 'Weights must sum to more than 0.', true)
    return
  }

  // Normalise to sum = 1.0
  const normalised = {}
  weightKeys.forEach((k, i) => {
    normalised[`weight_${k}`] = values[i] / total
  })

  try {
    await api.updateWeights(normalised)
    showFeedback('weights-feedback', 'Weights saved. Historical scores will recalculate automatically.')
  } catch (err) {
    showFeedback('weights-feedback', `Error: ${err.message}`, true)
  }
})

// ── Helpers ───────────────────────────────────────────────────

function showFeedback(id, msg, isError = false) {
  const el = document.getElementById(id)
  el.textContent = msg
  el.style.color = isError ? '#d5281b' : '#007f3b'
  el.style.display = ''
  setTimeout(() => { el.style.display = 'none' }, 4000)
}

// ── Init ──────────────────────────────────────────────────────

loadPostcode()
loadSupplements()
loadWeights()
