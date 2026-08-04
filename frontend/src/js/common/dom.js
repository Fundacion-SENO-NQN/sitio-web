/**
 * Utilidades generales para manipular el DOM dentro de la
 * plataforma administrativa.
 *
 * Centraliza:
 * - Resolución de selectores.
 * - Mostrar y ocultar elementos.
 * - Apertura y cierre de modales.
 * - Bloqueo del scroll.
 * - Activación y desactivación de controles.
 * - Manejo de texto, atributos, clases y datasets.
 * - Registro y limpieza de eventos.
 * - Cierre mediante Escape o fondo.
 */

/* ==========================================================
   ELEMENT RESOLUTION
========================================================== */

/**
 * Resuelve un selector o devuelve directamente el elemento.
 *
 * @param {string | Element | null | undefined} value
 * @param {ParentNode} root
 * @returns {Element | null}
 */
export function resolveElement(value, root = document) {
  if (!value) return null

  if (isElement(value)) return value

  if (typeof value === 'string')
    try {
      return root.querySelector(value)
    } catch (error) {
      throw new Error(`El selector "${value}" no es válido.`, {
        cause: error
      })
    }

  return null
}

/**
 * Igual que resolveElement(), pero lanza un error cuando el
 * elemento no existe.
 */
export function requireElement(
  value,
  description = 'elemento',
  root = document
) {
  const element = resolveElement(value, root)

  if (!element) throw new Error(`No se encontró: ${description}.`)

  return element
}

/**
 * Resuelve:
 * - Un selector.
 * - Un Element.
 * - Un arreglo.
 * - NodeList.
 * - HTMLCollection.
 * - Cualquier iterable de elementos o selectores.
 */
export function resolveElements(values, root = document) {
  if (!values) return []

  if (isElement(values)) return [values]

  if (typeof values === 'string') {
    try {
      return [...root.querySelectorAll(values)]
    } catch (error) {
      throw new Error(`El selector "${values}" no es válido.`, {
        cause: error
      })
    }
  }

  if (
    Array.isArray(values) ||
    isNodeList(values) ||
    isHtmlCollection(values) ||
    isIterable(values)
  )
    return [...values]
      .flatMap((value) => resolveElements(value, root))
      .filter(Boolean)

  return []
}

/* ==========================================================
   VISIBILITY
========================================================== */

/**
 * Muestra u oculta uno o varios elementos.
 *
 * Por defecto utiliza la clase "oculto". Para páginas antiguas:
 *
 * setVisible(modal, true, {
 *   hiddenClass: 'hidden'
 * })
 *
 * Para elementos que utilizan el atributo HTML hidden:
 *
 * setVisible(loader, true, {
 *   useHiddenAttribute: true,
 *   hiddenClass: null
 * })
 */
export function setVisible(
  targets,
  visible,
  { hiddenClass = 'oculto', useHiddenAttribute = false, updateAria = true } = {}
) {
  const elements = resolveElements(targets)

  elements.forEach((element) => {
    if (hiddenClass) element.classList.toggle(hiddenClass, !visible)

    if (useHiddenAttribute) element.hidden = !visible

    if (updateAria) element.setAttribute('aria-hidden', String(!visible))
  })

  return elements
}

export function showElement(targets, options = {}) {
  return setVisible(targets, true, options)
}

export function hideElement(targets, options = {}) {
  return setVisible(targets, false, options)
}

export function toggleElement(targets, options = {}) {
  const elements = resolveElements(targets)

  elements.forEach((element) => {
    setVisible(element, isHidden(element, options), options)
  })

  return elements
}

export function isHidden(
  target,
  { hiddenClass = 'oculto', useHiddenAttribute = false } = {}
) {
  const element = resolveElement(target)

  if (!element) return true

  if (useHiddenAttribute && element.hidden) return true

  if (hiddenClass && element.classList.contains(hiddenClass)) return true

  return false
}

/* ==========================================================
   TEXT AND CONTENT
========================================================== */

export function setText(target, value) {
  const element = resolveElement(target)

  if (!element) return null

  element.textContent = String(value ?? '')

  return element
}

export function clearElement(target) {
  const element = resolveElement(target)

  element?.replaceChildren()

  return element
}

export function replaceContent(target, ...content) {
  const element = requireElement(target, 'contenedor')

  const nodes = content
    .flat(Infinity)
    .filter((value) => value !== null && value !== undefined)
    .map(toNode)

  element.replaceChildren(...nodes)

  return element
}

function toNode(value) {
  if (value instanceof Node) return value

  return document.createTextNode(String(value))
}

/* ==========================================================
   CLASSES
========================================================== */

