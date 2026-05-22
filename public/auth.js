import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

let _supabase = null
let _token = null
let _profile = null

function fetchWithTimeout(url, ms = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const authReady = (async () => {
  const { supabaseUrl, supabaseAnonKey } = await fetchWithTimeout('/api/auth-config').then(r => r.json())
  _supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data: { session } } = await _supabase.auth.getSession()

  if (!session) {
    if (!location.pathname.endsWith('/login.html')) {
      location.href = '/login.html'
    }
    return
  }

  _token = session.access_token

  _supabase.auth.onAuthStateChange((_, s) => {
    _token = s?.access_token || null
    if (!_token && !location.pathname.endsWith('/login.html')) {
      location.href = '/login.html'
    }
  })

  try {
    const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${_token}` } })
    if (res.ok) _profile = await res.json()
  } catch { /* profile fetch failure is non-fatal */ }

  wireNav()
})()

function wireNav() {
  if (_profile?.role === 'admin') {
    const adminFooterItem = document.getElementById('admin-footer-item')
    if (adminFooterItem) adminFooterItem.style.display = ''
    const accountRoleRow = document.getElementById('account-role-row')
    if (accountRoleRow) {
      const roleValue = document.getElementById('account-role-value')
      if (roleValue) roleValue.innerHTML = '<a href="/admin.html" class="nhsuk-link">Admin</a>'
      accountRoleRow.style.display = ''
    }
  }

  const logoutBtn = document.getElementById('nav-logout-btn')
  if (logoutBtn) {
    logoutBtn.style.display = ''
    logoutBtn.addEventListener('click', () => signOut())
  }

  const settingsSignoutBtn = document.getElementById('settings-signout-btn')
  if (settingsSignoutBtn) {
    settingsSignoutBtn.addEventListener('click', () => signOut())
  }

  const navAccountLink = document.getElementById('nav-account-link')
  if (navAccountLink && _profile?.first_name) {
    const label = navAccountLink.querySelector('.app-btn-label')
    if (label) label.textContent = _profile.first_name
    navAccountLink.style.display = ''
  }

  const settingsName = document.getElementById('settings-account-name')
  if (settingsName && _profile) settingsName.textContent = _profile.first_name

  const settingsEmail = document.getElementById('settings-account-email')
  if (settingsEmail && _profile) settingsEmail.textContent = _profile.email
}

export function getToken() {
  return _token
}

export function getProfile() {
  return _profile
}

export async function signOut() {
  try {
    if (_supabase) await _supabase.auth.signOut()
  } catch { /* ignore sign-out errors */ }
  _token = null
  _profile = null
  location.href = '/login.html'
}

export function getSupabase() {
  return _supabase
}
