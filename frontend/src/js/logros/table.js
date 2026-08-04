import {
  createTableRenderer,
  createImageColumn,
  createCustomColumn,
  createActionsColumn,
  createTableButton,
  truncateText
} from '../common/table.js'

import { requireElement } from '../common/dom.js'

const IMG_URL = (
  import.meta.env.PUBLIC_IMG_URL ??
  'https://pub-508ef05ca2d548c1b336a8b1f0f31c83.r2.dev'
).replace(/\/+$/, '')

/* ==========================================================
   TABLE FACTORY
========================================================== */

export function createLogrosTable({
  orderController,
  getFeaturedAchievements,
  onEdit,
  onDelete
} = {}) {
  validarConfiguracion({
    orderController,
    getFeaturedAchievements,
    onEdit,
    onDelete
  })

  const emptyElement = requireElement(
    '#achievementsEmpty',
    'estado vacío de logros'
  )

  const renderTable = createTableRenderer({
    body: '#achievementsBody',

    rowIdPrefix: 'row-achievement-',

    getRowId(logro) {
      return logro.id
    },

    getRowDataset(logro) {
      return {
        achievementId: logro.id
      }
    },

    columns: [
      crearColumnaOrden(orderController),

      crearColumnaImagen(),

      crearColumnaInformacion(),

      crearColumnaDestacado(getFeaturedAchievements),

      crearColumnaAcciones({
        onEdit,
        onDelete
      })
    ]
  })

  return function renderLogros(context = {}) {
    const items = Array.isArray(context.items) ? context.items : []

    /*
     * El renderizador también se ejecuta cuando la lista
     * está vacía para limpiar las filas anteriores.
     */
    renderTable({
      ...context,
      items
    })

    emptyElement.hidden = items.length !== 0

    emptyElement.setAttribute('aria-hidden', String(items.length !== 0))
  }
}

/* ==========================================================
   ORDER
========================================================== */

function crearColumnaOrden(orderController) {
  return createCustomColumn({
    className: 'orderCell',

    render(logro) {
      const fragment = document.createDocumentFragment()

      const subir = createTableButton({
        text: '↑',

        className: 'tableButton',

        ariaLabel: `Subir el logro ${obtenerTitulo(logro)}`,

        disabled: !orderController.canMoveUp(logro.id),

        async onClick() {
          await orderController.moveUp(logro.id)
        }
      })

      const bajar = createTableButton({
        text: '↓',

        className: 'tableButton',

        ariaLabel: `Bajar el logro ${obtenerTitulo(logro)}`,

        disabled: !orderController.canMoveDown(logro.id),

        async onClick() {
          await orderController.moveDown(logro.id)
        }
      })

      fragment.append(subir, bajar)

      return fragment
    }
  })
}

/* ==========================================================
   IMAGE
========================================================== */

function crearColumnaImagen() {
  return createImageColumn({
    imageClassName: 'achievementImage',

    errorClassName: 'achievementImageError',

    src(logro) {
      return `${IMG_URL}/img_logros/` + `${logro.id}.avif`
    },

    alt(logro) {
      return `Imagen del logro ` + obtenerTitulo(logro)
    },

    loading: 'lazy',

    decoding: 'async'
  })
}

/* ==========================================================
   TITLE AND DESCRIPTION
========================================================== */

function crearColumnaInformacion() {
  return createCustomColumn({
    render(logro) {
      const fragment = document.createDocumentFragment()

      const titulo = document.createElement('div')

      titulo.className = 'achievementTitle'

      titulo.textContent = obtenerTitulo(logro)

      const descripcion = document.createElement('div')

      descripcion.className = 'achievementDescription'

      const contenidoCompleto = String(logro.contenido ?? '').trim()

      if (contenidoCompleto) {
        descripcion.textContent = truncateText(contenidoCompleto, 100)

        if (descripcion.textContent !== contenidoCompleto)
          descripcion.title = contenidoCompleto
      } else {
        descripcion.textContent = 'Sin descripción'

        descripcion.classList.add('sin-dato')
      }

      fragment.append(titulo, descripcion)

      return fragment
    }
  })
}