export function addClasses(target, classes) {
  const element = resolveElement(target)

  if (!element) return null

  normalizeClassNames(classes).forEach((className) => {
    element.classList.add(className)
  })

  return element
}

export function removeClasses(target, classes) {
  const element = resolveElement(target)

  if (!element) return null

  normalizeClassNames(classes).forEach((className) => {
    element.classList.remove(className)
  })

  return element
}

export function toggleClass(target, className, force) {
  const element = resolveElement(target)

  if (!element) return false

  if (force === undefined) return element.classList.toggle(className)

  return element.classList.toggle(className, Boolean(force))
}

export function setClasses(target, classes) {
  const element = resolveElement(target)

  if (!element) return null

  element.className = ''

  addClasses(element, classes)

  return element
}

function normalizeClassNames(classes) {
  if (!classes) return []

  if (Array.isArray(classes))
    return classes.flatMap(normalizeClassNames).filter(Boolean)

  if (typeof classes === 'object') {
    return Object.entries(classes)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([className]) => className)
  }

  return String(classes).split(/\s+/).filter(Boolean)
}

/* ==========================================================
   ATTRIBUTES AND DATASET
========================================================== */

export function setAttributes(target, attributes) {
  const element = resolveElement(target)

  if (!element || !attributes || typeof attributes !== 'object') return element

  Object.entries(attributes).forEach(([name, value]) => {
    if (value === null || value === undefined || value === false) {
      element.removeAttribute(name)

      return
    }

    if (value === true) {
      element.setAttribute(name, '')

      return
    }

    element.setAttribute(name, String(value))
  })

  return element
}

export function setDataset(target, values) {
  const element = resolveElement(target)

  if (!element || !values || typeof values !== 'object') return element

  Object.entries(values).forEach(([name, value]) => {
    if (value === null || value === undefined) {
      delete element.dataset[name]

      return
    }

    element.dataset[name] = String(value)
  })

  return element
}

/* ==========================================================
   DISABLED AND BUSY STATES
========================================================== */

export function setDisabled(targets, disabled) {
  const elements = resolveElements(targets)

  elements.forEach((element) => {
    if ('disabled' in element) element.disabled = Boolean(disabled)

    element.setAttribute('aria-disabled', String(Boolean(disabled)))
  })

  return elements
}

/**
 * Deshabilita todos los controles dentro de un contenedor.
 *
 * exclude puede contener selectores o elementos.
 */
export function setControlsDisabled(
  container,
  disabled,
  { exclude = [] } = {}
) {
  const root = requireElement(container, 'contenedor de controles')

  const excludedElements = new Set(resolveElements(exclude, root))

  const controls = [
    ...root.querySelectorAll('button, input, textarea, select, fieldset')
  ]

  controls.forEach((control) => {
    if (excludedElements.has(control)) return

    control.disabled = Boolean(disabled)

    control.setAttribute('aria-disabled', String(Boolean(disabled)))
  })

  return controls
}

/**
 * Actualiza de manera conjunta el estado visual de un botón.
 */
export function setButtonState(
  target,
  { disabled = undefined, text = undefined, busy = undefined } = {}
) {
  const button = resolveElement(target)

  if (!button) return null

  if (disabled !== undefined) button.disabled = Boolean(disabled)

  if (text !== undefined) button.textContent = String(text)

  if (busy !== undefined)
    button.setAttribute('aria-busy', String(Boolean(busy)))

  return button
}

/* ==========================================================
   FOCUS
========================================================== */

export function focusSoon(target, { selectText = false } = {}) {
  window.requestAnimationFrame(() => {
    const element = resolveElement(target)

    if (!element) return

    element.focus()

    if (selectText && typeof element.select === 'function') element.select()
  })
}

/* ==========================================================
   BODY SCROLL LOCK
========================================================== */

let scrollLockCount = 0
let previousBodyOverflow = ''

/**
 * Devuelve una función que libera únicamente este bloqueo.
 *
 * const unlock = lockBodyScroll()
 * unlock()
 */
export function lockBodyScroll() {
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'
  }

  scrollLockCount += 1

  let released = false

  return function releaseScrollLock() {
    if (released) return

    released = true

    unlockBodyScroll()
  }
}

export function unlockBodyScroll() {
  if (scrollLockCount === 0) return

  scrollLockCount -= 1

  if (scrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow

    previousBodyOverflow = ''
  }
}

export function resetBodyScrollLock() {
  scrollLockCount = 0

  document.body.style.overflow = previousBodyOverflow

  previousBodyOverflow = ''
}

/* ==========================================================
   MODALS
========================================================== */

const modalScrollUnlockers = new WeakMap()

