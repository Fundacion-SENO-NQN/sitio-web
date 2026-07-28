import { usersBody, usersEmpty, pantallaCargaUsers } from './dom.js'
import { filteredUsers } from './state.js'
import { openEditUserModal, askNewPassword } from './userModal.js'
import { openDeleteUserModal } from './deleteModal.js'
import { replaceUser } from './helpers.js'
import { showToast } from '../common/toast.js'
import { setUserActive } from '../common/api.js'

export function renderUsers() {
  usersBody.innerHTML = ''

  if (filteredUsers.length === 0) {
    usersEmpty.hidden = false

    return
  }

  usersEmpty.hidden = true

  filteredUsers.forEach((user) => {
    usersBody.appendChild(createUserRow(user))
  })

  pantallaCargaUsers.classList.add('hidden')
}

export function createUserRow(user) {
  const tr = document.createElement('tr')

  tr.append(
    createAvatarCell(user),

    createTextCell(user.username),

    createTextCell(user.email),

    createRoleCell(user),

    createStatusCell(user),

    createActionsCell(user),
  )

  return tr
}

export function createAvatarCell(user) {
  const td = document.createElement('td')

  const container = document.createElement('div')

  container.className = 'userCell'

  const avatar = document.createElement('div')

  avatar.className = 'avatar'

  avatar.textContent = `${user.name[0] ?? ''}${user.last_name[0] ?? ''}`

  const info = document.createElement('div')

  const name = document.createElement('div')

  name.className = 'name'

  name.textContent = `${user.name} ${user.last_name}`

  const username = document.createElement('div')

  username.className = 'username'

  username.textContent = '@' + user.username

  info.append(name, username)

  container.append(avatar, info)

  td.appendChild(container)

  return td
}

export function createTextCell(text) {
  const td = document.createElement('td')

  td.textContent = text

  return td
}

export function createRoleCell(user) {
  const td = document.createElement('td')

  const badge = document.createElement('span')

  badge.className = 'roleBadge'

  badge.textContent = user.role_name

  td.appendChild(badge)

  return td
}

export function createStatusCell(user) {
  const td = document.createElement('td')

  const label = document.createElement('label')

  label.className = 'switch'

  const checkbox = document.createElement('input')

  checkbox.type = 'checkbox'

  checkbox.checked = user.active

  if (user.username === localStorage.getItem('username')) {
    checkbox.disabled = true
  } else {
    checkbox.onchange = async () => {
      try {
        const updated = await setUserActive(user.id, checkbox.checked)

        replaceUser(updated)

        showToast('Estatus actualizado.', 'success')
      } catch (error) {
        checkbox.checked = !checkbox.checked

        showToast(error.message, 'error')
      }
    }
  }

  const slider = document.createElement('span')

  slider.className = 'slider'

  label.append(checkbox, slider)

  td.appendChild(label)

  return td
}

export function createActionsCell(user) {
  const td = document.createElement('td')

  td.className = 'actions'

  const edit = document.createElement('button')

  edit.className = 'tableButton edit'

  edit.textContent = 'Editar'

  edit.onclick = () => {
    openEditUserModal(user)
  }

  td.appendChild(edit)

  const password = document.createElement('button')

  password.className = 'tableButton'

  if (user.username === localStorage.getItem('username')) {
    password.textContent = 'Contraseña'

    password.onclick = () => {
      askNewPassword(user)
    }

    td.appendChild(password)
  }

  if (user.username !== localStorage.getItem('username')) {
    const del = document.createElement('button')

    del.className = 'tableButton delete'

    del.textContent = 'Borrar'

    del.onclick = () => {
      openDeleteUserModal(user)
    }

    td.appendChild(del)
  }

  return td
}
