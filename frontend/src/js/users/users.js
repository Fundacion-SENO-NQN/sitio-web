import { createListController } from '../common/listController.js'

import { usersApi, rolesApi } from '../common/resources.js'

import { createEventScope, requireElement, setVisible } from '../common/dom.js'

import { showToast } from '../common/toast.js'

import { createUsersTable } from './usersTable.js'

import { createRolesTable } from './rolesTable.js'

import { createUserModal } from './userModal.js'

import { createRoleModal } from './roleModal.js'

import { createUsersDeleteController } from './deleteModal.js'

/* ==========================================================
   ELEMENTOS DE LAS PESTAÑAS
========================================================== */

const usersView = requireElement('#usersView', 'vista de usuarios')

const rolesView = requireElement('#rolesView', 'vista de roles')

const tabUsers = requireElement('#tabUsers', 'pestaña de usuarios')

const tabRoles = requireElement('#tabRoles', 'pestaña de roles')

/* ==========================================================
   RENDERIZADORES
========================================================== */

/*
 * Los renderizadores definitivos se crean después de los
 * modales y del controlador de eliminación.
 *
 * Estas funciones intermedias evitan dependencias circulares
 * entre users.js, las tablas y los modales.
 */
let renderUsers = () => {}
let renderRoles = () => {}

/* ==========================================================
   SERVICIOS
========================================================== */

let services = []
let pendingServicesRequest = null

export async function refreshServices() {
  if (pendingServicesRequest) return pendingServicesRequest

  pendingServicesRequest = loadServices().finally(() => {
    pendingServicesRequest = null
  })

  return pendingServicesRequest
}

async function loadServices() {
  try {
    const response = await rolesApi.getServices()

    services = Array.isArray(response) ? response : []

    return services
  } catch (error) {
    services = []

    console.error('No se pudieron cargar los servicios:', error)

    showToast(
      error instanceof Error
        ? error.message
        : 'No se pudieron cargar los servicios.',
      'error'
    )

    throw error
  }
}

export function getServices() {
  return [...services]
}

export function getServiceById(id) {
  const normalizedId = Number(id)

  return services.find((service) => Number(service.id) === normalizedId)
}

/* ==========================================================
   LISTA DE USUARIOS
========================================================== */

export const usersController = createListController({
  load: usersApi.list,

  render(context) {
    renderUsers(context)
  },

  searchInput: '#searchUsers',

  loadingElement: '#pantalla-carga-users',

  createButtons: ['#btnNewUser'],

  onCreate() {
    userModal.openCreate()
  },

  searchValues(user) {
    return [
      user.username,
      user.email,
      user.name,
      user.last_name,
      user.role_name,

      `${user.name ?? ''} ${user.last_name ?? ''}`
    ]
  },

  sortButtons: {
    name: '#sortName',

    username: '#sortUsername',

    email: '#sortEmail',

    role: '#sortRole',

    status: '#sortStatus'
  },

  sorters: {
    name(userA, userB) {
      return getFullName(userA).localeCompare(getFullName(userB), 'es-AR', {
        sensitivity: 'base'
      })
    },

    username(userA, userB) {
      return compareText(userA.username, userB.username)
    },

    email(userA, userB) {
      return compareText(userA.email, userB.email)
    },

    role(userA, userB) {
      return compareText(userA.role_name, userB.role_name)
    },

    status(userA, userB) {
      return Number(Boolean(userA.active)) - Number(Boolean(userB.active))
    }
  },

  defaultSort: 'name',

  defaultAscending: true,

  hiddenClass: 'hidden',

  singular: 'usuario',

  plural: 'usuarios',

  messages: {
    loadError: 'No se pudieron cargar los usuarios.'
  },

  onError(error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'No se pudieron cargar los usuarios.',
      'error'
    )
  }
})

export const usuariosController = usersController

/* ==========================================================
   LISTA DE ROLES
========================================================== */

