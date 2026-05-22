import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const { supabaseUrl, supabaseAnonKey } = await fetch('/api/auth-config').then(r => r.json())
const supabase = createClient(supabaseUrl, supabaseAnonKey)
const { data: { session } } = await supabase.auth.getSession()

const show = id => { const el = document.getElementById(id); if (el) el.style.display = '' }
const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none' }

if (session) {
  hide('nav-signin-link')
  show('nav-checkin-link')
  show('nav-calendar-link')
  show('nav-reports-link')
  show('nav-settings-link')
  show('nav-logout-btn')

  document.getElementById('nav-logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut()
    location.href = '/login.html'
  })

  try {
    const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${session.access_token}` } })
    if (res.ok) {
      const profile = await res.json()
      if (profile?.role === 'admin') show('admin-footer-item')
      const accountLink = document.getElementById('nav-account-link')
      if (accountLink && profile?.first_name) {
        const label = accountLink.querySelector('.app-btn-label')
        if (label) label.textContent = profile.first_name
        accountLink.style.display = ''
      }
    }
  } catch { /* non-fatal */ }
}
