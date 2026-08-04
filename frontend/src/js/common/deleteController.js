import { showToast } from './toast.js'

/**
 * Controlador reutilizable para modales de eliminación.
 *
 * Se encarga de:
 * - Guardar el elemento seleccionado.
 * - Abrir y cerrar el modal.
 * - Cerrar mediante fondo o Escape.
 * - Mostrar el nombre del elemento.
 * - Bloquear controles durante la petición.
 * - Ejecutar la función DELETE.
 * - Recargar la lista.
 * - Mostrar mensajes de éxito o error.
 */
export function createDeleteController({
  modal,

  confirmButton,
  cancelButtons = [],
  closeButtons = [],

  backdrop = null,
  textElement = null,

  remove,
  refresh = null,

  getId = defaultGetId,
  getName = defaultGetName,

  buildConfirmationText = defaultBuildConfirmationText,

  defaultText = '',

  deletingText = 'Eliminando...',
  confirmButtonText = 'Eliminar',

  successMessage = 'El elemento fue eliminado correctamente.',

  errorMessage = 'No se pudo eliminar el elemento.',

  hiddenClass = 'oculto',

  lockBodyScroll = true,

  focusElement = null,

  onOpen = null,
  onClose = null,
  onDeleted = null,

  notify = showToast
} = {}) {
  const elements = {
    modal: resolveRequiredElement(modal, 'modal de eliminación'),

    confirmButton: resolveRequiredElement(
      confirmButton,
      'botón de confirmación'
    ),

    cancelButtons: resolveElements(cancelButtons),

    closeButtons: resolveElements(closeButtons),

    backdrop: resolveElement(backdrop),

    textElement: resolveElement(textElement),

    focusElement
  }

  validateConfiguration({
    remove,
    refresh,
    getId,
    getName,
    buildConfirmationText,
    onOpen,
    onClose,
    onDeleted,
    notify
  })

  const state = {
    item: null,
    deleting: false,
    opened: false,
    initialized: false
  }

  const eventController = new AbortController()

  const eventOptions = {
    signal: eventController.signal
  }

  const controller = {
    initialize,
    destroy,

    open,
    close,
    confirm,

    setDeleting,

    get item() {
      return state.item
    },

    get deleting() {
      return state.deleting
    },

    get opened() {
      return state.opened
    }
  }

  return controller

  /* ========================================================
     INITIALIZATION
  ======================================================== */

  function initialize() {
    if (state.initialized) return controller

    state.initialized = true

    elements.confirmButton.addEventListener('click', confirm, eventOptions)

    elements.cancelButtons.forEach((button) => {
      button.addEventListener('click', close, eventOptions)
    })

    elements.closeButtons.forEach((button) => {
      button.addEventListener('click', close, eventOptions)
    })

    elements.backdrop?.addEventListener('click', close, eventOptions)

    /*
     * También permite usar el propio contenedor modal
     * como fondo.
     */
    elements.modal.addEventListener('click', handleModalClick, eventOptions)

    document.addEventListener('keydown', handleKeydown, eventOptions)

    updateButtonState()

    return controller
  }

  function destroy() {
    eventController.abort()

    state.item = null
    state.deleting = false
    state.opened = false
    state.initialized = false
  }

  /* ========================================================
     OPEN
  ======================================================== */

  async function open(item) {
    if (state.deleting || !item) return

    state.item = item

    updateConfirmationText()

    if (typeof onOpen === 'function')
      await onOpen({
        item,
        controller
      })

    elements.modal.classList.remove(hiddenClass)

    elements.modal.setAttribute('aria-hidden', 'false')

    state.opened = true

    if (lockBodyScroll) document.body.style.overflow = 'hidden'

    window.requestAnimationFrame(() => {
      const element =
        resolveFocusElement(elements.focusElement) ??
        elements.cancelButtons[0] ??
        elements.confirmButton

      element?.focus()
    })
  }

  /* ========================================================
     CONFIRM DELETE
  ======================================================== */

  async function confirm() {
    if (state.deleting || !state.item) return

    const item = state.item

    let id
    let name

    try {
      id = getId(item)

      name = getName(item)
    } catch (error) {
      notify(error instanceof Error ? error.message : errorMessage, 'error')

      return
    }

    setDeleting(true)

    try {
      const result = await remove(id, item)

      /*
       * Se fuerza el cierre porque el cierre normal está
       * bloqueado mientras deleting sea true.
       */
      await close({
        force: true
      })

      notify(
        resolveMessage(successMessage, {
          item,
          id,
          name,
          result
        }),
        'success'
      )

      if (typeof refresh === 'function') await refresh()

      if (typeof onDeleted === 'function')
        await onDeleted({
          item,
          id,
          name,
          result,
          controller
        })

      return result
    } catch (error) {
      console.error(errorMessage, error)

      notify(error instanceof Error ? error.message : errorMessage, 'error')

      return null
    } finally {
      setDeleting(false)
    }
  }

  /* ========================================================
     CLOSE
  ======================================================== */

  async function close(options = {}) {
    const force = options?.force === true

    if (state.deleting && !force) return

    const previousItem = state.item

    elements.modal.classList.add(hiddenClass)

    elements.modal.setAttribute('aria-hidden', 'true')

    state.opened = false
    state.item = null

    if (lockBodyScroll) document.body.style.overflow = ''

    restoreConfirmationText()

    if (typeof onClose === 'function')
      await onClose({
        item: previousItem,

        controller
      })
  }

  /* ========================================================
     DELETING STATE
  ======================================================== */

  function setDeleting(value) {
    state.deleting = Boolean(value)

    updateButtonState()
  }

  function updateButtonState() {
    elements.confirmButton.disabled = state.deleting

    elements.confirmButton.textContent = state.deleting
      ? deletingText
      : confirmButtonText

    elements.cancelButtons.forEach((button) => {
      button.disabled = state.deleting
    })

    elements.closeButtons.forEach((button) => {
      button.disabled = state.deleting
    })
  }

  /* ========================================================
     TEXT
  ======================================================== */

  function updateConfirmationText() {
    if (!elements.textElement || !state.item) return

    elements.textElement.textContent = buildConfirmationText(state.item, {
      id: getId(state.item),

      name: getName(state.item),

      controller
    })
  }

  function restoreConfirmationText() {
    if (!elements.textElement) return

    elements.textElement.textContent = defaultText
  }

  /* ========================================================
     EVENTS
  ======================================================== */

  function handleModalClick(event) {
    if (event.target === elements.modal) close()
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape' || !state.opened) return

    close()
  }
}

