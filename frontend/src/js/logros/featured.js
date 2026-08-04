import {
  closeModalElement,
  createEventScope,
  openModalElement,
  requireElement,
  setDisabled
} from '../common/dom.js'

import { showToast } from '../common/toast.js'

const MAX_FEATURED = 3

/* ==========================================================
   CONTROLLER FACTORY
========================================================== */

export function createFeaturedAchievementsController({
  load,
  replace,

  getAchievements,

  setLoading = null,
  onChange = null,

  maxFeatured = MAX_FEATURED
} = {}) {
  validarConfiguracion({
    load,
    replace,
    getAchievements,
    setLoading,
    onChange,
    maxFeatured
  })

  /* ========================================================
     ELEMENTOS
  ======================================================== */

  const modal = requireElement('#featuredModal', 'modal de logros destacados')

  const container = requireElement(
    '#featuredContainer',
    'contenedor de logros destacados'
  )

  const openButton = requireElement(
    '#btnFeatured',
    'botón para administrar logros destacados'
  )

  const cancelButton = requireElement(
    '#btnCancelFeatured',
    'botón para cancelar los logros destacados'
  )

  const saveButton = requireElement(
    '#btnSaveFeatured',
    'botón para guardar los logros destacados'
  )

  /* ========================================================
     ESTADO
  ======================================================== */

  const state = {
    items: [],
    selected: [],

    initialized: false,
    opened: false,
    loading: false,
    saving: false
  }

  let pendingRefresh = null

  const events = createEventScope()

  const controller = {
    initialize,
    destroy,

    refresh,

    open: openFeaturedModal,

    close: closeFeaturedModal,

    save: saveFeaturedAchievements,

    add: addFeatured,

    remove: removeFeatured,

    isFeatured,
    getPosition,

    render,

    get items() {
      return state.items
    },

    get selected() {
      return state.selected.map((item) => ({
        ...item
      }))
    },

    get opened() {
      return state.opened
    },

    get loading() {
      return state.loading
    },

    get saving() {
      return state.saving
    }
  }

  return controller

  /* ========================================================
     INITIALIZATION
  ======================================================== */

  function initialize() {
    if (state.initialized) return controller

    state.initialized = true

    events.on(openButton, 'click', openFeaturedModal)

    events.on(cancelButton, 'click', closeFeaturedModal)

    events.on(saveButton, 'click', saveFeaturedAchievements)

    events.on(modal, 'click', (event) => {
      if (event.target === modal) closeFeaturedModal()
    })

    events.on(document, 'keydown', (event) => {
      if (event.key === 'Escape' && state.opened) closeFeaturedModal()
    })

    actualizarEstadoBotones()

    return controller
  }

  function destroy() {
    events.destroy()

    state.items = []
    state.selected = []

    state.initialized = false
    state.opened = false
    state.loading = false
    state.saving = false

    pendingRefresh = null
  }

  /* ========================================================
     LOAD
  ======================================================== */

  function refresh({ manageLoading = true } = {}) {
    if (pendingRefresh) return pendingRefresh

    pendingRefresh = performRefresh({
      manageLoading
    }).finally(() => {
      pendingRefresh = null
    })

    return pendingRefresh
  }

  async function performRefresh({ manageLoading }) {
    state.loading = true

    if (manageLoading) await updateGlobalLoading(true)

    actualizarEstadoBotones()

    try {
      const response = await load()

      state.items = normalizarDestacados(response)

      if (state.opened) {
        copiarSeleccionActual()

        render()
      }

      if (typeof onChange === 'function')
        await onChange({
          items: state.items,

          controller
        })

      return state.items
    } catch (error) {
      console.error('No se pudieron cargar los logros destacados:', error)

      state.items = []

      showToast(
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar los logros destacados.',
        'error'
      )

      throw error
    } finally {
      state.loading = false

      actualizarEstadoBotones()

      if (manageLoading) {
        await updateGlobalLoading(false)
      }
    }
  }

  /* ========================================================
     OPEN
  ======================================================== */

  function openFeaturedModal() {
    if (state.saving || state.loading) return

    copiarSeleccionActual()

    render()

    openModalElement(modal, {
      hiddenClass: 'hidden',

      focus: cancelButton
    })

    state.opened = true
  }

  function closeFeaturedModal({ force = false } = {}) {
    if (state.saving && !force) return

    closeModalElement(modal, {
      hiddenClass: 'hidden'
    })

    state.opened = false
    state.selected = []

    container.replaceChildren()
  }

  function copiarSeleccionActual() {
    state.selected = state.items
      .map((item, index) => ({
        id: obtenerIdLogro(item),

        orden: index
      }))
      .filter((item) => item.id !== null)

    normalizarOrdenSeleccionado()
  }

  /* ========================================================
     RENDER
  ======================================================== */

  function render() {
    container.replaceChildren()

    const achievements = obtenerLogrosOrdenados()

    if (achievements.length === 0) {
      container.appendChild(crearEstadoVacio())

      return
    }

    const fragment = document.createDocumentFragment()

    achievements.forEach((achievement) => {
      fragment.appendChild(crearFilaLogro(achievement))
    })

    container.appendChild(fragment)
  }

  function crearFilaLogro(achievement) {
    const id = obtenerIdLogro(achievement)

    const row = document.createElement('div')

    row.className = 'featuredRow'

    if (id !== null) row.dataset.achievementId = String(id)

    const info = document.createElement('div')

    info.className = 'featuredInfo'

    info.textContent = obtenerTituloLogro(achievement)

    row.appendChild(info)

    const position = getPosition(id)

    if (position !== null) {
      const badge = document.createElement('span')

      badge.className = 'featuredPosition'

      badge.textContent = `#${position}`

      badge.setAttribute('aria-label', `Destacado en la posición ${position}`)

      row.appendChild(badge)
    }

    const button = document.createElement('button')

    button.type = 'button'

    if (position !== null) {
      button.textContent = 'Remover'

      button.className = 'tableButton delete'

      button.setAttribute(
        'aria-label',
        `Remover ${obtenerTituloLogro(achievement)} de los logros destacados`
      )

      button.addEventListener('click', () => {
        removeFeatured(id)
      })
    } else {
      button.textContent = 'Añadir'

      button.className = 'tableButton'

      button.setAttribute(
        'aria-label',
        `Añadir ${obtenerTituloLogro(achievement)} a los logros destacados`
      )

      button.addEventListener('click', () => {
        addFeatured(achievement)
      })
    }

    button.disabled = state.saving

    row.appendChild(button)

    return row
  }

  function crearEstadoVacio() {
    const message = document.createElement('p')

    message.className = 'featuredEmpty'

    message.textContent = 'No hay logros disponibles para destacar.'

    return message
  }

  /* ========================================================
     ADD
  ======================================================== */

  function addFeatured(achievement) {
    if (state.saving) return

    const id = obtenerIdLogro(achievement)

    if (id === null) {
      showToast('El logro no tiene un id válido.', 'error')

      return
    }

    if (isFeatured(id)) return

    /*
     * Mantiene el comportamiento original:
     * al añadir un cuarto logro se elimina el primero.
     */
    if (state.selected.length >= maxFeatured) {
      state.selected.shift()
    }

    state.selected.push({
      id,
      orden: state.selected.length
    })

    normalizarOrdenSeleccionado()

    render()
  }

  /* ========================================================
     REMOVE
  ======================================================== */

  function removeFeatured(id) {
    if (state.saving) return

    const normalizedId = normalizarId(id)

    if (normalizedId === null) return

    state.selected = state.selected.filter((item) => item.id !== normalizedId)

    normalizarOrdenSeleccionado()

    render()
  }

  /* ========================================================
     SAVE
  ======================================================== */

  async function saveFeaturedAchievements() {
    if (state.saving) return

    if (state.selected.length > maxFeatured) {
      showToast(
        `Solo se pueden seleccionar ${maxFeatured} logros destacados.`,
        'error'
      )

      return
    }

    const request = state.selected.map((item, index) => ({
      logro_id: item.id,

      orden: index
    }))

    state.saving = true

    actualizarEstadoBotones()
    render()

    await updateGlobalLoading(true)

    try {
      await replace(request)

      /*
       * Recarga sin volver a modificar el contador global,
       * porque esta operación ya mantiene el loader activo.
       */
      await refresh({
        manageLoading: false
      })

      closeFeaturedModal({
        force: true
      })

      showToast('Logros destacados actualizados.', 'success')
    } catch (error) {
      console.error('No se pudieron actualizar los logros destacados:', error)

      showToast(
        error instanceof Error
          ? error.message
          : 'No se pudieron actualizar los logros destacados.',
        'error'
      )
    } finally {
      state.saving = false

      actualizarEstadoBotones()

      await updateGlobalLoading(false)
    }
  }

  /* ========================================================
     FEATURED STATE
  ======================================================== */

  function isFeatured(id) {
    const normalizedId = normalizarId(id)

    if (normalizedId === null) return false

    return state.selected.some((item) => item.id === normalizedId)
  }

  function getPosition(id) {
    const normalizedId = normalizarId(id)

    if (normalizedId === null) return null

    const index = state.selected.findIndex((item) => item.id === normalizedId)

    return index === -1 ? null : index + 1
  }

  function normalizarOrdenSeleccionado() {
    state.selected = state.selected
      .filter((item, index, array) => {
        return (
          item.id !== null &&
          array.findIndex((other) => other.id === item.id) === index
        )
      })
      .slice(0, maxFeatured)

    state.selected.forEach((item, index) => {
      item.orden = index
    })
  }

  /* ========================================================
     ACHIEVEMENTS
  ======================================================== */

  function obtenerLogrosOrdenados() {
    const achievements = getAchievements()

    if (!Array.isArray(achievements)) return []

    return [...achievements].sort((first, second) => {
      return normalizarOrden(first?.orden) - normalizarOrden(second?.orden)
    })
  }

  /* ========================================================
     BUTTON STATE
  ======================================================== */

  function actualizarEstadoBotones() {
    const busy = state.loading || state.saving

    setDisabled([openButton, cancelButton, saveButton], busy)

    saveButton.textContent = state.saving ? 'Guardando...' : 'Guardar'
  }

  /* ========================================================
     GLOBAL LOADING
  ======================================================== */

  async function updateGlobalLoading(value) {
    if (typeof setLoading === 'function') await setLoading(Boolean(value))
  }
}

