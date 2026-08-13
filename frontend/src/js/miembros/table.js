import {
  createTableRenderer,
  createOrderColumn,
  createImageColumn,
  createTextColumn,
  createCustomColumn,
  createDateColumn,
  createActionsColumn,
  formatDate
} from '../common/table.js'

const IMG_URL = (
  import.meta.env.PUBLIC_IMG_URL ??
  'https://pub-508ef05ca2d548c1b336a8b1f0f31c83.r2.dev'
).replace(/\/+$/, '')

/* ==========================================================
   TABLE FACTORY
========================================================== */

export function createMiembrosTable({
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
    body: '#membersBody',

    getRowId(miembro) {
      return miembro.id
    },

    getRowDataset(miembro) {
      return {
        memberId: miembro.id
      }
    },

    columns: [
      crearColumnaOrden(orderController),

      crearColumnaImagen(),

      crearColumnaNombre(),

      crearColumnaPuesto(),

      crearColumnaDescripcion(),

      crearColumnaFecha(),

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

    containerClassName: 'orderCell',

    positionClassName: 'orderValue',

    buttonsClassName: 'orderButtons',

    buttonClassName: 'orderButton',

    getPosition(miembro) {
      return Number(miembro.orden) + 1
    },

    upAriaLabel(miembro) {
      return `Subir a ` + obtenerNombreCompleto(miembro)
    },

    downAriaLabel(miembro) {
      return `Bajar a ` + obtenerNombreCompleto(miembro)
    }
  })
}

/* ==========================================================
   IMAGE
========================================================== */

function crearColumnaImagen() {
  return createImageColumn({
    imageClassName: 'memberImage',

    errorClassName: 'memberImageError',

    src(miembro) {
      return `${IMG_URL}/img_equipo/` + `${miembro.id}.avif`
    },

    alt(miembro) {
      return `Fotografía de ` + obtenerNombreCompleto(miembro)
    }
  })
}

/* ==========================================================
   NAME
========================================================== */

function crearColumnaNombre() {
  return createCustomColumn({
    render(miembro) {
      const contenedor = document.createElement('div')

      contenedor.className = 'memberInfo'

      const nombre = document.createElement('strong')

      nombre.textContent = obtenerNombreCompleto(miembro)

      contenedor.appendChild(nombre)

      return contenedor
    }
  })
}

/* ==========================================================
   POSITION
========================================================== */

function crearColumnaPuesto() {
  return createTextColumn({
    value(miembro) {
      return miembro.puesto
    },

    className: 'memberPosition',

    emptyText: 'Sin puesto',

    tag: 'span'
  })
}

/* ==========================================================
   DESCRIPTION
========================================================== */

function crearColumnaDescripcion() {
  return createCustomColumn({
    render(miembro) {
      const descripcion = document.createElement('p')

      descripcion.className = 'memberDescription'

      const texto = String(miembro.descripcion ?? '').trim()

      descripcion.textContent = texto || 'Sin descripción'

      if (!texto) descripcion.classList.add('sin-dato')

      return descripcion
    }
  })
}

/* ==========================================================
   CREATION DATE
========================================================== */

function crearColumnaFecha() {
  return createDateColumn({
    value: 'created_at',

    className: 'memberDate',

    emptyText: '—',

    formatter(value) {
      return formatDate(value, {
        locale: 'es-AR',

        timeZone: 'America/Argentina/Buenos_Aires',

        day: '2-digit',

        month: '2-digit',

        year: 'numeric'
      })
    }
  })
}

/* ==========================================================
   ACTIONS
========================================================== */

function crearColumnaAcciones({ onEdit, onDelete }) {
  return createActionsColumn({
    containerClassName: 'actions',

    buttonClassName: 'tableButton',

    actions: [
      {
        text: 'Editar',

        className: 'edit',

        ariaLabel(miembro) {
          return `Editar a ` + obtenerNombreCompleto(miembro)
        },

        onClick(miembro) {
          onEdit(miembro)
        }
      },

      {
        text: 'Eliminar',

        className: 'delete',

        ariaLabel(miembro) {
          return `Eliminar a ` + obtenerNombreCompleto(miembro)
        },

        onClick(miembro) {
          onDelete(miembro)
        }
      }
    ]
  })
}

/* ==========================================================
   HELPERS
========================================================== */

function obtenerNombreCompleto(miembro) {
  const nombreCompleto = [miembro?.nombre, miembro?.apellido]
    .map((valor) => String(valor ?? '').trim())
    .filter(Boolean)
    .join(' ')

  if (nombreCompleto) return nombreCompleto

  return (`miembro n.º ` + `${miembro?.id ?? ''}`).trim()
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validarConfiguracion({ orderController, onEdit, onDelete }) {
  if (!orderController)
    throw new TypeError('createMiembrosTable requiere orderController.')

  const metodosOrden = ['moveUp', 'moveDown', 'canMoveUp', 'canMoveDown']

  for (const metodo of metodosOrden) {
    if (typeof orderController[metodo] !== 'function')
      throw new TypeError(`orderController no implementa ${metodo}().`)
  }

  if (typeof onEdit !== 'function')
    throw new TypeError('createMiembrosTable requiere onEdit.')

  if (typeof onDelete !== 'function')
    throw new TypeError('createMiembrosTable requiere onDelete.')
}