export function openModalElement(
  target,
  {
    hiddenClass = 'oculto',
    useHiddenAttribute = false,

    lockScroll = true,
    focus = null,

    role = 'dialog'
  } = {}
) {
  const modal = requireElement(target, 'modal')

  showElement(modal, {
    hiddenClass,
    useHiddenAttribute,
    updateAria: true
  })

  if (role) {
    modal.setAttribute('role', role)
  }

  modal.setAttribute('aria-modal', 'true')

  if (lockScroll && !modalScrollUnlockers.has(modal))
    modalScrollUnlockers.set(modal, lockBodyScroll())

  if (focus) focusSoon(focus)

  return modal
}

export function closeModalElement(
  target,
  { hiddenClass = 'oculto', useHiddenAttribute = false } = {}
) {
  const modal = resolveElement(target)

  if (!modal) return null

  hideElement(modal, {
    hiddenClass,
    useHiddenAttribute,
    updateAria: true
  })

  modal.setAttribute('aria-modal', 'false')

  const unlockScroll = modalScrollUnlockers.get(modal)

  if (unlockScroll) {
    unlockScroll()

    modalScrollUnlockers.delete(modal)
  }

  return modal
}

/* ==========================================================
   EVENT SCOPE
========================================================== */

/**
 * Permite registrar todos los eventos de un módulo y
 * eliminarlos juntos.
 *
 * const events = createEventScope()
 *
 * events.on(button, 'click', save)
 * events.on(document, 'keydown', handleKeydown)
 *
 * events.destroy()
 */
export function createEventScope() {
  const controller = new AbortController()

  let destroyed = false

  return {
    get signal() {
      return controller.signal
    },

    on(targets, type, listener, options = {}) {
      if (destroyed) throw new Error('El grupo de eventos ya fue destruido.')

      if (typeof listener !== 'function')
        throw new TypeError('El listener debe ser una función.')

      const elements = resolveEventTargets(targets)

      elements.forEach((element) => {
        element.addEventListener(type, listener, {
          ...normalizeEventOptions(options),

          signal: controller.signal
        })
      })

      return listener
    },

    destroy() {
      if (destroyed) return

      destroyed = true

      controller.abort()
    },

    get destroyed() {
      return destroyed
    }
  }
}

/* ==========================================================
   DISMISS EVENTS
========================================================== */

/**
 * Registra el cierre de un modal mediante:
 * - Botones.
 * - Fondo.
 * - Tecla Escape.
 *
 * Devuelve una función de limpieza.
 */
export function registerModalDismiss({
  modal,

  close,

  buttons = [],
  backdrop = null,

  closeOnModalBackground = true,
  closeOnEscape = true,

  canClose = null,

  eventScope = null
} = {}) {
  const modalElement = requireElement(modal, 'modal')

  if (typeof close !== 'function')
    throw new TypeError('close debe ser una función.')

  const scope = eventScope ?? createEventScope()

  const shouldClose = () =>
    typeof canClose === 'function' ? Boolean(canClose()) : true

  resolveElements(buttons).forEach((button) => {
    scope.on(button, 'click', () => {
      if (shouldClose()) close()
    })
  })

  const backdropElement = resolveElement(backdrop)

  if (backdropElement) {
    scope.on(backdropElement, 'click', () => {
      if (shouldClose()) close()
    })
  }

  if (closeOnModalBackground) {
    scope.on(modalElement, 'click', (event) => {
      if (event.target === modalElement && shouldClose()) close()
    })
  }

  if (closeOnEscape) {
    scope.on(document, 'keydown', (event) => {
      if (event.key === 'Escape' && shouldClose()) close()
    })
  }

  return () => {
    if (!eventScope) scope.destroy()
  }
}

/* ==========================================================
   EVENT HELPERS
========================================================== */

function resolveEventTargets(targets) {
  if (targets === document || targets === window) return [targets]

  if (Array.isArray(targets))
    return targets.flatMap(resolveEventTargets).filter(Boolean)

  if (targets instanceof EventTarget && !isElement(targets)) return [targets]

  return resolveElements(targets)
}

function normalizeEventOptions(options) {
  if (typeof options === 'boolean')
    return {
      capture: options
    }

  return options ?? {}
}

/* ==========================================================
   TYPE HELPERS
========================================================== */

function isElement(value) {
  return typeof Element !== 'undefined' && value instanceof Element
}

function isNodeList(value) {
  return typeof NodeList !== 'undefined' && value instanceof NodeList
}

function isHtmlCollection(value) {
  return (
    typeof HTMLCollection !== 'undefined' && value instanceof HTMLCollection
  )
}

function isIterable(value) {
  return (
    value !== null &&
    value !== undefined &&
    typeof value !== 'string' &&
    typeof value[Symbol.iterator] === 'function'
  )
}
