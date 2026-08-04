import {
  createTableRenderer,
  createCustomColumn,
  createTextColumn,
  createActionsColumn
} from '../common/table.js'

import { requireElement } from '../common/dom.js'

/* ==========================================================
   TABLE FACTORY
========================================================== */

export function createUsersTable({
  onEdit,
  onDelete,
  onPassword,
  onToggleActive,

  isCurrentUser,
  isChangingStatus
} = {}) {
  validarConfiguracion({
    onEdit,
    onDelete,
    onPassword,
    onToggleActive,
    isCurrentUser,
    isChangingStatus
  })

  const emptyElement = requireElement('#usersEmpty', 'estado vacío de usuarios')

  const renderTable = createTableRenderer({
    body: '#usersBody',

    getRowId(user) {
      return user.id
    },

    getRowDataset(user) {
      return {
        userId: user.id,

        username: user.username ?? ''
      }
    },

    getRowClassName(user) {
      return {
        currentUser: isCurrentUser(user),

        inactiveUser: !Boolean(user.active)
      }
    },

    columns: [
      crearColumnaUsuario(),

      createTextColumn({
        value: 'username',

        emptyText: 'Sin usuario',

        textClassName: 'usernameValue'
      }),

      createTextColumn({
        value: 'email',

        emptyText: 'Sin correo',

        textClassName: 'emailValue'
      }),

      crearColumnaRol(),

      crearColumnaEstado({
        onToggleActive,
        isCurrentUser,
        isChangingStatus
      }),

      crearColumnaAcciones({
        onEdit,
        onDelete,
        onPassword,
        isCurrentUser
      })
    ]
  })

  return function renderUsers(context = {}) {
    const items = Array.isArray(context.items) ? context.items : []

    /*
     * Aunque no existan usuarios visibles, ejecutamos el
     * render para eliminar las filas de una búsqueda anterior.
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
   USER INFORMATION
========================================================== */

function crearColumnaUsuario() {
  return createCustomColumn({
    render(user) {
      const container = document.createElement('div')

      container.className = 'userCell'

      const avatar = document.createElement('div')

      avatar.className = 'avatar'

      avatar.textContent = obtenerIniciales(user)

      avatar.setAttribute('aria-hidden', 'true')

      const info = document.createElement('div')

      const name = document.createElement('div')

      name.className = 'name'

      name.textContent = obtenerNombreCompleto(user)

      const username = document.createElement('div')

      username.className = 'username'

      username.textContent = obtenerUsernameVisible(user)

      info.append(name, username)

      container.append(avatar, info)

      return container
    }
  })
}

/* ==========================================================
   ROLE
========================================================== */

function crearColumnaRol() {
  return createCustomColumn({
    render(user) {
      const roleName = String(user.role_name ?? '').trim()

      if (!roleName) return crearValorVacio('Sin rol')

      const badge = document.createElement('span')

      badge.className = 'roleBadge'

      badge.textContent = roleName

      return badge
    }
  })
}

/* ==========================================================
   STATUS
========================================================== */

function crearColumnaEstado({
  onToggleActive,
  isCurrentUser,
  isChangingStatus
}) {
  return createCustomColumn({
    render(user) {
      const currentUser = isCurrentUser(user)

      const changing = isChangingStatus(user)

      const label = document.createElement('label')

      label.className = 'switch'

      if (changing) label.classList.add('loading')

      const checkbox = document.createElement('input')

      checkbox.type = 'checkbox'

      checkbox.checked = Boolean(user.active)

      checkbox.disabled = currentUser || changing

      checkbox.setAttribute('aria-label', construirLabelEstado(user))

      checkbox.setAttribute('aria-busy', String(changing))

      if (currentUser)
        checkbox.title = 'No podés cambiar el estado de tu propio usuario.'

      checkbox.addEventListener('change', async () => {
        const nextActive = checkbox.checked

        checkbox.disabled = true
        checkbox.setAttribute('aria-busy', 'true')

        try {
          const changed = await onToggleActive(user, nextActive)

          /*
           * Si la operación fue rechazada antes de llegar
           * al backend, restauramos el valor inmediatamente.
           *
           * Para errores del servidor, users.js recarga la
           * colección y vuelve a renderizar la fila.
           */
          if (changed === false) checkbox.checked = Boolean(user.active)
        } catch (error) {
          checkbox.checked = Boolean(user.active)

          console.error('No se pudo cambiar el estado del usuario:', error)
        } finally {
          /*
           * Puede que la tabla ya haya sido renderizada de
           * nuevo y este control esté desconectado del DOM.
           */
          if (checkbox.isConnected) {
            checkbox.disabled = currentUser

            checkbox.setAttribute('aria-busy', 'false')
          }
        }
      })

      const slider = document.createElement('span')

      slider.className = 'slider'

      slider.setAttribute('aria-hidden', 'true')

      label.append(checkbox, slider)

      return label
    }
  })
}

/* ==========================================================
   ACTIONS
========================================================== */

function crearColumnaAcciones({ onEdit, onDelete, onPassword, isCurrentUser }) {
  return createActionsColumn({
    className: 'actions',

    containerClassName: 'actions',

    buttonClassName: 'tableButton',

    actions: [
      {
        text: 'Editar',

        className: 'edit',

        ariaLabel(user) {
          return `Editar el usuario ` + obtenerUsername(user)
        },

        onClick(user) {
          onEdit(user)
        }
      },

      {
        text: 'Contraseña',

        hidden(user) {
          return !isCurrentUser(user)
        },

        ariaLabel(user) {
          return `Cambiar la contraseña de ` + obtenerUsername(user)
        },

        onClick(user) {
          onPassword(user)
        }
      },

      {
        text: 'Borrar',

        className: 'delete',

        hidden(user) {
          return isCurrentUser(user)
        },

        ariaLabel(user) {
          return `Eliminar el usuario ` + obtenerUsername(user)
        },

        onClick(user) {
          onDelete(user)
        }
      }
    ]
  })
}

/* ==========================================================
   USER HELPERS
========================================================== */

function obtenerNombreCompleto(user) {
  const fullName = [user?.name, user?.last_name]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')

  if (fullName) return fullName

  return obtenerUsername(user)
}

function obtenerUsername(user) {
  const username = String(user?.username ?? '').trim()

  if (username) return username

  return `usuario n.º ${user?.id ?? ''}`.trim()
}

function obtenerUsernameVisible(user) {
  const username = String(user?.username ?? '').trim()

  return username ? `@${username}` : 'Sin nombre de usuario'
}

function obtenerIniciales(user) {
  const firstName = String(user?.name ?? '').trim()

  const lastName = String(user?.last_name ?? '').trim()

  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toLocaleUpperCase('es-AR')

  if (initials) return initials

  const username = String(user?.username ?? '').trim()

  return username.slice(0, 2).toLocaleUpperCase('es-AR')
}

/* ==========================================================
   STATUS HELPERS
========================================================== */

function construirLabelEstado(user) {
  const username = obtenerUsername(user)

  return Boolean(user.active)
    ? `Desactivar el usuario ${username}`
    : `Activar el usuario ${username}`
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

function validarConfiguracion({
  onEdit,
  onDelete,
  onPassword,
  onToggleActive,
  isCurrentUser,
  isChangingStatus
}) {
  const functions = {
    onEdit,
    onDelete,
    onPassword,
    onToggleActive,
    isCurrentUser,
    isChangingStatus
  }

  for (const [name, value] of Object.entries(functions)) {
    if (typeof value !== 'function')
      throw new TypeError(`createUsersTable requiere ${name}.`)
  }
}
