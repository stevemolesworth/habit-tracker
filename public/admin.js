import { authReady, profileReady, getProfile, getToken } from '/auth.js'

let allUsers = []
let sortCol = 'last_checkin_date'
let sortAsc = false

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str + (str.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

function renderTable() {
  const sorted = [...allUsers].sort((a, b) => {
    const av = a[sortCol] ?? ''
    const bv = b[sortCol] ?? ''
    if (av < bv) return sortAsc ? -1 : 1
    if (av > bv) return sortAsc ? 1 : -1
    return 0
  })

  const tbody = document.getElementById('user-table-body')
  tbody.innerHTML = sorted.map(u => `
    <tr class="nhsuk-table__row" style="cursor:pointer" data-id="${u.id}">
      <td class="nhsuk-table__cell">${u.first_name}</td>
      <td class="nhsuk-table__cell">${u.email}</td>
      <td class="nhsuk-table__cell">${fmtDate(u.created_at)}</td>
      <td class="nhsuk-table__cell">${fmtDate(u.last_checkin_date)}</td>
      <td class="nhsuk-table__cell">${u.behaviours_monitored ?? 0}</td>
    </tr>
  `).join('')

  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => loadUserDetail(row.dataset.id))
  })
}

document.getElementById('user-table').querySelectorAll('th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col
    if (sortCol === col) { sortAsc = !sortAsc } else { sortCol = col; sortAsc = true }
    renderTable()
  })
})

document.getElementById('detail-close-btn').addEventListener('click', () => {
  document.getElementById('user-detail-card').style.display = 'none'
})

async function loadUserDetail(id) {
  const card = document.getElementById('user-detail-card')
  const list = document.getElementById('detail-list')
  card.style.display = ''
  list.innerHTML = '<dd class="nhsuk-summary-list__value">Loading…</dd>'

  try {
    const res = await fetch(`/api/admin-user-detail?id=${id}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
    const d = await res.json()

    document.getElementById('detail-name').textContent = d.first_name

    const rows = [
      ['Email', d.email],
      ['Joined', fmtDate(d.created_at)],
      ['Location', d.location || '—'],
      ['Country', d.country || '—'],
      ['Check-ins', d.checkin_count],
      ['Behaviours monitored', d.behaviours_monitored],
      ['First check-in', fmtDate(d.first_checkin)],
      ['Last check-in', fmtDate(d.last_checkin)],
      ['Avg check-ins / week', d.avg_checkins_per_week != null ? d.avg_checkins_per_week : '—']
    ]

    list.innerHTML = rows.map(([label, value]) => `
      <div class="nhsuk-summary-list__row">
        <dt class="nhsuk-summary-list__key">${label}</dt>
        <dd class="nhsuk-summary-list__value">${value}</dd>
      </div>
    `).join('')
  } catch {
    list.innerHTML = '<dd class="nhsuk-summary-list__value">Could not load detail.</dd>'
  }
}

async function init() {
  await authReady
  await profileReady

  const profile = getProfile()
  if (profile?.role !== 'admin') {
    document.getElementById('access-denied').style.display = ''
    return
  }

  document.getElementById('admin-content').style.display = ''

  try {
    const res = await fetch('/api/admin-users', {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
    const { users, total_checkins } = await res.json()
    allUsers = users
    document.getElementById('stat-users').textContent = users.length
    document.getElementById('stat-checkins').textContent = total_checkins
    renderTable()
  } catch {
    document.getElementById('user-table-body').innerHTML =
      '<tr class="nhsuk-table__row"><td class="nhsuk-table__cell" colspan="4">Could not load users.</td></tr>'
  }
}

init()
