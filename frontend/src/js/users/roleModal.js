import { setEditingRole, editingRole } from './state.js'
import {
  modalTitle,
  roleForm,
  roleModal,
  roleModalTitle,
  roleNameInput,
  modalCargaRole,
} from './dom.js'
import { fillServices } from './rolesTable.js'
import { getSelectedServices } from './helpers.js'
import { createRole, updateRole } from '../common/api.js'
import { refreshRoles } from './data.js'

export function openCreateRoleModal() {
  setEditingRole(null)

  modalTitle.textContent = 'Crear Rol'

  roleForm.reset()

  fillServices()

  openRoleModal()
}

export function openRoleModal() {
  roleModal.classList.remove('hidden')
  modalCargaRole.classList.add('hidden')
}

export function closeRoleModal() {
  roleModal.classList.add('hidden')

  roleForm.reset()

  setEditingRole(null)
}

export function openEditRoleModal(role) {
  setEditingRole(role)

  roleModalTitle.textContent = 'Editar Rol'

  roleNameInput.value = role.name

  fillServices(role.services)

  openRoleModal()
}

export async function submitRoleForm(e) {
  e.preventDefault()
  modalCargaRole.classList.remove('hidden')
  const body = {
    name: roleNameInput.value.trim(),

    service_ids: getSelectedServices(),
  }

  if (editingRole == null) {
    await createRole(body)
  } else {
    await updateRole(editingRole.id, body)
  }

  closeRoleModal()

  await refreshRoles()
}
