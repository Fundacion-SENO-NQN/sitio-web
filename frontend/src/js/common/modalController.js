import { showToast } from './toast.js'

/**
 * Generic controller for create/edit form modals.
 *
 * Handles:
 * - Create mode
 * - Edit mode
 * - Form submission
 * - Busy state
 * - Create/update API calls
 * - Refreshing the list
 * - Closing with buttons, backdrop and Escape
 * - Body scroll locking
 * - Success/error notifications
 * - Form reset and field population
 */
export function createFormModalController({
  modal,
  form,

  titleElement = null,
  saveButton = null,

  closeButtons = [],
  cancelButtons = [],
  backdrop = null,

  hiddenClass = 'oculto',
  lockBodyScroll = true,

  createTitle = 'Crear elemento',
  editTitle = 'Editar elemento',

  createButtonText = 'Crear',
  editButtonText = 'Guardar cambios',

  creatingText = 'Creando...',
  updatingText = 'Guardando cambios...',

  createSuccessMessage = 'El elemento fue creado correctamente.',

  updateSuccessMessage = 'El elemento fue actualizado correctamente.',

  errorMessage = 'No se pudo guardar el elemento.',

  create,
  update,
  refresh = null,

  validate = null,
  buildPayload = defaultBuildPayload,
  populate = defaultPopulateForm,
  clear = defaultClearForm,

  getId = defaultGetId,

  focusElement = null,

  onOpenCreate = null,
  onOpenEdit = null,
  onBeforeSubmit = null,
  onAfterSubmit = null,
  onClose = null,

  disableFormWhileSubmitting = false,

  notify = showToast
}) {
  const elements = {
    modal: resolveRequiredElement(modal, 'modal'),

    form: resolveRequiredElement(form, 'form'),

    titleElement: resolveElement(titleElement),

    saveButton: resolveElement(saveButton),

    closeButtons: resolveElements(closeButtons),

    cancelButtons: resolveElements(cancelButtons),

    backdrop: resolveElement(backdrop),

    focusElement
  }

  validateConfiguration({
    create,
    update,
    refresh,
    validate,
    buildPayload,
    populate,
    clear,
    getId
  })

  const state = {
    editingItem: null,
    submitting: false,
    initialized: false,
    opened: false
  }

  const eventController = new AbortController()

  const eventOptions = {
    signal: eventController.signal
  }

  const controller = {
    initialize,
    destroy,

    openCreate,
    openEdit,
    close,
    submit,

    reset: resetForm,

    setSubmitting,

    get editingItem() {
      return state.editingItem
    },

    get isEditing() {
      return state.editingItem !== null
    },

    get submitting() {
      return state.submitting
    },

    get opened() {
      return state.opened
    },

    get modal() {
      return elements.modal
    },

    get form() {
      return elements.form
    }
  }

  return controller

  /* ========================================================
     INITIALIZATION
  ======================================================== */

  function initialize() {
    if (state.initialized) return controller

    state.initialized = true

    elements.form.addEventListener('submit', submit, eventOptions)

    elements.closeButtons.forEach((button) => {
      button.addEventListener('click', close, eventOptions)
    })

    elements.cancelButtons.forEach((button) => {
      button.addEventListener('click', close, eventOptions)
    })

    /*
     * Used by modals that have a dedicated background:
     *
     * <div class="modal-fondo" data-close-modal></div>
     */
    elements.backdrop?.addEventListener('click', close, eventOptions)

    /*
     * Also supports modals where the modal itself acts
     * as the background container.
     */

    document.addEventListener('keydown', handleKeydown, eventOptions)

    return controller
  }

  function destroy() {
    eventController.abort()

    state.initialized = false
  }

  /* ========================================================
     OPEN CREATE
  ======================================================== */

  async function openCreate() {
    if (state.submitting) return

    state.editingItem = null

    await resetForm()

    updateTexts()

    if (typeof onOpenCreate === 'function')
      await onOpenCreate({
        controller,
        form: elements.form
      })

    showModal()
    focusInitialElement()
  }

  /* ========================================================
     OPEN EDIT
  ======================================================== */

  async function openEdit(item) {
    if (state.submitting || !item) return

    state.editingItem = item

    await resetForm({
      preserveEditingItem: true
    })

    await populate(elements.form, item, controller)

    updateTexts()

    if (typeof onOpenEdit === 'function')
      await onOpenEdit({
        item,
        controller,
        form: elements.form
      })

    showModal()
    focusInitialElement()
  }

  /* ========================================================
     SUBMIT
  ======================================================== */

  async function submit(event) {
    event?.preventDefault()

    if (state.submitting) return

    const editing = state.editingItem !== null

    try {
      if (typeof validate === 'function')
        await validate({
          form: elements.form,

          item: state.editingItem,

          editing,
          controller
        })

      if (typeof onBeforeSubmit === 'function')
        await onBeforeSubmit({
          form: elements.form,

          item: state.editingItem,

          editing,
          controller
        })

      const payload = await buildPayload({
        form: elements.form,

        item: state.editingItem,

        editing,
        controller
      })

      setSubmitting(true)

      let result

      if (editing)
        result = await update(
          getId(state.editingItem),
          payload,
          state.editingItem
        )
      else result = await create(payload)

      notify(
        resolveMessage(editing ? updateSuccessMessage : createSuccessMessage, {
          item: state.editingItem,

          result,
          editing
        }),
        'success'
      )

      /*
       * Force closing because the regular close operation
       * is blocked while a request is running.
       */
      await close({
        force: true
      })

      if (typeof refresh === 'function') {
        await refresh()
      }

      if (typeof onAfterSubmit === 'function') {
        await onAfterSubmit({
          result,
          editing,
          controller
        })
      }

      return result
    } catch (error) {
      console.error(errorMessage, error)

      notify(error instanceof Error ? error.message : errorMessage, 'error')

      return null
    } finally {
      setSubmitting(false)
    }
  }

  /* ========================================================
     CLOSE
  ======================================================== */

  async function close(options = {}) {
    const force = options?.force === true

    if (state.submitting && !force) return

    hideModal()

    const previousItem = state.editingItem

    state.editingItem = null

    await resetForm()

    updateTexts()

    if (typeof onClose === 'function')
      await onClose({
        previousItem,
        controller
      })
  }

  function showModal() {
    elements.modal.classList.remove(hiddenClass)

    elements.modal.setAttribute('aria-hidden', 'false')

    state.opened = true

    if (lockBodyScroll) document.body.style.overflow = 'hidden'
  }

  function hideModal() {
    elements.modal.classList.add(hiddenClass)

    elements.modal.setAttribute('aria-hidden', 'true')

    state.opened = false

    if (lockBodyScroll) document.body.style.overflow = ''
  }

  /* ========================================================
     RESET
  ======================================================== */

  async function resetForm({ preserveEditingItem = false } = {}) {
    await clear(elements.form, controller)

    if (!preserveEditingItem) state.editingItem = null
  }

  /* ========================================================
     BUSY STATE
  ======================================================== */

  function setSubmitting(submitting) {
    state.submitting = Boolean(submitting)

    const editing = state.editingItem !== null

    if (elements.saveButton) {
      elements.saveButton.disabled = state.submitting

      elements.saveButton.textContent = state.submitting
        ? editing
          ? updatingText
          : creatingText
        : editing
          ? editButtonText
          : createButtonText
    }

    elements.closeButtons.forEach((button) => {
      button.disabled = state.submitting
    })

    elements.cancelButtons.forEach((button) => {
      button.disabled = state.submitting
    })

    if (disableFormWhileSubmitting) setFormControlsDisabled(state.submitting)
  }

  function setFormControlsDisabled(disabled) {
    for (const control of elements.form.elements) {
      /*
       * The save, cancel and close buttons are managed
       * separately.
       */
      if (
        control === elements.saveButton ||
        elements.cancelButtons.includes(control) ||
        elements.closeButtons.includes(control)
      )
        continue

      control.disabled = disabled
    }
  }

  /* ========================================================
     TEXT
  ======================================================== */

  function updateTexts() {
    const editing = state.editingItem !== null

    if (elements.titleElement)
      elements.titleElement.textContent = editing ? editTitle : createTitle

    if (elements.saveButton && !state.submitting)
      elements.saveButton.textContent = editing
        ? editButtonText
        : createButtonText
  }

  /* ========================================================
     EVENTS
  ======================================================== */

  function handleKeydown(event) {
    if (event.key !== 'Escape' || !state.opened) return

    close()
  }

  /* ========================================================
     FOCUS
  ======================================================== */

  function focusInitialElement() {
    window.requestAnimationFrame(() => {
      const element = resolveFocusElement(elements.focusElement, controller)

      element?.focus()
    })
  }
}

