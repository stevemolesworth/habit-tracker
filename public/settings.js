import { api } from '/api.js'

// ── Behaviours ────────────────────────────────────────────────

function weightLabel(w) {
  if (w === -3) return '-3 💩'
  if (w === 3) return '+3 👍'
  return w > 0 ? `+${w}` : `${w}`
}

async function loadBehaviours() {
  const list = document.getElementById('behaviour-list')
  try {
    const behaviours = await api.getBehaviours()
    if (!behaviours.length) {
      list.innerHTML = '<li class="nhsuk-u-secondary-text-color">No behaviours yet.</li>'
      return
    }
    list.innerHTML = behaviours.map(b => `
      <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
        <span>${b.name} <span class="nhsuk-u-secondary-text-color nhsuk-body-s">(${weightLabel(b.weight)})</span></span>
        <button class="nhsuk-button nhsuk-button--secondary" style="margin:0;padding:4px 12px;font-size:0.875rem" onclick="deleteBehaviour('${b.id}')">Remove</button>
      </li>
    `).join('')
  } catch {
    list.innerHTML = '<li class="nhsuk-body nhsuk-u-secondary-text-color">Could not load behaviours.</li>'
  }
}

window.deleteBehaviour = async function(id) {
  try {
    await api.deleteBehaviour(id)
    loadBehaviours()
  } catch (err) {
    showFeedback('behaviour-feedback', `Error: ${err.message}`, true)
  }
}

document.getElementById('add-behaviour-btn').addEventListener('click', async () => {
  const nameInput = document.getElementById('new-behaviour')
  const weightInput = document.getElementById('new-behaviour-weight')
  const name = nameInput.value.trim()
  const weight = Number(weightInput.value)
  if (!name) return
  if (!Number.isInteger(weight) || weight < -3 || weight > 3) {
    showFeedback('behaviour-feedback', 'Weight must be a whole number between -3 and 3.', true)
    return
  }
  try {
    await api.addBehaviour(name, weight)
    nameInput.value = ''
    weightInput.value = '1'
    showFeedback('behaviour-feedback', `"${name}" added.`)
    loadBehaviours()
  } catch (err) {
    showFeedback('behaviour-feedback', `Error: ${err.message}`, true)
  }
})

document.getElementById('new-behaviour').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    document.getElementById('add-behaviour-btn').click()
  }
})

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

// ── Helpers ───────────────────────────────────────────────────

function showFeedback(id, msg, isError = false) {
  const el = document.getElementById(id)
  el.textContent = msg
  el.style.color = isError ? '#d5281b' : '#007f3b'
  el.style.display = ''
  setTimeout(() => { el.style.display = 'none' }, 4000)
}

// ── Delete range ─────────────────────────────────────────────

function fmtDate(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

document.getElementById('delete-range-btn').addEventListener('click', () => {
  const from = document.getElementById('delete-from').value
  const to = document.getElementById('delete-to').value
  if (!from || !to) {
    showFeedback('delete-range-feedback', 'Please select both a from and to date.', true)
    return
  }
  if (from > to) {
    showFeedback('delete-range-feedback', '"From" date must be on or before "To" date.', true)
    return
  }
  document.getElementById('delete-range-summary').textContent =
    `Delete all check-ins from ${fmtDate(from)} to ${fmtDate(to)}?`
  document.getElementById('delete-range-modal').style.display = 'flex'
})

document.getElementById('delete-range-cancel-btn').addEventListener('click', () => {
  document.getElementById('delete-range-modal').style.display = 'none'
})

document.getElementById('delete-range-confirm-btn').addEventListener('click', async () => {
  const btn = document.getElementById('delete-range-confirm-btn')
  btn.disabled = true
  btn.textContent = 'Deleting…'
  const from = document.getElementById('delete-from').value
  const to = document.getElementById('delete-to').value
  try {
    const result = await api.deleteRange(from, to)
    document.getElementById('delete-range-modal').style.display = 'none'
    showFeedback('delete-range-feedback', `${result.deleted} check-in${result.deleted === 1 ? '' : 's'} deleted.`)
  } catch (err) {
    document.getElementById('delete-range-modal').style.display = 'none'
    showFeedback('delete-range-feedback', `Error: ${err.message}`, true)
  } finally {
    btn.disabled = false
    btn.textContent = 'Delete'
  }
})

// ── Init ──────────────────────────────────────────────────────

loadPostcode()
loadBehaviours()
loadSupplements()
