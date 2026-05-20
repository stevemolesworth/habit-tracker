import { api } from '/api.js'
import { authReady } from '/auth.js'

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
          <button class="nhsuk-button nhsuk-button--secondary nhsuk-button--small" style="margin:0" onclick="editBehaviour('${b.id}', '${b.name.replace(/'/g, "\\'")}', ${b.weight})">Edit</button>
          <button class="nhsuk-button nhsuk-button--warning nhsuk-button--small" style="margin:0" onclick="confirmDeleteBehaviour('${b.id}', '${b.name.replace(/'/g, "\\'")}')">Remove</button>
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
  const btn = document.getElementById('behaviour-edit-save-btn')
  btn.disabled = true
  btn.textContent = 'Saving…'
  try {
    await api.updateBehaviour(editingBehaviourId, name, weight)
    document.getElementById('behaviour-edit-modal').style.display = 'none'
    editingBehaviourId = null
    showFeedback('behaviour-feedback', 'Behaviour updated.')
    loadBehaviours()
  } catch (err) {
    showFeedback('behaviour-feedback', `Error: ${err.message}`, true)
  } finally {
    btn.disabled = false
    btn.textContent = 'Save'
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
  const btn = document.getElementById('behaviour-delete-confirm-btn')
  btn.disabled = true
  btn.textContent = 'Removing…'
  try {
    await api.deleteBehaviour(deletingBehaviourId)
    document.getElementById('behaviour-delete-modal').style.display = 'none'
    deletingBehaviourId = null
    loadBehaviours()
  } catch (err) {
    document.getElementById('behaviour-delete-modal').style.display = 'none'
    showFeedback('behaviour-feedback', `Error: ${err.message}`, true)
  } finally {
    btn.disabled = false
    btn.textContent = 'Remove'
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

document.getElementById('new-behaviour-weight').addEventListener('input', (e) => {
  document.getElementById('new-behaviour-weight-label').textContent = weightLabel(Number(e.target.value))
})

// ── Focuses ───────────────────────────────────────────────────

async function loadFocuses() {
  const list = document.getElementById('focus-list')
  try {
    const focuses = await api.getFocuses()
    if (!focuses.length) {
      list.innerHTML = '<li class="nhsuk-u-secondary-text-color">No focuses yet.</li>'
      return
    }
    list.innerHTML = focuses.map(f => {
      const badge = f.is_active
        ? ''
        : ' <span style="font-size:0.75rem;background:#768692;color:#fff;padding:1px 6px;border-radius:2px;vertical-align:middle">Inactive</span>'
      const toggleLabel = f.is_active ? 'Deactivate' : 'Activate'
      return `
        <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px">
          <span>${f.title}${badge}</span>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="nhsuk-button nhsuk-button--secondary nhsuk-button--small" style="margin:0" onclick="editFocus('${f.id}', '${f.title.replace(/'/g, "\\'")}')">Edit</button>
            <button class="nhsuk-button nhsuk-button--secondary nhsuk-button--small" style="margin:0" onclick="toggleFocus('${f.id}', ${f.is_active})">${toggleLabel}</button>
            <button class="nhsuk-button nhsuk-button--warning nhsuk-button--small" style="margin:0" onclick="confirmDeleteFocus('${f.id}', '${f.title.replace(/'/g, "\\'")}')">Remove</button>
          </div>
        </li>`
    }).join('')
  } catch {
    list.innerHTML = '<li class="nhsuk-body nhsuk-u-secondary-text-color">Could not load focuses.</li>'
  }
}

let editingFocusId = null

window.editFocus = function(id, title) {
  editingFocusId = id
  document.getElementById('edit-focus-title').value = title
  document.getElementById('focus-edit-modal').style.display = 'flex'
}

document.getElementById('focus-edit-cancel-btn').addEventListener('click', () => {
  document.getElementById('focus-edit-modal').style.display = 'none'
  editingFocusId = null
})

document.getElementById('focus-edit-save-btn').addEventListener('click', async () => {
  const title = document.getElementById('edit-focus-title').value.trim()
  if (!title) return
  const btn = document.getElementById('focus-edit-save-btn')
  btn.disabled = true
  btn.textContent = 'Saving…'
  try {
    await api.updateFocus(editingFocusId, { title })
    document.getElementById('focus-edit-modal').style.display = 'none'
    editingFocusId = null
    showFeedback('focus-feedback', 'Focus updated.')
    loadFocuses()
  } catch (err) {
    showFeedback('focus-feedback', `Error: ${err.message}`, true)
  } finally {
    btn.disabled = false
    btn.textContent = 'Save'
  }
})

window.toggleFocus = async function(id, currentlyActive) {
  try {
    await api.updateFocus(id, { is_active: !currentlyActive })
    loadFocuses()
  } catch (err) {
    showFeedback('focus-feedback', `Error: ${err.message}`, true)
  }
}

let deletingFocusId = null

window.confirmDeleteFocus = function(id, title) {
  deletingFocusId = id
  document.getElementById('focus-delete-summary').textContent = `Remove "${title}" from your focuses list?`
  document.getElementById('focus-delete-modal').style.display = 'flex'
}

document.getElementById('focus-delete-cancel-btn').addEventListener('click', () => {
  document.getElementById('focus-delete-modal').style.display = 'none'
  deletingFocusId = null
})

document.getElementById('focus-delete-confirm-btn').addEventListener('click', async () => {
  const btn = document.getElementById('focus-delete-confirm-btn')
  btn.disabled = true
  btn.textContent = 'Removing…'
  try {
    await api.deleteFocus(deletingFocusId)
    document.getElementById('focus-delete-modal').style.display = 'none'
    deletingFocusId = null
    loadFocuses()
  } catch (err) {
    document.getElementById('focus-delete-modal').style.display = 'none'
    showFeedback('focus-feedback', `Error: ${err.message}`, true)
  } finally {
    btn.disabled = false
    btn.textContent = 'Remove'
  }
})

document.getElementById('add-focus-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-focus')
  const title = input.value.trim()
  if (!title) return
  try {
    await api.addFocus(title)
    input.value = ''
    showFeedback('focus-feedback', `"${title}" added.`)
    loadFocuses()
  } catch (err) {
    showFeedback('focus-feedback', `Error: ${err.message}`, true)
  }
})

