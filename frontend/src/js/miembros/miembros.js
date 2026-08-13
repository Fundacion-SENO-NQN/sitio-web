import { createListController } from '../common/listController.js'

import { createOrderController } from '../common/orderController.js'

import { membersApi } from '../common/resources.js'

import { showToast } from '../common/toast.js'

import { createMiembrosTable } from './table.js'

import { createMiembroModal } from './modal.js'

import { createMiembroDeleteController } from './delete.js'

import { memberImagePicker } from './images.js'

/* ==========================================================
   RENDERIZADOR
========================================================== */

/*
 * El renderizador definitivo se crea después de los
 * controladores de orden, edición y eliminación.
 *
 * Esta función intermedia evita dependencias circulares.
 */
let renderMiembros = () => {}

/* ==========================================================
   LISTA
========================================================== */

export const miembrosController = createListController({
  load: membersApi.list,

  render(context) {
    renderMiembros(context)
  },

  searchInput: '#searchMembers',

  emptyElement: '#membersEmpty',

  tableElement: '.tableWrapper',

  createButtons: ['#btnNewMember', '#btnEmptyNewMember'],

  sortButtons: {
    name: '#sortName',

    date: '#sortDate'
  },

  onCreate() {
    miembroModal.openCreate()
  },

  searchValues(miembro) {
    return [
      miembro.nombre,
      miembro.apellido,

      `${miembro.nombre ?? ''} ${miembro.apellido ?? ''}`,

      miembro.puesto,
      miembro.descripcion
    ]
  },

  sorters: {
    order(miembroA, miembroB) {
      return Number(miembroA.orden) - Number(miembroB.orden)
    },

    name(miembroA, miembroB) {
      const nombreA = obtenerNombreCompleto(miembroA)

      const nombreB = obtenerNombreCompleto(miembroB)

      return nombreA.localeCompare(nombreB, 'es-AR', {
        sensitivity: 'base'
      })
    },

    date(miembroA, miembroB) {
      return (
        obtenerTimestamp(miembroA.created_at) -
        obtenerTimestamp(miembroB.created_at)
      )
    }
  },

  defaultSort: 'order',

  defaultAscending: true,

  messages: {
    emptyTitle: 'No hay miembros cargados',

    emptyDescription:
      'Agregá el primer miembro para que aparezca en el sitio web.',

    noResultsTitle: 'No se encontraron miembros',

    noResultsDescription: 'Probá buscar por nombre, puesto o descripción.',

    loadError: 'No se pudieron cargar los miembros.'
  },

  /*
   * La página original utiliza "hidden" en lugar de
   * "oculto".
   */
  hiddenClass: 'hidden',

  singular: 'miembro',

  plural: 'miembros',

  onError(error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'No se pudieron cargar los miembros.',
      'error'
    )
  }
})

/*
 * Alias en inglés para mantener compatibilidad con algunos
 * nombres utilizados durante la refactorización.
 */
export const membersController = miembrosController

/* ==========================================================
   ORDEN
========================================================== */

export const miembrosOrderController = createOrderController({
  listController: miembrosController,

  changeOrder: membersApi.changeOrder,

  refresh: miembrosController.refresh,

  optimistic: true,

  refreshAfterChange: true,

  refreshAfterError: true,

  errorMessage: 'No se pudo cambiar el orden de los miembros.'
})

export const membersOrderController = miembrosOrderController

/* ==========================================================
   MODAL DE CREACIÓN Y EDICIÓN
========================================================== */

export const miembroModal = createMiembroModal({
  create: membersApi.create,

  update: membersApi.update,

  refresh: miembrosController.refresh,

  imagePicker: memberImagePicker
})

/* ==========================================================
   MODAL DE ELIMINACIÓN
========================================================== */

export const miembroDeleteController = createMiembroDeleteController({
  remove: membersApi.remove,

  refresh: miembrosController.refresh
})

/* ==========================================================
   TABLA
========================================================== */

renderMiembros = createMiembrosTable({
  orderController: miembrosOrderController,

  onEdit(miembro) {
    miembroModal.openEdit(miembro)
  },

  onDelete(miembro) {
    miembroDeleteController.open(miembro)
  }
})

/* ==========================================================
   EXPORTACIONES DE COMPATIBILIDAD
========================================================== */

export function refreshMembers(options) {
  return miembrosController.refresh(options)
}

export function refreshMiembros(options) {
  return miembrosController.refresh(options)
}

export function applyFilters() {
  return miembrosController.applyFilters()
}

export function aplicarFiltros() {
  return miembrosController.applyFilters()
}

export function obtenerMiembros() {
  return miembrosController.items
}

export function obtenerMiembrosFiltrados() {
  return miembrosController.filteredItems
}

export function getMemberById(id) {
  return miembrosController.getById(id)
}

export function obtenerMiembroPorId(id) {
  return miembrosController.getById(id)
}

/* ==========================================================
   INICIALIZACIÓN
========================================================== */

async function init() {
  memberImagePicker.initialize()
  miembroModal.initialize()
  miembroDeleteController.initialize()

  try {
    await miembrosController.initialize()
  } catch (error) {
    /*
     * listController ya mostró la notificación de error.
     * La captura evita una promesa rechazada sin controlar
     * durante la carga inicial.
     */
    console.error(
      'Falló la inicialización de la administración de miembros:',
      error
    )
  }
}

/* ==========================================================
   HELPERS
========================================================== */

function obtenerNombreCompleto(miembro) {
  return [miembro?.nombre, miembro?.apellido].filter(Boolean).join(' ').trim()
}

function obtenerTimestamp(value) {
  if (!value) return 0

  const timestamp = new Date(value).getTime()

  return Number.isNaN(timestamp) ? 0 : timestamp
}

/* ==========================================================
   EJECUCIÓN
========================================================== */

init()
