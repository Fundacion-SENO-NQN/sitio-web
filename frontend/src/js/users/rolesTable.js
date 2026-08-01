import {
  rolesBody,
  rolesEmpty,
  roleSelect,
  servicesContainer,
  pantallaCargaRoles,
} from './dom.js'
import { filteredRoles, roles, services } from './state.js'
import { createTextCell } from './usersTable.js'
import { openEditRoleModal } from './roleModal.js'
import { openDeleteRoleModal } from './deleteModal.js'

export function renderRoles() {
  rolesBody.innerHTML = ''

  if (filteredRoles.length === 0) {
    rolesEmpty.hidden = false

    return
  }

  rolesEmpty.hidden = true

  filteredRoles.forEach((role) => {
    rolesBody.appendChild(createRoleRow(role))
  })

  pantallaCargaRoles.remove()
}

export function createRoleRow(role) {
  const tr = document.createElement('tr')

  const services = role.services.map((service) => service.titulo).join(', ')

  tr.append(
    createTextCell(role.name),

    createTextCell(services),

    createRoleActions(role),
  )

  return tr
}

export function createRoleActions(role) {
  const td = document.createElement('td')

  td.className = 'actions'

  if (role.name === localStorage.getItem('role')) return td

  const edit = document.createElement('button')

  edit.className = 'tableButton edit'

  edit.textContent = 'Editar'

  edit.onclick = () => openEditRoleModal(role)

  const del = document.createElement('button')

  del.className = 'tableButton delete'

  del.textContent = 'Borrar'

  del.onclick = () => openDeleteRoleModal(role)

  td.append(edit, del)

  return td
}

export function fillRoleSelect() {
  roleSelect.innerHTML = ''

  roles.forEach((role) => {
    const option = document.createElement('option')

    option.value = role.id

    option.textContent = role.name

    roleSelect.appendChild(option)
  })
}

export function fillServices(selected = []) {
  servicesContainer.innerHTML = ''

  services.forEach((service) => {
    const label = document.createElement('label')

    label.className = 'serviceOption'

    const checkbox = document.createElement('input')

    checkbox.type = 'checkbox'

    checkbox.value = service.id

    checkbox.checked = selected.some((s) => s.id === service.id)

    const span = document.createElement('span')

    span.textContent = service.titulo

    label.append(checkbox, span)

    servicesContainer.appendChild(label)
  })
}
