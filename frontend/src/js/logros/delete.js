import { createDeleteController } from '../common/deleteController.js'

/* ==========================================================
   DELETE CONTROLLER FACTORY
========================================================== */

export function createLogroDeleteController({
  remove,
  refresh,
  setLoading
} = {}) {
  validarConfiguracion({
    remove,
    refresh,
    setLoading
  })

  /* ========================================================
     PETICIONES CON INDICADOR DE CARGA
  ======================================================== */

  async function eliminarLogro(id, logro) {
    setLoading(true)

    try {
      return await remove(id, logro)
    } finally {
      setLoading(false)
    }
  }

  async function recargarLogros() {
    setLoading(true)

    try {
      return await refresh()
    } finally {
      setLoading(false)
    }
  }

  /* ========================================================
     CONTROLADOR
  ======================================================== */

  return createDeleteController({
    modal: '#deleteModal',

    confirmButton: '#btnDelete',

    cancelButtons: ['#btnCancelDelete'],

    textElement: '#deleteText',

    /*
     * En la página de logros, el propio contenedor del
     * modal funciona como fondo.
     */
    hiddenClass: 'hidden',

    focusElement: '#btnCancelDelete',

    lockBodyScroll: true,

    remove: eliminarLogro,

    refresh: recargarLogros,

    getId(logro) {
      return obtenerIdLogro(logro)
    },

    getName(logro) {
      return obtenerTituloLogro(logro)
    },

    buildConfirmationText(_logro, { name }) {
      return (
        `¿Seguro que querés borrar “${name}”? ` +
        'Esta acción no se puede deshacer.'
      )
    },

    defaultText:
      '¿Seguro que querés borrar este logro? Esta acción no se puede deshacer.',

    deletingText: 'Borrando...',

    confirmButtonText: 'Borrar',

    successMessage: 'Logro borrado.',

    errorMessage: 'No se pudo borrar el logro.'
  })
}

/* ==========================================================
   ACHIEVEMENT DATA
========================================================== */

function obtenerIdLogro(logro) {
  const id = Number(logro?.id)

  if (!Number.isInteger(id) || id <= 0)
    throw new TypeError('El logro no tiene un id válido.')

  return id
}

function obtenerTituloLogro(logro) {
  const titulo = String(logro?.titulo ?? '').trim()

  if (titulo) return titulo

  return `logro n.º ${logro?.id ?? ''}`.trim()
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validarConfiguracion({ remove, refresh, setLoading }) {
  const funciones = {
    remove,
    refresh,
    setLoading
  }

  for (const [nombre, funcion] of Object.entries(funciones)) {
    if (typeof funcion !== 'function')
      throw new TypeError(`createLogroDeleteController requiere ${nombre}.`)
  }
}