/* ==========================================================
   DEFAULT FUNCTIONS
========================================================== */

function defaultGetId(item) {
  const id = Number(item?.id)

  if (!Number.isInteger(id) || id <= 0)
    throw new TypeError('El elemento no tiene un id válido.')

  return id
}

function defaultGetName(item) {
  return item?.titulo ?? item?.nombre ?? `elemento ${item?.id ?? ''}`
}

function defaultBuildConfirmationText(_item, { name }) {
  return (
    `¿Seguro que querés eliminar “${name}”? ` +
    'Esta acción no se puede deshacer.'
  )
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validateConfiguration({
  remove,
  refresh,
  getId,
  getName,
  buildConfirmationText,
  onOpen,
  onClose,
  onDeleted,
  notify
}) {
  const requiredFunctions = {
    remove,
    getId,
    getName,
    buildConfirmationText,
    notify
  }

  for (const [name, value] of Object.entries(requiredFunctions)) {
    if (typeof value !== 'function')
      throw new TypeError(`${name} debe ser una función.`)
  }

  const optionalFunctions = {
    refresh,
    onOpen,
    onClose,
    onDeleted
  }

  for (const [name, value] of Object.entries(optionalFunctions)) {
    if (value !== null && value !== undefined && typeof value !== 'function')
      throw new TypeError(`${name} debe ser una función.`)
  }
}

/* ==========================================================
   DOM HELPERS
========================================================== */

function resolveRequiredElement(value, description) {
  const element = resolveElement(value)

  if (!element) throw new Error(`No se encontró: ${description}.`)

  return element
}

function resolveElement(value) {
  if (!value) return null

  if (value instanceof Element) return value

  if (typeof value === 'string') return document.querySelector(value)

  return null
}

function resolveElements(values) {
  if (!values) return []

  if (typeof values === 'string') return [...document.querySelectorAll(values)]

  if (values instanceof Element) return [values]

  if (Array.isArray(values) || values instanceof NodeList)
    return [...values].map(resolveElement).filter(Boolean)

  return []
}

function resolveFocusElement(value) {
  if (typeof value === 'function') return resolveElement(value())

  return resolveElement(value)
}

/* ==========================================================
   MESSAGE
========================================================== */

function resolveMessage(message, context) {
  if (typeof message === 'function') return message(context)

  return message
}
