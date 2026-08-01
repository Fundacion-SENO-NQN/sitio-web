import { setEditingUser, roles, editingUser } from './state.js'
import {
  modalTitle,
  userForm,
  passwordContainer,
  passwordInput,
  roleSelect,
  usernameInput,
  emailInput,
  nameInput,
  lastNameInput,
  userModal,
  modalCargaUser,
  roleContainer,
} from './dom.js'
import { createUser, updateUser, changePassword } from '../common/api.js'
import { refreshUsers } from './data.js'
import { showToast } from '../common/toast.js'

export function openCreateUserModal() {
  setEditingUser(null)

  modalTitle.textContent = 'Crear Usuario'

  userForm.reset()

  passwordContainer.hidden = false

  passwordInput.required = true

  if (roles.length > 0) roleSelect.value = roles[0].id

  openUserModal()
}

export function openEditUserModal(user) {
  setEditingUser(user)

  modalTitle.textContent = 'Editar Usuario'

  usernameInput.value = user.username

  emailInput.value = user.email

  nameInput.value = user.name

  lastNameInput.value = user.last_name

  if (user.username === localStorage.getItem('username')) {
    roleSelect.hidden = true
    roleContainer.hidden = true
  } else {
    roleSelect.hidden = false
    roleContainer.hidden = false
    roleSelect.value = user.role_id
  }

  passwordInput.value = ''

  passwordContainer.hidden = true

  passwordInput.required = false

  openUserModal()
}

export async function submitUserForm(e) {
  e.preventDefault()
  modalCargaUser.classList.remove('hidden')
  try {
    const data = {
      username: usernameInput.value.trim(),

      email: emailInput.value.trim(),

      name: nameInput.value.trim(),

      last_name: lastNameInput.value.trim(),

      role_id: Number(roleSelect.value),
    }

    validateUserData(data)

    if (editingUser == null) {
      data.password = passwordInput.value

      await createUser(data)

      await refreshUsers()
    } else {
      await updateUser(editingUser.id, data)

      await refreshUsers()
    }

    closeUserModal()
  } catch (error) {
    console.error(error)

    alert(error.message ?? 'Error inesperado.')
  }
}

export function validateUserData(data) {
  if (data.username.length < 3) throw new Error('El nombre de usuario muy corto.')

  if (data.name.length === 0) throw new Error('El nombre es requerido.')

  if (data.last_name.length === 0) throw new Error('El apellido es requerido.')

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    throw new Error('Correo electrónico inválido.')

  if (editingUser == null && passwordInput.value.length < 6)
    throw new Error('La contraseña debe de contener al menos 6 caracteres.')
}

export function closeUserModal() {
  setEditingUser(null)

  userForm.reset()

  userModal.classList.add('hidden')
}

export function openUserModal() {
  userModal.classList.remove('hidden')
  modalCargaUser.classList.add('hidden')
}

export async function askNewPassword(user) {
  const password = prompt(`Nueva contraseña para ${user.username}`)

  if (password == null || password.trim() === '') return

  try {
    await changePassword(user.id, password)

    showToast('Contraseña actualizada.', 'success')
  } catch (error) {
    showToast(error.message, 'error')
  }
}

userForm.addEventListener('submit', submitUserForm)
usernameInput.addEventListener('input', () => {
  usernameInput.value = usernameInput.value.replace(/\s/g, '')
})
emailInput.addEventListener('input', () => {
  emailInput.value = emailInput.value.trim()
})
