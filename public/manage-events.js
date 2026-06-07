import { api, clearCache } from '/api.js'
import { authReady } from '/auth.js'
import { showToast } from '/toast.js'

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function btn(label, icon, classes, onclick) {
  return `<button class="nhsuk-button ${classes} nhsuk-button--small" style="margin:0" onclick="${onclick}">` +
    `<span class="material-icons app-btn-icon" aria-hidden="true">${icon}</span>` +
    `<span class="app-btn-label">${label}</span></button>`
}

let eventSortable = null
let _eventsCache = []

// ── Load & render list ──────────────────────────────────────────

async function loadEvents() {
  const list = document.getElementById('event-list')
  try {
    const events = await api.getEvents()
    _eventsCache = events
    if (!events.length) {
      list.innerHTML = '<li class="nhsuk-u-secondary-text-color">No events yet.</li>'
    } else {
      list.innerHTML = events.map(e => {
        const dateDisplay = new Date(e.event_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        const timeDisplay = e.event_time ? ` at ${e.event_time.slice(0, 5)}` : ''
        const nameSafe = escHtml(e.name).replace(/'/g, '&#39;')
        return `
          <li data-id="${e.id}" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;gap:8px">
            <span class="app-drag-handle material-icons" aria-hidden="true">drag_indicator</span>
            <span style="flex:1">${escHtml(e.name)} <span class="nhsuk-u-secondary-text-color nhsuk-body-s">${dateDisplay}${timeDisplay}</span></span>
            <div style="display:flex;gap:6px;flex-shrink:0">
              ${btn('Edit', 'edit', 'nhsuk-button--secondary', `editEvent('${e.id}')`)}
              ${btn('Remove', 'close', 'nhsuk-button--warning', `confirmDeleteEvent('${e.id}', '${nameSafe}')`)}
            </div>
          </li>`
      }).join('')
    }

    if (eventSortable) eventSortable.destroy()
    eventSortable = Sortable.create(list, {
      handle: '.app-drag-handle',
      animation: 150,
      onEnd: () => {
        const ids = [...list.querySelectorAll('li[data-id]')].map(li => li.dataset.id)
        api.reorderEvents(ids)
      }
    })
  } catch {
    list.innerHTML = '<li class="nhsuk-body nhsuk-u-secondary-text-color">Could not load events.</li>'
  }
}

// ── Add event ───────────────────────────────────────────────────

function getDirection() {
  return document.getElementById('new-event-dir-countup').checked ? 'countup' : 'countdown'
}

function resetAddForm() {
  document.getElementById('new-event-name').value = ''
  document.getElementById('new-event-description').value = ''
  document.getElementById('new-event-url').value = ''
  document.getElementById('new-event-date').value = ''
  document.getElementById('new-event-time').value = ''
  document.getElementById('new-event-dir-countdown').checked = true
  document.getElementById('add-event-error').style.display = 'none'
  updateAddBtnState()
}

function updateAddBtnState() {
  const hasName = !!document.getElementById('new-event-name').value.trim()
  const hasDate = !!document.getElementById('new-event-date').value
  document.getElementById('add-event-btn').disabled = !(hasName && hasDate)
  const hasAny = hasName || hasDate ||
    !!document.getElementById('new-event-description').value ||
    !!document.getElementById('new-event-url').value ||
    !!document.getElementById('new-event-time').value
  document.getElementById('cancel-event-btn').disabled = !hasAny
}

;['new-event-name', 'new-event-date', 'new-event-description', 'new-event-url', 'new-event-time'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateAddBtnState)
})

