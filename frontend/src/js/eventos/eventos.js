import { createListController } from '../common/listController.js'

import { createOrderController } from '../common/orderController.js'

import { eventsApi } from '../common/resources.js'

import { showToast } from '../common/toast.js'

import { createEventosTable } from './table.js'

import { createEventoModal } from './modal.js'

import { createEventoDeleteController } from './delete.js'

import { eventImagePicker } from './images.js'

/* ==========================================================
   RENDERIZADOR
========================================================== */

/*
 * listController necesita recibir un renderizador durante
 * su creación.
 *
 * El renderizador definitivo se construye más abajo, después
 * de crear los controladores de orden, edición y eliminación.
 *
 * Esta función intermedia evita dependencias circulares entre:
 *
 * eventos.js
 * table.js
 * modal.js
 * delete.js
 */
let renderEventos = () => {}

/* ==========================================================
   LISTA
========================================================== */

export const eventosController = createListController({
  load: eventsApi.list,

  render(context) {
    renderEventos(context)
  },

  searchInput: '#buscar-eventos',

  countElement: '#cantidad-eventos',

  loadingElement: '#estado-cargando',

  errorElement: '#estado-error',

  emptyElement: '#estado-vacio',

  tableElement: '#tabla-wrapper',

  retryButton: '#btn-reintentar-eventos',

  createButtons: ['#btn-nuevo-evento', '#btn-primer-evento'],

  onCreate() {
    eventoModal.openCreate()
  },

  searchValues(evento) {
    return [
      evento.titulo,
      evento.descripcion,
      evento.lugar,
      evento.fecha,
      evento.horario,
      evento.url,
      evento.url_titulo
    ]
  },

  sorters: {
    order(eventoA, eventoB) {
      return Number(eventoA.orden) - Number(eventoB.orden)
    },

    title(eventoA, eventoB) {
      return String(eventoA.titulo ?? '').localeCompare(
        String(eventoB.titulo ?? ''),
        'es-AR',
        {
          sensitivity: 'base'
        }
      )
    },

    createdAt(eventoA, eventoB) {
      return (
        obtenerTimestamp(eventoA.created_at) -
        obtenerTimestamp(eventoB.created_at)
      )
    }
  },

  defaultSort: 'order',

  defaultAscending: true,

  messages: {
    emptyTitle: 'No hay eventos publicados',

    emptyDescription:
      'Creá el primer evento para que aparezca en el sitio web.',

    noResultsTitle: 'No se encontraron eventos',

    noResultsDescription: 'Probá buscar con otras palabras.',

    loadError: 'No se pudieron cargar los eventos.'
  },

  singular: 'evento',

  plural: 'eventos',

  onError(error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'No se pudieron cargar los eventos.',
      'error'
    )
  }
})

/* ==========================================================
   ORDEN
========================================================== */

export const eventosOrderController = createOrderController({
  listController: eventosController,

  changeOrder: eventsApi.changeOrder,

  refresh: eventosController.refresh,

  optimistic: true,

  refreshAfterChange: true,

  refreshAfterError: true,

  errorMessage: 'No se pudo cambiar el orden de los eventos.'
})

/* ==========================================================
   MODAL DE CREACIÓN Y EDICIÓN
========================================================== */

export const eventoModal = createEventoModal({
  create: eventsApi.create,

  update: eventsApi.update,

  refresh: eventosController.refresh,

  imagePicker: eventImagePicker
})

/* ==========================================================
   MODAL DE ELIMINACIÓN
========================================================== */

export const eventoDeleteController = createEventoDeleteController({
  remove: eventsApi.remove,

  refresh: eventosController.refresh
})

/* ==========================================================
   TABLA
========================================================== */

renderEventos = createEventosTable({
  orderController: eventosOrderController,

  onEdit(evento) {
    eventoModal.openEdit(evento)
  },

  onDelete(evento) {
    eventoDeleteController.open(evento)
  }
})

/* ==========================================================
   EXPORTACIONES DE COMPATIBILIDAD
========================================================== */

/*
 * Estas funciones permiten que otros módulos continúen
 * utilizando nombres similares a los anteriores sin volver
 * a importar ni modificar directamente los arrays.
 */

export function refreshEventos(options) {
  return eventosController.refresh(options)
}

export function aplicarFiltros() {
  return eventosController.applyFilters()
}

export function obtenerEventos() {
  return eventosController.items
}

export function obtenerEventosFiltrados() {
  return eventosController.filteredItems
}

export function obtenerEventoPorId(id) {
  return eventosController.getById(id)
}

/* ==========================================================
   INICIALIZACIÓN
========================================================== */

async function init() {
  /*
   * Cada controlador registra sus eventos una sola vez.
   */
  eventImagePicker.initialize()
  eventoModal.initialize()
  eventoDeleteController.initialize()

  try {
    await eventosController.initialize()
  } catch (error) {
    /*
     * listController ya mostró el estado de error y ejecutó
     * onError. Capturamos el rechazo para evitar una promesa
     * no controlada durante la carga inicial.
     */
    console.error(
      'Falló la inicialización de la administración de eventos:',
      error
    )
  }
}

/* ==========================================================
   HELPERS
========================================================== */

function obtenerTimestamp(value) {
  if (!value) {
    return 0
  }

  const timestamp = new Date(value).getTime()

  return Number.isNaN(timestamp) ? 0 : timestamp
}

/* ==========================================================
   EJECUCIÓN
========================================================== */

init()
