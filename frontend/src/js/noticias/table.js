import {
  createTableRenderer,
  createOrderColumn,
  createImageColumn,
  createPrimaryTextColumn,
  createCustomColumn,
  createImageCountColumn,
  createDateColumn,
  createActionsColumn,
  formatDateTime
} from '../common/table.js'

const IMG_URL = (
  import.meta.env.PUBLIC_IMG_URL ??
  'https://pub-508ef05ca2d548c1b336a8b1f0f31c83.r2.dev'
).replace(/\/+$/, '')

/* ==========================================================
   TABLE FACTORY
========================================================== */

export function createNoticiasTable({
  orderController,
  onEdit,
  onDelete
} = {}) {
  validarConfiguracion({
    orderController,
    onEdit,
    onDelete
  })

  return createTableRenderer({
    body: '#tabla-noticias-body',

    getRowId(noticia) {
      return noticia.id
    },

    getRowDataset(noticia) {
      return {
        noticiaId: noticia.id
      }
    },

    columns: [
      crearColumnaOrden(orderController),

      crearColumnaImagen(),

      crearColumnaInformacion(),

      crearColumnaFechaPublicada(),

      createImageCountColumn({
        value: 'cant_img',

        className: 'cantidad-imagenes',

        singular: 'imagen',

        plural: 'imágenes'
      }),

      crearColumnaFechaCreacion(),

      crearColumnaAcciones({
        onEdit,
        onDelete
      })
    ]
  })
}

/* ==========================================================
   ORDER
========================================================== */

function crearColumnaOrden(orderController) {
  return createOrderColumn({
    orderController,

    containerClassName: 'orden-noticia',

    positionClassName: 'numero-orden',

    buttonsClassName: 'botones-orden',

    buttonClassName: 'boton-orden',

    getPosition(noticia) {
      return Number(noticia.orden) + 1
    },

    upAriaLabel(noticia) {
      return `Subir la noticia ` + obtenerTitulo(noticia)
    },

    downAriaLabel(noticia) {
      return `Bajar la noticia ` + obtenerTitulo(noticia)
    }
  })
}

/* ==========================================================
   IMAGE
========================================================== */

function crearColumnaImagen() {
  return createImageColumn({
    imageClassName: 'imagen-noticia-tabla',

    errorClassName: 'imagen-noticia-error',

    src(noticia) {
      return `${IMG_URL}/img_noticias/` + `${noticia.id}/0.avif`
    },

    alt(noticia) {
      return `Imagen principal de ` + obtenerTitulo(noticia)
    }
  })
}

/* ==========================================================
   PRIMARY INFORMATION
========================================================== */

function crearColumnaInformacion() {
  return createPrimaryTextColumn({
    containerClassName: 'info-noticia',

    title: 'titulo',

    description: 'contenido',

    emptyDescription: 'Sin contenido'
  })
}

/* ==========================================================
   PUBLISHED DATE
========================================================== */

function crearColumnaFechaPublicada() {
  return createCustomColumn({
    className: 'fecha-noticia',

    render(noticia) {
      const fecha = String(noticia.fecha ?? '').trim()

      if (fecha) {
        const elemento = document.createElement('span')

        elemento.textContent = fecha

        return elemento
      }

      return crearValorVacio('Sin fecha')
    }
  })
}

/* ==========================================================
   CREATION DATE
========================================================== */

function crearColumnaFechaCreacion() {
  return createDateColumn({
    value: 'created_at',

    className: 'fecha-creacion',

    emptyText: 'Sin información',

    formatter(value) {
      return formatDateTime(value, {
        locale: 'es-AR',

        timeZone: 'America/Argentina/Buenos_Aires',

        day: '2-digit',

        month: '2-digit',

        year: 'numeric',

        hour: '2-digit',

        minute: '2-digit',

        hour12: false
      })
    }
  })
}

/* ==========================================================
   ACTIONS
========================================================== */

function crearColumnaAcciones({ onEdit, onDelete }) {
  return createActionsColumn({
    containerClassName: 'acciones-noticia',

    buttonClassName: 'boton-tabla',

    actions: [
      {
        text: 'Editar',

        className: 'boton-editar',

        ariaLabel(noticia) {
          return `Editar la noticia ` + obtenerTitulo(noticia)
        },

        onClick(noticia) {
          onEdit(noticia)
        }
      },

      {
        text: 'Eliminar',

        className: 'boton-eliminar',

        ariaLabel(noticia) {
          return `Eliminar la noticia ` + obtenerTitulo(noticia)
        },

        onClick(noticia) {
          onDelete(noticia)
        }
      }
    ]
  })
}

/* ==========================================================
   HELPERS
========================================================== */

function obtenerTitulo(noticia) {
  const titulo = String(noticia?.titulo ?? '').trim()

  if (titulo) return titulo

  return (`noticia n.º ` + `${noticia?.id ?? ''}`).trim()
}

function crearValorVacio(texto) {
  const elemento = document.createElement('span')

  elemento.className = 'sin-dato'

  elemento.textContent = texto

  return elemento
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validarConfiguracion({ orderController, onEdit, onDelete }) {
  if (!orderController)
    throw new TypeError('createNoticiasTable requiere orderController.')

  const metodosOrden = ['moveUp', 'moveDown', 'canMoveUp', 'canMoveDown']

  for (const metodo of metodosOrden) {
    if (typeof orderController[metodo] !== 'function')
      throw new TypeError(`orderController no implementa ${metodo}().`)
  }

  if (typeof onEdit !== 'function')
    throw new TypeError('createNoticiasTable requiere onEdit.')

  if (typeof onDelete !== 'function')
    throw new TypeError('createNoticiasTable requiere onDelete.')
}
