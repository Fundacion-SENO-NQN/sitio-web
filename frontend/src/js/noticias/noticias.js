import { createListController } from '../common/listController.js'

import { createOrderController } from '../common/orderController.js'

import { newsApi } from '../common/resources.js'

import { showToast } from '../common/toast.js'

import { createNoticiasTable } from './table.js'

import { createNoticiaModal } from './modal.js'

import { createNoticiaDeleteController } from './delete.js'

import { newsImagePicker } from './images.js'

/* ==========================================================
   RENDERIZADOR
========================================================== */

/*
 * La función definitiva se asigna después de crear los
 * controladores de orden, modal y eliminación.
 *
 * Esto evita dependencias circulares entre los módulos.
 */
let renderNoticias = () => {}

/* ==========================================================
   LISTA
========================================================== */

export const noticiasController = createListController({
  load: newsApi.list,

  render(context) {
    renderNoticias(context)
  },

  searchInput: '#buscar-noticias',

  countElement: '#cantidad-noticias',

  loadingElement: '#estado-cargando',

  errorElement: '#estado-error',

  emptyElement: '#estado-vacio',

  tableElement: '#tabla-wrapper',

  retryButton: '#btn-reintentar-noticias',

  createButtons: ['#btn-nueva-noticia', '#btn-primera-noticia'],

  onCreate() {
    noticiaModal.openCreate()
  },

  searchValues(noticia) {
    return [
      noticia.titulo,
      noticia.contenido,
      noticia.fecha,
      noticia.created_at
    ]
  },

  sorters: {
    order(noticiaA, noticiaB) {
      return Number(noticiaA.orden) - Number(noticiaB.orden)
    },

    title(noticiaA, noticiaB) {
      return String(noticiaA.titulo ?? '').localeCompare(
        String(noticiaB.titulo ?? ''),
        'es-AR',
        {
          sensitivity: 'base'
        }
      )
    },

    createdAt(noticiaA, noticiaB) {
      return (
        obtenerTimestamp(noticiaA.created_at) -
        obtenerTimestamp(noticiaB.created_at)
      )
    }
  },

  defaultSort: 'order',

  defaultAscending: true,

  messages: {
    emptyTitle: 'No hay noticias publicadas',

    emptyDescription:
      'Creá la primera noticia para que aparezca en el sitio web.',

    noResultsTitle: 'No se encontraron noticias',

    noResultsDescription: 'Probá buscar con otras palabras.',

    loadError: 'No se pudieron cargar las noticias.'
  },

  singular: 'noticia',

  plural: 'noticias',

  onError(error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'No se pudieron cargar las noticias.',
      'error'
    )
  }
})

/* ==========================================================
   ORDEN
========================================================== */

export const noticiasOrderController = createOrderController({
  listController: noticiasController,

  changeOrder: newsApi.changeOrder,

  refresh: noticiasController.refresh,

  optimistic: true,

  refreshAfterChange: true,

  refreshAfterError: true,

  errorMessage: 'No se pudo cambiar el orden de las noticias.'
})

/* ==========================================================
   MODAL DE CREACIÓN Y EDICIÓN
========================================================== */

export const noticiaModal = createNoticiaModal({
  create: newsApi.create,

  update: newsApi.update,

  refresh: noticiasController.refresh,

  imagePicker: newsImagePicker
})

/* ==========================================================
   MODAL DE ELIMINACIÓN
========================================================== */

export const noticiaDeleteController = createNoticiaDeleteController({
  remove: newsApi.remove,

  refresh: noticiasController.refresh
})

/* ==========================================================
   TABLA
========================================================== */

renderNoticias = createNoticiasTable({
  orderController: noticiasOrderController,

  onEdit(noticia) {
    noticiaModal.openEdit(noticia)
  },

  onDelete(noticia) {
    noticiaDeleteController.open(noticia)
  }
})

/* ==========================================================
   EXPORTACIONES DE COMPATIBILIDAD
========================================================== */

export function refreshNoticias(options) {
  return noticiasController.refresh(options)
}

export function aplicarFiltros() {
  return noticiasController.applyFilters()
}

export function obtenerNoticias() {
  return noticiasController.items
}

export function obtenerNoticiasFiltradas() {
  return noticiasController.filteredItems
}

export function obtenerNoticiaPorId(id) {
  return noticiasController.getById(id)
}

/* ==========================================================
   INICIALIZACIÓN
========================================================== */

async function init() {
  newsImagePicker.initialize()
  noticiaModal.initialize()
  noticiaDeleteController.initialize()

  try {
    await noticiasController.initialize()
  } catch (error) {
    /*
     * El controlador ya mostró el estado de error y ejecutó
     * el callback onError. Esta captura evita una promesa
     * rechazada sin controlar durante la carga inicial.
     */
    console.error(
      'Falló la inicialización de la administración de noticias:',
      error
    )
  }
}

/* ==========================================================
   HELPERS
========================================================== */

function obtenerTimestamp(value) {
  if (!value) return 0

  const timestamp = new Date(value).getTime()

  return Number.isNaN(timestamp) ? 0 : timestamp
}

/* ==========================================================
   EJECUCIÓN
========================================================== */

init()
