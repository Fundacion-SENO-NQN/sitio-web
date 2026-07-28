import { users, roles, setUsers, setRoles } from './state.js'
import { filterUsers, filterRoles } from './search.js'
import { servicesContainer } from './dom.js'

export function findUser(id) {
  return users.find((user) => user.id === id)
}

export function findRole(id) {
  return roles.find((role) => role.id === id)
}

export function replaceUser(updatedUser) {
  const index = users.findIndex((user) => user.id === updatedUser.id)

  if (index === -1) return

  users[index] = updatedUser

  filterUsers()
}

export function removeUser(id) {
  setUsers(users.filter((user) => user.id !== id))

  filterUsers()
}

export function replaceRole(updatedRole) {
  const index = roles.findIndex((role) => role.id === updatedRole.id)

  if (index === -1) return

  roles[index] = updatedRole

  filterRoles()
}

export function removeRole(id) {
  setRoles(roles.filter((role) => role.id !== id))

  filterRoles()
}

export function getSelectedServices() {
  return [...servicesContainer.querySelectorAll('input:checked')].map((cb) =>
    Number(cb.value),
  )
}

export function validateRole(name, services) {
  if (name.length === 0) throw new Error('El nombre del rol es requerido.')

  if (services.length === 0) throw new Error('Seleccionar al menos 1 servicio.')
}