document.getElementById('add-event-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-event-name').value.trim()
  const event_date = document.getElementById('new-event-date').value
  if (!name || !event_date) return

  const addBtn = document.getElementById('add-event-btn')
  addBtn.disabled = true
  addBtn.textContent = 'Adding…'
  document.getElementById('add-event-error').style.display = 'none'

  try {
    await api.addEvent({
      name,
      description: document.getElementById('new-event-description').value.trim() || null,
      url: document.getElementById('new-event-url').value.trim() || null,
      direction: getDirection(),
      event_date,
      event_time: document.getElementById('new-event-time').value || null
    })
    resetAddForm()
    showToast(`"${name}" added.`)
    loadEvents()
  } catch (err) {
    document.getElementById('add-event-error').textContent = err.message
    document.getElementById('add-event-error').style.display = ''
    addBtn.disabled = false
    addBtn.textContent = 'Add event'
  }
})

document.getElementById('cancel-event-btn').addEventListener('click', resetAddForm)

document.getElementById('new-event-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-event-btn').click() }
})

// ── Edit event ──────────────────────────────────────────────────

let editingEventId = null

window.editEvent = function(id) {
  const e = _eventsCache.find(ev => ev.id === id)
  if (!e) return
  editingEventId = id
  document.getElementById('edit-event-name').value = e.name
  document.getElementById('edit-event-description').value = e.description || ''
  document.getElementById('edit-event-url').value = e.url || ''
  document.getElementById('edit-event-date').value = e.event_date
  document.getElementById('edit-event-time').value = e.event_time ? e.event_time.slice(0, 5) : ''
  document.getElementById('edit-event-dir-countdown').checked = e.direction === 'countdown'
  document.getElementById('edit-event-dir-countup').checked = e.direction === 'countup'
  document.getElementById('event-edit-error').style.display = 'none'
  document.getElementById('event-edit-modal').style.display = 'flex'
}

document.getElementById('event-edit-cancel-btn').addEventListener('click', () => {
  document.getElementById('event-edit-modal').style.display = 'none'
  editingEventId = null
})

document.getElementById('event-edit-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('edit-event-name').value.trim()
  const event_date = document.getElementById('edit-event-date').value
  if (!name || !event_date) return

  const saveBtn = document.getElementById('event-edit-save-btn')
  saveBtn.disabled = true
  saveBtn.textContent = 'Saving…'
  document.getElementById('event-edit-error').style.display = 'none'

  const direction = document.getElementById('edit-event-dir-countup').checked ? 'countup' : 'countdown'

  try {
    await api.updateEvent(editingEventId, {
      name,
      description: document.getElementById('edit-event-description').value.trim() || null,
      url: document.getElementById('edit-event-url').value.trim() || null,
      direction,
      event_date,
      event_time: document.getElementById('edit-event-time').value || null
    })
    document.getElementById('event-edit-modal').style.display = 'none'
    editingEventId = null
    showToast('Event updated.')
    loadEvents()
  } catch (err) {
    document.getElementById('event-edit-error').textContent = err.message
    document.getElementById('event-edit-error').style.display = ''
    saveBtn.disabled = false
    saveBtn.textContent = 'Save'
  }
})

// ── Delete event ────────────────────────────────────────────────

let deletingEventId = null

window.confirmDeleteEvent = function(id, name) {
  deletingEventId = id
  document.getElementById('event-delete-summary').textContent = `Remove "${name}" from your events?`
  document.getElementById('event-delete-modal').style.display = 'flex'
}

document.getElementById('event-delete-cancel-btn').addEventListener('click', () => {
  document.getElementById('event-delete-modal').style.display = 'none'
  deletingEventId = null
})

document.getElementById('event-delete-confirm-btn').addEventListener('click', async () => {
  const delBtn = document.getElementById('event-delete-confirm-btn')
  delBtn.disabled = true
  delBtn.textContent = 'Removing…'
  try {
    await api.deleteEvent(deletingEventId)
    document.getElementById('event-delete-modal').style.display = 'none'
    deletingEventId = null
    loadEvents()
  } catch (err) {
    document.getElementById('event-delete-modal').style.display = 'none'
    showToast(`Error: ${err.message}`, true)
  } finally {
    delBtn.disabled = false
    delBtn.textContent = 'Remove'
  }
})

// ── Init ────────────────────────────────────────────────────────

authReady.then(() => loadEvents())
