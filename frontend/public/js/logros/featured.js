import {
  achievements,
  featuredAchievements,
  refreshFeaturedAchievements,
  refreshAchievements,
  modalCarga,
} from './logros.js'

import { replaceFeaturedAchievements } from '../common/api.js'

import { showToast } from '../common/toast.js'

/* ============================================================
 * DOM
 * ========================================================== */

const modal = document.getElementById('featuredModal')

const container = document.getElementById('featuredContainer')

const btnOpen = document.getElementById('btnFeatured')

const btnCancel = document.getElementById('btnCancelFeatured')

const btnSave = document.getElementById('btnSaveFeatured')

/* ============================================================
 * EVENTS
 * ========================================================== */

export function registerFeaturedEvents() {
  btnOpen.onclick = openFeaturedModal

  btnCancel.onclick = closeFeaturedModal

  btnSave.onclick = saveFeaturedAchievements

  modal.onclick = (e) => {
    if (e.target === modal) closeFeaturedModal()
  }
}

/* ============================================================
 * OPEN
 * ========================================================== */

function openFeaturedModal() {
  render()

  modal.classList.remove('hidden')
}

function closeFeaturedModal() {
  modal.classList.add('hidden')
}

function render() {
  container.innerHTML = ''

  achievements.forEach((achievement) => {
    const row = document.createElement('div')

    row.className = 'featuredRow'

    const info = document.createElement('div')

    info.className = 'featuredInfo'

    info.textContent = achievement.titulo

    row.appendChild(info)

    const found = featuredAchievements.some(
      (item) => item.id === achievement.id,
    )

    if (found) {
      const badge = document.createElement('span')

      badge.className = 'featuredPosition'

      badge.textContent = `#${featuredAchievements.findIndex((item) => item.id === achievement.id) + 1}`

      row.appendChild(badge)
    }

    const button = document.createElement('button')

    if (found) {
      button.textContent = 'Remover'

      button.className = 'tableButton delete'

      button.onclick = () => {
        removeFeatured(achievement.id)
      }
    } else {
      button.textContent = 'Añadir'

      button.className = 'tableButton'

      button.onclick = () => {
        addFeatured(achievement)
      }
    }

    row.appendChild(button)

    container.appendChild(row)
  })
}

function addFeatured(achievement) {
  if (selected.find((f) => f.id === achievement.id)) return

  if (selected.length >= 3) selected.shift()

  selected.push({
    id: achievement.id,
    orden: selected.length,
  })

  normalize()

  render()
}

function removeFeatured(id) {
  selected = selected.filter((f) => f.id !== id)

  normalize()

  render()
}

function normalize() {
  selected.forEach((item, index) => {
    item.orden = index
  })
}

async function saveFeaturedAchievements() {
  modalCarga.hidden = false
  try {
    const request = selected.map((item, index) => ({
      logro_id: item.id,
      orden: index,
    }))

    await replaceFeaturedAchievements(request)

    await refreshFeaturedAchievements()

    closeFeaturedModal()

    showToast('Logros destacados actualizados.')
  } catch (err) {
    console.error(err)

    showToast(err.message, 'error')
  }
  modalCarga.hidden = true
}
