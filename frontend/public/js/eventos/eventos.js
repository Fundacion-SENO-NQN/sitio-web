import {
  getEventos,
} from '../common/api.js'

import {
  renderEventos,
} from './table.js'

import {
  abrirModalCrearEvento,
  registrarEventosModal,
} from './modal.js'

import {
  registrarEventosEliminar,
} from './delete.js'

/* ==========================================================
   ESTADO
========================================================== */

export let eventos = []
export let eventosFiltrados = []

let cargando = false

/* ==========================================================
   ELEMENTOS
========================================================== */

const inputBusqueda =
  document.getElementById(
    'buscar-eventos',
  )

const cantidadEventos =
  document.getElementById(
    'cantidad-eventos',
  )

const estadoCargando =
  document.getElementById(
    'estado-cargando',
  )

const estadoError =
  document.getElementById(
    'estado-error',
  )

const estadoVacio =
  document.getElementById(
    'estado-vacio',
  )

const tablaWrapper =
  document.getElementById(
    'tabla-wrapper',
  )

const botonNuevoEvento =
  document.getElementById(
    'btn-nuevo-evento',
  )

const botonPrimerEvento =
  document.getElementById(
    'btn-primer-evento',
  )

const botonReintentar =
  document.getElementById(
    'btn-reintentar-eventos',
  )

/* ==========================================================
   INICIALIZACIÓN
========================================================== */

async function init() {
  registrarEventosGenerales()
  registrarEventosModal()
  registrarEventosEliminar()

  await refreshEventos()
}

/* ==========================================================
   CARGAR EVENTOS
========================================================== */

export async function refreshEventos() {
  if (cargando) {
    return
  }

  cargando = true

  mostrarEstadoCargando()

  try {
    const respuesta =
      await getEventos()

    eventos =
      Array.isArray(respuesta)
        ? respuesta
        : []

    ordenarEventosPorOrden()

    aplicarFiltros()
  } catch (error) {
    console.error(
      'No se pudieron cargar los eventos:',
      error,
    )

    eventos = []
    eventosFiltrados = []

    mostrarEstadoError()
    actualizarCantidad()
  } finally {
    cargando = false
  }
}

/* ==========================================================
   FILTROS
========================================================== */

export function aplicarFiltros() {
  const busqueda =
    inputBusqueda?.value
      .trim()
      .toLocaleLowerCase('es-AR') ?? ''

  if (!busqueda) {
    eventosFiltrados = [
      ...eventos,
    ]
  } else {
    eventosFiltrados =
      eventos.filter((evento) => {
        const textoBuscable = [
          evento.titulo,
          evento.descripcion,
          evento.lugar,
          evento.fecha,
          evento.horario,
          evento.url_titulo,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('es-AR')

        return textoBuscable.includes(
          busqueda,
        )
      })
  }

  eventosFiltrados.sort(
    (eventoA, eventoB) =>
      eventoA.orden -
      eventoB.orden,
  )

  actualizarCantidad()
  renderizarEstadoActual()
}

/* ==========================================================
   EVENTOS GENERALES
========================================================== */

function registrarEventosGenerales() {
  inputBusqueda?.addEventListener(
    'input',
    aplicarFiltros,
  )

  botonNuevoEvento?.addEventListener(
    'click',
    abrirModalCrearEvento,
  )

  botonPrimerEvento?.addEventListener(
    'click',
    abrirModalCrearEvento,
  )

  botonReintentar?.addEventListener(
    'click',
    refreshEventos,
  )
}

/* ==========================================================
   ESTADOS VISUALES
========================================================== */

function renderizarEstadoActual() {
  ocultarTodosLosEstados()

  /*
   * No hay eventos en la base de datos.
   */
  if (eventos.length === 0) {
    estadoVacio?.classList.remove(
      'oculto',
    )

    return
  }

  /*
   * Hay eventos, pero ninguno coincide con la búsqueda.
   */
  if (eventosFiltrados.length === 0) {
    mostrarEstadoSinResultados()

    return
  }

  tablaWrapper?.classList.remove(
    'oculto',
  )

  renderEventos()
}

function mostrarEstadoCargando() {
  ocultarTodosLosEstados()

  estadoCargando?.classList.remove(
    'oculto',
  )
}

function mostrarEstadoError() {
  ocultarTodosLosEstados()

  estadoError?.classList.remove(
    'oculto',
  )
}

function mostrarEstadoSinResultados() {
  ocultarTodosLosEstados()

  if (!estadoVacio) {
    return
  }

  const titulo =
    estadoVacio.querySelector('h2')

  const descripcion =
    estadoVacio.querySelector('p')

  if (titulo) {
    titulo.textContent =
      'No se encontraron eventos'
  }

  if (descripcion) {
    descripcion.textContent =
      'Probá buscar con otras palabras.'
  }

  botonPrimerEvento?.classList.add(
    'oculto',
  )

  estadoVacio.classList.remove(
    'oculto',
  )
}

function ocultarTodosLosEstados() {
  estadoCargando?.classList.add(
    'oculto',
  )

  estadoError?.classList.add(
    'oculto',
  )

  estadoVacio?.classList.add(
    'oculto',
  )

  tablaWrapper?.classList.add(
    'oculto',
  )

  restaurarEstadoVacio()
}

function restaurarEstadoVacio() {
  if (!estadoVacio) {
    return
  }

  const titulo =
    estadoVacio.querySelector('h2')

  const descripcion =
    estadoVacio.querySelector('p')

  if (titulo) {
    titulo.textContent =
      'No hay eventos publicados'
  }

  if (descripcion) {
    descripcion.textContent =
      'Creá el primer evento para que aparezca en el sitio web.'
  }

  botonPrimerEvento?.classList.remove(
    'oculto',
  )
}

/* ==========================================================
   CANTIDAD
========================================================== */

function actualizarCantidad() {
  if (!cantidadEventos) {
    return
  }

  const cantidadTotal =
    eventos.length

  const cantidadVisible =
    eventosFiltrados.length

  const hayBusqueda =
    Boolean(
      inputBusqueda?.value.trim(),
    )

  if (
    hayBusqueda &&
    cantidadVisible !== cantidadTotal
  ) {
    cantidadEventos.textContent =
      `${cantidadVisible} de ${cantidadTotal} eventos`

    return
  }

  cantidadEventos.textContent =
    cantidadTotal === 1
      ? '1 evento'
      : `${cantidadTotal} eventos`
}

/* ==========================================================
   ORDEN
========================================================== */

function ordenarEventosPorOrden() {
  eventos.sort(
    (eventoA, eventoB) =>
      eventoA.orden -
      eventoB.orden,
  )
}

/* ==========================================================
   EJECUCIÓN
========================================================== */

init()