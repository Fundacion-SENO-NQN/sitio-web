import { usersView, rolesView, tabUsers, tabRoles } from './dom.js'

export function showUsers() {
  usersView.hidden = false

  rolesView.hidden = true

  tabUsers.classList.add('active')

  tabRoles.classList.remove('active')
}

export function showRoles() {
  usersView.hidden = true

  rolesView.hidden = false

  tabRoles.classList.add('active')

  tabUsers.classList.remove('active')
}
