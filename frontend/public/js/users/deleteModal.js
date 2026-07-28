import {
  deletingEntity,
  roles,
  setDeletingEntity,
  setRoles,
  setUsers,
  users,
} from './state.js'
import {
  confirmText,
  confirmModal,
  btnCancelDelete,
  modalCargaConfirm,
} from './dom.js'
import { deleteRole, deleteUser } from '../common/api.js'
import { filterRoles, filterUsers } from './search.js'
import { showToast } from '../common/toast.js'

export function openDeleteUserModal(user) {
  setDeletingEntity(user)

  confirmText.textContent = `¿Borrar "${user.username}"?`

  openModal()

  btnConfirmDelete.onclick = confirmDeleteUser
}

export function openDeleteRoleModal(role) {
  setDeletingEntity(role)

  confirmText.textContent = `¿Borrar "${role.name}"?`

  openModal()

  btnConfirmDelete.onclick = confirmDeleteRole
}

function openModal() {
  confirmModal.classList.remove('hidden')
  modalCargaConfirm.classList.add('hidden')
}

export async function confirmDeleteUser() {
  if (!deletingEntity) return
  modalCargaConfirm.classList.remove('hidden')
  try {
    await deleteUser(deletingEntity.id)

    setUsers(users.filter((user) => user.id !== deletingEntity.id))

    filterUsers()

    closeDeleteModal()

    showToast('Usuario borrado exitosamente.', 'success')
  } catch (error) {
    console.error(error)

    showToast(error.message, 'error')

    modalCargaConfirm.classList.add('hidden')
  }
}

export async function confirmDeleteRole() {
  if (!deletingEntity) return
  modalCargaConfirm.classList.remove('hidden')
  try {
    await deleteRole(deletingEntity.id)

    setRoles(roles.filter((role) => role.id !== deletingEntity.id))

    filterRoles()

    closeDeleteModal()

    showToast('Rol borrado exitosamente.', 'success')
  } catch (error) {
    console.error(error)

    showToast('ERROR: ' + error.message.error, 'error')

    modalCargaConfirm.classList.add('hidden')
  }
}

export function closeDeleteModal() {
  confirmModal.classList.add('hidden')

  setDeletingEntity(null)
}

btnCancelDelete.onclick = closeDeleteModal

confirmModal.onclick = (e) => {
  if (e.target === confirmModal) closeDeleteModal()
}
