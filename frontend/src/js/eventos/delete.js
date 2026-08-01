import { deleteEvento } from '../common/api.js'

import { refreshEventos } from './eventos.js'

import { showToast } from '../common/toast.js'

/* ==========================================================
   ELEMENTOS
========================================================== */

const modal = document.getElementById('modal-eliminar-evento')

const modalBackground = modal?.querySelector('[data-cerrar-modal-eliminar]')

const closeButton = document.getElementById('btn-cerrar-modal-eliminar')

const cancelButton = document.getElementById('btn-cancelar-eliminar')

const confirmButton = document.getElementById('btn-confirmar-eliminar')

const deleteText = document.getElementById('texto-eliminar-evento')

/* ==========================================================
   ESTADO
========================================================== */

let eventoAEliminar = null
let eliminando = false

/* ==========================================================
   REGISTRAR EVENTOS
========================================================== */

export function registrarEventosEliminar() {
  closeButton?.addEventListener('click', cerrarModalEliminarEvento)

  cancelButton?.addEventListener('click', cerrarModalEliminarEvento)

  confirmButton?.addEventListener('click', confirmarEliminacion)

  modalBackground?.addEventListener('click', cerrarModalEliminarEvento)

  document.addEventListener('keydown', manejarTeclado)
}

/* ==========================================================
   ABRIR MODAL
========================================================== */

export function abrirModalEliminarEvento(evento) {
  if (eliminando || !evento) {
    return
  }

  eventoAEliminar = evento

  if (deleteText) {
    deleteText.textContent =
      `El evento “${evento.titulo}”, su enlace y sus ` +
      `${formatearCantidadImagenes(evento.cant_img)} ` +
      'serán eliminados permanentemente.'
  }

  modal?.classList.remove('oculto')

  document.body.style.overflow = 'hidden'

  window.setTimeout(() => {
    cancelButton?.focus()
  }, 0)
}

/* ==========================================================
   CONFIRMAR ELIMINACIÓN
========================================================== */

async function confirmarEliminacion() {
  if (eliminando || !eventoAEliminar) {
    return
  }

  eliminando = true
  actualizarEstadoEliminacion(true)

  const eventoId = eventoAEliminar.id

  const eventoTitulo = eventoAEliminar.titulo

  try {
    await deleteEvento(eventoId)

    /*
     * Ocultamos el modal antes de recargar la tabla para
     * evitar que el evento eliminado siga visible detrás.
     */
    ocultarModal()

    eventoAEliminar = null

    showToast(`El evento “${eventoTitulo}” fue eliminado correctamente.`)

    await refreshEventos()
  } catch (error) {
    console.error('No se pudo eliminar el evento:', error)

    showToast(error.message || 'No se pudo eliminar el evento.', 'error')
  } finally {
    eliminando = false
    actualizarEstadoEliminacion(false)
  }
}

/* ==========================================================
   CERRAR MODAL
========================================================== */

function cerrarModalEliminarEvento() {
  if (eliminando) {
    return
  }

  ocultarModal()

  eventoAEliminar = null
}

function ocultarModal() {
  modal?.classList.add('oculto')

  document.body.style.overflow = ''

  if (deleteText) {
    deleteText.textContent =
      'El evento y todas sus imágenes serán eliminados permanentemente.'
  }
}

/* ==========================================================
   ESTADO DE LOS BOTONES
========================================================== */

function actualizarEstadoEliminacion(valor) {
  if (confirmButton) {
    confirmButton.disabled = valor

    confirmButton.textContent = valor
      ? 'Eliminando evento...'
      : 'Eliminar evento'
  }

  if (cancelButton) {
    cancelButton.disabled = valor
  }

  if (closeButton) {
    closeButton.disabled = valor
  }
}

/* ==========================================================
   TECLADO
========================================================== */

function manejarTeclado(event) {
  if (event.key !== 'Escape' || modal?.classList.contains('oculto')) {
    return
  }

  cerrarModalEliminarEvento()
}

/* ==========================================================
   HELPERS
========================================================== */

function formatearCantidadImagenes(cantidad) {
  const cantidadNormalizada = Number(cantidad) || 0

  if (cantidadNormalizada === 1) {
    return '1 imagen'
  }

  return `${cantidadNormalizada} imágenes`
}
