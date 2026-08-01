import { eventos, refreshEventos } from './eventos.js'

import { changeOrderEventos } from '../common/api.js'

import { showToast } from '../common/toast.js'

let cambiandoOrden = false

/* ==========================================================
   MOVER HACIA ARRIBA
========================================================== */

export async function moverEventoArriba(eventoId) {
  if (cambiandoOrden) {
    return
  }

  const eventosOrdenados = obtenerEventosOrdenados()

  const indiceActual = eventosOrdenados.findIndex(
    (evento) => evento.id === eventoId
  )

  if (indiceActual <= 0) {
    return
  }

  const eventoActual = eventosOrdenados[indiceActual]

  const eventoAnterior = eventosOrdenados[indiceActual - 1]

  await intercambiarOrden(eventoActual, eventoAnterior)
}

/* ==========================================================
   MOVER HACIA ABAJO
========================================================== */

export async function moverEventoAbajo(eventoId) {
  if (cambiandoOrden) {
    return
  }

  const eventosOrdenados = obtenerEventosOrdenados()

  const indiceActual = eventosOrdenados.findIndex(
    (evento) => evento.id === eventoId
  )

  if (indiceActual === -1 || indiceActual >= eventosOrdenados.length - 1) {
    return
  }

  const eventoActual = eventosOrdenados[indiceActual]

  const eventoSiguiente = eventosOrdenados[indiceActual + 1]

  await intercambiarOrden(eventoActual, eventoSiguiente)
}

/* ==========================================================
   INTERCAMBIAR POSICIONES
========================================================== */

async function intercambiarOrden(primerEvento, segundoEvento) {
  cambiandoOrden = true

  /*
   * Guardamos las posiciones anteriores para poder
   * restaurar el estado local si la petición falla.
   */
  const primerOrdenAnterior = primerEvento.orden

  const segundoOrdenAnterior = segundoEvento.orden

  /*
   * Cambio optimista:
   * actualizamos primero los objetos locales para que la
   * interfaz responda inmediatamente.
   */
  primerEvento.orden = segundoOrdenAnterior

  segundoEvento.orden = primerOrdenAnterior

  try {
    await changeOrderEventos([
      {
        id: primerEvento.id,
        orden: primerEvento.orden
      },
      {
        id: segundoEvento.id,
        orden: segundoEvento.orden
      }
    ])

    /*
     * Volvemos a solicitar los eventos para que el frontend
     * quede sincronizado con PostgreSQL.
     */
    await refreshEventos()
  } catch (error) {
    /*
     * Restauramos el estado local si el backend rechazó
     * el cambio.
     */
    primerEvento.orden = primerOrdenAnterior

    segundoEvento.orden = segundoOrdenAnterior

    console.error('No se pudo cambiar el orden de los eventos:', error)

    showToast(
      error.message || 'No se pudo cambiar el orden de los eventos.',
      'error'
    )

    /*
     * También recargamos para recuperar el estado real
     * almacenado en el backend.
     */
    await refreshEventos()
  } finally {
    cambiandoOrden = false
  }
}

/* ==========================================================
   HELPERS
========================================================== */

function obtenerEventosOrdenados() {
  return [...eventos].sort((eventoA, eventoB) => eventoA.orden - eventoB.orden)
}
