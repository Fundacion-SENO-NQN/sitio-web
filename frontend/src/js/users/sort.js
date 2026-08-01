import { renderRoles } from './rolesTable.js'
import {
  filteredUsers,
  setAscending,
  ascending,
  currentSort,
  setCurrentSort,
  currentSortHeader,
  setCurrentSortHeader,
  filteredRoles,
} from './state.js'
import { renderUsers } from './usersTable.js'

export function setSort(column, header) {
  currentSortHeader.className = ''
  if (currentSort === column) setAscending(!ascending)
  else {
    setCurrentSort(column)
    setCurrentSortHeader(header)
    setAscending(true)
  }

  currentSortHeader.classList.add(`sort-${ascending ? 'up' : 'down'}`)
  sortColumn(!(column === 'role_name' || column === 'services'))
}

export function sortColumn(userColumn = true) {
  if (userColumn) {
    filteredUsers.sort((a, b) => {
      let A
      let B
      switch (currentSort) {
        case 'username':
          A = a.username
          B = b.username
          break
        case 'email':
          A = a.email
          B = b.email
          break
        case 'role':
          A = a.role_name
          B = b.role_name
          break
        case 'status':
          A = a.active
          B = b.active
          break
        default:
          A = `${a.name} ${a.last_name}`
          B = `${b.name} ${b.last_name}`
      }

      if (typeof A === 'string') {
        A = A.toLowerCase()
        B = B.toLowerCase()
      }
      if (A < B) return ascending ? -1 : 1
      if (A > B) return ascending ? 1 : -1
      return 0
    })

    renderUsers()
  } else {
    filteredRoles.sort((a, b) => {
      let A, B
      switch (currentSort) {
        case 'services':
          A = a.services
          B = b.services
          break
        default:
          A = a.name
          B = b.name
      }

      if (typeof A === 'string') {
        A = A.toLowerCase()
        B = B.toLowerCase()
      }
      if (A < B) return ascending ? -1 : 1
      if (A > B) return ascending ? 1 : -1
      return 0
    })

    renderRoles()
  }
}
