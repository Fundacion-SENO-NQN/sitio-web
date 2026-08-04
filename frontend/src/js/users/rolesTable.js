import {
  createTableRenderer,
  createTextColumn,
  createCustomColumn,
  createActionsColumn
} from '../common/table.js'

import { requireElement } from '../common/dom.js'

/* ==========================================================
   TABLE FACTORY
========================================================== */

export function createRolesTable({ onEdit, onDelete, isCurrentRole } = {}) {
  validarConfiguracion({
    onEdit,
    onDelete,
    isCurrentRole
  })

  const emptyElement = requireElement('#rolesEmpty', 'estado vacío de roles')

  const renderTable = createTableRenderer({
    body: '#rolesBody',

    getRowId(role) {
      return role.id
    },

    getRowDataset(role) {
      return {
        roleId: role.id,

        roleName: role.name ?? ''
      }
    },

    getRowClassName(role) {
      return {
        currentRole: isCurrentRole(role)
      }
    },

    columns: [
      crearColumnaNombre(),

      crearColumnaServicios(),

      crearColumnaAcciones({
        onEdit,
        onDelete,
        isCurrentRole
      })
    ]
  })

  return function renderRoles(context = {}) {
    const items = Array.isArray(context.items) ? context.items : []

    /*
     * Se ejecuta siempre para limpiar posibles filas de una
     * búsqueda o carga anterior.
     */
    renderTable({
      ...context,
      items
    })

    const empty = items.length === 0

    emptyElement.hidden = !empty

    emptyElement.setAttribute('aria-hidden', String(!empty))
  }
}

/* ==========================================================
   ROLE NAME
========================================================== */

function crearColumnaNombre() {
  return createTextColumn({
    value(role) {
      return obtenerNombreRol(role)
    },

    emptyText: 'Rol sin nombre',

    textClassName: 'roleName'
  })
}

/* ==========================================================
   SERVICES
========================================================== */

function crearColumnaServicios() {
  return createCustomColumn({
    render(role) {
      const services = normalizarServicios(role.services)

      if (services.length === 0)
        return crearValorVacio('Sin servicios asignados')

      const container = document.createElement('div')

      container.className = 'roleServices'

      services.forEach((service) => {
        const badge = document.createElement('span')

        badge.className = 'serviceBadge'

        badge.textContent = service.name

        if (service.id !== null) badge.dataset.serviceId = String(service.id)

        container.appendChild(badge)
      })

      return container
    }
  })
}

/* ==========================================================
   ACTIONS
========================================================== */

function crearColumnaAcciones({ onEdit, onDelete, isCurrentRole }) {
  return createActionsColumn({
    className: 'actions',

    containerClassName: 'actions',

    buttonClassName: 'tableButton',

    actions: [
      {
        text: 'Editar',

        className: 'edit',

        hidden(role) {
          return isCurrentRole(role)
        },

        ariaLabel(role) {
          return `Editar el rol ` + obtenerNombreRol(role)
        },

        onClick(role) {
          onEdit(role)
        }
      },

      {
        text: 'Borrar',

        className: 'delete',

        hidden(role) {
          return isCurrentRole(role)
        },

        ariaLabel(role) {
          return `Eliminar el rol ` + obtenerNombreRol(role)
        },

        onClick(role) {
          onDelete(role)
        }
      }
    ]
  })
}

/* ==========================================================
   SERVICES HELPERS
========================================================== */

function normalizarServicios(services) {
  if (!Array.isArray(services)) return []

  const normalizedServices = services
    .map((service) => {
      if (typeof service === 'string') {
        const name = service.trim()

        return name
          ? {
              id: null,
              name
            }
          : null
      }

      if (!service || typeof service !== 'object') return null

      const name = String(service.titulo ?? service.name ?? '').trim()

      if (!name) return null

      const numericId = Number(service.id)

      return {
        id: Number.isInteger(numericId) && numericId > 0 ? numericId : null,

        name
      }
    })
    .filter(Boolean)

  /*
   * Evita mostrar servicios repetidos si el backend devuelve
   * relaciones duplicadas.
   */
  const uniqueServices = new Map()

  normalizedServices.forEach((service) => {
    const key =
      service.id !== null
        ? `id:${service.id}`
        : `name:${service.name.toLocaleLowerCase('es-AR')}`

    if (!uniqueServices.has(key)) uniqueServices.set(key, service)
  })

  return [...uniqueServices.values()]
}

/* ==========================================================
   ROLE HELPERS
========================================================== */

function obtenerNombreRol(role) {
  const name = String(role?.name ?? '').trim()

  if (name) return name

  return `rol n.º ${role?.id ?? ''}`.trim()
}

/* ==========================================================
   EMPTY VALUE
========================================================== */

function crearValorVacio(text) {
  const element = document.createElement('span')

  element.className = 'sin-dato'

  element.textContent = String(text)

  return element
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validarConfiguracion({ onEdit, onDelete, isCurrentRole }) {
  const functions = {
    onEdit,
    onDelete,
    isCurrentRole
  }

  for (const [name, value] of Object.entries(functions)) {
    if (typeof value !== 'function')
      throw new TypeError(`createRolesTable requiere ${name}.`)
  }
}
