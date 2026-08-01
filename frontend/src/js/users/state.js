import { sortName } from './dom.js'

export let users = []

export function setUsers(value) {
  users = value
}

export let filteredUsers = []

export function setFilteredUsers(value) {
  filteredUsers = value
}

export let roles = []

export function setRoles(value) {
  roles = value
}

export let filteredRoles = []

export function setFilteredRoles(value) {
  filteredRoles = value
}

export let services = []

export function setServices(value) {
  services = value
}

export let editingUser = null

export function setEditingUser(value) {
  editingUser = value
}

export let editingRole = null

export function setEditingRole(value) {
  editingRole = value
}

export let deletingEntity = null

export function setDeletingEntity(value) {
  deletingEntity = value
}

export let deletingType = null

export function setDeletingType(value) {
  deletingType = value
}

export let currentSort = 'name'

export function setCurrentSort(value) {
  currentSort = value
}

export let currentSortHeader = sortName

export function setCurrentSortHeader(value) {
  currentSortHeader = value
}

export let ascending = true

export function setAscending(value) {
  ascending = value
}
