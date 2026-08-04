import { createEventScope, requireElement } from '../common/dom.js'

import { showToast } from '../common/toast.js'

const ENTITY_USER = 'user'
const ENTITY_ROLE = 'role'

/* ==========================================================
   DELETE CONTROLLER FACTORY
========================================================== */

export function createUsersDeleteController({
  removeUser,
  removeRole,

  refreshUsers,
  refreshRoles,

  isCurrentUser,
  isCurrentRole
} = {}) {
  validarConfiguracion({
    removeUser,
    removeRole,
    refreshUsers,
    refreshRoles,
    isCurrentUser,
    isCurrentRole
  })

  /* ========================================================
     ELEMENTOS
  ======================================================== */

  const modal = requireElement('#confirmModal', 'modal de confirmación')

  const confirmationText = requireElement(
    '#confirmText',
    'texto de confirmación'
  )

  const cancelButton = requireElement(
    '#btnCancelDelete',
    'botón para cancelar la eliminación'
  )

  const confirmButton = requireElement(
    '#btnConfirmDelete',
    'botón para confirmar la eliminación'
  )

  const modalLoader = requireElement(
    '#modal-carga-confirm',
    'indicador de carga de eliminación'
  )

  /* ========================================================
     ESTADO
  ======================================================== */

  const state = {
    initialized: false,
    opened: false,
    deleting: false,

    entityType: null,
    entity: null,

    previousBodyOverflow: ''
  }

  const events = createEventScope()

  const controller = {
    initialize,
    destroy,

    openUser,
    openRole,

    confirm: confirmDelete,

    close: closeModal,

    get opened() {
      return state.opened
    },

    get deleting() {
      return state.deleting
    },

    get entity() {
      return state.entity
    },

    get entityType() {
      return state.entityType
    }
  }

  return controller

  /* ========================================================
     INITIALIZATION
  ======================================================== */

  function initialize() {
    if (state.initialized) return controller

    events.on(cancelButton, 'click', closeModal)

    events.on(confirmButton, 'click', confirmDelete)

    events.on(modal, 'click', (event) => {
      if (event.target === modal) {
        closeModal()
      }
    })

    events.on(document, 'keydown', (event) => {
      if (event.key === 'Escape' && state.opened) {
        closeModal()
      }
    })

    ocultarLoader()
    actualizarEstadoBotones(false)

    state.initialized = true

    return controller
  }

  function destroy() {
    events.destroy()

    closeModal({
      force: true
    })

    state.initialized = false
  }

  /* ========================================================
     OPEN USER
  ======================================================== */

  function openUser(user) {
    if (state.deleting || !user) return false

    if (isCurrentUser(user)) {
      showToast('No podés borrar tu propio usuario.', 'warning')

      return false
    }

    return openModal({
      entityType: ENTITY_USER,

      entity: user
    })
  }

  /* ========================================================
     OPEN ROLE
  ======================================================== */

  function openRole(role) {
    if (state.deleting || !role) return false

    if (isCurrentRole(role)) {
      showToast(
        'No podés borrar el rol utilizado por tu sesión actual.',
        'warning'
      )

      return false
    }

    return openModal({
      entityType: ENTITY_ROLE,

      entity: role
    })
  }

  /* ========================================================
     OPEN MODAL
  ======================================================== */

  function openModal({ entityType, entity }) {
    state.entityType = entityType

    state.entity = entity

    confirmationText.textContent = construirTextoConfirmacion({
      entityType,
      entity
    })

    ocultarLoader()
    actualizarEstadoBotones(false)

    modal.classList.remove('hidden')

    modal.hidden = false

    modal.setAttribute('aria-hidden', 'false')

    modal.setAttribute('aria-busy', 'false')

    state.previousBodyOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    state.opened = true

    window.setTimeout(() => {
      if (state.opened && !state.deleting) {
        cancelButton.focus()
      }
    }, 0)

    return true
  }

  /* ========================================================
     CONFIRM DELETE
  ======================================================== */

  async function confirmDelete() {
    if (state.deleting || !state.entity || !state.entityType) return false

    const entity = state.entity

    const entityType = state.entityType

    if (
      !puedeEliminar({
        entityType,
        entity
      })
    ) {
      closeModal({
        force: true
      })

      return false
    }

    const id = obtenerIdEntidad(entity)

    state.deleting = true

    mostrarLoader()
    actualizarEstadoBotones(true)

    modal.setAttribute('aria-busy', 'true')

    try {
      if (entityType === ENTITY_USER) await removeUser(id, entity)
      else await removeRole(id, entity)

      /*
       * La eliminación ya se realizó. Si la recarga falla,
       * no informamos incorrectamente que el borrado falló.
       */
      await recargarDespuesDeEliminar(entityType)

      closeModal({
        force: true
      })

      showToast(obtenerMensajeExito(entityType), 'success')

      return true
    } catch (error) {
      console.error(
        entityType === ENTITY_USER
          ? 'No se pudo borrar el usuario:'
          : 'No se pudo borrar el rol:',
        error
      )

      showToast(obtenerMensajeError(error, entityType), 'error')

      return false
    } finally {
      state.deleting = false

      if (state.opened) {
        ocultarLoader()
        actualizarEstadoBotones(false)

        modal.setAttribute('aria-busy', 'false')
      }
    }
  }

  /* ========================================================
     REFRESH
  ======================================================== */

  async function recargarDespuesDeEliminar(entityType) {
    try {
      if (entityType === ENTITY_USER)
        await refreshUsers({
          showLoading: false
        })
      else
        /*
         * users.js pasa refreshRolesAndUsers, por lo que al
         * borrar un rol también se actualizan los usuarios.
         */
        await refreshRoles({
          showLoading: false
        })
    } catch (error) {
      console.error(
        'La entidad fue borrada, pero no se pudo actualizar la tabla:',
        error
      )

      showToast(
        'El elemento fue borrado, pero no se pudo actualizar la lista.',
        'warning'
      )
    }
  }

  /* ========================================================
     CLOSE MODAL
  ======================================================== */

  function closeModal({ force = false } = {}) {
    if (state.deleting && !force) return false

    modal.classList.add('hidden')

    modal.hidden = true

    modal.setAttribute('aria-hidden', 'true')

    modal.setAttribute('aria-busy', 'false')

    document.body.style.overflow = state.previousBodyOverflow

    state.opened = false
    state.entityType = null
    state.entity = null
    state.previousBodyOverflow = ''

    confirmationText.textContent = '¿Seguro que querés borrar este elemento?'

    ocultarLoader()
    actualizarEstadoBotones(false)

    return true
  }

  /* ========================================================
     PERMISSIONS
  ======================================================== */

  function puedeEliminar({ entityType, entity }) {
    if (entityType === ENTITY_USER && isCurrentUser(entity)) {
      showToast('No podés borrar tu propio usuario.', 'warning')

      return false
    }

    if (entityType === ENTITY_ROLE && isCurrentRole(entity)) {
      showToast(
        'No podés borrar el rol utilizado por tu sesión actual.',
        'warning'
      )

      return false
    }

    return true
  }

  /* ========================================================
     LOADER
  ======================================================== */

  function mostrarLoader() {
    modalLoader.classList.remove('hidden')

    modalLoader.hidden = false

    modalLoader.setAttribute('aria-hidden', 'false')
  }

  function ocultarLoader() {
    modalLoader.classList.add('hidden')

    modalLoader.hidden = true

    modalLoader.setAttribute('aria-hidden', 'true')
  }

  /* ========================================================
     BUTTON STATE
  ======================================================== */

  function actualizarEstadoBotones(deleting) {
    confirmButton.disabled = deleting

    cancelButton.disabled = deleting

    confirmButton.textContent = deleting ? 'Borrando...' : 'Borrar'

    confirmButton.setAttribute('aria-busy', String(deleting))
  }
}

