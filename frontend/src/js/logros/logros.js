import { createListController } from '../common/listController.js'

import { createOrderController } from '../common/orderController.js'

import {
  achievementsApi,
  featuredAchievementsApi
} from '../common/resources.js'

import { showToast } from '../common/toast.js'

import { createLogrosTable } from './table.js'

import { createLogroModal } from './modal.js'

import { createLogroDeleteController } from './delete.js'

import { createFeaturedAchievementsController } from './featured.js'

import { achievementImagePicker } from './images.js'

/* ==========================================================
   CARGA GLOBAL
========================================================== */

export const modalCarga = document.getElementById('modal-carga')

/*
 * Se utiliza un contador porque puede haber más de una
 * operación solicitando el indicador de carga.
 *
 * Por ejemplo:
 * - Cargar logros.
 * - Cargar destacados.
 * - Cambiar el orden.
 */
let operacionesCargando = 0

export function setLogrosLoading(loading) {
  if (loading) operacionesCargando += 1
  else operacionesCargando = Math.max(0, operacionesCargando - 1)

  if (modalCarga) {
    modalCarga.hidden = operacionesCargando === 0

    modalCarga.setAttribute('aria-hidden', String(operacionesCargando === 0))
  }
}

/* ==========================================================
   RENDERIZADOR
========================================================== */

/*
 * Se asigna al final, cuando ya existen los controladores
 * de orden, edición, eliminación y destacados.
 */
let renderLogros = () => {}

/* ==========================================================
   LISTA DE LOGROS
========================================================== */

export const logrosController = createListController({
  load: achievementsApi.list,

  render(context) {
    renderLogros({
      ...context,

      featuredItems: logrosDestacadosController?.items ?? []
    })
  },

  /*
   * La tabla específica administra el elemento vacío
   * mediante el atributo `hidden`, como hacía la página
   * original.
   */
  createButtons: ['#btnNewAchievement'],

  onCreate() {
    logroModal.openCreate()
  },

  searchValues(logro) {
    return [logro.titulo, logro.contenido]
  },

  sorters: {
    order(logroA, logroB) {
      return Number(logroA.orden) - Number(logroB.orden)
    },

    title(logroA, logroB) {
      return String(logroA.titulo ?? '').localeCompare(
        String(logroB.titulo ?? ''),
        'es-AR',
        {
          sensitivity: 'base'
        }
      )
    },

    createdAt(logroA, logroB) {
      return (
        obtenerTimestamp(logroA.created_at) -
        obtenerTimestamp(logroB.created_at)
      )
    }
  },

  searchInput: '#buscar-logros',

  defaultSort: 'order',

  defaultAscending: true,

  singular: 'logro',

  plural: 'logros',

  messages: {
    loadError: 'No se pudieron cargar los logros.'
  },

  onError(error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'No se pudieron cargar los logros.',
      'error'
    )
  }
})

export const achievementsController = logrosController

/* ==========================================================
   ORDEN
========================================================== */

export const logrosOrderController = createOrderController({
  listController: logrosController,

  changeOrder: achievementsApi.changeOrder,

  refresh: logrosController.refresh,

  optimistic: true,

  refreshAfterChange: true,

  refreshAfterError: true,

  setLoading: setLogrosLoading,

  successMessage: 'Orden actualizado.',

  errorMessage: 'No se pudo cambiar el orden de los logros.'
})

export const achievementsOrderController = logrosOrderController

/* ==========================================================
   MODAL DE CREACIÓN Y EDICIÓN
========================================================== */

export const logroModal = createLogroModal({
  create: achievementsApi.create,

  update: achievementsApi.update,

  refresh: logrosController.refresh,

  imagePicker: achievementImagePicker,

  setLoading: setLogrosLoading
})

/* ==========================================================
   MODAL DE ELIMINACIÓN
========================================================== */

export const logroDeleteController = createLogroDeleteController({
  remove: achievementsApi.remove,

  refresh: async () => {
    /*
     * Al eliminar un logro también puede desaparecer de
     * los destacados. Recargamos ambas colecciones.
     */
    await logrosController.refresh({
      showLoading: false
    })

    await logrosDestacadosController.refresh()
  },

  setLoading: setLogrosLoading
})

/* ==========================================================
   LOGROS DESTACADOS
========================================================== */

export const logrosDestacadosController = createFeaturedAchievementsController({
  load: featuredAchievementsApi.list,

  replace: featuredAchievementsApi.replace,

  getAchievements() {
    return logrosController.items
  },

  setLoading: setLogrosLoading,

  onChange() {
    /*
     * Fuerza un nuevo render de la tabla para actualizar
     * las estrellas y posiciones de los destacados.
     */
    logrosController.applyFilters()
  }
})

export const featuredAchievementsController = logrosDestacadosController

/* ==========================================================
   TABLA
========================================================== */

renderLogros = createLogrosTable({
  orderController: logrosOrderController,

  getFeaturedAchievements() {
    return logrosDestacadosController.items
  },

  onEdit(logro) {
    logroModal.openEdit(logro)
  },

  onDelete(logro) {
    logroDeleteController.open(logro)
  }
})

/* ==========================================================
   EXPORTACIONES DE COMPATIBILIDAD
========================================================== */

export function refreshAchievements(options) {
  return logrosController.refresh(options)
}

export function refreshLogros(options) {
  return logrosController.refresh(options)
}

export function refreshFeaturedAchievements() {
  return logrosDestacadosController.refresh()
}

export function refreshLogrosDestacados() {
  return logrosDestacadosController.refresh()
}

export function obtenerLogros() {
  return logrosController.items
}

export function obtenerLogrosFiltrados() {
  return logrosController.filteredItems
}

export function obtenerLogroPorId(id) {
  return logrosController.getById(id)
}

export function obtenerLogrosDestacados() {
  return logrosDestacadosController.items
}

export function esLogroDestacado(id) {
  const idNormalizado = Number(id)

  return logrosDestacadosController.items.some(
    (logro) => Number(logro.id) === idNormalizado
  )
}

export function obtenerPosicionDestacada(id) {
  const idNormalizado = Number(id)

  const indice = logrosDestacadosController.items.findIndex(
    (logro) => Number(logro.id) === idNormalizado
  )

  return indice === -1 ? null : indice + 1
}

/* ==========================================================
   INICIALIZACIÓN
========================================================== */

async function init() {
  achievementImagePicker.initialize()
  logroModal.initialize()
  logroDeleteController.initialize()
  logrosDestacadosController.initialize()

  setLogrosLoading(true)

  try {
    /*
     * Primero cargamos todos los logros porque el modal de
     * destacados necesita esa colección para construir sus
     * opciones.
     */
    await logrosController.initialize()

    await logrosDestacadosController.refresh()
  } catch (error) {
    console.error(
      'Falló la inicialización de la administración de logros:',
      error
    )
  } finally {
    setLogrosLoading(false)
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
