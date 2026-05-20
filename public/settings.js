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
      <li style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px">
        <span>${b.name} <span class="nhsuk-u-secondary-text-color nhsuk-body-s">(${weightLabel(b.weight)})</span></span>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="nhsuk-button nhsuk-button--secondary" style="margin:0;padding:4px 12px;font-size:0.875rem" onclick="editBehaviour('${b.id}', '${b.name.replace(/'/g, "\\'")}', ${b.weight})">Edit</button>
          <button class="nhsuk-button nhsuk-button--reverse" style="margin:0;padding:4px 12px;font-size:0.875rem" onclick="confirmDeleteBehaviour('${b.id}', '${b.name.replace(/'/g, "\\'")}')">Remove</button>
        </div>
      </li>
    `).join('')
  } catch {
    list.innerHTML = '<li class="nhsuk-body nhsuk-u-secondary-text-color">Could not load behaviours.</li>'
  }
}

// ── Edit modal ────────────────────────────────────────────────

let editingBehaviourId = null

window.editBehaviour = function(id, name, weight) {
  editingBehaviourId = id
  document.getElementById('edit-behaviour-name').value = name
  const slider = document.getElementById('edit-behaviour-weight')
  slider.value = weight
  document.getElementById('edit-behaviour-weight-label').textContent = weight > 0 ? `+${weight}` : `${weight}`
  document.getElementById('behaviour-edit-modal').style.display = 'flex'
}

document.getElementById('edit-behaviour-weight').addEventListener('input', (e) => {
  const v = Number(e.target.value)
  document.getElementById('edit-behaviour-weight-label').textContent = v > 0 ? `+${v}` : `${v}`
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

// ── Delete confirm modal ──────────────────────────────────────

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
  const v = Number(e.target.value)
  document.getElementById('new-behaviour-weight-label').textContent = v > 0 ? `+${v}` : `${v}`
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
          <button class="nhsuk-button nhsuk-button--secondary" style="margin:0;padding:4px 12px;font-size:0.875rem" onclick="editSupplement('${s.id}', '${s.name.replace(/'/g, "\\'")}')">Edit</button>
          <button class="nhsuk-button nhsuk-button--reverse" style="margin:0;padding:4px 12px;font-size:0.875rem" onclick="confirmDeleteSupplement('${s.id}', '${s.name.replace(/'/g, "\\'")}')">Remove</button>
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