/* ==========================================================
   RESPONSE NORMALIZATION
========================================================== */

function normalizarDestacados(response) {
  if (!Array.isArray(response)) return []

  /*
   * Se copia cada objeto y se normaliza `orden` según la
   * posición devuelta por el endpoint.
   *
   * Esto funciona tanto cuando el backend devuelve:
   *
   * { id, titulo, contenido, ... }
   *
   * como cuando devuelve:
   *
   * { id, logro_id, orden, ... }
   */
  return response
    .map((item, index) => ({
      ...item,

      orden: index
    }))
    .filter((item) => obtenerIdLogro(item) !== null)
}

/* ==========================================================
   DATA HELPERS
========================================================== */

function obtenerIdLogro(item) {
  const value = item?.logro_id ?? item?.id

  return normalizarId(value)
}

function obtenerTituloLogro(item) {
  const title = String(item?.titulo ?? '').trim()

  if (title) return title

  const id = obtenerIdLogro(item)

  return id === null ? 'Logro sin título' : `Logro n.º ${id}`
}

function normalizarId(value) {
  const id = Number(value)

  if (!Number.isInteger(id) || id <= 0) return null

  return id
}

function normalizarOrden(value) {
  const order = Number(value)

  if (!Number.isInteger(order) || order < 0) return 0

  return order
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validarConfiguracion({
  load,
  replace,
  getAchievements,
  setLoading,
  onChange,
  maxFeatured
}) {
  const requiredFunctions = {
    load,
    replace,
    getAchievements
  }

  for (const [name, value] of Object.entries(requiredFunctions)) {
    if (typeof value !== 'function')
      throw new TypeError(
        `createFeaturedAchievementsController requiere ${name}.`
      )
  }

  const optionalFunctions = {
    setLoading,
    onChange
  }

  for (const [name, value] of Object.entries(optionalFunctions)) {
    if (value !== null && value !== undefined && typeof value !== 'function')
      throw new TypeError(`${name} debe ser una función.`)
  }

  if (!Number.isInteger(maxFeatured) || maxFeatured <= 0)
    throw new TypeError('maxFeatured debe ser un entero positivo.')
}