/* ==========================================================
   DEFAULT FORM BEHAVIOUR
========================================================== */

/**
 * Creates FormData from the complete form.
 *
 * A page can replace this with a custom builder when it
 * needs to transform fields or use a JSON object.
 */
function defaultBuildPayload({ form }) {
  return new FormData(form)
}

function defaultClearForm(form) {
  form.reset()
}

/**
 * Populates inputs using each element's `name`.
 *
 * Example:
 *
 * item.titulo -> input[name="titulo"]
 * item.fecha   -> input[name="fecha"]
 */
function defaultPopulateForm(form, item) {
  for (const field of form.elements) {
    if (
      !field.name ||
      field.type === 'file' ||
      field.type === 'submit' ||
      field.type === 'button'
    )
      continue

    const value = item[field.name]

    if (field instanceof HTMLInputElement && field.type === 'checkbox') {
      field.checked = Boolean(value)

      continue
    }

    if (field instanceof HTMLInputElement && field.type === 'radio') {
      field.checked = String(field.value) === String(value)

      continue
    }

    if (field instanceof HTMLSelectElement && field.multiple) {
      const selectedValues = new Set(
        Array.isArray(value) ? value.map(String) : []
      )

      for (const option of field.options) {
        option.selected = selectedValues.has(option.value)
      }

      continue
    }

    field.value = value ?? ''
  }
}

