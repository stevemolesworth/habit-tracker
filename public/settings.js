import { api, clearCache } from '/api.js'
import { authReady } from '/auth.js'
import { geocode } from '/weather.js'

const btn = (label, icon, classes, onclick) =>
  `<button class="nhsuk-button ${classes} nhsuk-button--small" style="margin:0" onclick="${onclick}">` +
  `<span class="material-icons app-btn-icon" aria-hidden="true">${icon}</span>` +
  `<span class="app-btn-label">${label}</span></button>`

// ── Secondary Moods ───────────────────────────────────────────

let moodSortable = null

async function loadMoodDimensions() {
  const list = document.getElementById('mood-dimension-list')
  try {
    const dims = await api.getMoodDimensionsAll()
    if (!dims.length) {
      list.innerHTML = '<li class="nhsuk-u-secondary-text-color">No secondary moods yet.</li>'
    } else {
      list.innerHTML = dims.map(d => `
        <li data-id="${d.id}" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px${d.paused ? ';opacity:0.55' : ''}">
          <span class="app-drag-handle material-icons" aria-hidden="true">drag_indicator</span>
          <span style="flex:1">${d.name}${d.paused ? '<span class="app-item-paused-badge">Paused</span>' : ''}</span>
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${btn(d.paused ? 'Resume' : 'Pause', d.paused ? 'play_arrow' : 'pause', 'nhsuk-button--secondary', `pauseMoodDimension('${d.id}', ${d.paused})`)}
            ${btn('Edit', 'edit', 'nhsuk-button--secondary', `editMoodDimension('${d.id}', '${d.name.replace(/'/g, "\\'")}', ${d.five_is_good !== false})`)}
            ${btn('Remove', 'close', 'nhsuk-button--warning', `confirmDeleteMoodDimension('${d.id}', '${d.name.replace(/'/g, "\\'")}')`)}
          </div>
        </li>
      `).join('')
    }

    const existingNames = new Set(dims.map(d => d.name.toLowerCase()))
    const quickBtns = document.querySelectorAll('[data-quick-mood]')
    quickBtns.forEach(b => {
      b.style.display = existingNames.has(b.dataset.quickMood.toLowerCase()) ? 'none' : ''
    })
    const anyVisible = [...quickBtns].some(b => b.style.display !== 'none')
    document.getElementById('quick-add-details').style.display = anyVisible ? '' : 'none'

    if (moodSortable) moodSortable.destroy()
    moodSortable = Sortable.create(list, {
      handle: '.app-drag-handle',
      animation: 150,
      onEnd: () => {
        const ids = [...list.querySelectorAll('li[data-id]')].map(li => li.dataset.id)
        api.reorderMoodDimensions(ids)
      }
    })
  } catch {
    list.innerHTML = '<li class="nhsuk-body nhsuk-u-secondary-text-color">Could not load mood dimensions.</li>'
  }
}

let editingMoodDimId = null

window.editMoodDimension = function(id, name, fiveIsGood) {
  editingMoodDimId = id
  document.getElementById('edit-mood-name').value = name
  document.getElementById('edit-mood-dir-good').checked = fiveIsGood !== false
  document.getElementById('edit-mood-dir-bad').checked = fiveIsGood === false
  document.getElementById('mood-edit-error').style.display = 'none'
  document.getElementById('mood-edit-modal').style.display = 'flex'
}

document.getElementById('mood-edit-cancel-btn').addEventListener('click', () => {
  document.getElementById('mood-edit-modal').style.display = 'none'
  editingMoodDimId = null
})

document.getElementById('mood-edit-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('edit-mood-name').value.trim()
  if (!name) return
  const dirRadio = document.querySelector('[name="edit_mood_direction"]:checked')
  const five_is_good = !dirRadio || dirRadio.value === 'good'
  const saveBtn = document.getElementById('mood-edit-save-btn')
  saveBtn.disabled = true
  saveBtn.textContent = 'Saving…'
  try {
    await api.updateMoodDimension(editingMoodDimId, { name, five_is_good })
    document.getElementById('mood-edit-modal').style.display = 'none'
    editingMoodDimId = null
    showFeedback('mood-dimension-feedback', 'Mood dimension updated.')
    clearCache('moodDimensions'); loadMoodDimensions()
  } catch (err) {
    const errEl = document.getElementById('mood-edit-error')
    errEl.textContent = `Error: ${err.message}`
    errEl.style.display = ''
  } finally {
    saveBtn.disabled = false
    saveBtn.textContent = 'Save'
  }
})

window.pauseMoodDimension = async function(id, isPaused) {
  try {
    await api.updateMoodDimension(id, { paused: !isPaused })
    clearCache('moodDimensions'); loadMoodDimensions()
  } catch (err) {
    showFeedback('mood-dimension-feedback', `Error: ${err.message}`, true)
  }
}

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

async function addMoodDimension(name, fiveIsGood = true) {
  if (!name) return
  try {
    await api.addMoodDimension(name, fiveIsGood)
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
  const dirRadio = document.querySelector('[name="new_mood_direction"]:checked')
  const fiveIsGood = !dirRadio || dirRadio.value === 'good'
  input.value = ''
  addMoodDimension(name, fiveIsGood)
})

document.getElementById('new-mood-dimension').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    document.getElementById('add-mood-dimension-btn').click()
  }
})

document.querySelectorAll('[data-quick-mood]').forEach(b => {
  b.addEventListener('click', () => addMoodDimension(b.dataset.quickMood))
})

// ── Behaviours ────────────────────────────────────────────────

document.querySelectorAll('[data-quick-behaviour]').forEach(b => {
  b.addEventListener('click', async () => {
    try {
      await api.addBehaviour(b.dataset.quickBehaviour, Number(b.dataset.quickWeight))
      showFeedback('behaviour-feedback', `"${b.dataset.quickBehaviour}" added.`)
      clearCache('behaviours'); loadBehaviours()
    } catch (err) {
      showFeedback('behaviour-feedback', `Error: ${err.message}`, true)
    }
  })
})

function weightLabel(w) {
  if (w > 0) return '👍'.repeat(w)
  if (w < 0) return '💩'.repeat(-w)
  return '—'
}

let behaviourSortable = null

async function loadBehaviours() {
  const list = document.getElementById('behaviour-list')
  try {
    const behaviours = await api.getBehaviours()
    if (!behaviours.length) {
      list.innerHTML = '<li class="nhsuk-u-secondary-text-color">No behaviours yet.</li>'
    } else {
      list.innerHTML = behaviours.map(b => `
        <li data-id="${b.id}" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px">
          <span class="app-drag-handle material-icons" aria-hidden="true">drag_indicator</span>
          <span style="flex:1">${b.name} <span style="letter-spacing:1px">${weightLabel(b.weight)}</span></span>
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${btn('Edit', 'edit', 'nhsuk-button--secondary', `editBehaviour('${b.id}', '${b.name.replace(/'/g, "\\'")}', ${b.weight})`)}
            ${btn('Remove', 'close', 'nhsuk-button--warning', `confirmDeleteBehaviour('${b.id}', '${b.name.replace(/'/g, "\\'")}')`)}
          </div>
        </li>
      `).join('')
    }

    const existingNames = new Set(behaviours.map(b => b.name.toLowerCase()))
    const quickBtns = document.querySelectorAll('[data-quick-behaviour]')
    quickBtns.forEach(b => {
      b.style.display = existingNames.has(b.dataset.quickBehaviour.toLowerCase()) ? 'none' : ''
    })
    const anyVisible = [...quickBtns].some(b => b.style.display !== 'none')
    document.getElementById('quick-add-behaviour-details').style.display = anyVisible ? '' : 'none'

    if (behaviourSortable) behaviourSortable.destroy()
    behaviourSortable = Sortable.create(list, {
      handle: '.app-drag-handle',
      animation: 150,
      onEnd: () => {
        const ids = [...list.querySelectorAll('li[data-id]')].map(li => li.dataset.id)
        api.reorderBehaviours(ids)
      }
    })
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

// ── Momentum ──────────────────────────────────────────────────

let momentumSortable = null

async function loadMomentumItems() {
  const list = document.getElementById('momentum-item-list')
  try {
    const items = await api.getMomentumItemsAll()
    if (!items.length) {
      list.innerHTML = '<li class="nhsuk-u-secondary-text-color">No momentum items yet.</li>'
    } else {
      list.innerHTML = items.map(m => `
        <li data-id="${m.id}" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px${m.paused ? ';opacity:0.55' : ''}">
          <span class="app-drag-handle material-icons" aria-hidden="true">drag_indicator</span>
          <span style="flex:1">${m.name}${m.paused ? '<span class="app-item-paused-badge">Paused</span>' : ''}</span>
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${btn(m.paused ? 'Resume' : 'Pause', m.paused ? 'play_arrow' : 'pause', 'nhsuk-button--secondary', `pauseMomentumItem('${m.id}', ${m.paused})`)}
            ${btn('Edit', 'edit', 'nhsuk-button--secondary', `editMomentumItem('${m.id}', '${m.name.replace(/'/g, "\\'")}') `)}
            ${btn('Remove', 'close', 'nhsuk-button--warning', `confirmDeleteMomentumItem('${m.id}', '${m.name.replace(/'/g, "\\'")}')`)}
          </div>
        </li>
      `).join('')
    }

    if (momentumSortable) momentumSortable.destroy()
    momentumSortable = Sortable.create(list, {
      handle: '.app-drag-handle',
      animation: 150,
      onEnd: () => {
        const ids = [...list.querySelectorAll('li[data-id]')].map(li => li.dataset.id)
        api.reorderMomentumItems(ids)
      }
    })
  } catch {
    list.innerHTML = '<li class="nhsuk-body nhsuk-u-secondary-text-color">Could not load momentum items.</li>'
  }
}

let editingMomentumId = null

window.editMomentumItem = function(id, name) {
  editingMomentumId = id
  document.getElementById('edit-momentum-name').value = name
  document.getElementById('momentum-edit-modal').style.display = 'flex'
}

document.getElementById('momentum-edit-cancel-btn').addEventListener('click', () => {
  document.getElementById('momentum-edit-modal').style.display = 'none'
  editingMomentumId = null
})

document.getElementById('momentum-edit-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('edit-momentum-name').value.trim()
  if (!name) return
  const saveBtn = document.getElementById('momentum-edit-save-btn')
  saveBtn.disabled = true
  saveBtn.textContent = 'Saving…'
  try {
    await api.updateMomentumItem(editingMomentumId, { name })
    document.getElementById('momentum-edit-modal').style.display = 'none'
    editingMomentumId = null
    showFeedback('momentum-item-feedback', 'Momentum item updated.')
    clearCache('momentumItems'); loadMomentumItems()
  } catch (err) {
    showFeedback('momentum-item-feedback', `Error: ${err.message}`, true)
  } finally {
    saveBtn.disabled = false
    saveBtn.textContent = 'Save'
  }
})

window.pauseMomentumItem = async function(id, isPaused) {
  try {
    await api.updateMomentumItem(id, { paused: !isPaused })
    clearCache('momentumItems'); loadMomentumItems()
  } catch (err) {
    showFeedback('momentum-item-feedback', `Error: ${err.message}`, true)
  }
}

let deletingMomentumId = null

window.confirmDeleteMomentumItem = function(id, name) {
  deletingMomentumId = id
  document.getElementById('momentum-delete-summary').textContent = `Remove "${name}" from your momentum items?`
  document.getElementById('momentum-delete-modal').style.display = 'flex'
}

document.getElementById('momentum-delete-cancel-btn').addEventListener('click', () => {
  document.getElementById('momentum-delete-modal').style.display = 'none'
  deletingMomentumId = null
})

document.getElementById('momentum-delete-confirm-btn').addEventListener('click', async () => {
  const delBtn = document.getElementById('momentum-delete-confirm-btn')
  delBtn.disabled = true
  delBtn.textContent = 'Removing…'
  try {
    await api.deleteMomentumItem(deletingMomentumId)
    document.getElementById('momentum-delete-modal').style.display = 'none'
    deletingMomentumId = null
    clearCache('momentumItems'); loadMomentumItems()
  } catch (err) {
    document.getElementById('momentum-delete-modal').style.display = 'none'
    showFeedback('momentum-item-feedback', `Error: ${err.message}`, true)
  } finally {
    delBtn.disabled = false
    delBtn.textContent = 'Remove'
  }
})

document.getElementById('add-momentum-item-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-momentum-item')
  const name = input.value.trim()
  if (!name) return
  try {
    await api.addMomentumItem(name)
    input.value = ''
    showFeedback('momentum-item-feedback', `"${name}" added.`)
    clearCache('momentumItems'); loadMomentumItems()
  } catch (err) {
    showFeedback('momentum-item-feedback', `Error: ${err.message}`, true)
  }
})

document.getElementById('new-momentum-item').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    document.getElementById('add-momentum-item-btn').click()
  }
})

// ── Supplements ──────────────────────────────────────────────

async function loadSupplements() {
  const list = document.getElementById('supplement-list')
  try {
    const supplements = await api.getSupplements()
    if (!supplements.length) {
      list.innerHTML = '<li class="nhsuk-u-secondary-text-color">No supplements yet.</li>'
    } else {
      list.innerHTML = supplements.map(s => `
        <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px">
          <span>${s.name}</span>
          <div style="display:flex;gap:6px;flex-shrink:0">
            ${btn('Edit', 'edit', 'nhsuk-button--secondary', `editSupplement('${s.id}', '${s.name.replace(/'/g, "\\'")}') `)}
            ${btn('Remove', 'close', 'nhsuk-button--warning', `confirmDeleteSupplement('${s.id}', '${s.name.replace(/'/g, "\\'")}')`)}
          </div>
        </li>
      `).join('')
    }

    const existingNames = new Set(supplements.map(s => s.name.toLowerCase()))
    const quickBtns = document.querySelectorAll('[data-quick-supplement]')
    quickBtns.forEach(b => {
      b.style.display = existingNames.has(b.dataset.quickSupplement.toLowerCase()) ? 'none' : ''
    })
    const anyVisible = [...quickBtns].some(b => b.style.display !== 'none')
    document.getElementById('quick-add-supplement-details').style.display = anyVisible ? '' : 'none'
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

document.querySelectorAll('[data-quick-supplement]').forEach(b => {
  b.addEventListener('click', async () => {
    try {
      await api.addSupplement(b.dataset.quickSupplement)
      showFeedback('supp-feedback', `"${b.dataset.quickSupplement}" added.`)
      clearCache('supplements'); loadSupplements()
    } catch (err) {
      showFeedback('supp-feedback', `Error: ${err.message}`, true)
    }
  })
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
  loadMomentumItems()
  loadSupplements()
  loadTrackAlcohol()
})
