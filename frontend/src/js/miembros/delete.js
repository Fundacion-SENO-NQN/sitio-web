import { createDeleteController } from '../common/deleteController.js'

/* ==========================================================
   DELETE CONTROLLER FACTORY
========================================================== */

export function createMiembroDeleteController({ remove, refresh } = {}) {
  validarConfiguracion({
    remove,
    refresh
  })

  return createDeleteController({
    modal: '#deleteMemberModal',

    confirmButton: '#btnDeleteMember',

    cancelButtons: ['#btnCancelDeleteMember'],

    textElement: '#deleteMemberText',

    /*
     * Esta página utiliza la clase "hidden" en lugar de
     * "oculto".
     */
    hiddenClass: 'hidden',

    focusElement: '#btnCancelDeleteMember',

    lockBodyScroll: true,

    remove,
    refresh,

    getId(miembro) {
      return obtenerIdMiembro(miembro)
    },

    getName(miembro) {
      return obtenerNombreCompleto(miembro)
    },

    buildConfirmationText(_miembro, { name }) {
      return (
        `¿Seguro que querés eliminar a “${name}”? ` +
        'Esta acción no se puede deshacer.'
      )
    },

    defaultText:
      '¿Seguro que querés eliminar este miembro? Esta acción no se puede deshacer.',

    deletingText: 'Eliminando...',

    confirmButtonText: 'Eliminar',

    successMessage({ name }) {
      return `${name} fue eliminado ` + 'correctamente.'
    },

    errorMessage: 'No se pudo eliminar el miembro.'
  })
}

/* ==========================================================
   MEMBER DATA
========================================================== */

function obtenerIdMiembro(miembro) {
  const id = Number(miembro?.id)

  if (!Number.isInteger(id) || id <= 0)
    throw new TypeError('El miembro no tiene un id válido.')

  return id
}

function obtenerNombreCompleto(miembro) {
  const nombreCompleto = [miembro?.nombre, miembro?.apellido]
    .map((valor) => String(valor ?? '').trim())
    .filter(Boolean)
    .join(' ')

  if (nombreCompleto) return nombreCompleto

  return (`miembro n.º ` + `${miembro?.id ?? ''}`).trim()
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validarConfiguracion({ remove, refresh }) {
  if (typeof remove !== 'function')
    throw new TypeError('createMiembroDeleteController requiere remove.')

  if (typeof refresh !== 'function')
    throw new TypeError('createMiembroDeleteController requiere refresh.')
}