/* ==========================================================
   FEATURED ACHIEVEMENT
========================================================== */

function crearColumnaDestacado(getFeaturedAchievements) {
  return createCustomColumn({
    render(logro) {
      const badge = document.createElement('span')

      const posicion = obtenerPosicionDestacada(
        logro.id,
        getFeaturedAchievements()
      )

      if (posicion !== null) {
        badge.className = 'featuredBadge'

        badge.textContent = `★ ${posicion}`

        badge.setAttribute(
          'aria-label',
          `Logro destacado en la posición ${posicion}`
        )
      } else {
        badge.className = 'normalBadge'

        badge.textContent = '—'

        badge.setAttribute('aria-label', 'Logro no destacado')
      }

      return badge
    }
  })
}

/* ==========================================================
   ACTIONS
========================================================== */

function crearColumnaAcciones({ onEdit, onDelete }) {
  return createActionsColumn({
    className: 'actions',

    containerClassName: 'actions',

    buttonClassName: 'tableButton',

    actions: [
      {
        text: 'Editar',

        className: 'edit',

        ariaLabel(logro) {
          return `Editar el logro ` + obtenerTitulo(logro)
        },

        onClick(logro) {
          onEdit(logro)
        }
      },

      {
        text: 'Borrar',

        className: 'delete',

        ariaLabel(logro) {
          return `Eliminar el logro ` + obtenerTitulo(logro)
        },

        onClick(logro) {
          onDelete(logro)
        }
      }
    ]
  })
}

/* ==========================================================
   FEATURED HELPERS
========================================================== */

function obtenerPosicionDestacada(logroId, destacados) {
  const idNormalizado = Number(logroId)

  if (!Number.isInteger(idNormalizado) || !Array.isArray(destacados))
    return null

  const destacadosOrdenados = [...destacados].sort((destacadoA, destacadoB) => {
    return obtenerOrdenDestacado(destacadoA) - obtenerOrdenDestacado(destacadoB)
  })

  const indice = destacadosOrdenados.findIndex(
    (destacado) => obtenerIdLogroDestacado(destacado) === idNormalizado
  )

  return indice === -1 ? null : indice + 1
}

function obtenerIdLogroDestacado(destacado) {
  /*
   * Admite ambos formatos posibles:
   *
   * 1. El backend devuelve directamente el Logro:
   *    { id, titulo, orden, ... }
   *
   * 2. El backend devuelve la relación:
   *    { id, logro_id, orden, ... }
   */
  const id = Number(destacado?.logro_id ?? destacado?.id)

  return Number.isInteger(id) ? id : null
}

function obtenerOrdenDestacado(destacado) {
  const orden = Number(destacado?.orden)

  return Number.isInteger(orden) ? orden : 0
}

/* ==========================================================
   ACHIEVEMENT HELPERS
========================================================== */

function obtenerTitulo(logro) {
  const titulo = String(logro?.titulo ?? '').trim()

  if (titulo) return titulo

  return `logro n.º ${logro?.id ?? ''}`.trim()
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validarConfiguracion({
  orderController,
  getFeaturedAchievements,
  onEdit,
  onDelete
}) {
  if (!orderController)
    throw new TypeError('createLogrosTable requiere orderController.')

  const metodosOrden = ['moveUp', 'moveDown', 'canMoveUp', 'canMoveDown']

  for (const metodo of metodosOrden) {
    if (typeof orderController[metodo] !== 'function')
      throw new TypeError(`orderController no implementa ${metodo}().`)
  }

  if (typeof getFeaturedAchievements !== 'function')
    throw new TypeError('createLogrosTable requiere getFeaturedAchievements.')

  if (typeof onEdit !== 'function')
    throw new TypeError('createLogrosTable requiere onEdit.')

  if (typeof onDelete !== 'function')
    throw new TypeError('createLogrosTable requiere onDelete.')
}