function defaultGetId(item) {
  const id = Number(item?.id)

  if (!Number.isInteger(id) || id <= 0)
    throw new TypeError('The edited item does not have a valid id.')

  return id
}

/* ==========================================================
   CONFIGURATION VALIDATION
========================================================== */

function validateConfiguration({
  create,
  update,
  refresh,
  validate,
  buildPayload,
  populate,
  clear,
  getId
}) {
  if (typeof create !== 'function')
    throw new TypeError('createFormModalController requires a create function.')

  if (typeof update !== 'function')
    throw new TypeError(
      'createFormModalController requires an update function.'
    )

  const optionalFunctions = {
    refresh,
    validate
  }

  for (const [name, value] of Object.entries(optionalFunctions)) {
    if (value !== null && value !== undefined && typeof value !== 'function')
      throw new TypeError(`${name} must be a function.`)
  }

  const requiredFunctions = {
    buildPayload,
    populate,
    clear,
    getId
  }

  for (const [name, value] of Object.entries(requiredFunctions)) {
    if (typeof value !== 'function')
      throw new TypeError(`${name} must be a function.`)
  }
}

/* ==========================================================
   ELEMENT HELPERS
========================================================== */

function resolveRequiredElement(value, name) {
  const element = resolveElement(value)

  if (!element) throw new Error(`Could not find the modal element "${name}".`)

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

function resolveFocusElement(value, controller) {
  if (typeof value === 'function') return resolveElement(value(controller))

  return resolveElement(value)
}

/* ==========================================================
   MESSAGE HELPER
========================================================== */

function resolveMessage(message, context) {
  if (typeof message === 'function') return message(context)

  return message
}
