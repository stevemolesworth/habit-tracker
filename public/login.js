import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const splashImages = ['/gfx/chicken001.avif', '/gfx/chicken002.avif', '/gfx/chicken003.avif']
document.getElementById('login-page').style.backgroundImage =
  `url('${splashImages[Math.floor(Math.random() * splashImages.length)]}')`

let supabase = null

async function init() {
  const { supabaseUrl, supabaseAnonKey } = await fetch('/api/auth-config').then(r => r.json())
  supabase = createClient(supabaseUrl, supabaseAnonKey)

  if (new URLSearchParams(location.search).get('logout') === '1') {
    await supabase.auth.signOut().catch(() => {})
    history.replaceState(null, '', '/login.html')
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (session) { location.href = '/'; return }
}

function showError(msg) {
  document.getElementById('error-message').textContent = msg
  document.getElementById('error-banner').style.display = ''
}
function hideError() {
  document.getElementById('error-banner').style.display = 'none'
}

// Tab toggle
document.getElementById('tab-signin').addEventListener('click', (e) => {
  e.preventDefault()
  document.getElementById('signin-form').style.display = ''
  document.getElementById('signup-form').style.display = 'none'
  document.getElementById('tab-signin').classList.add('active')
  document.getElementById('tab-signup').classList.remove('active')
  hideError()
})
document.getElementById('tab-signup').addEventListener('click', (e) => {
  e.preventDefault()
  document.getElementById('signup-form').style.display = ''
  document.getElementById('signin-form').style.display = 'none'
  document.getElementById('tab-signup').classList.add('active')
  document.getElementById('tab-signin').classList.remove('active')
  hideError()
})

// Sign in
document.getElementById('signin-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  hideError()
  const btn = document.getElementById('signin-btn')
  btn.disabled = true
  btn.textContent = 'Signing in…'
  const email = document.getElementById('signin-email').value.trim()
  const password = document.getElementById('signin-password').value
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    location.href = '/'
  } catch (err) {
    showError(err.message || 'Sign in failed. Please check your email and password.')
    btn.disabled = false
    btn.textContent = 'Sign in'
  }
})

// Sign up
document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  hideError()
  const firstName = document.getElementById('signup-firstname').value.trim()
  const email = document.getElementById('signup-email').value.trim()
  const password = document.getElementById('signup-password').value
  const password2 = document.getElementById('signup-password2').value

  if (!firstName) { showError('Please enter your first name.'); return }
  if (!email) { showError('Please enter your email address.'); return }
  if (password.length < 6) { showError('Password must be at least 6 characters.'); return }
  if (password !== password2) { showError('Passwords do not match.'); return }

  const btn = document.getElementById('signup-btn')
  btn.disabled = true
  btn.textContent = 'Creating account…'
  try {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error

    // Create profile row
    const token = data.session?.access_token
    if (token) {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ first_name: firstName })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Could not create profile')
      }
    }

    location.href = '/'
  } catch (err) {
    showError(err.message || 'Could not create account. Please try again.')
    btn.disabled = false
    btn.textContent = 'Create account'
  }
})

init()
