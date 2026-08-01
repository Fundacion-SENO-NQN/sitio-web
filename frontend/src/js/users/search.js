import { setFilteredUsers, users, setFilteredRoles, roles } from './state.js'
import { searchUsers, searchRoles } from './dom.js'
import { sortColumn } from './sort.js'
import { renderRoles } from './rolesTable.js'

export function filterUsers() {
  const text = searchUsers.value.trim().toLowerCase()

  setFilteredUsers(
    users.filter((user) => {
      return (
        user.username.toLowerCase().includes(text) ||
        user.email.toLowerCase().includes(text) ||
        user.name.toLowerCase().includes(text) ||
        user.last_name.toLowerCase().includes(text) ||
        user.role_name.toLowerCase().includes(text)
      )
    }),
  )

  sortColumn()
}

export function filterRoles() {
  const text = searchRoles.value.trim().toLowerCase()

  setFilteredRoles(
    roles.filter((role) => {
      if (role.name.toLowerCase().includes(text)) return true

      return role.services.some((service) =>
        service.titulo.toLowerCase().includes(text),
      )
    }),
  )

  renderRoles()
}
