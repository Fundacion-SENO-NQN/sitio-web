import { deleteAchievement } from '../common/api.js'

import { modalCarga, refreshAchievements } from './logros.js'

import { showToast } from '../common/toast.js'

/* ============================================================
 * DOM
 * ========================================================== */

const modal = document.getElementById('deleteModal')

const text = document.getElementById('deleteText')

const btnCancel = document.getElementById('btnCancelDelete')

const btnDelete = document.getElementById('btnDelete')

/* ============================================================
 * STATE
 * ========================================================== */

let deletingAchievement = null

/* ============================================================
 * EVENTS
 * ========================================================== */

export function registerDeleteEvents() {
  btnCancel.onclick = closeDeleteModal

  btnDelete.onclick = confirmDelete

  modal.onclick = (e) => {
    if (e.target === modal) {
      closeDeleteModal()
    }
  }
}

/* ============================================================
 * OPEN
 * ========================================================== */

export function openDeleteAchievementModal(achievement) {
  deletingAchievement = achievement

  text.textContent = `¿Borrar "${achievement.titulo}"?`

  modal.classList.remove('hidden')
}

/* ============================================================
 * DELETE
 * ========================================================== */

async function confirmDelete() {
  modalCarga.hidden = false
  if (!deletingAchievement) return

  try {
    await deleteAchievement(deletingAchievement.id)

    closeDeleteModal()

    await refreshAchievements()

    showToast('Logro borrado.', 'success')
  } catch (err) {
    console.error(err)

    showToast(err.message, 'error')
  }
  modalCarga.hidden = true
}

/* ============================================================
 * CLOSE
 * ========================================================== */

function closeDeleteModal() {
  deletingAchievement = null

  modal.classList.add('hidden')
}
