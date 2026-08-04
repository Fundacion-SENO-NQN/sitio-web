export function showToast(message, type = 'success') {
  const toast = document.createElement('div')

  toast.className = `toast ${type}`

  toast.textContent = message

  document.body.appendChild(toast)

  setTimeout(() => {
    requestAnimationFrame(() => toast.classList.add('show'))
    setTimeout(() => {
      toast.classList.remove('show')

      setTimeout(toast.remove, 300)
    }, 2500)
  }, 100)
}