export const rolesController = createListController({
  load: rolesApi.list,

  render(context) {
    renderRoles(context)
  },

  searchInput: '#searchRoles',

  loadingElement: '#pantalla-carga-roles',

  createButtons: ['#btnNewRole'],

  onCreate() {
    roleModal.openCreate()
  },

  searchValues(role) {
    return [
      role.name,

      ...(Array.isArray(role.services)
        ? role.services.map((service) => service.titulo ?? service.name)
        : [])
    ]
  },

  sortButtons: {
    role_name: '#sortRoleName',

    services: '#sortRoleServices'
  },

  sorters: {
    role_name(roleA, roleB) {
      return compareText(roleA.name, roleB.name)
    },

    services(roleA, roleB) {
      return compareText(getRoleServicesText(roleA), getRoleServicesText(roleB))
    }
  },

  defaultSort: 'role_name',

  defaultAscending: true,

  hiddenClass: 'hidden',

  singular: 'rol',

  plural: 'roles',

  messages: {
    loadError: 'No se pudieron cargar los roles.'
  },

  onError(error) {
    showToast(
      error instanceof Error
        ? error.message
        : 'No se pudieron cargar los roles.',
      'error'
    )
  }
})

/* ==========================================================
   MODAL DE USUARIOS
========================================================== */

export const userModal = createUserModal({
  create: usersApi.create,

  update: usersApi.update,

  changePassword: usersApi.changePassword,

  refresh: refreshUsers,

  getRoles() {
    return rolesController.items
  },

  isCurrentUser
})

export const usuarioModal = userModal

/* ==========================================================
   MODAL DE ROLES
========================================================== */

export const roleModal = createRoleModal({
  create: rolesApi.create,

  update: rolesApi.update,

  refresh: refreshRolesAndUsers,

  getServices,

  ensureServices: refreshServices,

  isCurrentRole
})

export const rolModal = roleModal

/* ==========================================================
   ELIMINACIÓN DE USUARIOS Y ROLES
========================================================== */

export const deleteController = createUsersDeleteController({
  removeUser: usersApi.remove,

  removeRole: rolesApi.remove,

  refreshUsers,

  refreshRoles: refreshRolesAndUsers,

  isCurrentUser,
  isCurrentRole
})

/* ==========================================================
   CAMBIO DE ESTADO
========================================================== */

const changingUserStatus = new Set()

export async function setUserStatus(user, active) {
  const id = normalizeId(user?.id)

  if (isCurrentUser(user)) {
    showToast('No podés cambiar el estado de tu propio usuario.', 'warning')

    return false
  }

  if (changingUserStatus.has(id)) return false

  changingUserStatus.add(id)

  /*
   * Vuelve a renderizar para deshabilitar temporalmente
   * el interruptor del usuario.
   */
  usersController.applyFilters()

  try {
    const updatedUser = await usersApi.setActive(id, Boolean(active))

    /*
     * Algunos endpoints devuelven el usuario actualizado.
     * Si no lo hacen, usamos los datos locales.
     */
    if (updatedUser && typeof updatedUser === 'object')
      replaceUserLocally(updatedUser)
    else
      replaceUserLocally({
        ...user,
        active: Boolean(active)
      })

    showToast(
      Boolean(active)
        ? 'Usuario activado correctamente.'
        : 'Usuario desactivado correctamente.',
      'success'
    )

    return true
  } catch (error) {
    console.error('No se pudo cambiar el estado del usuario:', error)

    showToast(
      error instanceof Error
        ? error.message
        : 'No se pudo cambiar el estado del usuario.',
      'error'
    )

    /*
     * Recupera el estado real almacenado en el backend.
     */
    try {
      await usersController.refresh({
        showLoading: false
      })
    } catch {}

    return false
  } finally {
    changingUserStatus.delete(id)

    usersController.applyFilters()
  }
}

export function isChangingUserStatus(userOrId) {
  const id = normalizeId(typeof userOrId === 'object' ? userOrId?.id : userOrId)

  return changingUserStatus.has(id)
}

function replaceUserLocally(updatedUser) {
  const id = normalizeId(updatedUser.id)

  const nextUsers = usersController.items.map((user) =>
    Number(user.id) === id
      ? {
          ...user,
          ...updatedUser
        }
      : user
  )

  usersController.setItems(nextUsers)
}

/* ==========================================================
   TABLAS
========================================================== */

renderUsers = createUsersTable({
  onEdit(user) {
    userModal.openEdit(user)
  },

  onDelete(user) {
    deleteController.openUser(user)
  },

  onPassword(user) {
    userModal.askNewPassword(user)
  },

  onToggleActive(user, active) {
    return setUserStatus(user, active)
  },

  isCurrentUser,

  isChangingStatus: isChangingUserStatus
})

