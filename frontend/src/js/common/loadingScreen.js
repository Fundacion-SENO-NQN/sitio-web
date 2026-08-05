import {
  hideElement,
  lockBodyScroll,
  resolveElement,
  setText,
  showElement
} from './dom.js'

const config = {
  screen: '#modal-carga-global',
  text: '#loading-text-global',

  hiddenClass: 'oculto',

  defaultMessage: 'Procesando...',

  /*
   * Prevents the screen from flashing for very fast
   * operations.
   */
  showDelay: 120,

  /*
   * Once displayed, it remains visible for at least this
   * amount of time.
   */
  minimumVisibleTime: 250
}

const activeOperations = new Map()

let screenElement = null
let textElement = null

let showTimer = null
let hideTimer = null

let visibleSince = 0
let releaseScrollLock = null

/* ==========================================================
   CONFIGURATION
========================================================== */

export function configureLoadingScreen(options = {}) {
  Object.assign(config, options)

  screenElement = null
  textElement = null

  resolveLoadingElements()

  return {
    start: startLoading,
    run: withLoading,
    hide: forceHideLoadingScreen
  }
}

/* ==========================================================
   START / STOP
========================================================== */

/**
 * Starts a loading operation and returns the function that
 * must finish it.
 *
 * const finish = startLoading('Guardando...')
 *
 * try {
 *   await save()
 * } finally {
 *   finish()
 * }
 */
export function startLoading(message = config.defaultMessage) {
  const token = Symbol('loading-operation')

  activeOperations.set(token, normalizeMessage(message))

  updateMessage()

  if (activeOperations.size === 1) {
    scheduleShow()
  }

  let finished = false

  return function finishLoading() {
    if (finished) return

    finished = true

    activeOperations.delete(token)

    if (activeOperations.size === 0) {
      scheduleHide()
    } else {
      updateMessage()
    }
  }
}

/* ==========================================================
   PROMISE WRAPPER
========================================================== */

/**
 * Wraps any asynchronous operation.
 *
 * await withLoading(
 *   () => generateReport(),
 *   {
 *     message: 'Generando reporte...'
 *   }
 * )
 */
export async function withLoading(
  operation,
  { message = config.defaultMessage } = {}
) {
  const finish = startLoading(message)

  try {
    const result = typeof operation === 'function' ? operation() : operation

    return await result
  } finally {
    finish()
  }
}

/* ==========================================================
   STATE
========================================================== */

export function isLoading() {
  return activeOperations.size > 0
}

export function forceHideLoadingScreen() {
  activeOperations.clear()

  clearTimeout(showTimer)
  clearTimeout(hideTimer)

  showTimer = null
  hideTimer = null

  hideNow()
}

/* ==========================================================
   SHOW
========================================================== */

function scheduleShow() {
  clearTimeout(hideTimer)
  hideTimer = null

  if (showTimer !== null) return

  showTimer = window.setTimeout(() => {
    showTimer = null

    if (activeOperations.size > 0) {
      showNow()
    }
  }, config.showDelay)
}

function showNow() {
  resolveLoadingElements()

  if (!screenElement) return

  updateMessage()

  showElement(screenElement, {
    hiddenClass: config.hiddenClass
  })

  screenElement.setAttribute('aria-hidden', 'false')

  document.documentElement.setAttribute('aria-busy', 'true')

  visibleSince = Date.now()

  if (!releaseScrollLock) {
    releaseScrollLock = lockBodyScroll()
  }
}

/* ==========================================================
   HIDE
========================================================== */

function scheduleHide() {
  clearTimeout(showTimer)
  showTimer = null

  if (!screenElement || isScreenHidden()) {
    hideNow()
    return
  }

  const elapsed = Date.now() - visibleSince

  const remaining = Math.max(0, config.minimumVisibleTime - elapsed)

  clearTimeout(hideTimer)

  hideTimer = window.setTimeout(() => {
    hideTimer = null

    if (activeOperations.size === 0) {
      hideNow()
    }
  }, remaining)
}

function hideNow() {
  resolveLoadingElements()

  if (screenElement) {
    hideElement(screenElement, {
      hiddenClass: config.hiddenClass
    })

    screenElement.setAttribute('aria-hidden', 'true')
  }

  document.documentElement.removeAttribute('aria-busy')

  releaseScrollLock?.()
  releaseScrollLock = null

  visibleSince = 0
}

/* ==========================================================
   MESSAGE
========================================================== */

function updateMessage() {
  resolveLoadingElements()

  if (!textElement) return

  let message = config.defaultMessage

  for (const operationMessage of activeOperations.values()) {
    message = operationMessage
  }

  setText(textElement, message)
}

function normalizeMessage(message) {
  const normalized = String(message ?? '').trim()

  return normalized || config.defaultMessage
}

/* ==========================================================
   DOM
========================================================== */

function resolveLoadingElements() {
  if (typeof document === 'undefined') return

  if (!screenElement || !document.contains(screenElement)) {
    screenElement = resolveElement(config.screen)
  }

  if (!textElement || !document.contains(textElement)) {
    textElement = resolveElement(config.text)
  }
}

function isScreenHidden() {
  return !screenElement || screenElement.classList.contains(config.hiddenClass)
}
