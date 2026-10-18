export function showToast(message, type = 'success') {
  const toast = document.createElement('div')

  toast.className = `toast ${type}`

  toast.textContent = message

  document.body.appendChild(toast)

  // Use a slight delay to allow the browser to paint the element before transitioning
  setTimeout(() => {
    requestAnimationFrame(() => {
      toast.classList.add('show')

      // Remove the toast after 2.5 seconds
      setTimeout(() => {
        toast.classList.remove('show')

        // Wait for the CSS transition to complete before removing from DOM
        toast.addEventListener('transitionend', (e) => {
          if (e.propertyName === 'opacity' || e.propertyName === 'transform') {
            toast.remove()
          }
        }, { once: true })

        // Fallback in case transitionend doesn't fire (e.g. document hidden)
        setTimeout(() => toast.remove(), 1000)
      }, 2500)
    })
  }, 10)
}
