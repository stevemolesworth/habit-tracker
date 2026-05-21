import { api, clearCache } from '/api.js'
import { authReady } from '/auth.js'
import { geocode } from '/weather.js'

const btn = (label, icon, classes, onclick) =>
  `<button class="nhsuk-button ${classes} nhsuk-button--small" style="margin:0" onclick="${onclick}">` +
  `<span class="material-icons app-btn-icon" aria-hidden="true">${icon}</span>` +
  `<span class="app-btn-label">${label}</span></button>`

// ── Secondary Moods ───────────────────────────────────────────

async function loadMoodDimensions() {
  const list = document.getElementById('mood-dimension-list')
  try {
    const dims = await api.getMoodDimensions()
    if (!dims.length) {
      list.innerHTML = '<li class="nhsuk-u-secondary-text-color">No secondary moods yet.</li>'
    } else {
      list.innerHTML = dims.map(d => `
        <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px">
          <span>${d.name}</span>
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${btn('Edit', 'edit', 'nhsuk-button--secondary', `editMoodDimension('${d.id}', '${d.name.replace(/'/g, "\\'")}') `)}
            ${btn('Remove', 'close', 'nhsuk-button--warning', `confirmDeleteMoodDimension('${d.id}', '${d.name.replace(/'/g, "\\'")}')`)}
          </div>
        </li>
      `).join('')
    }

    const existingNames = new Set(dims.map(d => d.name.toLowerCase()))
    const quickBtns = document.querySelectorAll('[data-quick-mood]')
    quickBtns.forEach(btn => {
      btn.style.display = existingNames.has(btn.dataset.quickMood.toLowerCase()) ? 'none' : ''
    })
    const anyVisible = [...quickBtns].some(b => b.style.display !== 'none')
    document.getElementById('quick-add-details').style.display = anyVisible ? '' : 'none'
  } catch {
    list.innerHTML = '<li class="nhsuk-body nhsuk-u-secondary-text-color">Could not load mood dimensions.</li>'
  }
}

let editingMoodDimId = null

window.editMoodDimension = function(id, name) {
  editingMoodDimId = id
  document.getElementById('edit-mood-name').value = name
  document.getElementById('mood-edit-modal').style.display = 'flex'
}

document.getElementById('mood-edit-cancel-btn').addEventListener('click', () => {
  document.getElementById('mood-edit-modal').style.display = 'none'
  editingMoodDimId = null
})

document.getElementById('mood-edit-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('edit-mood-name').value.trim()
  if (!name) return
  const saveBtn = document.getElementById('mood-edit-save-btn')
  saveBtn.disabled = true
  saveBtn.textContent = 'Saving…'
  try {
    await api.updateMoodDimension(editingMoodDimId, { name })
    document.getElementById('mood-edit-modal').style.display = 'none'
    editingMoodDimId = null
    showFeedback('mood-dimension-feedback', 'Mood dimension updated.')
    clearCache('moodDimensions'); loadMoodDimensions()
  } catch (err) {
    showFeedback('mood-dimension-feedback', `Error: ${err.message}`, true)
  } finally {
    saveBtn.disabled = false
    saveBtn.textContent = 'Save'
  }
})

let deletingMoodDimId = null

window.confirmDeleteMoodDimension = function(id, name) {
  deletingMoodDimId = id
  document.getElementById('mood-delete-summary').textContent = `Remove "${name}" from your mood dimensions?`
  document.getElementById('mood-delete-modal').style.display = 'flex'
}

document.getElementById('mood-delete-cancel-btn').addEventListener('click', () => {
  document.getElementById('mood-delete-modal').style.display = 'none'
  deletingMoodDimId = null
})

document.getElementById('mood-delete-confirm-btn').addEventListener('click', async () => {
  const delBtn = document.getElementById('mood-delete-confirm-btn')
  delBtn.disabled = true
  delBtn.textContent = 'Removing…'
  try {
    await api.deleteMoodDimension(deletingMoodDimId)
    document.getElementById('mood-delete-modal').style.display = 'none'
    deletingMoodDimId = null
    clearCache('moodDimensions'); loadMoodDimensions()
  } catch (err) {
    document.getElementById('mood-delete-modal').style.display = 'none'
    showFeedback('mood-dimension-feedback', `Error: ${err.message}`, true)
  } finally {
    delBtn.disabled = false
    delBtn.textContent = 'Remove'
  }
})

async function addMoodDimension(name) {
  if (!name) return
  try {
    await api.addMoodDimension(name)
    showFeedback('mood-dimension-feedback', `"${name}" added.`)
    clearCache('moodDimensions'); loadMoodDimensions()
  } catch (err) {
    showFeedback('mood-dimension-feedback', `Error: ${err.message}`, true)
  }
}

document.getElementById('add-mood-dimension-btn').addEventListener('click', () => {
  const input = document.getElementById('new-mood-dimension')
  const name = input.value.trim()
  if (!name) return
  input.value = ''
  addMoodDimension(name)
})

document.getElementById('new-mood-dimension').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    document.getElementById('add-mood-dimension-btn').click()
  }
})

document.querySelectorAll('[data-quick-mood]').forEach(btn => {
  btn.addEventListener('click', () => addMoodDimension(btn.dataset.quickMood))
})

// ── Behaviours ────────────────────────────────────────────────

function weightLabel(w) {
  if (w > 0) return '👍'.repeat(w)
  if (w < 0) return '💩'.repeat(-w)
  return '—'
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
      <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px">
        <span>${b.name} <span style="letter-spacing:1px">${weightLabel(b.weight)}</span></span>
        <div style="display:flex;gap:6px;flex-shrink:0">
          ${btn('Edit', 'edit', 'nhsuk-button--secondary', `editBehaviour('${b.id}', '${b.name.replace(/'/g, "\\'")}', ${b.weight})`)}
          ${btn('Remove', 'close', 'nhsuk-button--warning', `confirmDeleteBehaviour('${b.id}', '${b.name.replace(/'/g, "\\'")}')`)}
        </div>
      </li>
    `).join('')
  } catch {
    list.innerHTML = '<li class="nhsuk-body nhsuk-u-secondary-text-color">Could not load behaviours.</li>'
  }
}

let editingBehaviourId = null

window.editBehaviour = function(id, name, weight) {
  editingBehaviourId = id
  document.getElementById('edit-behaviour-name').value = name
  const slider = document.getElementById('edit-behaviour-weight')
  slider.value = weight
  document.getElementById('edit-behaviour-weight-label').textContent = weightLabel(weight)
  document.getElementById('behaviour-edit-modal').style.display = 'flex'
}

document.getElementById('edit-behaviour-weight').addEventListener('input', (e) => {
  document.getElementById('edit-behaviour-weight-label').textContent = weightLabel(Number(e.target.value))
})

document.getElementById('behaviour-edit-cancel-btn').addEventListener('click', () => {
  document.getElementById('behaviour-edit-modal').style.display = 'none'
  editingBehaviourId = null
})

document.getElementById('behaviour-edit-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('edit-behaviour-name').value.trim()
  const weight = Number(document.getElementById('edit-behaviour-weight').value)
  if (!name) return
  const saveBtn = document.getElementById('behaviour-edit-save-btn')
  saveBtn.disabled = true
  saveBtn.textContent = 'Saving…'
  try {
    await api.updateBehaviour(editingBehaviourId, name, weight)
    document.getElementById('behaviour-edit-modal').style.display = 'none'
    editingBehaviourId = null
    showFeedback('behaviour-feedback', 'Behaviour updated.')
    clearCache('behaviours'); loadBehaviours()
  } catch (err) {
    showFeedback('behaviour-feedback', `Error: ${err.message}`, true)
  } finally {
    saveBtn.disabled = false
    saveBtn.textContent = 'Save'
  }
})

let deletingBehaviourId = null

window.confirmDeleteBehaviour = function(id, name) {
  deletingBehaviourId = id
  document.getElementById('behaviour-delete-summary').textContent = `Remove "${name}" from your behaviours list?`
  document.getElementById('behaviour-delete-modal').style.display = 'flex'
}

document.getElementById('behaviour-delete-cancel-btn').addEventListener('click', () => {
  document.getElementById('behaviour-delete-modal').style.display = 'none'
  deletingBehaviourId = null
})

document.getElementById('behaviour-delete-confirm-btn').addEventListener('click', async () => {
  const delBtn = document.getElementById('behaviour-delete-confirm-btn')
  delBtn.disabled = true
  delBtn.textContent = 'Removing…'
  try {
    await api.deleteBehaviour(deletingBehaviourId)
    document.getElementById('behaviour-delete-modal').style.display = 'none'
    deletingBehaviourId = null
    clearCache('behaviours'); loadBehaviours()
  } catch (err) {
    document.getElementById('behaviour-delete-modal').style.display = 'none'
    showFeedback('behaviour-feedback', `Error: ${err.message}`, true)
  } finally {
    delBtn.disabled = false
    delBtn.textContent = 'Remove'
  }
})

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
    clearCache('behaviours'); loadBehaviours()
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

document.getElementById('new-behaviour-weight').addEventListener('input', (e) => {
  document.getElementById('new-behaviour-weight-label').textContent = weightLabel(Number(e.target.value))
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
      <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px">
        <span>${s.name}</span>
        <div style="display:flex;gap:6px;flex-shrink:0">
          ${btn('Edit', 'edit', 'nhsuk-button--secondary', `editSupplement('${s.id}', '${s.name.replace(/'/g, "\\'")}') `)}
          ${btn('Remove', 'close', 'nhsuk-button--warning', `confirmDeleteSupplement('${s.id}', '${s.name.replace(/'/g, "\\'")}')`)}
        </div>
      </li>
    `).join('')
  } catch {
    list.innerHTML = '<li class="nhsuk-body nhsuk-u-secondary-text-color">Could not load supplements.</li>'
  }
}

let editingSupplementId = null

window.editSupplement = function(id, name) {
  editingSupplementId = id
  document.getElementById('edit-supplement-name').value = name
  document.getElementById('supplement-edit-modal').style.display = 'flex'
}

document.getElementById('supplement-edit-cancel-btn').addEventListener('click', () => {
  document.getElementById('supplement-edit-modal').style.display = 'none'
  editingSupplementId = null
})

document.getElementById('supplement-edit-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('edit-supplement-name').value.trim()
  if (!name) return
  const saveBtn = document.getElementById('supplement-edit-save-btn')
  saveBtn.disabled = true
  saveBtn.textContent = 'Saving…'
  try {
    await api.updateSupplement(editingSupplementId, name)
    document.getElementById('supplement-edit-modal').style.display = 'none'
    editingSupplementId = null
    showFeedback('supp-feedback', 'Supplement updated.')
    clearCache('supplements'); loadSupplements()
  } catch (err) {
    showFeedback('supp-feedback', `Error: ${err.message}`, true)
  } finally {
    saveBtn.disabled = false
    saveBtn.textContent = 'Save'
  }
})

let deletingSupplementId = null

window.confirmDeleteSupplement = function(id, name) {
  deletingSupplementId = id
  document.getElementById('supplement-delete-summary').textContent = `Remove "${name}" from your supplements list?`
  document.getElementById('supplement-delete-modal').style.display = 'flex'
}

document.getElementById('supplement-delete-cancel-btn').addEventListener('click', () => {
  document.getElementById('supplement-delete-modal').style.display = 'none'
  deletingSupplementId = null
})

document.getElementById('supplement-delete-confirm-btn').addEventListener('click', async () => {
  const delBtn = document.getElementById('supplement-delete-confirm-btn')
  delBtn.disabled = true
  delBtn.textContent = 'Removing…'
  try {
    await api.deleteSupplement(deletingSupplementId)
    document.getElementById('supplement-delete-modal').style.display = 'none'
    deletingSupplementId = null
    clearCache('supplements'); loadSupplements()
  } catch (err) {
    document.getElementById('supplement-delete-modal').style.display = 'none'
    showFeedback('supp-feedback', `Error: ${err.message}`, true)
  } finally {
    delBtn.disabled = false
    delBtn.textContent = 'Remove'
  }
})

document.getElementById('add-supplement-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-supplement')
  const name = input.value.trim()
  if (!name) return
  try {
    await api.addSupplement(name)
    input.value = ''
    showFeedback('supp-feedback', `"${name}" added.`)
    clearCache('supplements'); loadSupplements()
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

// ── Default location ──────────────────────────────────────────

async function loadLocation() {
  const label = document.getElementById('location-current-label')
  try {
    const config = await api.getWeights()
    label.textContent = config?.default_location_label
      ? `Current: ${config.default_location_label}`
      : 'No default location set.'
  } catch {
    label.textContent = 'Could not load current location.'
  }
}

document.getElementById('location-save-btn').addEventListener('click', async () => {
  const input = document.getElementById('location-input')
  const feedback = document.getElementById('location-feedback')
  const label = document.getElementById('location-current-label')
  const query = input.value.trim()
  if (!query) return
  feedback.textContent = 'Saving…'
  feedback.style.display = ''
  try {
    const loc = await geocode(query)
    await api.updateWeights({ default_location_lat: loc.lat, default_location_lng: loc.lng, default_location_label: loc.label })
    clearCache('weights')
    label.textContent = `Current: ${loc.label}`
    input.value = ''
    feedback.textContent = 'Saved.'
    setTimeout(() => { feedback.style.display = 'none' }, 2000)
  } catch (err) {
    feedback.textContent = err.message || 'Could not save location.'
  }
})

// ── Track alcohol toggle ──────────────────────────────────────

async function loadTrackAlcohol() {
  try {
    const config = await api.getWeights()
    const enabled = config?.track_alcohol !== false
    document.getElementById('track-alcohol').checked = enabled
  } catch { /* leave default checked */ }
}

document.getElementById('track-alcohol').addEventListener('change', async (e) => {
  const feedback = document.getElementById('track-alcohol-feedback')
  try {
    await api.updateWeights({ track_alcohol: e.target.checked })
    clearCache('weights')
    feedback.textContent = 'Saved.'
    feedback.style.display = ''
    setTimeout(() => { feedback.style.display = 'none' }, 2000)
  } catch {
    feedback.textContent = 'Could not save — please try again.'
    feedback.style.display = ''
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

authReady.then(() => {
  loadLocation()
  loadMoodDimensions()
  loadBehaviours()
  loadSupplements()
  loadTrackAlcohol()
})
