import {
  clearElement,
  createEventScope,
  focusSoon,
  requireElement,
  setVisible
} from '../common/dom.js'

export function createInformationRowsController({
  container,
  emptyElement,
  addButton,

  hiddenClass = 'oculto'
} = {}) {
  const elements = {
    container: requireElement(
      container,
      'contenedor de información del método'
    ),

    emptyElement: requireElement(emptyElement, 'mensaje de información vacía'),

    addButton: requireElement(addButton, 'botón para agregar información')
  }

  const events = createEventScope()

  const state = {
    initialized: false,
    sequence: 0
  }

  const controller = {
    initialize,
    destroy,

    add,
    clear,
    populate,
    getValues,

    get count() {
      return elements.container.children.length
    }
  }

  return controller

  function initialize() {
    if (state.initialized) {
      return controller
    }

    state.initialized = true

    events.on(elements.addButton, 'click', () => {
      add(null, {
        focus: true
      })
    })

    updateEmptyState()

    return controller
  }

  function destroy() {
    events.destroy()
    clear()

    state.initialized = false
  }

  function add(information = null, { focus = false } = {}) {
    state.sequence += 1

    const sequence = state.sequence

    const row = document.createElement('div')

    row.className = 'informationRow'

    if (hasValidId(information?.id)) {
      row.dataset.informationId = String(information.id)
    }

    const titleField = createField({
      id: `information-title-${sequence}`,
      className: 'informationTitle',
      label: 'Título',
      placeholder: 'Por ejemplo: Alias',
      value: information?.titulo ?? ''
    })

    const valueField = createField({
      id: `information-value-${sequence}`,
      className: 'informationValue',
      label: 'Valor',
      placeholder: 'Por ejemplo: fundacion.seno',
      value: information?.valor ?? ''
    })

    const removeButton = document.createElement('button')

    removeButton.type = 'button'
    removeButton.className = 'informationRemoveButton'
    removeButton.textContent = 'Quitar'

    removeButton.setAttribute('aria-label', `Quitar dato ${sequence}`)

    events.on(removeButton, 'click', () => {
      const nextFocusTarget =
        row.previousElementSibling?.querySelector('.informationRemoveButton') ??
        row.nextElementSibling?.querySelector('.informationRemoveButton') ??
        elements.addButton

      row.remove()

      updateEmptyState()
      focusSoon(nextFocusTarget)
    })

    row.append(titleField.container, valueField.container, removeButton)

    elements.container.appendChild(row)

    updateEmptyState()

    if (focus) {
      focusSoon(titleField.input)
    }

    return row
  }

  function clear() {
    clearElement(elements.container)

    state.sequence = 0

    updateEmptyState()
  }

  function populate(information) {
    clear()

    const items = Array.isArray(information) ? information : []

    items.forEach((item) => {
      add(item)
    })
  }

  function getValues() {
    return [...elements.container.querySelectorAll('.informationRow')].map(
      (row) => {
        const titleInput = row.querySelector('.informationTitle')

        const valueInput = row.querySelector('.informationValue')

        const id = Number(row.dataset.informationId)

        return {
          ...(Number.isInteger(id) && id > 0 ? { id } : {}),

          titulo: String(titleInput?.value ?? '').trim(),

          valor: String(valueInput?.value ?? '').trim()
        }
      }
    )
  }

  function updateEmptyState() {
    setVisible(
      elements.emptyElement,
      elements.container.children.length === 0,
      {
        hiddenClass
      }
    )
  }
}

function createField({ id, className, label, placeholder, value }) {
  const container = document.createElement('div')

  container.className = 'informationField'

  const labelElement = document.createElement('label')

  labelElement.htmlFor = id
  labelElement.textContent = label

  const input = document.createElement('input')

  input.id = id
  input.type = 'text'
  input.className = className
  input.placeholder = placeholder
  input.value = String(value ?? '')
  input.required = true
  input.autocomplete = 'off'

  container.append(labelElement, input)

  return {
    container,
    input
  }
}

function hasValidId(id) {
  const numericId = Number(id)

  return Number.isInteger(numericId) && numericId > 0
}
