import {
  createTableRenderer,
  createOrderColumn,
  createImageColumn,
  createPrimaryTextColumn,
  createCustomColumn,
  createImageCountColumn,
  createLinkColumn,
  createActionsColumn
} from '../common/table.js'

const IMG_URL = (
  import.meta.env.PUBLIC_IMG_URL ??
  'https://pub-508ef05ca2d548c1b336a8b1f0f31c83.r2.dev'
).replace(/\/+$/, '')

/* ==========================================================
   TABLE FACTORY
========================================================== */

export function createEventosTable({ orderController, onEdit, onDelete } = {}) {
  validateConfiguration({
    orderController,
    onEdit,
    onDelete
  })

  return createTableRenderer({
    body: '#tabla-eventos-body',

    getRowId(evento) {
      return evento.id
    },

    getRowDataset(evento) {
      return {
        eventoId: evento.id
      }
    },

    columns: [
      createOrderColumn({
        orderController,

        containerClassName: 'orden-evento',

        positionClassName: 'numero-orden',

        buttonsClassName: 'botones-orden',

        buttonClassName: 'boton-orden',

        getPosition(evento) {
          return Number(evento.orden) + 1
        },

        upAriaLabel(evento) {
          return `Subir el evento ` + obtenerTitulo(evento)
        },

        downAriaLabel(evento) {
          return `Bajar el evento ` + obtenerTitulo(evento)
        }
      }),

      createImageColumn({
        imageClassName: 'imagen-evento-tabla',

        errorClassName: 'imagen-evento-error',

        src(evento) {
          return `${IMG_URL}/img_eventos/` + `${evento.id}/0.avif`
        },

        alt(evento) {
          return `Imagen principal de ` + obtenerTitulo(evento)
        }
      }),

      createPrimaryTextColumn({
        containerClassName: 'info-evento',

        title: 'titulo',

        description: 'descripcion',

        emptyDescription: 'Sin descripción'
      }),

      createCustomColumn({
        render(evento) {
          return crearFechaHorario(evento)
        }
      }),

      createCustomColumn({
        className: 'lugar-evento',

        render(evento) {
          return crearLugar(evento)
        }
      }),

      createImageCountColumn({
        value: 'cant_img',

        className: 'cantidad-imagenes'
      }),

      createLinkColumn({
        href: 'url',

        text(evento) {
          return evento.url_titulo || 'Abrir enlace'
        },

        emptyText: 'Sin enlace',

        linkClassName: 'enlace-tabla',

        ariaLabel(evento) {
          const texto = evento.url_titulo || 'enlace del evento'

          return (
            `Abrir ${texto} de ` +
            `${obtenerTitulo(evento)} ` +
            'en una nueva pestaña'
          )
        }
      }),

      createActionsColumn({
        containerClassName: 'acciones-evento',

        buttonClassName: 'boton-tabla',

        actions: [
          {
            text: 'Editar',

            className: 'boton-editar',

            ariaLabel(evento) {
              return `Editar el evento ` + obtenerTitulo(evento)
            },

            onClick(evento) {
              onEdit(evento)
            }
          },

          {
            text: 'Eliminar',

            className: 'boton-eliminar',

            ariaLabel(evento) {
              return `Eliminar el evento ` + obtenerTitulo(evento)
            },

            onClick(evento) {
              onDelete(evento)
            }
          }
        ]
      })
    ]
  })
}

/* ==========================================================
   DATE AND TIME
========================================================== */

function crearFechaHorario(evento) {
  const contenedor = document.createElement('div')

  contenedor.className = 'fecha-horario-evento'

  const fecha = document.createElement('span')

  const fechaDisponible = tieneTexto(evento.fecha)

  fecha.textContent = fechaDisponible ? evento.fecha.trim() : 'Sin fecha'

  if (!fechaDisponible) fecha.classList.add('sin-dato')

  const horario = document.createElement('small')

  const horarioDisponible = tieneTexto(evento.horario)

  horario.textContent = horarioDisponible
    ? evento.horario.trim()
    : 'Sin horario'

  if (!horarioDisponible) horario.classList.add('sin-dato')

  contenedor.append(fecha, horario)

  return contenedor
}

/* ==========================================================
   PLACE
========================================================== */

function crearLugar(evento) {
  if (tieneTexto(evento.lugar)) return evento.lugar.trim()

  const sinLugar = document.createElement('span')

  sinLugar.className = 'sin-dato'

  sinLugar.textContent = 'Sin lugar'

  return sinLugar
}

/* ==========================================================
   HELPERS
========================================================== */

function obtenerTitulo(evento) {
  if (tieneTexto(evento?.titulo)) return evento.titulo.trim()

  return `n.º ${evento?.id ?? ''}`
}

function tieneTexto(value) {
  return typeof value === 'string' && value.trim().length > 0
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validateConfiguration({ orderController, onEdit, onDelete }) {
  if (!orderController)
    throw new TypeError('createEventosTable requiere orderController.')

  if (
    typeof orderController.moveUp !== 'function' ||
    typeof orderController.moveDown !== 'function' ||
    typeof orderController.canMoveUp !== 'function' ||
    typeof orderController.canMoveDown !== 'function'
  )
    throw new TypeError('orderController no es un controlador de orden válido.')

  if (typeof onEdit !== 'function')
    throw new TypeError('createEventosTable requiere onEdit.')

  if (typeof onDelete !== 'function')
    throw new TypeError('createEventosTable requiere onDelete.')
}
