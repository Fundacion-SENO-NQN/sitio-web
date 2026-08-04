import { createDeleteController } from '../common/deleteController.js'

/* ==========================================================
   DELETE CONTROLLER FACTORY
========================================================== */

export function createEventoDeleteController({ remove, refresh } = {}) {
  validarConfiguracion({
    remove,
    refresh
  })

  return createDeleteController({
    modal: '#modal-eliminar-evento',

    confirmButton: '#btn-confirmar-eliminar',

    cancelButtons: ['#btn-cancelar-eliminar'],

    closeButtons: ['#btn-cerrar-modal-eliminar'],

    backdrop: '[data-cerrar-modal-eliminar]',

    textElement: '#texto-eliminar-evento',

    hiddenClass: 'oculto',

    focusElement: '#btn-cancelar-eliminar',

    lockBodyScroll: true,

    remove,
    refresh,

    getId(evento) {
      return obtenerIdEvento(evento)
    },

    getName(evento) {
      return obtenerTituloEvento(evento)
    },

    buildConfirmationText(evento, { name }) {
      const cantidadImagenes = formatearCantidadImagenes(evento.cant_img)

      return (
        `El evento “${name}”, su enlace y sus ` +
        `${cantidadImagenes} serán eliminados permanentemente.`
      )
    },

    defaultText:
      'El evento y todas sus imágenes serán eliminados permanentemente.',

    deletingText: 'Eliminando evento...',

    confirmButtonText: 'Eliminar evento',

    successMessage({ name }) {
      return `El evento “${name}” ` + 'fue eliminado correctamente.'
    },

    errorMessage: 'No se pudo eliminar el evento.'
  })
}

/* ==========================================================
   EVENT DATA
========================================================== */

function obtenerIdEvento(evento) {
  const id = Number(evento?.id)

  if (!Number.isInteger(id) || id <= 0)
    throw new TypeError('El evento no tiene un id válido.')

  return id
}

function obtenerTituloEvento(evento) {
  const titulo = String(evento?.titulo ?? '').trim()

  if (titulo) return titulo

  return `evento n.º ${evento?.id ?? ''}`.trim()
}

/* ==========================================================
   IMAGE COUNT
========================================================== */

function formatearCantidadImagenes(cantidad) {
  const cantidadNormalizada = Math.max(0, Number(cantidad) || 0)

  if (cantidadNormalizada === 1) return '1 imagen'

  return `${cantidadNormalizada} imágenes`
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validarConfiguracion({ remove, refresh }) {
  if (typeof remove !== 'function')
    throw new TypeError('createEventoDeleteController requiere remove.')

  if (typeof refresh !== 'function')
    throw new TypeError('createEventoDeleteController requiere refresh.')
}