document.getElementById('new-focus').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    document.getElementById('add-focus-btn').click()
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
      <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px">
        <span>${s.name}</span>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="nhsuk-button nhsuk-button--secondary nhsuk-button--small" style="margin:0" onclick="editSupplement('${s.id}', '${s.name.replace(/'/g, "\\'")}')">Edit</button>
          <button class="nhsuk-button nhsuk-button--warning nhsuk-button--small" style="margin:0" onclick="confirmDeleteSupplement('${s.id}', '${s.name.replace(/'/g, "\\'")}')">Remove</button>
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
  const btn = document.getElementById('supplement-edit-save-btn')
  btn.disabled = true
  btn.textContent = 'Saving…'
  try {
    await api.updateSupplement(editingSupplementId, name)
    document.getElementById('supplement-edit-modal').style.display = 'none'
    editingSupplementId = null
    showFeedback('supp-feedback', 'Supplement updated.')
    loadSupplements()
  } catch (err) {
    showFeedback('supp-feedback', `Error: ${err.message}`, true)
  } finally {
    btn.disabled = false
    btn.textContent = 'Save'
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
  const btn = document.getElementById('supplement-delete-confirm-btn')
  btn.disabled = true
  btn.textContent = 'Removing…'
  try {
    await api.deleteSupplement(deletingSupplementId)
    document.getElementById('supplement-delete-modal').style.display = 'none'
    deletingSupplementId = null
    loadSupplements()
  } catch (err) {
    document.getElementById('supplement-delete-modal').style.display = 'none'
    showFeedback('supp-feedback', `Error: ${err.message}`, true)
  } finally {
    btn.disabled = false
    btn.textContent = 'Remove'
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

// ── Helpers ───────────────────────────────────────────────────

function showFeedback(id, msg, isError = false) {
  const el = document.getElementById(id)
  el.textContent = msg
  el.style.color = isError ? '#d5281b' : '#007f3b'
  el.style.display = ''
  setTimeout(() => { el.style.display = 'none' }, 4000)
}

// ── Init ──────────────────────────────────────────────────────

// ── Track alcohol toggle ──────────────────────────────────────

async function loadTrackAlcohol() {
  try {
    const config = await api.getWeights()
    const enabled = config?.track_alcohol !== false // default true
    document.getElementById('track-alcohol').checked = enabled
  } catch { /* leave default checked */ }
}

document.getElementById('track-alcohol').addEventListener('change', async (e) => {
  const feedback = document.getElementById('track-alcohol-feedback')
  try {
    await api.updateWeights({ track_alcohol: e.target.checked })
    feedback.textContent = 'Saved.'
    feedback.style.display = ''
    setTimeout(() => { feedback.style.display = 'none' }, 2000)
  } catch {
    feedback.textContent = 'Could not save — please try again.'
    feedback.style.display = ''
  }
})

authReady.then(() => {
  loadTrackAlcohol()
  loadFocuses()
  loadBehaviours()
  loadSupplements()
})
