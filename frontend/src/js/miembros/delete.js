import { refreshMembers } from './miembros.js'

import { deleteMember } from '../common/api.js'

import { showToast } from '../common/toast.js'

/* ==========================================================
   DOM
========================================================== */

const modal = document.getElementById('deleteMemberModal')

const deleteText = document.getElementById('deleteMemberText')

const cancelButton = document.getElementById('btnCancelDeleteMember')

const deleteButton = document.getElementById('btnDeleteMember')

/* ==========================================================
   STATE
========================================================== */

let deletingMember = null

let deleting = false

/* ==========================================================
   EVENTS
========================================================== */

export function registerMemberDeleteEvents() {
  cancelButton?.addEventListener('click', closeDeleteMemberModal)

  deleteButton?.addEventListener('click', confirmDeleteMember)

  modal?.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeDeleteMemberModal()
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal?.classList.contains('hidden')) {
      closeDeleteMemberModal()
    }
  })
}

/* ==========================================================
   OPEN
========================================================== */

export function openDeleteMemberModal(member) {
  if (deleting) {
    return
  }

  deletingMember = member

  if (deleteText) {
    const fullName = `${member.nombre} ${member.apellido}`.trim()

    deleteText.textContent =
      `¿Seguro que querés eliminar a “${fullName}”? ` +
      'Esta acción no se puede deshacer.'
  }

  modal?.classList.remove('hidden')

  document.body.style.overflow = 'hidden'

  cancelButton?.focus()
}

/* ==========================================================
   CLOSE
========================================================== */

export function closeDeleteMemberModal() {
  if (deleting) {
    return
  }

  modal?.classList.add('hidden')

  document.body.style.overflow = ''

  deletingMember = null

  resetDeleteButton()
}

/* ==========================================================
   DELETE
========================================================== */

async function confirmDeleteMember() {
  if (deleting || !deletingMember) {
    return
  }

  deleting = true

  setDeletingState(true)

  const memberName =
    `${deletingMember.nombre} ${deletingMember.apellido}`.trim()

  try {
    await deleteMember(deletingMember.id)

    /*
     * Close manually because closeDeleteMemberModal()
     * does not close while `deleting` is true.
     */
    modal?.classList.add('hidden')

    document.body.style.overflow = ''

    deletingMember = null

    showToast(`${memberName} fue eliminado correctamente.`, 'success')

    await refreshMembers()
  } catch (error) {
    console.error('Error deleting member:', error)

    showToast(error.message || 'No se pudo eliminar el miembro.', 'error', 5000)
  } finally {
    deleting = false

    resetDeleteButton()
  }
}

/* ==========================================================
   BUTTON STATE
========================================================== */

function setDeletingState(isDeleting) {
  if (deleteButton) {
    deleteButton.disabled = isDeleting
    deleteButton.textContent = isDeleting ? 'Eliminando...' : 'Eliminar'
  }

  if (cancelButton) {
    cancelButton.disabled = isDeleting
  }
}

function resetDeleteButton() {
  if (deleteButton) {
    deleteButton.disabled = false
    deleteButton.textContent = 'Eliminar'
  }

  if (cancelButton) {
    cancelButton.disabled = false
  }
}
