import { api } from '/api.js'
import { authReady, getProfile, getToken, signOut } from '/auth.js'
import { showToast } from '/toast.js'

// ── Name edit ─────────────────────────────────────────────────

document.getElementById('edit-name-btn').addEventListener('click', (e) => {
  e.preventDefault()
  const current = document.getElementById('settings-account-name').textContent
  document.getElementById('edit-name-input').value = current === '—' ? '' : current
  document.getElementById('edit-name-row').style.display = ''
  document.getElementById('edit-name-btn').style.display = 'none'
  document.getElementById('edit-name-input').focus()
})

document.getElementById('cancel-name-btn').addEventListener('click', () => {
  document.getElementById('edit-name-row').style.display = 'none'
  document.getElementById('edit-name-btn').style.display = ''
})

document.getElementById('save-name-btn').addEventListener('click', async () => {
  const name = document.getElementById('edit-name-input').value.trim()
  const feedbackEl = document.getElementById('edit-name-feedback')
  if (!name) { feedbackEl.textContent = 'Name cannot be empty.'; feedbackEl.style.color = '#d5281b'; feedbackEl.style.display = ''; return }

  const btn = document.getElementById('save-name-btn')
  btn.disabled = true
  btn.textContent = 'Saving…'
  feedbackEl.style.display = 'none'

  try {
    const token = getToken()
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ first_name: name })
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed')
    document.getElementById('settings-account-name').textContent = name
    document.getElementById('edit-name-row').style.display = 'none'
    document.getElementById('edit-name-btn').style.display = ''
  } catch (err) {
    feedbackEl.textContent = err.message
    feedbackEl.style.color = '#d5281b'
    feedbackEl.style.display = ''
  } finally {
    btn.disabled = false
    btn.textContent = 'Save'
  }
})

// ── Export ────────────────────────────────────────────────────

async function downloadExport(format) {
  const btn = document.getElementById(`export-${format}-btn`)
  btn.disabled = true
  btn.textContent = 'Downloading…'
  try {
    const token = getToken()
    const res = await fetch(`/api/export?format=${format}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!res.ok) throw new Error(`Server returned ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `habit-tracker-export.${format}`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    showToast(`Export failed: ${err.message}`, 'error')
  } finally {
    btn.disabled = false
    btn.textContent = format === 'csv' ? 'Download CSV' : 'Download JSON'
  }
}

document.getElementById('export-csv-btn').addEventListener('click', () => downloadExport('csv'))
document.getElementById('export-json-btn').addEventListener('click', () => downloadExport('json'))

// ── Delete range ─────────────────────────────────────────────

function fmtDate(str) {
  return new Date(str + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

document.getElementById('delete-range-btn').addEventListener('click', () => {
  const from = document.getElementById('delete-from').value
  const to = document.getElementById('delete-to').value
  if (!from || !to) {
    showToast('Please select both a from and to date.', 'error')
    return
  }
  if (from > to) {
    showToast('"From" date must be on or before "To" date.', 'error')
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
    showToast(`${result.deleted} check-in${result.deleted === 1 ? '' : 's'} deleted.`)
  } catch (err) {
    document.getElementById('delete-range-modal').style.display = 'none'
    showToast(`Error: ${err.message}`, 'error')
  } finally {
    btn.disabled = false
    btn.textContent = 'Delete'
  }
})

// ── Delete account ────────────────────────────────────────────

document.getElementById('delete-account-btn').addEventListener('click', () => {
  document.getElementById('delete-account-email-confirm').value = ''
  document.getElementById('delete-account-error').style.display = 'none'
  document.getElementById('delete-account-modal').style.display = 'flex'
})

document.getElementById('delete-account-cancel-btn').addEventListener('click', () => {
  document.getElementById('delete-account-modal').style.display = 'none'
})

document.getElementById('delete-account-confirm-btn').addEventListener('click', async () => {
  const profile = getProfile()
  const entered = document.getElementById('delete-account-email-confirm').value.trim().toLowerCase()
  const expected = (profile?.email || '').toLowerCase()

  const errorEl = document.getElementById('delete-account-error')
  if (!entered || entered !== expected) {
    errorEl.textContent = 'Email address does not match.'
    errorEl.style.display = ''
    return
  }

  const btn = document.getElementById('delete-account-confirm-btn')
  btn.disabled = true
  btn.textContent = 'Deleting…'
  errorEl.style.display = 'none'

  try {
    await api.deleteAccount()
    await signOut()
  } catch (err) {
    errorEl.textContent = `Could not delete account: ${err.message}`
    errorEl.style.display = ''
    btn.disabled = false
    btn.textContent = 'Delete account'
  }
})

// ── Init ──────────────────────────────────────────────────────

authReady.then(() => { /* auth.js wireNav() handles name/email display */ })
