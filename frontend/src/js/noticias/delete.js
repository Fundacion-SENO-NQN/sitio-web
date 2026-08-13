import { createDeleteController } from '../common/deleteController.js'

/* ==========================================================
   DELETE CONTROLLER FACTORY
========================================================== */

export function createNoticiaDeleteController({ remove, refresh } = {}) {
  validarConfiguracion({
    remove,
    refresh
  })

  return createDeleteController({
    modal: '#modal-eliminar-noticia',

    confirmButton: '#btn-confirmar-eliminar',

    cancelButtons: ['#btn-cancelar-eliminar'],

    closeButtons: ['#btn-cerrar-modal-eliminar'],

    backdrop: '[data-cerrar-modal-eliminar]',

    textElement: '#texto-eliminar-noticia',

    hiddenClass: 'oculto',

    focusElement: '#btn-cancelar-eliminar',

    lockBodyScroll: true,

    remove,
    refresh,

    getId(noticia) {
      return obtenerIdNoticia(noticia)
    },

    getName(noticia) {
      return obtenerTituloNoticia(noticia)
    },

    buildConfirmationText(noticia, { name }) {
      const cantidadImagenes = formatearCantidadImagenes(noticia.cant_img)

      return (
        `La noticia “${name}” y sus ` +
        `${cantidadImagenes} serán eliminadas permanentemente.`
      )
    },

    defaultText:
      'La noticia y todas sus imágenes serán eliminadas permanentemente.',

    deletingText: 'Eliminando noticia...',

    confirmButtonText: 'Eliminar noticia',

    successMessage({ name }) {
      return `La noticia “${name}” ` + 'fue eliminada correctamente.'
    },

    errorMessage: 'No se pudo eliminar la noticia.'
  })
}

/* ==========================================================
   NEWS DATA
========================================================== */

function obtenerIdNoticia(noticia) {
  const id = Number(noticia?.id)

  if (!Number.isInteger(id) || id <= 0)
    throw new TypeError('La noticia no tiene un id válido.')

  return id
}

function obtenerTituloNoticia(noticia) {
  const titulo = String(noticia?.titulo ?? '').trim()

  if (titulo) return titulo

  return `noticia n.º ${noticia?.id ?? ''}`.trim()
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
    throw new TypeError('createNoticiaDeleteController requiere remove.')

  if (typeof refresh !== 'function')
    throw new TypeError('createNoticiaDeleteController requiere refresh.')
}
