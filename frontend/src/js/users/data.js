import {
  setFilteredUsers,
  setUsers,
  users,
  roles,
  setFilteredRoles,
  setRoles,
  setServices,
} from './state.js'
import { getUsers, getRoles, getServices } from '../common/api.js'
import { sortColumn } from './sort.js'
import { fillRoleSelect, renderRoles } from './rolesTable.js'

export async function loadUsers() {
  setUsers(await getUsers())

  setFilteredUsers([...users])

  sortColumn()
}

export async function loadRoles() {
  setRoles(await getRoles())

  setFilteredRoles([...roles])

  fillRoleSelect()

  renderRoles()
}

export async function loadServices() {
  setServices(await getServices())
}

export async function refreshUsers() {
  await loadUsers()
}

export async function refreshRoles() {
  await loadRoles()
}
