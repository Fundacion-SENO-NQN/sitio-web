import {
  tabUsers,
  tabRoles,
  searchRoles,
  searchUsers,
  sortName,
  sortUsername,
  sortEmail,
  sortRole,
  sortStatus,
  sortRoleName,
  sortRoleServices,
  btnNewUser,
  btnNewRole,
  btnCancel,
  btnCloseModal,
  btnCancelRole,
  btnCloseRoleModal,
  userModal,
  roleModal,
  roleForm,
  userForm,
} from './dom.js'
import { closeUserModal, openCreateUserModal } from './userModal.js'
import {
  closeRoleModal,
  openCreateRoleModal,
  submitRoleForm,
} from './roleModal.js'
import { closeDeleteModal } from './deleteModal.js'
import { showUsers, showRoles } from './tabs.js'
import { filterRoles, filterUsers } from './search.js'
import { setSort } from './sort.js'

export function registerEvents() {
  roleForm.addEventListener('submit', submitRoleForm)

  /* tabs */

  tabUsers.onclick = showUsers

  tabRoles.onclick = showRoles

  /* search */

  searchUsers.addEventListener('input', filterUsers)

  searchRoles.addEventListener('input', filterRoles)

  /* sorting */

  sortName.onclick = () => setSort('name', sortName)

  sortUsername.onclick = () => setSort('username', sortUsername)

  sortEmail.onclick = () => setSort('email', sortEmail)

  sortRole.onclick = () => setSort('role', sortRole)

  sortStatus.onclick = () => setSort('status', sortStatus)

  sortRoleName.onclick = () => setSort('role_name', sortRoleName)
  sortRoleServices.onclick = () => setSort('services', sortRoleServices)

  /* new */

  btnNewUser.onclick = openCreateUserModal

  btnNewRole.onclick = openCreateRoleModal

  /* modal */

  btnCancel.onclick = closeUserModal

  btnCloseModal.onclick = closeUserModal

  btnCancelRole.onclick = closeRoleModal

  btnCloseRoleModal.onclick = closeRoleModal

  userModal.onclick = (e) => {
    if (e.target === userModal) closeUserModal()
  }

  roleModal.onclick = (e) => {
    if (e.target === roleModal) closeRoleModal()
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return

    closeUserModal()

    closeRoleModal()

    closeDeleteModal()
  })
}