renderRoles = createRolesTable({
  onEdit(role) {
    roleModal.openEdit(role)
  },

  onDelete(role) {
    deleteController.openRole(role)
  },

  isCurrentRole
})

/* ==========================================================
   PESTAÑAS
========================================================== */

const tabEvents = createEventScope()

export function showUsers() {
  setActiveTab('users')
}

export function showRoles() {
  setActiveTab('roles')
}

function registerTabEvents() {
  tabEvents.on(tabUsers, 'click', showUsers)

  tabEvents.on(tabRoles, 'click', showRoles)

  tabEvents.on(tabUsers, 'keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowDown') return

    event.preventDefault()

    showRoles()
    tabRoles.focus()
  })

  tabEvents.on(tabRoles, 'keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowUp') return

    event.preventDefault()

    showUsers()
    tabUsers.focus()
  })
}

function setActiveTab(tab) {
  const usersActive = tab === 'users'

  setVisible(usersView, usersActive, {
    hiddenClass: null,
    useHiddenAttribute: true
  })

  setVisible(rolesView, !usersActive, {
    hiddenClass: null,
    useHiddenAttribute: true
  })

  tabUsers.classList.toggle('active', usersActive)

  tabRoles.classList.toggle('active', !usersActive)

  tabUsers.setAttribute('aria-selected', String(usersActive))

  tabRoles.setAttribute('aria-selected', String(!usersActive))

  tabUsers.tabIndex = usersActive ? 0 : -1

  tabRoles.tabIndex = usersActive ? -1 : 0
}

/* ==========================================================
   RECARGAS
========================================================== */

export function refreshUsers(options = {}) {
  return usersController.refresh(options)
}

export function refreshRoles(options = {}) {
  return rolesController.refresh(options)
}

export async function refreshRolesAndUsers() {
  await Promise.all([
    rolesController.refresh({
      showLoading: false
    }),

    usersController.refresh({
      showLoading: false
    })
  ])
}

export async function refreshAll() {
  const results = await Promise.allSettled([
    usersController.refresh(),
    rolesController.refresh(),
    refreshServices()
  ])

  return results
}

/* ==========================================================
   CONSULTAS
========================================================== */

export function getUsers() {
  return usersController.items
}

export function getFilteredUsers() {
  return usersController.filteredItems
}

export function getUserById(id) {
  return usersController.getById(id)
}

export function getRoles() {
  return rolesController.items
}

export function getFilteredRoles() {
  return rolesController.filteredItems
}

export function getRoleById(id) {
  return rolesController.getById(id)
}

/* ==========================================================
   SESIÓN ACTUAL
========================================================== */

export function getCurrentUsername() {
  return String(localStorage.getItem('username') ?? '').trim()
}

export function getCurrentRoleName() {
  return String(localStorage.getItem('role') ?? '').trim()
}

export function isCurrentUser(user) {
  const username = String(user?.username ?? '').trim()

  return username !== '' && username === getCurrentUsername()
}

export function isCurrentRole(role) {
  const roleName = String(role?.name ?? '').trim()

  return roleName !== '' && roleName === getCurrentRoleName()
}

/* ==========================================================
   INICIALIZACIÓN
========================================================== */

async function init() {
  registerTabEvents()

  userModal.initialize()
  roleModal.initialize()
  deleteController.initialize()

  /*
   * La pestaña de usuarios es la vista inicial.
   */
  showUsers()

  const results = await Promise.allSettled([
    usersController.initialize(),
    rolesController.initialize(),
    refreshServices()
  ])

  results.forEach((result) => {
    if (result.status === 'rejected')
      console.error('Falló una carga inicial de usuarios:', result.reason)
  })
}

/* ==========================================================
   HELPERS
========================================================== */

function getFullName(user) {
  return [user?.name, user?.last_name]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

function getRoleServicesText(role) {
  if (!Array.isArray(role?.services)) return ''

  return role.services
    .map((service) => String(service?.titulo ?? service?.name ?? '').trim())
    .filter(Boolean)
    .join(', ')
}

function compareText(first, second) {
  return String(first ?? '').localeCompare(String(second ?? ''), 'es-AR', {
    sensitivity: 'base'
  })
}

function normalizeId(value) {
  const id = Number(value)

  if (!Number.isInteger(id) || id <= 0)
    throw new TypeError('El id no es válido.')

  return id
}

/* ==========================================================
   EJECUCIÓN
========================================================== */

init()
