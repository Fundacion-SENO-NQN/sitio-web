import { createAchievement, updateAchievement } from '../common/api.js'

import { modalCarga, refreshAchievements } from './logros.js'

import { buildAchievementFormData } from './formData.js'

import { showToast } from '../common/toast.js'

/* ============================================================
 * DOM
 * ========================================================== */

const modal = document.getElementById('achievementModal')

const form = document.getElementById('achievementForm')

const title = document.getElementById('modalTitle')

const titulo = document.getElementById('title')

const contenido = document.getElementById('description')

const fecha = document.getElementById('date')

const image = document.getElementById('image')

const btnCancel = document.getElementById('btnCancel')

/* ============================================================
 * STATE
 * ========================================================== */

let editingAchievement = null

/* ============================================================
 * EVENTS
 * ========================================================== */

export function registerModalEvents() {
  btnCancel.onclick = closeModal

  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal()
    }
  }

  form.addEventListener('submit', submitForm)
}

/* ============================================================
 * OPEN
 * ========================================================== */

export function openCreateAchievementModal() {
  editingAchievement = null

  title.textContent = 'Crear logro'

  form.reset()

  openModal()
}

export function openEditAchievementModal(achievement) {
  editingAchievement = achievement

  title.textContent = 'Editar logro'

  titulo.value = achievement.titulo

  contenido.value = achievement.contenido

  /*
      If later you add a date field to the backend,
      assign it here.
  */

  image.value = ''

  openModal()
}

/* ============================================================
 * SUBMIT
 * ========================================================== */

async function submitForm(e) {
  e.preventDefault()
  modalCarga.hidden = false
  try {
    validate()

    const data = {
      titulo: titulo.value.trim(),

      contenido: contenido.value.trim(),

      orden: editingAchievement ? editingAchievement.orden : 0,

      image: image.files.length > 0 ? image.files[0] : null,
    }

    const formData = buildAchievementFormData(data)

    if (editingAchievement == null) {
      await createAchievement(formData)

      showToast('Logro creado.', 'success')
    } else {
      await updateAchievement(editingAchievement.id, formData)

      showToast('Logro actualizado.', 'success')
    }

    closeModal()

    await refreshAchievements()
  } catch (err) {
    showToast(err.message, 'error')
  }
  modalCarga.hidden = true
}

/* ============================================================
 * VALIDATION
 * ========================================================== */

function validate() {
  if (titulo.value.trim().length < 3) throw new Error('El título es muy corto.')

  if (contenido.value.trim().length < 10)
    throw new Error('La descripción es muy corta.')

  if (editingAchievement == null && image.files.length === 0)
    throw new Error('La imagen es requerida.')
}

/* ============================================================
 * MODAL
 * ========================================================== */

function openModal() {
  modal.classList.remove('hidden')

  titulo.focus()
}

function closeModal() {
  editingAchievement = null

  form.reset()

  modal.classList.add('hidden')
}
