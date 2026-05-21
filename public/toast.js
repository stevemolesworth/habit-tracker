const DURATION = 4000

export function showToast(message, type = 'success') {
  const container = getOrCreateContainer()
  const toast = document.createElement('div')
  toast.className = `app-toast app-toast--${type}`
  toast.textContent = message
  container.appendChild(toast)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('app-toast--visible'))
  })

  setTimeout(() => {
    toast.classList.remove('app-toast--visible')
    toast.addEventListener('transitionend', () => toast.remove(), { once: true })
  }, DURATION)
}

function getOrCreateContainer() {
  let el = document.getElementById('app-toast-container')
  if (!el) {
    el = document.createElement('div')
    el.id = 'app-toast-container'
    document.body.appendChild(el)
  }
  return el
}