/* ==========================================================
   CONFIRMATION TEXT
========================================================== */

function construirTextoConfirmacion({ entityType, entity }) {
  if (entityType === ENTITY_USER)
    return (
      `¿Borrar el usuario “${obtenerNombreUsuario(entity)}”? ` +
      'Esta acción no se puede deshacer.'
    )

  return (
    `¿Borrar el rol “${obtenerNombreRol(entity)}”? ` +
    'Esta acción no se puede deshacer.'
  )
}

/* ==========================================================
   SUCCESS MESSAGE
========================================================== */

function obtenerMensajeExito(entityType) {
  return entityType === ENTITY_USER
    ? 'Usuario borrado exitosamente.'
    : 'Rol borrado exitosamente.'
}

/* ==========================================================
   ERROR MESSAGE
========================================================== */

function obtenerMensajeError(error, entityType) {
  const backendMessage = extraerMensajeError(error)

  if (backendMessage) return backendMessage

  return entityType === ENTITY_USER
    ? 'No se pudo borrar el usuario.'
    : 'No se pudo borrar el rol.'
}

function extraerMensajeError(error) {
  if (typeof error?.message === 'string') {
    const message = error.message.trim()

    if (message) return message
  }

  /*
   * Algunos errores antiguos llegaban con una estructura
   * parecida a { message: { error: "..." } }.
   */
  if (typeof error?.message?.error === 'string')
    return error.message.error.trim()

  if (typeof error?.error === 'string') return error.error.trim()

  return ''
}

/* ==========================================================
   ENTITY DATA
========================================================== */

function obtenerIdEntidad(entity) {
  const id = Number(entity?.id)

  if (!Number.isInteger(id) || id <= 0)
    throw new TypeError('La entidad no tiene un id válido.')

  return id
}

function obtenerNombreUsuario(user) {
  const username = String(user?.username ?? '').trim()

  if (username) return username

  return `usuario n.º ${user?.id ?? ''}`.trim()
}

function obtenerNombreRol(role) {
  const name = String(role?.name ?? '').trim()

  if (name) return name

  return `rol n.º ${role?.id ?? ''}`.trim()
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validarConfiguracion({
  removeUser,
  removeRole,
  refreshUsers,
  refreshRoles,
  isCurrentUser,
  isCurrentRole
}) {
  const functions = {
    removeUser,
    removeRole,
    refreshUsers,
    refreshRoles,
    isCurrentUser,
    isCurrentRole
  }

  for (const [name, value] of Object.entries(functions)) {
    if (typeof value !== 'function')
      throw new TypeError(`createUsersDeleteController requiere ${name}.`)
  }
}
